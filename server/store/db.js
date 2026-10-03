// Persistence layer — PostgreSQL only (Neon on Vercel, or any Postgres).
// The app never stores data on the local filesystem: Vercel's disk is
// read-only and not persistent. All application data — audits, leads,
// orders/payments, admin sessions, login throttling and site settings —
// lives in the database named by DATABASE_URL.

import crypto from 'node:crypto';
import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';

// Neon's Vercel integration sets DATABASE_URL (and POSTGRES_URL); a custom
// prefix chosen in the integration produces e.g. STORAGE_DATABASE_URL.
const URL_VARS = ['DATABASE_URL', 'POSTGRES_URL', 'NEON_DATABASE_URL', 'POSTGRES_PRISMA_URL'];
function findDatabaseUrl(env = process.env) {
  for (const k of URL_VARS) if (env[k]) return { name: k, url: env[k] };
  const k = Object.keys(env).sort().find((n) => /_(DATABASE_URL|POSTGRES_URL)$/.test(n) && env[n]);
  return k ? { name: k, url: env[k] } : null;
}
const found = findDatabaseUrl();
export const driver = 'postgres';
export const databaseEnvVar = found?.name || null;

export class DatabaseConfigError extends Error {
  constructor() {
    super('DATABASE_URL is not set. Connect a Postgres database (Vercel → Storage → Neon) and redeploy, or set DATABASE_URL in .env for local development.');
    this.code = 'database_not_configured';
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY, name TEXT, email TEXT, phone TEXT, company TEXT,
    password_hash TEXT, created_at TEXT NOT NULL)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`,
  `CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
    name TEXT, email TEXT, phone TEXT, whatsapp TEXT, company TEXT, website TEXT,
    service TEXT, message TEXT, source TEXT,
    status TEXT NOT NULL DEFAULT 'new', audit_id TEXT, order_id TEXT, forwarded INTEGER DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, domain TEXT UNIQUE NOT NULL, name TEXT, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS audits (
    id TEXT PRIMARY KEY, customer_id TEXT, order_id TEXT,
    plan TEXT NOT NULL DEFAULT 'internal', website TEXT NOT NULL, domain TEXT, mode TEXT,
    status TEXT NOT NULL, score INTEGER, pages INTEGER, issues INTEGER,
    previous_audit_id TEXT, email TEXT, business TEXT, category TEXT,
    progress TEXT, input TEXT, data TEXT, error TEXT,
    created_at TEXT NOT NULL, completed_at TEXT)`,
  // Columns added after the first release.
  `ALTER TABLE audits ADD COLUMN IF NOT EXISTS business TEXT`,
  `ALTER TABLE audits ADD COLUMN IF NOT EXISTS category TEXT`,
  `ALTER TABLE audits ADD COLUMN IF NOT EXISTS progress TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_audits_domain ON audits(domain, created_at)`,
  `CREATE TABLE IF NOT EXISTS audit_findings (
    audit_id TEXT NOT NULL, url TEXT, category TEXT, issue TEXT, severity TEXT, priority TEXT,
    recommendation TEXT, status TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_findings_audit ON audit_findings(audit_id)`,
  `CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, customer_id TEXT,
    plan TEXT NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL DEFAULT 'INR',
    payment_status TEXT NOT NULL DEFAULT 'pending', transaction_id TEXT,
    name TEXT, email TEXT, phone TEXT, business TEXT, website TEXT,
    category TEXT, location TEXT, requirements TEXT, audit_id TEXT, admin_note TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, verified_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, ip TEXT)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip, at)`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

// ── Connection pool (one per serverless instance) ────────────────────────
let pool = null;
function getPool() {
  if (pool) return pool;
  if (!found) throw new DatabaseConfigError();
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(found.url);
  pool = new pg.Pool({
    connectionString: found.url,
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    ...(local ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  // Lets Vercel Fluid compute close idle connections before an instance is suspended.
  try { attachDatabasePool(pool); } catch {}
  return pool;
}

// ── Migrations ───────────────────────────────────────────────────────────
// Every statement is idempotent. A transaction-scoped advisory lock stops two
// cold-starting instances from running the DDL at the same moment.
const MIGRATION_LOCK = 7_301_102_400;
async function migrate() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    for (const s of SCHEMA) await client.query(s);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

let ready = null;
function ensureReady() {
  // If initialisation fails (e.g. database briefly unreachable), the next request retries.
  ready ||= migrate().catch((err) => { ready = null; throw err; });
  return ready;
}

const q = async (sql, params = []) => {
  await ensureReady();
  let i = 0;
  const text = sql.replace(/\?/g, () => `$${++i}`);
  const values = params.map((v) => (v === undefined || v === '' ? null : v));
  return (await getPool().query(text, values)).rows;
};
const one = async (sql, params) => (await q(sql, params))[0] || null;
const num = (v) => (v == null ? null : Number(v));

export const newId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');
const now = () => new Date().toISOString();
const json = (v) => (v ? JSON.parse(v) : null);

// An audit can run for at most the function time limit; anything "running"
// for longer than this was cut off and is reported as failed.
const STALE_MS = Number(process.env.AUDIT_STALE_MS || 7 * 60_000);

// ── Customers ────────────────────────────────────────────────────────────
export async function upsertCustomer({ name, email, phone, company }) {
  const e = (email || '').toLowerCase();
  if (!e) return null;
  const row = await one('SELECT id FROM customers WHERE email = ?', [e]);
  if (row) {
    await q('UPDATE customers SET name = COALESCE(?, name), phone = COALESCE(?, phone), company = COALESCE(?, company) WHERE id = ?', [name, phone, company, row.id]);
    return row.id;
  }
  const id = newId(8);
  await q('INSERT INTO customers (id, name, email, phone, company, created_at) VALUES (?,?,?,?,?,?)', [id, name, e, phone, company, now()]);
  return id;
}

// ── Projects ─────────────────────────────────────────────────────────────
export async function ensureProject(domain, name) {
  const existing = await one('SELECT * FROM projects WHERE domain = ?', [domain]);
  if (existing) return existing;
  const p = { id: newId(8), domain, name: name || domain, created_at: now() };
  await q('INSERT INTO projects (id, domain, name, created_at) VALUES (?,?,?,?) ON CONFLICT (domain) DO NOTHING', [p.id, p.domain, p.name, p.created_at]);
  return p;
}

export async function listProjects() {
  const rows = await q(`
    SELECT p.id, p.domain, p.name, p.created_at,
      (SELECT COUNT(*) FROM audits a WHERE a.domain = p.domain) AS audit_count,
      (SELECT MAX(created_at) FROM audits a WHERE a.domain = p.domain) AS last_audit_at,
      (SELECT score FROM audits WHERE domain = p.domain AND status = 'complete' ORDER BY created_at DESC LIMIT 1) AS latest_score,
      (SELECT score FROM audits WHERE domain = p.domain AND status = 'complete' ORDER BY created_at DESC LIMIT 1 OFFSET 1) AS previous_score,
      (SELECT id FROM audits WHERE domain = p.domain AND status = 'complete' ORDER BY created_at DESC LIMIT 1) AS latest_audit_id
    FROM projects p ORDER BY last_audit_at DESC`);
  return rows.map((r) => ({ ...r, audit_count: num(r.audit_count), latest_score: num(r.latest_score), previous_score: num(r.previous_score) }));
}

// ── Audits ───────────────────────────────────────────────────────────────
export async function createAudit({ website, domain, mode, plan = 'internal', input, previousAuditId = null, customerId = null, orderId = null, email = null }) {
  const id = newId();
  await q(`INSERT INTO audits (id, website, domain, mode, plan, status, input, previous_audit_id, customer_id, order_id, email, business, category, progress, created_at)
    VALUES (?,?,?,?,?,'running',?,?,?,?,?,?,?,?,?)`,
  [id, website, domain, mode, plan, JSON.stringify(input), previousAuditId, customerId, orderId, email, input.businessName, input.category, '[]', now()]);
  return id;
}

export async function saveProgress(id, events) {
  await q(`UPDATE audits SET progress = ? WHERE id = ? AND status = 'running'`, [JSON.stringify(events), id]);
}

export async function completeAudit(id, audit, events) {
  await ensureProject(audit.domain, audit.input.businessName || audit.domain);
  await q(`UPDATE audits SET status='complete', website=?, domain=?, score=?, pages=?, issues=?, data=?, progress=?, completed_at=? WHERE id=?`,
    [audit.website, audit.domain, audit.score.overall, audit.pagesAnalyzed, audit.issues.length, JSON.stringify(audit), JSON.stringify(events || []), now(), id]);
  await q('DELETE FROM audit_findings WHERE audit_id = ?', [id]);
  const rows = [];
  for (const i of audit.issues) {
    const pages = i.affected?.pages?.length ? i.affected.pages.map((p) => p.url) : [audit.website];
    for (const url of pages.slice(0, 25)) rows.push([id, url, i.category, i.title, i.severity, i.priority, i.recommendation, i.status]);
  }
  // Batch insert in chunks to keep round-trips low on serverless.
  for (let k = 0; k < rows.length; k += 50) {
    const chunk = rows.slice(k, k + 50);
    await q(`INSERT INTO audit_findings (audit_id, url, category, issue, severity, priority, recommendation, status) VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?)').join(',')}`, chunk.flat());
  }
}

export async function failAudit(id, error, events) {
  await q(`UPDATE audits SET status='failed', error=?, progress=COALESCE(?, progress), completed_at=? WHERE id=?`, [JSON.stringify(error), events ? JSON.stringify(events) : null, now(), id]);
}

export async function getAudit(id) {
  const r = await one('SELECT * FROM audits WHERE id = ?', [id]);
  if (!r) return null;
  if (r.status === 'running' && Date.now() - Date.parse(r.created_at) > STALE_MS) {
    const error = { code: 'timeout', message: 'This audit took longer than the allowed time and was stopped. Please try again, or choose a smaller audit.' };
    await failAudit(r.id, error);
    r.status = 'failed';
    r.error = JSON.stringify(error);
  }
  return {
    id: r.id, status: r.status, plan: r.plan, website: r.website, domain: r.domain, mode: r.mode,
    email: r.email, orderId: r.order_id, createdAt: r.created_at, completedAt: r.completed_at,
    previousAuditId: r.previous_audit_id, input: json(r.input), error: json(r.error),
    progress: json(r.progress) || [], audit: json(r.data),
  };
}

export async function listAudits({ domain, plan, limit = 100 } = {}) {
  const where = [];
  const args = [];
  if (domain) { where.push('a.domain = ?'); args.push(domain); }
  if (plan === 'paid') where.push("a.plan IN ('p25','p50')");
  else if (plan) { where.push('a.plan = ?'); args.push(plan); }
  args.push(limit);
  const rows = await q(`SELECT a.id, a.website, a.domain, a.mode, a.plan, a.status, a.score, a.pages, a.issues, a.email, a.order_id,
      a.previous_audit_id, a.created_at, a.completed_at, a.business, o.payment_status
    FROM audits a LEFT JOIN orders o ON o.id = a.order_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY a.created_at DESC LIMIT ?`, args);
  return rows.map((r) => ({ ...r, score: num(r.score), pages: num(r.pages), issues: num(r.issues) }));
}

export async function recentFreeAudit(domain, email, sinceIso) {
  return one(`SELECT id, status FROM audits WHERE plan='free' AND domain=? AND email=? AND created_at > ? AND status != 'failed' ORDER BY created_at DESC LIMIT 1`, [domain, (email || '').toLowerCase(), sinceIso]);
}

export async function previousCompleteAudit(domain, beforeIso) {
  return (await one(`SELECT id FROM audits WHERE domain=? AND status='complete' AND created_at < ? ORDER BY created_at DESC LIMIT 1`, [domain, beforeIso]))?.id || null;
}

// ── Orders / payments ────────────────────────────────────────────────────
export const PAYMENT_STATUSES = ['pending', 'screenshot_received', 'under_verification', 'verified', 'rejected'];

export async function createOrder(o) {
  const id = newId(8);
  const token = newId(16);
  const t = now();
  await q(`INSERT INTO orders (id, token, customer_id, plan, amount, payment_status, name, email, phone, business, website, category, location, requirements, created_at, updated_at)
    VALUES (?,?,?,?,?,'pending',?,?,?,?,?,?,?,?,?,?)`,
  [id, token, o.customerId, o.plan, o.amount, o.name, o.email, o.phone, o.business, o.website, o.category, o.location, o.requirements, t, t]);
  return { id, token };
}
const orderRow = (r) => (r ? { ...r, amount: num(r.amount), audit_score: num(r.audit_score) } : null);
export const getOrderByToken = async (token) => orderRow(await one('SELECT * FROM orders WHERE token = ?', [token]));
export const getOrder = async (id) => orderRow(await one('SELECT * FROM orders WHERE id = ?', [id]));
export const listOrders = async () => (await q(`SELECT o.*, a.status AS audit_status, a.score AS audit_score FROM orders o LEFT JOIN audits a ON a.id = o.audit_id ORDER BY o.created_at DESC LIMIT 500`)).map(orderRow);
export async function updateOrder(id, fields) {
  const allowed = ['payment_status', 'transaction_id', 'audit_id', 'admin_note', 'verified_at'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (!keys.length) return;
  await q(`UPDATE orders SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...keys.map((k) => fields[k]), now(), id]);
}

// ── Leads ────────────────────────────────────────────────────────────────
export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost'];
export async function createLead(l) {
  const id = newId(8);
  await q(`INSERT INTO leads (id, created_at, name, email, phone, whatsapp, company, website, service, message, source, audit_id, order_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, now(), l.name, l.email, l.phone, l.whatsapp, l.company, l.website, l.service, l.message, l.source, l.auditId, l.orderId]);
  return id;
}
export const linkLeadAudit = (leadId, auditId) => q('UPDATE leads SET audit_id = ? WHERE id = ?', [auditId, leadId]);
export const markLeadForwarded = (id) => q('UPDATE leads SET forwarded = 1 WHERE id = ?', [id]);
export const listLeads = () => q('SELECT * FROM leads ORDER BY created_at DESC LIMIT 1000');
export const updateLeadStatus = (id, status) => q('UPDATE leads SET status = ? WHERE id = ?', [status, id]);

// ── Admin sessions & login throttling (stored in the DB so they work across serverless instances)
export async function createSession(tokenHash, csrf, hours, ip) {
  await q('DELETE FROM sessions WHERE expires_at < ?', [now()]);
  await q('INSERT INTO sessions (token_hash, csrf, created_at, expires_at, ip) VALUES (?,?,?,?,?)', [tokenHash, csrf, now(), new Date(Date.now() + hours * 3600_000).toISOString(), ip]);
}
export const getSession = (tokenHash) => one('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?', [tokenHash, now()]);
export const deleteSession = (tokenHash) => q('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
export async function recentFailedLogins(ip, minutes) {
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  await q('DELETE FROM login_attempts WHERE at < ?', [new Date(Date.now() - 24 * 3600_000).toISOString()]);
  return num((await one('SELECT COUNT(*) AS n FROM login_attempts WHERE ip = ? AND at > ?', [ip, since])).n);
}
export const recordFailedLogin = (ip) => q('INSERT INTO login_attempts (ip, at) VALUES (?, ?)', [ip, now()]);
export const clearFailedLogins = (ip) => q('DELETE FROM login_attempts WHERE ip = ?', [ip]);

// ── Settings ─────────────────────────────────────────────────────────────
export async function getSetting(key, fallback) {
  const row = await one('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? JSON.parse(row.value) : fallback;
}
export async function setSetting(key, value) {
  await q('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
}

// ── Analytics ────────────────────────────────────────────────────────────
export async function stats() {
  const n = async (sql, a = []) => num((await one(sql, a)).n) ?? 0;
  const groups = async (sql) => (await q(sql)).map((r) => ({ label: r.label, n: num(r.n) }));
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  return {
    leads: await n('SELECT COUNT(*) AS n FROM leads'),
    newLeads: await n("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'"),
    leadsThisWeek: await n('SELECT COUNT(*) AS n FROM leads WHERE created_at > ?', [weekAgo]),
    audits: await n("SELECT COUNT(*) AS n FROM audits WHERE status = 'complete'"),
    freeAudits: await n("SELECT COUNT(*) AS n FROM audits WHERE plan = 'free' AND status = 'complete'"),
    paidAudits: await n("SELECT COUNT(*) AS n FROM audits WHERE plan IN ('p25','p50') AND status = 'complete'"),
    orders: await n('SELECT COUNT(*) AS n FROM orders'),
    pendingVerification: await n("SELECT COUNT(*) AS n FROM orders WHERE payment_status IN ('screenshot_received','under_verification')"),
    revenue: await n("SELECT COALESCE(SUM(amount),0) AS n FROM orders WHERE payment_status = 'verified'"),
    verifiedOrders: await n("SELECT COUNT(*) AS n FROM orders WHERE payment_status = 'verified'"),
    avgScore: num((await one("SELECT ROUND(AVG(score)) AS n FROM audits WHERE status = 'complete' AND plan != 'internal'")).n),
    wonLeads: await n("SELECT COUNT(*) AS n FROM leads WHERE status = 'won'"),
    byService: await groups("SELECT COALESCE(service, 'Not specified') AS label, COUNT(*) AS n FROM leads GROUP BY COALESCE(service, 'Not specified') ORDER BY n DESC LIMIT 8"),
    bySource: await groups("SELECT COALESCE(source, 'unknown') AS label, COUNT(*) AS n FROM leads GROUP BY COALESCE(source, 'unknown') ORDER BY n DESC"),
    byIndustry: await groups("SELECT COALESCE(category, 'Not specified') AS label, COUNT(*) AS n FROM audits WHERE plan != 'internal' GROUP BY COALESCE(category, 'Not specified') ORDER BY n DESC LIMIT 8"),
    byPlan: await groups("SELECT plan AS label, COUNT(*) AS n FROM audits WHERE status='complete' GROUP BY plan"),
  };
}
