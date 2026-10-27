// Minimal Gemini REST client. The key stays on the server (GEMINI_API_KEY); nothing here is sent to browsers.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(message, status = 502, code = 'provider_error') { super(message); this.status = status; this.code = code; }
}

export const apiKey = () => (process.env.GEMINI_API_KEY || '').trim();
export const isConfigured = () => apiKey().length > 8 && !apiKey().startsWith('your_');
export const modelName = () => (process.env.BAASHA_MODEL || 'gemini-3.5-flash').trim().replace(/[^\w.\-:]/g, '');

const MESSAGES = {
  400: 'Gemini rejected the request.', 401: 'The Gemini API key is invalid.', 403: 'The Gemini API key is invalid or lacks permission.',
  404: 'The configured Gemini model was not found.', 429: 'Baasha AI is busy right now (rate limit reached). Please try again in a minute.',
};

function failure(status) {
  const fallback = status >= 500 ? 'Gemini is temporarily unavailable. Please try again shortly.' : `Gemini returned an error (HTTP ${status}).`;
  const e = new GeminiError(MESSAGES[status] || fallback, status === 429 ? 429 : 502, status === 429 ? 'rate_limited' : 'provider_error');
  e.upstream = status; return e;
}

function body({ system, contents, tools, json, maxOutputTokens = 4096, temperature }) {
  const b = { contents, generationConfig: { maxOutputTokens } };
  if (temperature != null) b.generationConfig.temperature = temperature;
  if (json) b.generationConfig.responseMimeType = 'application/json';
  if (system) b.systemInstruction = { parts: [{ text: system }] };
  if (tools) b.tools = tools;
  return b;
}

// One automatic retry for a transient Google-side failure (5xx), never for quota or key problems.
async function call(path, payload, signal, timeoutMs) {
  try { return await callOnce(path, payload, signal, timeoutMs); }
  catch (e) {
    if (e instanceof GeminiError && e.code === 'provider_error' && e.upstream >= 500 && !signal?.aborted) { await new Promise((r) => setTimeout(r, 1500)); return callOnce(path, payload, signal, timeoutMs); }
    throw e;
  }
}

async function callOnce(path, payload, signal, timeoutMs) {
  if (!isConfigured()) throw new GeminiError('Baasha AI is not switched on yet.', 503, 'not_configured');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  signal?.addEventListener('abort', () => ctl.abort(), { once: true });
  try {
    const r = await fetch(`${BASE}/${encodeURIComponent(modelName())}:${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey() }, body: JSON.stringify(payload), signal: ctl.signal,
    });
    if (!r.ok) { await r.arrayBuffer().catch(() => {}); throw failure(r.status); }
    return r;
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if (signal?.aborted) throw new GeminiError('Cancelled.', 499, 'cancelled');
    throw new GeminiError(e.name === 'AbortError' ? 'Gemini took too long to answer. Please try again.' : 'Could not reach Gemini. Please try again.', 504, 'unreachable');
  } finally { clearTimeout(t); }
}

// One complete answer. Returns {text, parts, sources, queries, finish}
export async function generate(opts, signal) {
  const r = await call('generateContent', body(opts), signal, opts.timeoutMs || 60000);
  const data = await r.json().catch(() => null);
  const cand = data?.candidates?.[0];
  if (!cand?.content?.parts?.length) {
    const why = data?.promptFeedback?.blockReason;
    throw new GeminiError(why ? `Gemini could not answer that (blocked: ${why}).` : 'Gemini returned an empty answer. Please try again.', 502, 'empty');
  }
  const parts = cand.content.parts;
  const text = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
  const g = cand.groundingMetadata || {};
  const sources = (g.groundingChunks || []).map((c) => c.web).filter(Boolean).map((w) => ({ title: String(w.title || w.uri).slice(0, 200), url: String(w.uri) }));
  return { text, parts, sources, queries: g.webSearchQueries || [], supports: g.groundingSupports || [], finish: cand.finishReason };
}

// Streamed answer: yields text pieces as they arrive.
export async function* stream(opts, signal) {
  const r = await call('streamGenerateContent?alt=sse', body(opts), signal, opts.timeoutMs || 90000);
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let j; try { j = JSON.parse(line.slice(5)); } catch { continue; }
      const cand = j.candidates?.[0];
      for (const p of cand?.content?.parts || []) if (p.text && !p.thought) yield p.text;
      if (j.promptFeedback?.blockReason) throw new GeminiError(`Gemini could not answer that (blocked: ${j.promptFeedback.blockReason}).`, 502, 'blocked');
    }
  }
}
