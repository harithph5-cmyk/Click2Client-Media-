// Storage for accounts, workspaces, sessions and memory. Two implementations share one interface:
// Postgres (when the site has a database) and a bounded in-memory store (tests, local use without a database).
// Every query that touches workspace data takes the workspace id from the authenticated session, never from the client or the model.
import crypto from 'node:crypto';
import { ensureSchema } from './schema.js';

export const newId = (n = 12) => crypto.randomBytes(n).toString('base64url');
const nowIso = () => new Date().toISOString();

/* ---------- in-memory ---------- */
export class MemoryWsStore {
  constructor() { this.kind = 'memory'; this.users = new Map(); this.workspaces = new Map(); this.sessions = new Map(); this.memories = new Map(); this.history = []; }
  async upsertUser({ sub, email, name }) {
    let u = [...this.users.values()].find((x) => x.google_sub === sub); const at = nowIso();
    if (u) { u.email = email; u.name = name; u.last_login_at = at; return { ...u }; }
    u = { id: newId(), google_sub: sub, email, name, created_at: at, last_login_at: at }; this.users.set(u.id, u); return { ...u };
  }
  async ensureWorkspace(userId, name) {
    let w = [...this.workspaces.values()].find((x) => x.owner_user_id === userId);
    if (!w) { w = { id: newId(), owner_user_id: userId, name, created_at: nowIso() }; this.workspaces.set(w.id, w); }
    return { ...w };
  }
  async createSession(s) { this.sessions.set(s.tokenHash, { ...s }); }
  async getSession(tokenHash, now = nowIso()) {
    const s = this.sessions.get(tokenHash); if (!s || s.expiresAt <= now) return null;
    const u = this.users.get(s.userId); if (!u) return null;
    return { userId: s.userId, workspaceId: s.workspaceId, csrf: s.csrf, expiresAt: s.expiresAt, email: u.email, name: u.name };
  }
  async deleteSession(tokenHash) { this.sessions.delete(tokenHash); }
  async listMemories(ws, { status = null } = {}) { return [...this.memories.values()].filter((m) => m.workspace_id === ws && (!status || m.status === status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map((m) => ({ ...m })); }
  async getMemory(ws, id) { const m = this.memories.get(id); return m && m.workspace_id === ws ? { ...m } : null; }
  async createMemory(ws, m) { const row = { id: newId(), workspace_id: ws, task_id: null, ...m, created_at: nowIso(), updated_at: nowIso() }; this.memories.set(row.id, row); return { ...row }; }
  async updateMemory(ws, id, f) { const m = this.memories.get(id); if (!m || m.workspace_id !== ws) return null; Object.assign(m, f, { updated_at: nowIso() }); return { ...m }; }
  async deleteMemory(ws, id) { const m = this.memories.get(id); if (!m || m.workspace_id !== ws) return false; this.memories.delete(id); this.history = this.history.filter((h) => h.memory_id !== id); return true; }
  async countMemories(ws, status = null) { return (await this.listMemories(ws, { status })).length; }
  async addHistory(h) { this.history.push({ ...h }); }
  async listHistory(ws, id) { if (!(await this.getMemory(ws, id))) return null; return this.history.filter((h) => h.memory_id === id).sort((a, b) => b.version - a.version).map((h) => ({ ...h })); }
  async deleteWorkspaceAccount(userId) {
    const w = [...this.workspaces.values()].find((x) => x.owner_user_id === userId);
    if (w) for (const m of [...this.memories.values()]) if (m.workspace_id === w.id) { this.memories.delete(m.id); this.history = this.history.filter((h) => h.memory_id !== m.id); }
    for (const [k, s] of this.sessions) if (s.userId === userId) this.sessions.delete(k);
    if (w) this.workspaces.delete(w.id); this.users.delete(userId);
    return w ? w.id : null;
  }
  async purgeExpiredSessions(now = nowIso()) { for (const [k, s] of this.sessions) if (s.expiresAt <= now) this.sessions.delete(k); }
}

/* ---------- Postgres ---------- */
export class PgWsStore {
  constructor(db) { this.kind = 'postgres'; this.db = db; }
  async ready() { await ensureSchema(this.db); }
  async q(sql, p = []) { await this.ready(); return this.db.query(sql, p); }
  async one(sql, p = []) { await this.ready(); return this.db.queryOne(sql, p); }
  async upsertUser({ sub, email, name }) {
    const at = nowIso(); const id = newId();
    await this.q('INSERT INTO baasha_users (id, google_sub, email, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, last_login_at = EXCLUDED.last_login_at', [id, sub, email, name, at, at]);
    return this.one('SELECT id, google_sub, email, name FROM baasha_users WHERE google_sub = ?', [sub]);
  }
  async ensureWorkspace(userId, name) {
    await this.q('INSERT INTO baasha_workspaces (id, owner_user_id, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner_user_id) DO NOTHING', [newId(), userId, name, nowIso()]);
    return this.one('SELECT id, owner_user_id, name FROM baasha_workspaces WHERE owner_user_id = ?', [userId]);
  }
  async createSession(s) { await this.q('INSERT INTO baasha_sessions (token_hash, user_id, workspace_id, csrf, created_at, expires_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?)', [s.tokenHash, s.userId, s.workspaceId, s.csrf, s.createdAt || nowIso(), s.expiresAt, s.ipHash || null]); }
  async getSession(tokenHash, now = nowIso()) {
    const r = await this.one('SELECT s.user_id, s.workspace_id, s.csrf, s.expires_at, u.email, u.name FROM baasha_sessions s JOIN baasha_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?', [tokenHash, now]);
    return r ? { userId: r.user_id, workspaceId: r.workspace_id, csrf: r.csrf, expiresAt: r.expires_at, email: r.email, name: r.name } : null;
  }
  async deleteSession(tokenHash) { await this.q('DELETE FROM baasha_sessions WHERE token_hash = ?', [tokenHash]); }
  async listMemories(ws, { status = null } = {}) {
    return status ? this.q('SELECT * FROM baasha_memories WHERE workspace_id = ? AND status = ? ORDER BY updated_at DESC', [ws, status]) : this.q('SELECT * FROM baasha_memories WHERE workspace_id = ? ORDER BY updated_at DESC', [ws]);
  }
  async getMemory(ws, id) { return this.one('SELECT * FROM baasha_memories WHERE workspace_id = ? AND id = ?', [ws, id]); }
  async createMemory(ws, m) {
    const row = { id: newId(), workspace_id: ws, task_id: null, ...m, created_at: nowIso(), updated_at: nowIso() };
    await this.q('INSERT INTO baasha_memories (id, workspace_id, kind, subject, content, status, source, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [row.id, ws, row.kind, row.subject || null, row.content, row.status, row.source, row.task_id, row.created_at, row.updated_at]);
    return row;
  }
  async updateMemory(ws, id, f) {
    const cur = await this.getMemory(ws, id); if (!cur) return null;
    const next = { ...cur, ...f, updated_at: nowIso() };
    await this.q('UPDATE baasha_memories SET subject = ?, content = ?, status = ?, updated_at = ? WHERE workspace_id = ? AND id = ?', [next.subject || null, next.content, next.status, next.updated_at, ws, id]);
    return next;
  }
  async deleteMemory(ws, id) {
    if (!(await this.getMemory(ws, id))) return false;
    await this.q('DELETE FROM baasha_memory_history WHERE memory_id = ?', [id]); await this.q('DELETE FROM baasha_memories WHERE workspace_id = ? AND id = ?', [ws, id]); return true;
  }
  async countMemories(ws, status = null) { const r = status ? await this.one('SELECT COUNT(*) AS n FROM baasha_memories WHERE workspace_id = ? AND status = ?', [ws, status]) : await this.one('SELECT COUNT(*) AS n FROM baasha_memories WHERE workspace_id = ?', [ws]); return Number(r?.n || 0); }
  async addHistory(h) { await this.q('INSERT INTO baasha_memory_history (memory_id, version, content, subject, changed_at, changed_by, reason) VALUES (?, ?, ?, ?, ?, ?, ?)', [h.memory_id, h.version, h.content, h.subject || null, h.changed_at, h.changed_by, h.reason || null]); }
  async listHistory(ws, id) { if (!(await this.getMemory(ws, id))) return null; return this.q('SELECT memory_id, version, content, subject, changed_at, changed_by, reason FROM baasha_memory_history WHERE memory_id = ? ORDER BY version DESC', [id]); }
  async deleteWorkspaceAccount(userId) {
    const w = await this.one('SELECT id FROM baasha_workspaces WHERE owner_user_id = ?', [userId]);
    if (w) {
      await this.q('DELETE FROM baasha_memory_history WHERE memory_id IN (SELECT id FROM baasha_memories WHERE workspace_id = ?)', [w.id]);
      await this.q('DELETE FROM baasha_memories WHERE workspace_id = ?', [w.id]);
    }
    await this.q('DELETE FROM baasha_sessions WHERE user_id = ?', [userId]);
    if (w) await this.q('DELETE FROM baasha_workspaces WHERE id = ?', [w.id]);
    await this.q('DELETE FROM baasha_users WHERE id = ?', [userId]);
    return w ? w.id : null;
  }
  async purgeExpiredSessions(now = nowIso()) { await this.q('DELETE FROM baasha_sessions WHERE expires_at <= ?', [now]); }
}

let store = null, chosen = null;
export const setWsStore = (s) => { store = s; chosen = s ? Promise.resolve(s) : null; };
export async function getWsStore() {
  if (store) return store;
  chosen ||= (async () => {
    try {
      const db = await import('../store/db.js');
      if (db.databaseEnvVar) return (store = new PgWsStore(db));
    } catch (e) { console.error('[baasha] accounts store: database unavailable, using memory:', e?.code || e?.message); }
    return (store = new MemoryWsStore());
  })();
  return chosen;
}
