// Task state and audit history for the Baasha AI agent.
// Every agent run is a task with an explicit state and an ordered event log (state changes, each tool call with
// its policy decision and outcome, the final status). The log holds no page content and no secrets.
// Postgres is used when the site has a database; otherwise a bounded in-memory store is used and the task is
// labelled `persistence: "memory"` so nothing pretends to be durable.
import crypto from 'node:crypto';

export const STATES = ['queued', 'planning', 'running_read_only', 'waiting_for_approval', 'running_write', 'verifying', 'completed', 'partial', 'failed', 'cancelled'];
export const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled']);

const T = {
  queued: ['planning', 'cancelled', 'failed'],
  planning: ['running_read_only', 'verifying', 'waiting_for_approval', 'failed', 'cancelled', 'partial', 'completed'],
  running_read_only: ['running_read_only', 'waiting_for_approval', 'running_write', 'verifying', 'failed', 'cancelled', 'partial', 'completed'],
  waiting_for_approval: ['running_write', 'running_read_only', 'verifying', 'cancelled', 'failed', 'partial', 'completed'],
  running_write: ['verifying', 'waiting_for_approval', 'failed', 'cancelled', 'partial'],
  verifying: ['completed', 'partial', 'failed', 'cancelled', 'waiting_for_approval', 'running_read_only'],
  completed: [], partial: [], failed: [], cancelled: [],
};
export const canTransition = (from, to) => (T[from] || []).includes(to);

const REDACT = /key|token|secret|password|authorization|cookie|credential/i;
export function sanitizeData(data, max = 3000) {
  const clean = (v, depth = 0) => {
    if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.length > 300 ? v.slice(0, 300) + '...' : v;
    if (depth > 3) return '[nested]';
    if (Array.isArray(v)) return v.slice(0, 20).map((x) => clean(x, depth + 1));
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).slice(0, 30).map(([k, x]) => [k, REDACT.test(k) ? '[redacted]' : clean(x, depth + 1)]));
    return String(v);
  };
  const s = JSON.stringify(clean(data ?? {}));
  return s.length > max ? JSON.stringify({ truncated: true, preview: s.slice(0, max - 40) }) : s;
}

const salt = process.env.BAASHA_LOG_SALT || crypto.randomBytes(8).toString('hex');
export const hashIp = (ip) => crypto.createHash('sha256').update(`${salt}:${ip || ''}`).digest('hex').slice(0, 16);
export const newTaskId = () => crypto.randomBytes(18).toString('base64url');     // unguessable: it is the capability to read the task

/* ---------- in-memory store (bounded) ---------- */
export class MemoryTaskStore {
  constructor({ maxTasks = 300, maxEvents = 200 } = {}) { this.kind = 'memory'; this.tasks = new Map(); this.maxTasks = maxTasks; this.maxEvents = maxEvents; }
  async create(t) {
    this.tasks.set(t.id, { ...t, events: [] });
    while (this.tasks.size > this.maxTasks) this.tasks.delete(this.tasks.keys().next().value);
  }
  async get(id) { const t = this.tasks.get(id); return t ? { id: t.id, kind: t.kind, mode: t.mode, status: t.status, goal: t.goal, workspace_id: t.workspace_id || null, created_at: t.created_at, updated_at: t.updated_at, completed_at: t.completed_at || null, summary: t.summary || null } : null; }
  async setStatus(id, status, { summary = null, at }) { const t = this.tasks.get(id); if (!t) return; t.status = status; t.updated_at = at; if (TERMINAL.has(status)) t.completed_at = at; if (summary) t.summary = summary; }
  async addEvent(id, e) { const t = this.tasks.get(id); if (!t) return; if (t.events.length < this.maxEvents) t.events.push(e); }
  async events(id, limit = 200) { return (this.tasks.get(id)?.events || []).slice(0, limit); }
  async purge() { return 0; }
  async listByWorkspace(ws, limit = 50) { return [...this.tasks.values()].filter((t) => t.workspace_id === ws).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit).map((t) => ({ id: t.id, status: t.status, goal: t.goal, created_at: t.created_at, completed_at: t.completed_at || null, summary: t.summary || null })); }
  async deleteByWorkspace(ws) { for (const [k, t] of this.tasks) if (t.workspace_id === ws) this.tasks.delete(k); }
}

/* ---------- Postgres store ---------- */
export class PgTaskStore {
  constructor(db) { this.kind = 'postgres'; this.db = db; }
  async create(t) { await this.db.query('INSERT INTO agent_tasks (id, kind, mode, status, goal, ip_hash, workspace_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [t.id, t.kind, t.mode, t.status, t.goal, t.ip_hash, t.workspace_id || null, t.created_at, t.updated_at]); }
  async get(id) { const r = await this.db.queryOne('SELECT id, kind, mode, status, goal, workspace_id, created_at, updated_at, completed_at, summary FROM agent_tasks WHERE id = ?', [id]); if (!r) return null; return { ...r, summary: r.summary ? JSON.parse(r.summary) : null }; }
  async setStatus(id, status, { summary = null, at }) { await this.db.query('UPDATE agent_tasks SET status = ?, updated_at = ?, completed_at = ?, summary = COALESCE(?, summary) WHERE id = ?', [status, at, TERMINAL.has(status) ? at : null, summary ? JSON.stringify(summary) : null, id]); }
  async addEvent(id, e) { await this.db.query('INSERT INTO agent_events (task_id, seq, at, type, data) VALUES (?, ?, ?, ?, ?)', [id, e.seq, e.at, e.type, e.data]); }
  async events(id, limit = 200) { return (await this.db.query('SELECT seq, at, type, data FROM agent_events WHERE task_id = ? ORDER BY seq LIMIT ?', [id, limit])); }
  async listByWorkspace(ws, limit = 50) { return (await this.db.query('SELECT id, status, goal, created_at, completed_at, summary FROM agent_tasks WHERE workspace_id = ? ORDER BY created_at DESC LIMIT ?', [ws, limit])).map((r) => ({ ...r, summary: r.summary ? JSON.parse(r.summary) : null })); }
  async deleteByWorkspace(ws) { await this.db.query('DELETE FROM agent_events WHERE task_id IN (SELECT id FROM agent_tasks WHERE workspace_id = ?)', [ws]); await this.db.query('DELETE FROM agent_tasks WHERE workspace_id = ?', [ws]); }
  async purge(days) { const cut = new Date(Date.now() - days * 86400_000).toISOString(); await this.db.query('DELETE FROM agent_events WHERE task_id IN (SELECT id FROM agent_tasks WHERE created_at < ?)', [cut]); await this.db.query('DELETE FROM agent_tasks WHERE created_at < ?', [cut]); }
}

let store = null, chosen = null;
export const setTaskStore = (s) => { store = s; chosen = s ? Promise.resolve(s) : null; };
export async function getTaskStore() {
  if (store) return store;
  chosen ||= (async () => {
    try {
      const db = await import('../store/db.js');
      if (db.databaseEnvVar) return (store = new PgTaskStore(db));
    } catch (e) { console.error('[baasha] task store: database unavailable, using memory:', e?.code || e?.message); }
    return (store = new MemoryTaskStore());
  })();
  return chosen;
}

export const RETENTION_DAYS = Number(process.env.BAASHA_TASK_RETENTION_DAYS || 30);
let lastPurge = 0;

/* ---------- recorder: what the agent uses; it never throws and never blocks the run on logging ---------- */
export async function openTask({ goal, mode = 'assisted', ip = '', workspaceId = null, store: given = null } = {}) {
  const st = given || await getTaskStore();
  const id = newTaskId(), at = new Date().toISOString();
  let status = 'queued', seq = 0, failures = 0, persistence = st.kind;
  let chain = Promise.resolve();
  const run = (fn) => { chain = chain.then(fn).catch((e) => { failures++; persistence = 'failed'; console.error('[baasha] task log:', e?.code || e?.message); }); return chain; };
  run(() => st.create({ id, kind: 'agent', mode, status, goal: String(goal || '').slice(0, 2000), ip_hash: hashIp(ip), workspace_id: workspaceId, created_at: at, updated_at: at }));
  if (st.kind === 'postgres' && Date.now() - lastPurge > 3600_000) { lastPurge = Date.now(); run(() => st.purge(RETENTION_DAYS)); }
  const event = (type, data = {}) => { const e = { seq: ++seq, at: new Date().toISOString(), type, data: sanitizeData(data) }; return run(() => st.addEvent(id, e)); };
  const rec = {
    id, store: st, get persistence() { return persistence; }, get status() { return status; }, get failures() { return failures; },
    event,
    state(to, reason = '') {
      if (to === status) return true;
      if (!canTransition(status, to)) { event('invalid_transition', { from: status, to, reason }); return false; }
      const from = status; status = to;
      event('state', { from, to, reason });
      run(() => st.setStatus(id, to, { at: new Date().toISOString() }));
      return true;
    },
    finish(to, summary) {
      if (!TERMINAL.has(to) && to !== 'waiting_for_approval') to = 'failed';
      if (to !== status && !canTransition(status, to)) event('invalid_transition', { from: status, to, reason: 'finish' });
      else { const from = status; status = to; event('state', { from, to, reason: 'finish' }); }
      return run(() => st.setStatus(id, status, { summary, at: new Date().toISOString() }));
    },
    flush: () => chain,
  };
  event('created', { mode, persistence: st.kind });
  return rec;
}

// What the owner may read back about a task (never raw page content).
export async function readTask(id, st = null, { workspaceId = null } = {}) {
  const s = st || await getTaskStore();
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(id || ''))) return null;
  const task = await s.get(id); if (!task) return null;
  if (task.workspace_id && task.workspace_id !== workspaceId) return null;      // a workspace task is visible only to its own workspace
  delete task.workspace_id;
  const events = (await s.events(id, 200)).map((e) => ({ seq: e.seq, at: e.at, type: e.type, data: JSON.parse(e.data || '{}') }));
  return { ...task, persistence: s.kind, events };
}

export async function listTasks(workspaceId, limit = 50, st = null) { const s = st || await getTaskStore(); return workspaceId ? s.listByWorkspace(workspaceId, limit) : []; }
export async function deleteWorkspaceTasks(workspaceId, st = null) { const s = st || await getTaskStore(); if (workspaceId) await s.deleteByWorkspace(workspaceId); }
