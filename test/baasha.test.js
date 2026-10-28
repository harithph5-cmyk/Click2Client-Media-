import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';

process.env.GEMINI_API_KEY = 'test-key-not-real-123456';
const { calculate, currentDatetime, pageText, runTool } = await import('../server/baasha/tools.js');
const { parsePublicUrl, ipIsPublic, safeFetch, UrlRejected } = await import('../server/baasha/ssrf.js');
const { rateLimited, dailyCapReached, resetLimits } = await import('../server/baasha/limits.js');
const { runAgent, verifyLinks } = await import('../server/baasha/agent.js');
const routes = await import('../server/baasha/routes.js');

test('calculator is exact, safe and never evals', () => {
  assert.equal(calculate('2 + 3 * 4'), 14);
  assert.equal(calculate('(2 + 3) * 4 ^ 2 / 8'), 10);
  assert.equal(calculate('sqrt(144) + max(3, 9)'), 21);
  assert.equal(calculate('-5 + 10 % 4'), -3);
  assert.equal(calculate('0.1 + 0.2'), 0.3);
  for (const evil of ['process.exit()', 'require("fs")', '1/0', '2 +', '(1', 'constructor', 'x'.repeat(300), '', 'alert(1)']) assert.throws(() => calculate(evil), undefined, evil);
});

test('date tool falls back to UTC for an invalid timezone', () => {
  assert.equal(currentDatetime('Not/AZone').timezone, 'UTC');
  assert.equal(currentDatetime('Asia/Kolkata').timezone, 'Asia/Kolkata');
});

test('only public web addresses pass the SSRF check', () => {
  for (const u of ['http://localhost/', 'http://127.0.0.1/', 'http://127.1/', 'http://0.0.0.0/', 'http://10.1.2.3/', 'http://192.168.0.1/', 'http://172.20.0.5/', 'http://169.254.169.254/latest/meta-data/',
    'http://100.64.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/', 'http://x.internal/', 'http://printer.local/', 'file:///etc/passwd',
    'ftp://example.com/', 'javascript:alert(1)', 'http://user:pw@example.com/', 'http://example.com:22/', 'gopher://example.com', 'not a url', 'http://2130706433/']) {
    assert.throws(() => parsePublicUrl(u), UrlRejected, u);
  }
  for (const u of ['https://example.com/', 'http://example.org/a?b=1', 'https://sub.domain.co.in/x']) assert.doesNotThrow(() => parsePublicUrl(u), u);
  assert.equal(ipIsPublic('8.8.8.8'), true);
  assert.equal(ipIsPublic('::ffff:10.0.0.1'), false);
  assert.equal(ipIsPublic('2606:4700:4700::1111'), true);
});

test('safeFetch refuses a hostname that resolves to a private address and a redirect into one', async () => {
  await assert.rejects(() => safeFetch('http://localtest.me/'), (e) => e instanceof UrlRejected || /ENOTFOUND|EAI_AGAIN|private/i.test(String(e.message)));
  const srv = http.createServer((req, res) => { res.writeHead(302, { location: 'http://127.0.0.1:1/secret' }); res.end(); }).listen(0, '127.0.0.1');
  await new Promise((r) => srv.on('listening', r));
  try { await assert.rejects(() => safeFetch(`http://127.0.0.1:${srv.address().port}/`), UrlRejected); } finally { srv.close(); }
});

test('page text extraction drops scripts and keeps the title', () => {
  const r = pageText('<html><head><title> Hello  World </title><script>evil()</script></head><body><nav>menu</nav><main><h1>Heading</h1><p>Body text here.</p></main><footer>foot</footer></body></html>');
  assert.equal(r.title, 'Hello World');
  assert.equal(r.text, 'Heading Body text here.');
});

test('rate limiting and the daily cap', () => {
  resetLimits();
  assert.equal(rateLimited('k', 2, 1000, 0), false);
  assert.equal(rateLimited('k', 2, 1000, 10), false);
  assert.equal(rateLimited('k', 2, 1000, 20), true);
  assert.equal(rateLimited('k', 2, 1000, 5000), false);            // window passed
  assert.equal(rateLimited('other', 2, 1000, 20), false);          // keys are independent
  process.env.BAASHA_DAILY_LIMIT = '2';
  assert.equal(dailyCapReached(), false); assert.equal(dailyCapReached(), false); assert.equal(dailyCapReached(), true);
  delete process.env.BAASHA_DAILY_LIMIT; resetLimits();
});

test('links the tools never returned are removed from the final answer', () => {
  const ev = new Map([['https://real.example/a', { title: 'a' }]]);
  const v = verifyLinks('See https://real.example/a and https://made-up.example/x.', ev);
  assert.equal(v.kept, 1); assert.equal(v.removed, 1);
  assert.match(v.text, /real\.example\/a/); assert.doesNotMatch(v.text, /made-up/);
});

test('message validation keeps the latest turns and requires a final user message', () => {
  assert.equal(routes.cleanMessages(null), null);
  assert.equal(routes.cleanMessages([]), null);
  assert.equal(routes.cleanMessages([{ role: 'assistant', content: 'hi' }]), null);
  const long = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}` })).concat([{ role: 'user', content: 'last' }]);
  const kept = routes.cleanMessages(long);
  assert.ok(kept.length <= 14 && kept.at(-1).content === 'last');
  assert.equal(routes.cleanMessages([{ role: 'user', content: 'x'.repeat(20000) }])[0].content.length, 8000);
});

test('citation markers use only real source indices', () => {
  const text = 'Alpha beta. Gamma delta.';
  const out = routes.withCitations(text, [{ segment: { endIndex: 11 }, groundingChunkIndices: [0] }, { segment: { endIndex: 24 }, groundingChunkIndices: [1, 0] }, { segment: { endIndex: 9999 }, groundingChunkIndices: [5] }]);
  assert.equal(out, 'Alpha beta.[1] Gamma delta.[2][1]');
});

/* ---------- agent loop with a scripted model: real loop, fake provider ---------- */
test('agent plans, calls tools, verifies links and returns a report', async () => {
  const script = [
    { text: JSON.stringify({ goal: 'g', steps: [{ title: 'Calculate', tool: 'calculate' }, { title: 'Report', tool: 'write_report' }] }), parts: [] },
    { text: '', parts: [{ functionCall: { name: 'calculate', args: { expression: '6*7' } } }] },
    { text: '', parts: [{ functionCall: { name: 'write_report', args: { title: 'Answer', markdown: '# Answer\n\nThe result is 42.' } } }] },
    { text: 'The answer is 42. Source: https://invented.example/x', parts: [] },
  ];
  const events = [];
  await runAgent({ task: 'What is 6 times 7? Write a short report.', emit: (e) => events.push(e), signal: new AbortController().signal },
    { generate: async () => script.shift(), runTool });
  const types = events.map((e) => e.type);
  assert.deepEqual(types, ['state', 'status', 'plan', 'tool_start', 'tool_end', 'tool_start', 'tool_end', 'verify', 'final']);
  assert.equal(events.at(-1).status, 'completed');
  assert.equal(events.find((e) => e.type === 'tool_end').detail, '= 42');
  const fin = events.at(-1);
  assert.match(fin.text, /42/); assert.doesNotMatch(fin.text, /invented\.example/);
  assert.equal(fin.report.title, 'Answer');
  assert.equal(events.find((e) => e.type === 'verify').linksRemoved, 1);
});

test('agent stops at the step limit and still answers; cancelled runs stop', async () => {
  let n = 0;
  const looping = async (o) => (o.json ? { text: '{"steps":[{"title":"x"}]}', parts: [] } : o.tools ? (n++, { text: '', parts: [{ functionCall: { name: 'current_datetime', args: {} } }] }) : { text: 'Best effort answer.', parts: [] });
  const events = [];
  await runAgent({ task: 'Keep looping please', emit: (e) => events.push(e), signal: new AbortController().signal }, { generate: looping, runTool });
  assert.equal(events.filter((e) => e.type === 'tool_start').length, 8);
  assert.match(events.at(-1).stopped, /step limit/); assert.match(events.at(-1).text, /Best effort answer\./);
  assert.equal(events.at(-1).status, 'partially_completed'); assert.match(events.at(-1).text, /Partially completed/);
  const ctl = new AbortController(); ctl.abort();
  await assert.rejects(() => runAgent({ task: 'cancelled task', emit() {}, signal: ctl.signal }, { generate: async () => ({ text: '{"steps":[{"title":"x"}]}', parts: [] }), runTool }), /Cancelled/);
});

test('a tool failure is reported to the model instead of crashing the agent', async () => {
  const r = await runTool('fetch_page', { url: 'http://169.254.169.254/latest' }, { sources: new Map() });
  assert.equal(r.ok, false); assert.match(r.error, /private/i);
  assert.equal((await runTool('rm_rf', {}, { sources: new Map() })).ok, false);
  assert.equal((await runTool('calculate', { expression: 'process.exit()' }, { sources: new Map() })).ok, false);
});

/* ---------- HTTP layer with the real router and a mocked Gemini ---------- */
async function withServer(fn) {
  const app = express(); app.set('trust proxy', 1); app.use('/api/baasha', routes.default);
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => String(url).includes('generativelanguage.googleapis.com') ? geminiMock(String(url), opts) : realFetch(url, opts);
  try { await fn(base); } finally { globalThis.fetch = realFetch; srv.close(); resetLimits(); }
}
let geminiMode = 'ok';
function geminiMock(url, opts) {
  assert.equal(opts.headers['x-goog-api-key'], 'test-key-not-real-123456');
  assert.ok(!url.includes('key='), 'the key must travel in a header, never in the URL');
  if (geminiMode === 'quota') return Promise.resolve(new Response('{}', { status: 429 }));
  if (url.includes('streamGenerateContent')) {
    const enc = new TextEncoder();
    const body = new ReadableStream({ start(c) { for (const t of ['Hel', 'lo ', 'there']) c.enqueue(enc.encode(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`)); c.close(); } });
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  }
  const grounded = JSON.parse(opts.body).tools?.some((t) => t.google_search);
  return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: grounded ? 'Found facts.' : 'ok' }] },
    groundingMetadata: grounded ? { groundingChunks: [{ web: { uri: 'https://src.example/1', title: 'Source one' } }], groundingSupports: [{ segment: { endIndex: 5 }, groundingChunkIndices: [0] }], webSearchQueries: ['q'] } : undefined }] }), { status: 200 }));
}
const post = (base, path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const sse = async (r) => { const out = []; for (const block of (await r.text()).split('\n\n')) { const ev = /event: (\w+)/.exec(block), d = /data: (.*)/.exec(block); if (ev) out.push([ev[1], JSON.parse(d[1])]); } return out; };

test('status endpoint never exposes the key', async () => withServer(async (base) => {
  const r = await fetch(`${base}/api/baasha/status`); const j = await r.json(); const txt = JSON.stringify(j);
  assert.equal(j.configured, true); assert.ok(!txt.includes('test-key'));
}));

test('chat streams tokens from the provider', async () => withServer(async (base) => {
  const r = await post(base, '/api/baasha/chat', { mode: 'chat', messages: [{ role: 'user', content: 'hi' }] });
  assert.match(r.headers.get('content-type'), /text\/event-stream/);
  const ev = await sse(r);
  assert.equal(ev.filter(([t]) => t === 'token').map(([, d]) => d.t).join(''), 'Hello there');
  assert.equal(ev.at(-1)[0], 'done');
}));

test('research returns citations and sources from grounding', async () => withServer(async (base) => {
  const ev = await sse(await post(base, '/api/baasha/chat', { mode: 'research', messages: [{ role: 'user', content: 'what is new' }] }));
  const res = ev.find(([t]) => t === 'result')[1];
  assert.equal(res.text, 'Found[1] facts.'); assert.deepEqual(res.sources, [{ title: 'Source one', url: 'https://src.example/1' }]);
}));

test('provider errors become friendly messages and bad input is rejected', async () => withServer(async (base) => {
  geminiMode = 'quota';
  const ev = await sse(await post(base, '/api/baasha/chat', { mode: 'chat', messages: [{ role: 'user', content: 'hi' }] }));
  geminiMode = 'ok';
  assert.equal(ev[0][0], 'error'); assert.match(ev[0][1].message, /busy|rate limit/i); assert.ok(!JSON.stringify(ev).includes('test-key'));
  assert.equal((await post(base, '/api/baasha/chat', { messages: 'nope' })).status, 400);
  assert.equal((await post(base, '/api/baasha/chat', { messages: [{ role: 'assistant', content: 'x' }] })).status, 400);
  assert.equal((await post(base, '/api/baasha/agent', { task: 'hi' })).status, 400);
  assert.equal((await fetch(`${base}/api/baasha/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json' })).status >= 400, true);
}));

test('cross-site requests and over-limit callers are refused', async () => withServer(async (base) => {
  assert.equal((await post(base, '/api/baasha/chat', { messages: [{ role: 'user', content: 'x' }] }, { origin: 'https://evil.example' })).status, 403);
  for (let i = 0; i < 6; i++) await (await post(base, '/api/baasha/agent', { task: 'compute 1+1 please' })).text();
  const r = await post(base, '/api/baasha/agent', { task: 'compute 1+1 please' });
  assert.equal(r.status, 429); assert.equal((await r.json()).error.code, 'rate_limited');
}));

test('without a key the API says it is not switched on', async () => {
  const saved = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  try { await withServer(async (base) => {
    assert.equal((await (await fetch(`${base}/api/baasha/status`)).json()).configured, false);
    const r = await post(base, '/api/baasha/chat', { messages: [{ role: 'user', content: 'hi' }] });
    assert.equal(r.status, 503); assert.equal((await r.json()).error.code, 'not_configured');
  }); } finally { process.env.GEMINI_API_KEY = saved; }
});
