// Admin API for Baasha AI. Mounted by the site under /api/admin/baasha, behind the existing admin guard
// (admin session, plus the CSRF header on every change). It shows what is real: the loaded tools, skills and
// knowledge, usage from the task log, accounts, and sign-in setup. It never exposes secrets, sessions or memory text.
import express from 'express';
import { statusReport } from './routes.js';
import { getTaskStore, readTask, deleteWorkspaceTasks, STATES } from './taskstore.js';
import { getWsStore } from './wsstore.js';
import { getKnowledgeBase } from './kb.js';
import { toolCatalogue } from './agenttools.js';
import { LIMITS } from './limits.js';
import { isEnabled, setEnabled } from './switch.js';
import { RETENTION_DAYS } from './taskstore.js';

const cut = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const idOk = (id) => /^[A-Za-z0-9_-]{8,64}$/.test(String(id || ''));
const bad = (res, status, code, message) => res.status(status).json({ error: { code, message } });

export function createAdminRouter({ getTasks = getTaskStore, getWs = getWsStore, status = statusReport } = {}) {
  const r = express.Router();
  const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error('[baasha-admin]', req.method, req.path, e?.code || e?.message); if (!res.headersSent) bad(res, 503, 'unavailable', 'This section could not be loaded right now.'); } };

  r.get('/overview', h(async (req, res) => {
    const [tasks, ws] = [await getTasks(), await getWs()];
    const [st, tstats, accounts, enabled] = await Promise.all([status(), tasks.taskStats(), ws.adminSummary(), isEnabled()]);
    const kb = getKnowledgeBase().stats();
    res.set('cache-control', 'no-store').json({
      ok: true, enabled,
      status: { state: st.state, model: st.model, provider: st.provider, research: st.research, accounts: st.accounts },
      agent: { tools: toolCatalogue(), skills: kb.skills, knowledge: { documents: kb.documents, sections: kb.sections, areas: kb.areas }, taskLog: tasks.kind, retentionDays: RETENTION_DAYS },
      tasks: tstats, accounts, limits: { perHourPerVisitor: LIMITS, dailyCap: Number(process.env.BAASHA_DAILY_LIMIT || 600) },
    });
  }));

  r.get('/tasks', h(async (req, res) => {
    const status_ = STATES.includes(req.query.status) ? req.query.status : null;
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit, 10) || 50));
    const rows = await (await getTasks()).listRecent({ limit, status: status_ });
    res.set('cache-control', 'no-store').json({ ok: true, statuses: STATES, tasks: rows.map((t) => ({
      id: t.id, mode: t.mode, status: t.status, goal: cut(t.goal, 200), signedIn: Boolean(t.workspace_id), createdAt: t.created_at, completedAt: t.completed_at || null,
      tools: (t.summary?.tools || []).map((x) => x.name), seconds: t.summary?.seconds ?? null, modelCalls: t.summary?.modelCalls ?? null, approvals: (t.summary?.approvals || []).length })) });
  }));
  r.get('/tasks/:id', h(async (req, res) => {
    if (!idOk(req.params.id)) return bad(res, 404, 'not_found', 'That task does not exist.');
    const t = await readTask(req.params.id, await getTasks(), { admin: true });
    if (!t) return bad(res, 404, 'not_found', 'That task does not exist.');
    res.set('cache-control', 'no-store').json({ ok: true, task: { ...t, goal: cut(t.goal, 500) } });
  }));
  r.post('/tasks/delete', h(async (req, res) => {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).filter(idOk).slice(0, 100);
    if (!ids.length) return bad(res, 400, 'invalid', 'Choose at least one task.');
    const n = await (await getTasks()).deleteIds(ids); console.log('[baasha-admin] deleted tasks:', n); res.json({ ok: true, deleted: n });
  }));

  r.get('/accounts', h(async (req, res) => {
    const [ws, tasks] = [await getWs(), await getTasks()];
    const [users, counts] = await Promise.all([ws.adminUsers(), tasks.countByWorkspace()]);
    res.set('cache-control', 'no-store').json({ ok: true, storage: ws.kind, accounts: users.map((u) => ({ id: u.id, email: u.email, name: cut(u.name, 80), createdAt: u.created_at, lastLoginAt: u.last_login_at, memoriesApproved: u.approved, memoriesProposed: u.proposed, tasks: counts[u.workspace_id] || 0 })) });
  }));
  r.post('/accounts/delete', h(async (req, res) => {
    if (!idOk(req.body?.userId)) return bad(res, 400, 'invalid', 'Choose an account.');
    const wsId = await (await getWs()).deleteWorkspaceAccount(req.body.userId);
    if (wsId) await deleteWorkspaceTasks(wsId, await getTasks());
    console.log('[baasha-admin] deleted an account and its workspace data'); res.json({ ok: true, deleted: Boolean(wsId) });
  }));

  r.get('/knowledge', h(async (req, res) => {
    const kb = getKnowledgeBase();
    res.set('cache-control', 'no-store').json({ ok: true, stats: kb.stats(), skills: kb.listSkills(), documents: kb.docs() });
  }));

  r.put('/switch', h(async (req, res) => {
    if (typeof req.body?.enabled !== 'boolean') return bad(res, 400, 'invalid', 'Send enabled: true or false.');
    const enabled = await setEnabled(req.body.enabled); console.log('[baasha-admin] Baasha AI switched', enabled ? 'on' : 'off'); res.json({ ok: true, enabled });
  }));
  return r;
}
export default createAdminRouter;
