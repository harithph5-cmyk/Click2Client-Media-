// HTTP API for Baasha AI (mounted at /api/baasha). Stateless: nothing a visitor writes is stored on the
// server; conversations live in the visitor's own browser, so there is no shared data to leak.
import express from 'express';
import { generate, stream, isConfigured, modelName, GeminiError } from './gemini.js';
import { runAgent } from './agent.js';
import { rateLimited, dailyCapReached, LIMITS } from './limits.js';

const router = express.Router();
const SYSTEM = `You are Baasha AI, a friendly, direct and capable assistant made by Click2Client Media (India).
Answer clearly and accurately; use Markdown, and fenced code blocks with a language tag for code. If you are unsure, say so instead of guessing.
You are in Chat mode: you cannot browse the web or run tools here (the user can switch to Research or Agent mode for that).`;
const RESEARCH_SYSTEM = `You are Baasha AI in Research mode. Use Google Search to find current, reliable information and write a well-organised answer.
Separate what the sources say from your own reasoning, mention disagreements, and say what you could not verify. Do not invent links.`;

const bad = (res, status, code, message) => res.status(status).json({ error: { code, message } });

// Only the site's own pages may call the API (stops other websites from spending the owner's AI quota).
router.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin) { try { if (new URL(origin).host !== req.get('host')) return bad(res, 403, 'forbidden', 'Cross-site requests are not allowed.'); } catch { return bad(res, 403, 'forbidden', 'Bad origin.'); } }
  next();
});
router.use(express.json({ limit: '100kb' }));
router.use((err, req, res, next) => (err?.type === 'entity.parse.failed' || err?.status === 413) ? bad(res, err.status || 400, 'bad_request', 'The request was not valid JSON or was too large.') : next(err));

router.get('/status', (req, res) => {
  const ok = isConfigured();
  res.set('cache-control', 'no-store').json({ ok: true, configured: ok, model: ok ? modelName() : null, modes: { chat: ok, research: ok, agent: ok }, limits: LIMITS });
});

/* ---------- validation ---------- */
export function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 40) return null;
  const msgs = raw.slice(-14).map((m) => ({ role: m?.role === 'assistant' ? 'assistant' : 'user', content: String(m?.content ?? '').replace(/\u0000/g, '').slice(0, 8000) })).filter((m) => m.content.trim());
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return null;
  let total = 0; const kept = [];
  for (let i = msgs.length - 1; i >= 0; i--) { total += msgs[i].content.length; if (total > 30000 && kept.length) break; kept.unshift(msgs[i]); }
  return kept;
}
const toContents = (msgs) => msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

function guard(kind) {
  return (req, res, next) => {
    if (!isConfigured()) return bad(res, 503, 'not_configured', 'Baasha AI is not switched on yet. Please check back soon.');
    if (rateLimited(`${kind}:${req.ip}`, LIMITS[kind])) return bad(res, 429, 'rate_limited', 'You have reached the hourly limit for this mode. Please try again later.');
    if (dailyCapReached()) return bad(res, 429, 'busy', 'Baasha AI has reached its daily capacity. Please try again tomorrow.');
    next();
  };
}

/* ---------- server-sent events ---------- */
function openStream(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
  const ctl = new AbortController();
  res.on('close', () => ctl.abort());                    // the visitor left or pressed Stop
  const beat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
  const send = (event, data) => { if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  const end = () => { clearInterval(beat); if (!res.writableEnded) res.end(); };
  return { signal: ctl.signal, send, end };
}
const publicError = (e) => e instanceof GeminiError ? { code: e.code, message: e.message } : { code: 'internal', message: 'Something went wrong. Please try again.' };

// citation markers [1][2] inserted from Gemini's grounding data (real source indices only)
export function withCitations(text, supports) {
  const marks = [];
  for (const s of supports || []) {
    const end = s?.segment?.endIndex; const idx = (s?.groundingChunkIndices || []).slice(0, 3);
    if (Number.isInteger(end) && idx.length) marks.push([end, idx.map((i) => `[${i + 1}]`).join('')]);
  }
  const bytes = Buffer.from(text, 'utf8');
  let out = '', last = 0;
  for (const [end, m] of marks.sort((a, b) => a[0] - b[0])) { if (end > bytes.length || end < last) continue; out += bytes.subarray(last, end).toString('utf8') + m; last = end; }
  return out + bytes.subarray(last).toString('utf8');
}

/* ---------- Chat and Research ---------- */
router.post('/chat', (req, res, next) => {
  const mode = req.body?.mode === 'research' ? 'research' : 'chat';
  guard(mode)(req, res, async () => {
    const msgs = cleanMessages(req.body?.messages);
    if (!msgs) return bad(res, 400, 'bad_request', 'Send a conversation that ends with your message.');
    const sse = openStream(req, res);
    try {
      if (mode === 'chat') {
        for await (const t of stream({ system: SYSTEM, contents: toContents(msgs), maxOutputTokens: 4096 }, sse.signal)) sse.send('token', { t });
        sse.send('done', {});
      } else {
        sse.send('status', { text: 'Searching the web' });
        const r = await generate({ system: RESEARCH_SYSTEM, contents: toContents(msgs), tools: [{ google_search: {} }], maxOutputTokens: 4096, timeoutMs: 90000 }, sse.signal);
        sse.send('result', { text: withCitations(r.text, r.supports), sources: r.sources.slice(0, 12), queries: r.queries.slice(0, 6) });
        sse.send('done', {});
      }
    } catch (e) { if (e?.code !== 'cancelled') { console.error('[baasha] chat:', e?.code || e?.message); sse.send('error', publicError(e)); } }
    finally { sse.end(); }
  });
});

/* ---------- Agent ---------- */
router.post('/agent', (req, res) => {
  guard('agent')(req, res, async () => {
    const task = String(req.body?.task ?? '').replace(/\u0000/g, '').trim();
    if (task.length < 5 || task.length > 2000) return bad(res, 400, 'bad_request', 'Describe your task in 5 to 2000 characters.');
    const sse = openStream(req, res);
    try { await runAgent({ task, history: cleanMessages(req.body?.context) || [], emit: ({ type, ...d }) => sse.send(type, d), signal: sse.signal }); sse.send('done', {}); }
    catch (e) { if (e?.code !== 'cancelled') { console.error('[baasha] agent:', e?.code || e?.message); sse.send('error', publicError(e)); } }
    finally { sse.end(); }
  });
});

export default router;
