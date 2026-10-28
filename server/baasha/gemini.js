// Minimal Gemini REST client. The key stays on the server (GEMINI_API_KEY); nothing here is sent to browsers.
// Every provider failure is turned into a GeminiError with a `kind`, a safe user-facing message and, when Google
// says so, a retry delay. Temporary failures get a few bounded retries; quota and configuration errors do not.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(message, status = 502, code = 'provider_error', extra = {}) { super(message); this.status = status; this.code = code; Object.assign(this, extra); }
}

export const apiKey = () => (process.env.GEMINI_API_KEY || '').trim();
export const isConfigured = () => apiKey().length > 8 && !apiKey().startsWith('your_');
export const modelName = () => (process.env.BAASHA_MODEL || 'gemini-3.5-flash').trim().replace(/[^\w.\-:]/g, '');

export const MAX_ATTEMPTS = 3;               // 1 try + 2 retries, never more
const MAX_RETRY_WAIT_MS = 8000;              // longer provider delays are reported, not waited for

/* what the visitor is told for each failure kind (no internals, no keys) */
const MESSAGES = {
  quota_daily: 'Baasha AI has used up its AI quota for now. It will work again once the quota resets. Please try again later.',
  search_quota: 'Web search is temporarily unavailable because its quota has been reached. Chat and calculations still work.',
  rate_minute: 'Baasha AI is receiving too many requests right now. Please try again in about a minute.',
  rate_limited: 'Baasha AI is busy right now. Please try again in a little while.',
  auth: 'Baasha AI is unavailable because of a setup problem on the server. Please let the site owner know.',
  model: 'Baasha AI is unavailable because its AI model is not set up correctly. Please let the site owner know.',
  bad_request: 'The AI service could not process that request. Try rephrasing it.',
  unavailable: 'The AI service is temporarily unavailable. Please try again shortly.',
  timeout: 'The AI service took too long to answer. Please try again.',
  unreachable: 'Could not reach the AI service. Please try again shortly.',
  blocked: 'The AI service could not answer that request.',
  empty: 'The AI service returned an empty answer. Please try again.',
  malformed: 'The AI service sent an answer that could not be read. Please try again.',
};
const RETRYABLE = new Set(['unavailable', 'unreachable', 'rate_minute', 'rate_limited']);

/* ---------- classify a provider error from its HTTP status and (JSON) body ---------- */
export function classify(status, bodyText = '', grounded = false) {
  let err = null; try { err = JSON.parse(bodyText)?.error ?? null; } catch { /* not JSON */ }
  const details = Array.isArray(err?.details) ? err.details : [];
  const delay = details.map((d) => d?.retryDelay).find((d) => typeof d === 'string');
  const retryAfterMs = delay && Number.isFinite(parseFloat(delay)) ? Math.round(parseFloat(delay) * 1000) : null;
  const quotaIds = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations : []).map((v) => String(v?.quotaId || '')));
  let kind = 'unavailable';
  if (status === 429) kind = quotaIds.some((q) => /PerDay/i.test(q)) ? 'quota_daily' : quotaIds.some((q) => /PerMinute/i.test(q)) ? 'rate_minute' : grounded ? 'search_quota' : 'rate_limited';
  else if (status === 401 || status === 403) kind = 'auth';
  else if (status === 404) kind = 'model';
  else if (status >= 400 && status < 500) kind = 'bad_request';
  return { kind, retryAfterMs, providerStatus: typeof err?.status === 'string' ? err.status.slice(0, 40) : null };
}

export function providerError(kind, extra = {}) {
  const rate = kind === 'quota_daily' || kind === 'search_quota' || kind === 'rate_minute' || kind === 'rate_limited';
  const code = rate ? 'rate_limited' : kind === 'unreachable' || kind === 'timeout' ? 'unreachable' : kind === 'empty' ? 'empty' : kind === 'blocked' ? 'blocked' : 'provider_error';
  return new GeminiError(MESSAGES[kind] || MESSAGES.unavailable, rate ? 429 : kind === 'timeout' || kind === 'unreachable' ? 504 : 502, code, { kind, ...extra });
}

/* ---------- circuit breaker: once Google says "quota used up", stop sending it requests for a while ---------- */
const open = new Map();                      // 'model' | 'search' -> { until, error }
export function trip(name, error, ms) { open.set(name, { until: Date.now() + ms, error }); }
export function clearTrip(name) { open.delete(name); }
export function tripped(name) {
  const t = open.get(name); if (!t) return null;
  if (Date.now() >= t.until) { open.delete(name); return null; }     // time is up: the next request tests Google again
  return t;
}
export const searchSeen = { ok: null };       // null = not tried yet, true/false = outcome of the last web-search call
export const resetBreakers = () => { open.clear(); searchSeen.ok = null; };
const BREAK_MS = { quota_daily: 15 * 60_000, search_quota: 10 * 60_000, auth: 5 * 60_000, model: 5 * 60_000 };

function body({ system, contents, tools, json, maxOutputTokens = 4096, temperature }) {
  const b = { contents, generationConfig: { maxOutputTokens } };
  if (temperature != null) b.generationConfig.temperature = temperature;
  if (json) b.generationConfig.responseMimeType = 'application/json';
  if (system) b.systemInstruction = { parts: [{ text: system }] };
  if (tools) b.tools = tools;
  return b;
}

const sleep = (ms, signal) => new Promise((resolve) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});

// One request with bounded retries. The same payload is sent each time and only one attempt is ever in flight.
async function call(path, payload, signal, timeoutMs, grounded) {
  if (!isConfigured()) throw new GeminiError('Baasha AI is not switched on yet.', 503, 'not_configured', { kind: 'not_configured' });
  const stopped = tripped('model') || (grounded && tripped('search'));
  if (stopped) throw Object.assign(providerError(stopped.error.kind, { retryAfterMs: stopped.error.retryAfterMs }), { attempts: 0, failedFast: true });
  const deadline = Date.now() + timeoutMs * 2;               // overall limit for the request including retries
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await callOnce(path, payload, signal, Math.min(timeoutMs, Math.max(1000, deadline - Date.now())), grounded);
      clearTrip('model'); if (grounded) { clearTrip('search'); searchSeen.ok = true; }
      r.attempts = attempt; return r;
    } catch (e) {
      if (!(e instanceof GeminiError)) throw e;
      e.attempts = attempt;
      const wait = e.retryAfterMs ?? Math.random() * Math.min(MAX_RETRY_WAIT_MS, 800 * 2 ** (attempt - 1));   // honour Google's delay, else exponential backoff with full jitter
      const canRetry = RETRYABLE.has(e.kind) && attempt < MAX_ATTEMPTS && wait <= MAX_RETRY_WAIT_MS && Date.now() + wait < deadline && !signal?.aborted
        && !(e.kind === 'rate_limited' && attempt >= 2);        // an unexplained 429 gets a single retry
      console.error(`[baasha] provider ${e.kind} status=${e.providerHttp ?? '-'} attempt=${attempt}/${MAX_ATTEMPTS} retry=${canRetry ? Math.round(wait) + 'ms' : 'no'}`);
      if (!canRetry) {
        if (grounded && (e.kind === 'search_quota' || e.kind === 'quota_daily')) searchSeen.ok = false;
        if (BREAK_MS[e.kind]) trip(e.kind === 'search_quota' ? 'search' : 'model', e, Math.min(BREAK_MS[e.kind], e.retryAfterMs ?? Infinity));
        throw e;
      }
      await sleep(wait, signal);
      if (signal?.aborted) throw new GeminiError('Cancelled.', 499, 'cancelled', { kind: 'cancelled' });
    }
  }
}

async function callOnce(path, payload, signal, timeoutMs, grounded) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  signal?.addEventListener('abort', () => ctl.abort(), { once: true });
  try {
    const r = await fetch(`${BASE}/${encodeURIComponent(modelName())}:${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey() }, body: JSON.stringify(payload), signal: ctl.signal,
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      const c = classify(r.status, text, grounded);
      throw providerError(c.kind, { retryAfterMs: c.retryAfterMs, providerHttp: r.status, providerStatus: c.providerStatus });
    }
    return r;
  } catch (e) {
    if (e instanceof GeminiError) throw e;
    if (signal?.aborted) throw new GeminiError('Cancelled.', 499, 'cancelled', { kind: 'cancelled' });
    throw providerError(e.name === 'AbortError' ? 'timeout' : 'unreachable');
  } finally { clearTimeout(t); }
}

const isGrounded = (opts) => Array.isArray(opts.tools) && opts.tools.some((t) => t && t.google_search);

// One complete answer. Returns {text, parts, sources, queries, finish, attempts}
export async function generate(opts, signal) {
  const r = await call('generateContent', body(opts), signal, opts.timeoutMs || 60000, isGrounded(opts));
  const data = await r.json().catch(() => null);
  if (!data || typeof data !== 'object') throw providerError('malformed');
  const cand = data.candidates?.[0];
  if (!cand?.content?.parts?.length) {
    const why = data.promptFeedback?.blockReason;
    throw why ? Object.assign(providerError('blocked'), { message: `Gemini could not answer that (blocked: ${String(why).slice(0, 40)}).` }) : providerError('empty');
  }
  const parts = cand.content.parts;
  const text = parts.filter((p) => !p.thought).map((p) => p.text || '').join('');
  const g = cand.groundingMetadata || {};
  const sources = (g.groundingChunks || []).map((c) => c.web).filter(Boolean).map((w) => ({ title: String(w.title || w.uri).slice(0, 200), url: String(w.uri) }));
  return { text, parts, sources, queries: g.webSearchQueries || [], supports: g.groundingSupports || [], finish: cand.finishReason, attempts: r.attempts };
}

// Streamed answer: yields text pieces as they arrive. (Retries only happen before the first byte.)
export async function* stream(opts, signal) {
  const r = await call('streamGenerateContent?alt=sse', body(opts), signal, opts.timeoutMs || 90000, isGrounded(opts));
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
      if (j.promptFeedback?.blockReason) throw Object.assign(providerError('blocked'), { message: `Gemini could not answer that (blocked: ${String(j.promptFeedback.blockReason).slice(0, 40)}).` });
    }
  }
}

/* ---------- readiness probe for the status panel: asks Google for the model's details (uses no generation quota) ---------- */
let probeCache = { at: 0, value: null };
export async function probeProvider(now = Date.now()) {
  if (!isConfigured()) return { reachable: null, problem: 'not_configured' };
  if (probeCache.value && now - probeCache.at < 60_000) return probeCache.value;
  let value;
  try {
    const r = await fetch(`${BASE}/${encodeURIComponent(modelName())}`, { headers: { 'x-goog-api-key': apiKey() }, signal: AbortSignal.timeout(5000) });
    await r.arrayBuffer().catch(() => {});
    value = r.ok ? { reachable: true, problem: null } : { reachable: r.status === 401 || r.status === 403 || r.status === 404 || r.status === 429, problem: classify(r.status).kind };
  } catch { value = { reachable: false, problem: 'unreachable' }; }
  probeCache = { at: now, value }; return value;
}
export const resetProbe = () => { probeCache = { at: 0, value: null }; };
