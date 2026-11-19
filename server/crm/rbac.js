// Role-based access: every admin request resolves to an "actor" whose role
// carries a list of module permissions ('*' = everything). Writes are logged.

import * as store from '../store/db.js';

export const MODULES = {
  dashboard: 'Dashboard', crm: 'CRM (leads, contacts, deals, clients, tasks)', payments: 'Payment verification',
  finance: 'Invoices, subscriptions, revenue & expenses', seo: 'SEO, AEO, GEO & campaigns', content: 'Blog & page content',
  reports: 'Reports & analytics', team: 'Team & activity log', settings: 'Settings & pricing',
};

const FOUNDER = { id: null, name: 'Founder', email: null, role: 'founder', permissions: ['*'] };

export async function loadActor(session) {
  if (!session.user_id) return FOUNDER;
  const u = await store.queryOne('SELECT u.id, u.name, u.email, u.role, u.active, r.permissions FROM users u LEFT JOIN roles r ON r.key = u.role WHERE u.id = ?', [session.user_id]);
  if (!u || !u.active) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role, permissions: u.permissions || [] };
}

export const can = (actor, mod) => Boolean(actor) && (actor.permissions.includes('*') || actor.permissions.includes(mod));

/** Express guard: 403 unless the actor holds the module. */
export const need = (mod) => (req, res, next) =>
  can(req.actor, mod) ? next() : res.status(403).json({ error: { code: 'forbidden', message: 'Your role does not have access to this section.' } });

/** Fire-and-forget audit trail entry. */
export function log(req, action, entity = null, entityId = null, detail = null) {
  const a = req.actor || FOUNDER;
  return store.query('INSERT INTO audit_logs (actor, actor_role, action, entity, entity_id, detail, ip) VALUES (?,?,?,?,?,?,?)', [a.name, a.role, action, entity, entityId, detail && String(detail).slice(0, 400), req.ip]).catch(() => {});
}
