// Reliability tests for Baasha AI: provider errors, retries, circuit breaker, honest task status, status endpoint, UI state helpers.
// Gemini is always mocked here, so no key, quota or network is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

const FAKE_KEY = 'test-key-not-real-123456';
process.env.GEMINI_API_KEY = FAKE_KEY;
const gem = await import('../server/baasha/gemini.js');
const { runTool } = await import('../server/baasha/tools.js');
const { runAgent, assess, disclosure } = await import('../server/baasha/agent.js');
const routes = await import('../server/baasha/routes.js');
const { resetLimits } = await import('../server/baasha/limits.js');
const ui = await import('../public/baasha/js/state.js');

/* ---------- mocked Gemini: a queue of replies, and a log of every call that was made ---------- */
const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body, arrayBuffer: async () => new ArrayBuffer(0), body: null });
const okBody = (text = 'hello', sources = []) => ({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: { groundingChunks: sources.map((u) => ({ web: { uri: u, title: u } })) } }] });
const quotaDaily = () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota', details: [{ '@type': 'x.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }, { '@type': 'x.RetryInfo', retryDelay: '23312s' }] } });
const noDetail429 = () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'quota', details: [{ '@type': 'x.Help' }] } });
const minute429 = () => ({ error: { status: 'RESOURCE_EXHAUSTED', message: 'slow down', details: [{ '@type': 'x.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' }] }, { '@type': 'x.RetryInfo', retryDelay: '0.05s' }] } });

async function mocked(queue, fn) {
  const real = globalThis.fetch, calls = [];
  globalThis.fetch = async (url, opts) => {
    if (!String(url).includes('generativelanguage.googleapis.com')) return real(url, opts);
    calls.push({ url: String(url), body: opts?.body ? JSON.parse(opts.body) : null });
    const next = typeof queue === 'function' ? queue(calls.length, String(url), opts) : queue.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  gem.resetBreakers(); gem.resetProbe();
  try { return await fn(calls); } finally { globalThis.fetch = real; gem.resetBreakers(); gem.resetProbe(); }
}
const GROUNDED = { contents: [], tools: [{ google_search: {} }] };
const PLAIN = { contents: [] };

/* ---------- classification of provider errors ---------- */
test('classify reads Google quota details and retry delay', () => {
  const d = gem.classify(429, JSON.stringify(quotaDaily()), false);
  assert.equal(d.kind, 'quota_daily'); assert.equal(d.retryAfterMs, 23312000);
  assert.equal(gem.classify(429, JSON.stringify(minute429()), false).kind, 'rate_minute');
  assert.equal(gem.classify(429, JSON.stringify(noDetail429()), true).kind, 'search_quota');
  assert.equal(gem.classify(429, JSON.stringify(noDetail429()), false).kind, 'rate_limited');
  assert.equal(gem.classify(401, '').kind, 'auth'); assert.equal(gem.classify(403, '{}').kind, 'auth');
  assert.equal(gem.classify(404, 'not json at all').kind, 'model');
  assert.equal(gem.classify(400, '').kind, 'bad_request');
  assert.equal(gem.classify(503, '').kind, 'unavailable');
});

/* ---------- retries, limits and the circuit breaker ---------- */
test('a temporary 503 is retried and then succeeds', async () => {
  await mocked([reply(503, {}), reply(200, okBody('fine'))], async (calls) => {
    const r = await gem.generate(PLAIN); assert.equal(r.text, 'fine'); assert.equal(r.attempts, 2); assert.equal(calls.length, 2);
  });
});

test('retries are bounded: a provider that keeps failing is called 3 times at most', async () => {
  await mocked(() => reply(503, {}), async (calls) => {
    await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'unavailable' && e.attempts === gem.MAX_ATTEMPTS);
    assert.equal(calls.length, gem.MAX_ATTEMPTS);
  });
});

test('a per-minute rate limit honours the provider delay and then succeeds', async () => {
  await mocked([reply(429, minute429()), reply(200, okBody('after wait'))], async (calls) => {
    assert.equal((await gem.generate(PLAIN)).text, 'after wait'); assert.equal(calls.length, 2);
  });
});

test('invalid credentials are not retried and open the breaker', async () => {
  await mocked([reply(401, { error: { status: 'UNAUTHENTICATED', message: 'bad key' } })], async (calls) => {
    await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'auth' && !/bad key/.test(e.message));
    assert.equal(calls.length, 1);
    await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'auth' && e.failedFast);
    assert.equal(calls.length, 1, 'the breaker stops further provider calls');
  });
});

test('an unknown model (404) is a permanent configuration error', async () => {
  await mocked([reply(404, { error: { status: 'NOT_FOUND', message: 'no model' } })], async (calls) => {
    await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'model'); assert.equal(calls.length, 1);
  });
});

test('a used-up daily quota is not retried and later calls fail fast without touching Google', async () => {
  await mocked([reply(429, quotaDaily())], async (calls) => {
    await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'quota_daily' && /quota/i.test(e.message) && !/minute/i.test(e.message));
    assert.equal(calls.length, 1);
    await assert.rejects(() => gem.generate(PLAIN), (e) => e.failedFast); assert.equal(calls.length, 1);
  });
});

test('a search-only quota blocks grounded calls but not plain ones', async () => {
  await mocked([reply(429, noDetail429()), reply(200, okBody('plain works'))], async (calls) => {
    await assert.rejects(() => gem.generate(GROUNDED), (e) => e.kind === 'search_quota'); assert.equal(calls.length, 1);
    await assert.rejects(() => gem.generate(GROUNDED), (e) => e.failedFast); assert.equal(calls.length, 1);
    assert.equal((await gem.generate(PLAIN)).text, 'plain works'); assert.equal(calls.length, 2);
  });
});

test('timeouts and unreachable networks map to clear errors', async () => {
  await mocked([Object.assign(new Error('t'), { name: 'AbortError' })], async () => { await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'timeout'); });
  await mocked(() => new TypeError('fetch failed'), async (calls) => {
    await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'unreachable'); assert.equal(calls.length, gem.MAX_ATTEMPTS);
  });
});

test('malformed and empty provider answers are rejected, not shown', async () => {
  await mocked([reply(200, null)], async () => { await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'malformed'); });
  await mocked([reply(200, { candidates: [] })], async () => { await assert.rejects(() => gem.generate(PLAIN), (e) => e.kind === 'empty'); });
});

/* ---------- tools: dedupe, limits, no repeated failing search ---------- */
test('identical searches are run once; a failing search is not repeated', async () => {
  await mocked(() => reply(200, okBody('facts', ['https://a.example/'])), async (calls) => {
    const ctx = { sources: new Map() };
    const a = await runTool('web_search', { query: 'Python  install' }, ctx), b = await runTool('web_search', { query: 'python install' }, ctx);
    assert.ok(a.ok && b.deduped); assert.equal(calls.length, 1); assert.equal(ctx.sources.size, 1);
  });
  await mocked(() => reply(429, noDetail429()), async (calls) => {
    const ctx = { sources: new Map() };
    const a = await runTool('web_search', { query: 'one' }, ctx);
    const b = await runTool('web_search', { query: 'two' }, ctx);
    assert.equal(a.ok, false); assert.equal(a.category, 'search_quota');
    assert.ok(b.skipped && b.category === 'search_quota'); assert.equal(calls.length, 1, 'no second request to Google');
  });
});

test('a search that works but finds nothing is flagged as empty, not as evidence', async () => {
  await mocked([reply(200, okBody('nothing found'))], async () => {
    const r = await runTool('web_search', { query: 'obscure' }, { sources: new Map() });
    assert.ok(r.ok && r.empty && r.sources.length === 0);
  });
});

test('searches per task are capped', async () => {
  await mocked(() => reply(200, okBody('x', ['https://s.example/'])), async (calls) => {
    const ctx = { sources: new Map() }; let last;
    for (let i = 0; i < 6; i++) last = await runTool('web_search', { query: `q${i}` }, ctx);
    assert.equal(calls.length, 4); assert.ok(last.skipped && last.category === 'limit');
  });
});

/* ---------- task status from real tool results ---------- */
test('assess: completed, partially_completed and failed', () => {
  const ok = (name) => ({ name, status: 'ok' }), bad = (name) => ({ name, status: 'failed' });
  assert.equal(assess([]).status, 'completed');
  assert.equal(assess([ok('calculate'), ok('web_search')]).status, 'completed');
  assert.equal(assess([ok('web_search'), bad('web_search')]).status, 'partially_completed');
  assert.equal(assess([bad('calculate'), ok('calculate')]).status, 'completed', 'a recovered non-research failure is fine');
  assert.equal(assess([bad('web_search'), bad('web_search')]).status, 'failed');
  assert.equal(assess([bad('web_search'), ok('write_report')]).researchFailed, true);
  assert.equal(assess([ok('calculate')], { stopped: 'The step limit was reached.' }).status, 'partially_completed');
  assert.equal(assess([ok('calculate')], { hasText: false }).status, 'failed');
  assert.equal(assess([{ name: 'web_search', status: 'failed', deduped: true }, ok('web_search')]).status, 'completed', 'a repeated call is not counted twice');
});

const scripted = (steps) => async () => { const s = steps.shift(); if (s instanceof Error) throw s; return s; };
const plan = { text: JSON.stringify({ goal: 'g', steps: [{ title: 'Search', tool: 'web_search' }, { title: 'Report', tool: 'write_report' }] }), parts: [] };
const call = (name, args) => ({ text: '', parts: [{ functionCall: { name, args } }] });

test('rate-limited research is disclosed: the agent cannot claim it searched', async () => {
  await mocked(() => reply(429, noDetail429()), async () => {
    const events = [];
    await runAgent({ task: 'Find three official docs pages and write a report', emit: (e) => events.push(e), signal: new AbortController().signal }, {
      generate: scripted([plan, call('web_search', { query: 'python docs' }), call('web_search', { query: 'python install' }),
        call('write_report', { title: 'Docs', markdown: '# Docs\n\nI reviewed https://docs.example/invented and it says things.' }),
        { text: 'I searched the web, reviewed three sources, and the report is complete.', parts: [] }]),
      runTool,
    });
    const fin = events.at(-1);
    const ends = events.filter((e) => e.type === 'tool_end');
    assert.equal(ends[0].ok, false); assert.equal(ends[0].category, 'search_quota'); assert.equal(ends[1].status, 'skipped');
    assert.equal(fin.status, 'partially_completed');
    assert.match(fin.text, /Partially completed/); assert.match(fin.text, /not checked against sources/);
    assert.match(fin.text, /Tools that failed: Searching the web x2/); assert.match(fin.text, /Sources retrieved: 0/);
    assert.equal(fin.report.complete, false); assert.match(fin.report.markdown, /Preliminary report/);
    assert.match(fin.report.markdown, /No web sources were retrieved/);
    assert.doesNotMatch(fin.report.markdown, /docs\.example\/invented/, 'invented links are removed from reports too');
    assert.match(fin.text, /Report: saved \(preliminary\)/);
    assert.ok(fin.tools.every((t) => 'status' in t && 'ms' in t && 'retries' in t));
  });
});

test('when every tool fails the task is failed and no report is recorded', async () => {
  await mocked(() => reply(429, noDetail429()), async () => {
    const events = [];
    await runAgent({ task: 'Research something and save a report', emit: (e) => events.push(e), signal: new AbortController().signal }, {
      generate: scripted([plan, call('web_search', { query: 'x' }), { text: 'All done, here is the verified answer.', parts: [] }]), runTool,
    });
    const fin = events.at(-1);
    assert.equal(fin.status, 'failed'); assert.match(fin.text, /could not be completed/); assert.equal(fin.report, null);
    assert.match(fin.text, /Report: not saved/);
  });
});

test('if the provider dies mid-task the run reports what happened instead of crashing', async () => {
  const quota = gem.providerError('quota_daily');
  const events = [];
  await runAgent({ task: 'Calculate then explain things', emit: (e) => events.push(e), signal: new AbortController().signal }, {
    generate: scripted([plan, call('calculate', { expression: '2+2' }), quota]), runTool,
  });
  const fin = events.at(-1);
  assert.equal(fin.status, 'failed'); assert.equal(fin.error.kind, 'quota_daily'); assert.match(fin.text, /stopped responding/);
  // a failure before anything ran is still an error for the caller
  await assert.rejects(() => runAgent({ task: 'Too early to fail', emit() {}, signal: new AbortController().signal }, { generate: scripted([quota]), runTool }), (e) => e.kind === 'quota_daily');
});

test('a successful run says completed and counts model calls', async () => {
  const events = [];
  await runAgent({ task: 'What is 6 times 7?', emit: (e) => events.push(e), signal: new AbortController().signal }, {
    generate: scripted([plan, call('calculate', { expression: '6*7' }), { text: 'It is 42.', parts: [] }]), runTool,
  });
  const fin = events.at(-1);
  assert.equal(fin.status, 'completed'); assert.equal(fin.modelCalls, 3); assert.match(fin.text, /Status: Completed/); assert.doesNotMatch(fin.text, /Partially|could not/);
  assert.deepEqual(disclosure([], { status: 'completed' }, {}).head, '');
});

/* ---------- HTTP: errors reach the browser as structured, honest events; the status endpoint tells the truth ---------- */
async function withServer(fn) {
  const app = express(); app.set('trust proxy', 1); app.use('/api/baasha', routes.default);
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  try { await fn(`http://127.0.0.1:${srv.address().port}`); } finally { srv.close(); resetLimits(); }
}
const sseEvents = (text) => [...text.matchAll(/event: (\w+)\ndata: (.*)/g)].map((m) => [m[1], JSON.parse(m[2])]);
const realFetch = globalThis.fetch;
const post = (base, path, body) => realFetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ r, text: await r.text() }));

test('research with the search quota used up returns a clear structured error', async () => {
  await mocked(() => reply(429, noDetail429()), async () => withServer(async (base) => {
    const { text } = await post(base, '/api/baasha/chat', { mode: 'research', messages: [{ role: 'user', content: 'What is new in Python?' }] });
    const err = sseEvents(text).find(([t]) => t === 'error')[1];
    assert.equal(err.kind, 'search_quota'); assert.match(err.message, /search is temporarily unavailable/i); assert.doesNotMatch(text, /try again in a minute/i);
  }));
});

test('research without any sources is labelled unverified', async () => {
  await mocked(() => reply(200, okBody('Some answer')), async () => withServer(async (base) => {
    const { text } = await post(base, '/api/baasha/chat', { mode: 'research', messages: [{ role: 'user', content: 'Anything current?' }] });
    const res = sseEvents(text).find(([t]) => t === 'result')[1];
    assert.equal(res.verified, false); assert.match(res.text, /No web sources were found/);
  }));
});

test('status endpoint: ready, degraded, down, and no secrets', async () => {
  await mocked(() => reply(200, { name: 'models/x' }), async () => withServer(async (base) => {
    const s = await (await realFetch(base + '/api/baasha/status')).json();
    assert.equal(s.state, 'ready'); assert.equal(s.provider.reachable, true); assert.equal(s.backend, 'up'); assert.equal(s.research.state, 'untested');
    assert.ok(s.modes.chat && s.modes.agent && s.modes.research); assert.ok(!JSON.stringify(s).includes(FAKE_KEY));
  }));
  await mocked(() => reply(200, { name: 'models/x' }), async () => withServer(async (base) => {
    gem.trip('search', gem.providerError('search_quota'), 60000);
    const s = await (await realFetch(base + '/api/baasha/status')).json();
    assert.equal(s.state, 'degraded'); assert.equal(s.modes.research, false); assert.equal(s.modes.chat, true); assert.equal(s.research.reason, 'search_quota');
  }));
  await mocked(() => reply(403, { error: { status: 'PERMISSION_DENIED' } }), async () => withServer(async (base) => {
    const s = await (await realFetch(base + '/api/baasha/status')).json();
    assert.equal(s.state, 'down'); assert.equal(s.provider.problem, 'auth'); assert.equal(s.modes.chat, false); assert.ok(!JSON.stringify(s).includes(FAKE_KEY));
  }));
  await mocked(() => new TypeError('fetch failed'), async () => withServer(async (base) => {
    const s = await (await realFetch(base + '/api/baasha/status')).json();
    assert.equal(s.state, 'down'); assert.equal(s.provider.reachable, false);
  }));
});

test('status endpoint reports not_configured without a key', async () => {
  const keep = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
  try { await withServer(async (base) => { const s = await (await realFetch(base + '/api/baasha/status')).json(); assert.equal(s.state, 'not_configured'); assert.equal(s.model, null); }); }
  finally { process.env.GEMINI_API_KEY = keep; }
});

/* ---------- browser-side helpers (pure functions shared with the page) ---------- */
test('status view: loading always resolves to a clear state', () => {
  assert.equal(ui.statusView(undefined).tone, 'wait');
  const failed = ui.statusView(null); assert.equal(failed.tone, 'off'); assert.ok(failed.canRetry); assert.match(failed.label, /Cannot reach/);
  assert.equal(ui.statusView({ ok: false }).tone, 'off');
  const ready = ui.statusView({ ok: true, state: 'ready', model: 'm', provider: { reachable: true }, research: { state: 'working' }, limits: { chat: 1, research: 2, agent: 3 } });
  assert.equal(ready.tone, 'on'); assert.match(ready.label, /Ready/); assert.ok(!ready.canRetry);
  const deg = ui.statusView({ ok: true, state: 'degraded', model: 'm', provider: {}, research: { state: 'unavailable', reason: 'search_quota' } });
  assert.equal(deg.tone, 'warn'); assert.ok(deg.canRetry); assert.match(deg.lines.join(' '), /search quota/);
  const down = ui.statusView({ ok: true, state: 'down', provider: { problem: 'quota_daily' } }); assert.equal(down.tone, 'off'); assert.match(down.lines.join(' '), /quota/);
  assert.equal(ui.statusView({ ok: true, state: 'not_configured', provider: {} }).label, 'Not switched on yet');
});

test('saved conversations load defensively and reports are not duplicated', () => {
  assert.deepEqual(ui.loadDb(null), { chats: [], reports: [] });
  assert.deepEqual(ui.loadDb('{broken'), { chats: [], reports: [] });
  const saved = JSON.stringify({ chats: [{ id: 'a', messages: [] }, { nope: 1 }, null], reports: [{ title: 't', markdown: 'm' }, { title: 'x' }] });
  const db = ui.loadDb(saved); assert.equal(db.chats.length, 1); assert.equal(db.reports.length, 1);
  const list = []; const a = ui.addReport(list, { title: 'T', markdown: 'body' }), b = ui.addReport(list, { title: 'T', markdown: 'body' });
  assert.equal(list.length, 1); assert.equal(a, b);
  ui.addReport(list, { title: 'T', markdown: 'other', complete: false }); assert.equal(list.length, 2); assert.equal(list[0].complete, false);
  assert.deepEqual(ui.loadDb(JSON.stringify(db)).chats, db.chats, 'a refresh does not change saved chats');
});
