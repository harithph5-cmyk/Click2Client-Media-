// Admin section for Baasha AI: the API (usage, tasks, accounts, knowledge, on/off switch), privacy of what it returns,
// the real admin guard, the switch's effect on the public endpoints, and the admin page wiring. No network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import express from 'express';

const FAKE_KEY = 'test-key-not-real-123456';
process.env.GEMINI_API_KEY = FAKE_KEY;
const { createAdminRouter } = await import('../server/baasha/admin.js');
const { MemoryWsStore, setWsStore } = await import('../server/baasha/wsstore.js');
const ts = await import('../server/baasha/taskstore.js');
const mem = await import('../server/baasha/memory.js');
const sw = await import('../server/baasha/switch.js');
const routes = await import('../server/baasha/routes.js');
const { resetLimits } = await import('../server/baasha/limits.js');
const gem = await import('../server/baasha/gemini.js');
const { statusView } = await import('../public/baasha/js/state.js');

const SECRET_MEMORY = 'TOP SECRET MEMORY: our supplier is Globex';
async function seeded() {
  const ws = new MemoryWsStore(), tasks = new ts.MemoryTaskStore();
  const u1 = await ws.upsertUser({ sub: 'google-sub-aaa', email: 'a@example.com', name: 'Asha' }), u2 = await ws.upsertUser({ sub: 'google-sub-bbb', email: 'b@example.com', name: 'Bela' });
  const w1 = await ws.ensureWorkspace(u1.id, 'A'), w2 = await ws.ensureWorkspace(u2.id, 'B');
  await ws.createSession({ tokenHash: 'secret-token-hash', userId: u1.id, workspaceId: w1.id, csrf: 'secret-csrf-value', expiresAt: new Date(Date.now() + 3600e3).toISOString() });
  await mem.createApproved(ws, w1.id, { kind: 'project', content: SECRET_MEMORY }); await mem.propose(ws, w1.id, { kind: 'website', content: 'Runs on WordPress.', taskId: 'x' });
  const mk = async (goal, workspaceId, status, tools = ['audit_site']) => { const r = await ts.openTask({ goal, workspaceId, store: tasks }); r.state('planning'); await r.finish(status, { status, tools: tools.map((name) => ({ name, status: 'ok' })), seconds: 12, modelCalls: 4, approvals: status === 'waiting_for_approval' ? [{ id: 'a' }] : [] }); await r.flush(); return r; };
  const t1 = await mk('Audit acme.example', w1.id, 'completed'), t2 = await mk('Fix my title', w2.id, 'waiting_for_approval', ['update_page']), t3 = await mk('Anonymous question', null, 'failed', []), t4 = await mk('Another audit', w1.id, 'completed');
  return { ws, tasks, u1, u2, w1, w2, t1, t2, t3, t4 };
}
async function withAdmin(fn) {
  const s = await seeded();
  const status = async () => ({ state: 'ready', model: 'gemini-test', provider: { configured: true, reachable: true, problem: null }, research: { state: 'untested', via: 'google', reason: null }, accounts: { configured: false, missing: ['GOOGLE_CLIENT_ID'], storage: 'memory', schema: 'memory' } });
  const app = express(); app.use(express.json()); app.use('/api/admin/baasha', createAdminRouter({ getTasks: async () => s.tasks, getWs: async () => s.ws, status }));
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/admin/baasha`;
  const call = (p, { method = 'GET', body } = {}) => fetch(base + p, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const backend = { v: true, get: async () => backend.v, set: async (x) => { backend.v = x; } }; sw.setSwitchBackend(backend);
  try { await fn({ call, s, backend }); } finally { srv.close(); sw.setSwitchBackend(null); }
}

test('overview reports real counts from the task log, accounts, tools, skills and knowledge', async () => {
  await withAdmin(async ({ call }) => {
    const o = await (await call('/overview')).json();
    assert.equal(o.ok, true); assert.equal(o.enabled, true); assert.equal(o.status.state, 'ready'); assert.equal(o.status.accounts.configured, false);
    assert.deepEqual([o.tasks.total, o.tasks.last24h, o.tasks.last7d, o.tasks.signedIn], [4, 4, 4, 3]);
    assert.deepEqual(o.tasks.byStatus, { completed: 2, waiting_for_approval: 1, failed: 1 });
    assert.deepEqual(o.accounts, { users: 2, workspaces: 2, activeSessions: 1, memoriesApproved: 1, memoriesProposed: 1 });
    assert.ok(o.agent.tools.some((t) => t.name === 'audit_site' && t.risk === 'low') && o.agent.tools.some((t) => t.name === 'propose_memory' && t.requires === 'workspace'));
    assert.equal(o.agent.skills, 11); assert.ok(o.agent.knowledge.documents >= 60); assert.equal(o.agent.taskLog, 'memory');
    assert.deepEqual(Object.keys(o.limits.perHourPerVisitor).sort(), ['agent', 'chat', 'research']); assert.equal(o.limits.dailyCap, 600);
  });
});

test('task list filters by status, bounds the limit, and the log shows any task including anonymous ones', async () => {
  await withAdmin(async ({ call, s }) => {
    const all = await (await call('/tasks')).json(); assert.equal(all.tasks.length, 4); assert.ok(all.statuses.includes('waiting_for_approval'));
    assert.deepEqual(all.tasks.map((t) => t.goal).sort(), ['Anonymous question', 'Another audit', 'Audit acme.example', 'Fix my title']);
    const w = (await (await call('/tasks?status=waiting_for_approval')).json()).tasks; assert.equal(w.length, 1); assert.equal(w[0].approvals, 1); assert.deepEqual(w[0].tools, ['update_page']); assert.equal(w[0].signedIn, true);
    assert.equal((await (await call('/tasks?status=bogus')).json()).tasks.length, 4, 'an unknown status is ignored, not injected');
    assert.equal((await (await call('/tasks?limit=1')).json()).tasks.length, 1); assert.equal((await (await call('/tasks?limit=99999')).json()).tasks.length, 4);
    const anon = (await (await call('/tasks')).json()).tasks.find((t) => t.goal === 'Anonymous question'); assert.equal(anon.signedIn, false); assert.equal(anon.status, 'failed');
    const d = await (await call('/tasks/' + s.t2.id)).json(); assert.equal(d.task.status, 'waiting_for_approval'); assert.ok(d.task.events.some((e) => e.type === 'state')); assert.ok(!('workspace_id' in d.task));
    assert.equal((await call('/tasks/' + s.t3.id)).status, 200); assert.equal((await call('/tasks/short')).status, 404); assert.equal((await call('/tasks/' + 'A'.repeat(24))).status, 404);
  });
});

test('deleting tasks and accounts removes their data and nothing else', async () => {
  await withAdmin(async ({ call, s }) => {
    assert.equal((await call('/tasks/delete', { method: 'POST', body: { ids: [] } })).status, 400); assert.equal((await call('/tasks/delete', { method: 'POST', body: { ids: ['../x', 5] } })).status, 400);
    const del = await (await call('/tasks/delete', { method: 'POST', body: { ids: [s.t3.id] } })).json(); assert.equal(del.deleted, 1); assert.equal((await call('/tasks/' + s.t3.id)).status, 404); assert.equal((await call('/tasks/' + s.t1.id)).status, 200);
    assert.equal((await call('/accounts/delete', { method: 'POST', body: { userId: '!!' } })).status, 400);
    const r = await (await call('/accounts/delete', { method: 'POST', body: { userId: s.u1.id } })).json(); assert.equal(r.deleted, true);
    assert.equal(s.ws.users.size, 1); assert.equal(s.ws.memories.size, 0); assert.equal(s.ws.sessions.size, 0);
    assert.equal((await call('/tasks/' + s.t1.id)).status, 404, 'the deleted workspace tasks are gone'); assert.equal((await call('/tasks/' + s.t2.id)).status, 200, 'the other workspace is untouched');
    assert.equal((await (await call('/accounts')).json()).accounts.length, 1);
  });
});

test('accounts list shows counts but never memory text, tokens, csrf values or Google ids', async () => {
  await withAdmin(async ({ call }) => {
    const a = await (await call('/accounts')).json(); assert.equal(a.storage, 'memory'); const asha = a.accounts.find((x) => x.email === 'a@example.com');
    assert.deepEqual([asha.memoriesApproved, asha.memoriesProposed, asha.tasks], [1, 1, 2]);
    const dump = JSON.stringify([a, await (await call('/overview')).json(), await (await call('/tasks')).json(), await (await call('/knowledge')).json()]);
    for (const secret of [SECRET_MEMORY, 'Runs on WordPress', 'secret-token-hash', 'secret-csrf-value', 'google-sub-aaa', FAKE_KEY]) assert.ok(!dump.includes(secret), `leaked: ${secret}`);
  });
});

test('the admin accounts list is a whitelist: private columns a store might return are never passed on', async () => {
  const s = await seeded();
  const leaky = { kind: 'postgres', adminSummary: async () => ({ users: 1 }), adminUsers: async () => [{ id: 'u1aaaaaaaa', email: 'x@example.com', name: 'X', created_at: 'c', last_login_at: 'l', workspace_id: 'w1', approved: 0, proposed: 0, google_sub: 'LEAK-SUB', token_hash: 'LEAK-HASH', csrf: 'LEAK-CSRF', content: 'LEAK-MEMORY' }] };
  const app = express(); app.use(express.json()); app.use('/a', createAdminRouter({ getTasks: async () => s.tasks, getWs: async () => leaky, status: async () => ({}) }));
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  try { const t = await (await fetch(`http://127.0.0.1:${srv.address().port}/a/accounts`)).text(); for (const x of ['LEAK-SUB', 'LEAK-HASH', 'LEAK-CSRF', 'LEAK-MEMORY']) assert.ok(!t.includes(x), x); assert.match(t, /x@example\.com/); } finally { srv.close(); }
});

test('knowledge endpoint lists the real skills and documents', async () => {
  await withAdmin(async ({ call }) => {
    const k = await (await call('/knowledge')).json(); assert.equal(k.skills.length, 11); assert.ok(k.documents.length >= 60 && k.documents.every((d) => d.path.endsWith('.md')));
    assert.ok(k.skills.every((x) => x.id && x.version && x.reviewed && Array.isArray(x.tools))); assert.ok(!k.skills.some((x) => 'body' in x), 'skill bodies are not sent');
  });
});

test('the on/off switch validates input, persists, and is reflected in the overview', async () => {
  await withAdmin(async ({ call, backend }) => {
    assert.equal((await call('/switch', { method: 'PUT', body: { enabled: 'no' } })).status, 400); assert.equal((await call('/switch', { method: 'PUT', body: {} })).status, 400);
    assert.deepEqual(await (await call('/switch', { method: 'PUT', body: { enabled: false } })).json(), { ok: true, enabled: false }); assert.equal(backend.v, false);
    assert.equal((await (await call('/overview')).json()).enabled, false);
    await call('/switch', { method: 'PUT', body: { enabled: true } }); assert.equal((await (await call('/overview')).json()).enabled, true);
  });
});

/* ---------- the switch on the public endpoints ---------- */
const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body), json: async () => body, arrayBuffer: async () => new ArrayBuffer(0), body: null });
async function withPublic(fn) {
  setWsStore(new MemoryWsStore()); ts.setTaskStore(new ts.MemoryTaskStore());
  const app = express(); app.set('trust proxy', 1); app.use('/api/baasha', routes.default);
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r));
  const real = globalThis.fetch; let calls = 0;
  globalThis.fetch = async (url, opts) => { if (!String(url).includes('generativelanguage.googleapis.com')) return real(url, opts); calls++; if (String(url).endsWith('/models/' + gem.modelName())) return reply(200, { name: 'm' }); return reply(200, { candidates: [{ content: { parts: [{ text: 'ok' }] } }] }); };
  gem.resetBreakers(); gem.resetProbe(); const backend = { v: true, get: async () => backend.v, set: async (x) => { backend.v = x; } }; sw.setSwitchBackend(backend);
  try { await fn(`http://127.0.0.1:${srv.address().port}/api/baasha`, real, backend, () => calls); }
  finally { globalThis.fetch = real; srv.close(); resetLimits(); gem.resetBreakers(); gem.resetProbe(); setWsStore(null); ts.setTaskStore(null); sw.setSwitchBackend(null); }
}
test('when switched off, chat, research and the agent answer "switched off" without calling the AI provider', async () => {
  await withPublic(async (base, real, backend, calls) => {
    backend.v = false; sw.setSwitchBackend(backend);
    const post = (p, body) => real(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    for (const [p, body] of [['/chat', { mode: 'chat', messages: [{ role: 'user', content: 'hello there' }] }], ['/chat', { mode: 'research', messages: [{ role: 'user', content: 'news today' }] }], ['/agent', { task: 'Audit my website please' }]]) {
      const r = await post(p, body); assert.equal(r.status, 503, p); const j = await r.json(); assert.equal(j.error.code, 'switched_off'); assert.match(j.error.message, /switched off/i);
    }
    assert.equal(calls(), 0, 'the AI provider was never called');
    const s = await (await real(base + '/status')).json(); assert.equal(s.enabled, false); assert.deepEqual(s.modes, { chat: false, research: false, agent: false });
    backend.v = true; sw.setSwitchBackend(backend);
    const ok = await post('/chat', { mode: 'chat', messages: [{ role: 'user', content: 'hello there' }] }); assert.equal(ok.status, 200, 'switching on restores service');
  });
});
test('the switch keeps its last value if storage fails, and caches reads', async () => {
  let n = 0, fail = false; sw.setSwitchBackend({ get: async () => { n++; if (fail) throw new Error('db down'); return false; }, set: async () => {} });
  try {
    assert.equal(await sw.isEnabled(100_000), false); assert.equal(await sw.isEnabled(105_000), false); assert.equal(n, 1, 'cached for 15 seconds');
    fail = true; assert.equal(await sw.isEnabled(130_000), false, 'a read failure keeps the last value'); assert.equal(n, 2);
  } finally { sw.setSwitchBackend(null); }
  assert.equal(statusView({ ok: true, state: 'down', enabled: false, provider: {}, research: {} }).label, 'Switched off');
});

/* ---------- the real admin guard and the admin page ---------- */
test('the real admin API refuses the Baasha admin endpoints without an admin session', async () => {
  const { default: app } = await import('../server/app.js');
  const srv = app.listen(0, '127.0.0.1'); await new Promise((r) => srv.on('listening', r)); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    for (const [m, p] of [['GET', '/overview'], ['GET', '/tasks'], ['GET', '/accounts'], ['GET', '/knowledge'], ['PUT', '/switch'], ['POST', '/accounts/delete'], ['POST', '/tasks/delete']]) {
      const r = await fetch(`${base}/api/admin/baasha${p}`, { method: m, headers: { 'content-type': 'application/json' }, body: m === 'GET' ? undefined : '{}' });
      assert.equal(r.status, 401, `${m} ${p}`);
    }
  } finally { srv.close(); }
});
test('the admin page has the Baasha AI tab wired to the new endpoints', () => {
  const js = fs.readFileSync(new URL('../public/js/admin.js', import.meta.url), 'utf8');
  assert.match(js, /\['baasha', 'Baasha AI'\]/); assert.match(js, /baasha: baashaTab/);
  for (const ep of ['/admin/baasha/overview', '/admin/baasha/tasks', '/admin/baasha/accounts', '/admin/baasha/knowledge', '/admin/baasha/switch', '/admin/baasha/accounts/delete', '/admin/baasha/tasks/delete']) assert.ok(js.includes(ep), ep);
  assert.ok(!/innerHTML = [^;]*\$\{[a-z.]*\.goal\}/.test(js.replace(/\$\{esc\([^)]*\)\}/g, '')), 'task text is always escaped');
  const html = fs.readFileSync(new URL('../public/admin.html', import.meta.url), 'utf8'); assert.match(html, /\.pill\.bs-completed/);
});
