// Dashboard and report queries. Everything is computed from real rows; a block
// the signed-in role may not see comes back as null (and is not rendered).
// Dates are bucketed in India time (IST) so "today" matches the business day.

import * as store from '../store/db.js';
import * as blog from '../blog.js';
import { can } from './rbac.js';
import { scorePost } from '../../public/js/scores.js';

const DAY = 86_400_000;
const IST_MS = 330 * 60_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ist = (c) => `(${c}::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text`;
export const istToday = (d = new Date()) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
const startIso = (d) => new Date(d + 'T00:00:00+05:30').toISOString();
const q = store.query;
const n = async (sql, a = []) => Number((await store.queryOne(sql, a))?.n ?? 0);

export function resolveRange({ range = '30d', from, to } = {}) {
  const today = istToday();
  let a; let b = today;
  if (range === 'today') a = today;
  else if (range === '7d') a = addDays(today, -6);
  else if (range === 'month') a = today.slice(0, 8) + '01';
  else if (range === 'custom' && DATE.test(from || '') && DATE.test(to || '') && from <= to) { a = from; b = to; }
  else a = addDays(today, -29);
  if ((Date.parse(b) - Date.parse(a)) / DAY > 365) a = addDays(b, -365);
  const days = Math.round((Date.parse(b) - Date.parse(a)) / DAY) + 1;
  const pb = addDays(a, -1); const pa = addDays(pb, -(days - 1));
  return { a, b, days, start: startIso(a), end: startIso(addDays(b, 1)), pstart: startIso(pa), pend: startIso(a), pa, pb };
}

const delta = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : cur ? null : 0);

// verified audit-order payments + paid invoices, as one revenue stream
const revenueIn = async (s, e, a, b) =>
  (await n("SELECT COALESCE(SUM(amount),0) AS n FROM orders WHERE payment_status = 'verified' AND COALESCE(verified_at, updated_at) >= ? AND COALESCE(verified_at, updated_at) < ?", [s, e])) +
  (await n("SELECT COALESCE(SUM(total),0) AS n FROM invoices WHERE status = 'paid' AND paid_at >= ?::date AND paid_at <= ?::date", [a, b]));

export async function dashboard(actor, params) {
  const r = resolveRange(params);
  const money = can(actor, 'payments') || can(actor, 'finance');
  const crm = can(actor, 'crm');
  const seoOK = can(actor, 'seo');
  const contentOK = can(actor, 'content');
  const today = istToday();
  const out = { range: { from: r.a, to: r.b, days: r.days }, kpis: {}, charts: {}, lists: {} };

  if (money) {
    const rev = await revenueIn(r.start, r.end, r.a, r.b);
    const prev = await revenueIn(r.pstart, r.pend, r.pa, r.pb);
    out.kpis.revenue = { value: rev, delta: delta(rev, prev) };
    out.kpis.verifiedPayments = { value: await n("SELECT COUNT(*) AS n FROM orders WHERE payment_status = 'verified' AND COALESCE(verified_at, updated_at) >= ? AND COALESCE(verified_at, updated_at) < ?", [r.start, r.end]) };
    const pend = await store.queryOne("SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM orders WHERE payment_status IN ('pending','screenshot_received','under_verification')");
    out.kpis.pendingPayments = { value: Number(pend.c), amount: Number(pend.s) };

    // Revenue per day (or month for long ranges) in the selected window
    const bucket = (d) => (r.days > 92 ? d.slice(0, 7) : d);
    const m = new Map();
    const add = (d, v) => m.set(bucket(d), (m.get(bucket(d)) || 0) + Number(v));
    for (const x of await q(`SELECT ${ist('COALESCE(verified_at, updated_at)')} AS d, SUM(amount) AS v FROM orders WHERE payment_status = 'verified' AND COALESCE(verified_at, updated_at) >= ? AND COALESCE(verified_at, updated_at) < ? GROUP BY 1`, [r.start, r.end])) add(x.d, x.v);
    for (const x of await q("SELECT paid_at::text AS d, SUM(total) AS v FROM invoices WHERE status = 'paid' AND paid_at >= ?::date AND paid_at <= ?::date GROUP BY 1", [r.a, r.b])) add(x.d, x.v);
    out.charts.revenue = fill(r, m);

    // Monthly revenue, last 12 months (independent of the filter)
    const mStart = today.slice(0, 7) + '-01';
    const first = new Date(Date.parse(mStart + 'T00:00:00Z')); first.setUTCMonth(first.getUTCMonth() - 11);
    const f12 = first.toISOString().slice(0, 10);
    const mm = new Map();
    for (const x of await q(`SELECT substr(${ist('COALESCE(verified_at, updated_at)')}, 1, 7) AS d, SUM(amount) AS v FROM orders WHERE payment_status = 'verified' AND COALESCE(verified_at, updated_at) >= ? GROUP BY 1`, [startIso(f12)])) mm.set(x.d, (mm.get(x.d) || 0) + Number(x.v));
    for (const x of await q("SELECT substr(paid_at::text, 1, 7) AS d, SUM(total) AS v FROM invoices WHERE status = 'paid' AND paid_at >= ?::date GROUP BY 1", [f12])) mm.set(x.d, (mm.get(x.d) || 0) + Number(x.v));
    out.charts.monthly = Array.from({ length: 12 }, (_, i) => { const d = new Date(first); d.setUTCMonth(d.getUTCMonth() + i); const k = d.toISOString().slice(0, 7); return { label: k, value: mm.get(k) || 0 }; });

    const overdue = await n("SELECT COALESCE(SUM(total),0) AS n FROM invoices WHERE status = 'unpaid' AND due_date < ?::date", [today]);
    const invPending = await n("SELECT COALESCE(SUM(total),0) AS n FROM invoices WHERE status = 'unpaid' AND (due_date IS NULL OR due_date >= ?::date)", [today]);
    out.charts.payments = { paid: rev, pending: Number(pend.s) + invPending, overdue };
  }

  if (crm) {
    const leads = await n('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ? AND created_at < ?', [r.start, r.end]);
    const pleads = await n('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ? AND created_at < ?', [r.pstart, r.pend]);
    const won = await n("SELECT COUNT(*) AS n FROM leads WHERE status = 'won' AND created_at >= ? AND created_at < ?", [r.start, r.end]);
    out.kpis.totalLeads = { value: leads, delta: delta(leads, pleads) };
    out.kpis.newLeads = { value: await n("SELECT COUNT(*) AS n FROM leads WHERE status = 'new' AND created_at >= ? AND created_at < ?", [r.start, r.end]) };
    out.kpis.qualifiedLeads = { value: await n("SELECT COUNT(*) AS n FROM leads WHERE status IN ('qualified','proposal_sent','negotiation') AND created_at >= ? AND created_at < ?", [r.start, r.end]) };
    out.kpis.activeClients = { value: await n("SELECT COUNT(*) AS n FROM clients WHERE status = 'active'") };
    const deals = await store.queryOne("SELECT COUNT(*) AS c, COALESCE(SUM(value),0) AS s FROM deals WHERE stage NOT IN ('won','lost')");
    out.kpis.activeDeals = { value: Number(deals.c), amount: Number(deals.s) };
    out.kpis.conversion = { value: leads ? Math.round((won / leads) * 1000) / 10 : 0, won };

    const bucket = (d) => (r.days > 92 ? d.slice(0, 7) : d);
    const lm = new Map(); const wm = new Map();
    for (const x of await q(`SELECT ${ist('created_at')} AS d, COUNT(*) AS c, COUNT(*) FILTER (WHERE status = 'won') AS w FROM leads WHERE created_at >= ? AND created_at < ? GROUP BY 1`, [r.start, r.end])) {
      lm.set(bucket(x.d), (lm.get(bucket(x.d)) || 0) + Number(x.c)); wm.set(bucket(x.d), (wm.get(bucket(x.d)) || 0) + Number(x.w));
    }
    out.charts.leads = fill(r, lm); out.charts.won = fill(r, wm);
    out.charts.pipeline = await q('SELECT status AS label, COUNT(*) AS n FROM leads WHERE created_at >= ? AND created_at < ? GROUP BY status', [r.start, r.end]);
    out.lists.recentLeads = await q('SELECT id, name, company, service, source, status, budget, created_at FROM leads ORDER BY created_at DESC LIMIT 6');
    const fu = [
      ...(await q("SELECT id, title, due_date::text AS due, priority, 'task' AS type FROM tasks WHERE status = 'pending' AND due_date IS NOT NULL AND due_date <= ?::date + 7 ORDER BY due_date LIMIT 8", [today])),
      ...(await q("SELECT id, COALESCE(name, company, 'Lead') AS title, next_followup::text AS due, NULL AS priority, 'lead' AS type FROM leads WHERE next_followup IS NOT NULL AND next_followup <= ?::date + 7 AND status NOT IN ('won','lost') ORDER BY next_followup LIMIT 8", [today])),
    ];
    out.lists.followups = fu.sort((x, y) => x.due.localeCompare(y.due)).slice(0, 8).map((x) => ({ ...x, overdue: x.due < today }));
  }

  if (seoOK) {
    const done = await n("SELECT COUNT(*) AS n FROM audits WHERE status = 'complete' AND created_at >= ? AND created_at < ?", [r.start, r.end]);
    const pdone = await n("SELECT COUNT(*) AS n FROM audits WHERE status = 'complete' AND created_at >= ? AND created_at < ?", [r.pstart, r.pend]);
    out.kpis.audits = { value: done, delta: delta(done, pdone) };
    out.lists.audits = {
      byStatus: await q('SELECT status AS label, COUNT(*) AS n FROM audits WHERE created_at >= ? AND created_at < ? GROUP BY status', [r.start, r.end]),
      byPlan: await q("SELECT plan AS label, COUNT(*) AS n FROM audits WHERE status = 'complete' AND created_at >= ? AND created_at < ? GROUP BY plan ORDER BY n DESC", [r.start, r.end]),
      avgScore: (await store.queryOne("SELECT ROUND(AVG(score)) AS n FROM audits WHERE status = 'complete' AND plan != 'internal' AND created_at >= ? AND created_at < ?", [r.start, r.end]))?.n ?? null,
    };
  }

  if (contentOK) {
    const posts = (await blog.getBlog()).posts;
    const inRange = posts.filter((p) => blog.isLive(p) && p.date >= r.a && p.date <= r.b).length;
    const before = posts.filter((p) => blog.isLive(p) && p.date >= r.pa && p.date <= r.pb).length;
    out.kpis.posts = { value: inRange, delta: delta(inRange, before) };
    const st = (x) => blog.statusOf(x);
    out.lists.blog = {
      published: posts.filter((p) => st(p) === 'published').length, scheduled: posts.filter((p) => st(p) === 'scheduled').length,
      pending: posts.filter((p) => p.pending && !p.published).length, drafts: posts.filter((p) => !p.published && !p.pending).length,
      top: posts.filter((p) => blog.isLive(p)).sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 5).map((p) => { const s = scorePost(p); return { id: p.id, title: p.title, date: p.date, seo: s.seo, aeo: s.aeo, geo: s.geo }; }),
    };
  }

  if (can(actor, 'team')) out.lists.activity = await q('SELECT at, actor, action, entity, detail FROM audit_logs ORDER BY at DESC LIMIT 8');
  return out;
}

function fill(r, map) {
  const out = [];
  if (r.days > 92) {
    const cur = new Date(r.a.slice(0, 7) + '-01T00:00:00Z'); const last = r.b.slice(0, 7);
    for (let k = cur.toISOString().slice(0, 7); k <= last; cur.setUTCMonth(cur.getUTCMonth() + 1), k = cur.toISOString().slice(0, 7)) out.push({ label: k, value: map.get(k) || 0 });
  } else for (let i = 0; i < r.days; i++) { const d = addDays(r.a, i); out.push({ label: d, value: map.get(d) || 0 }); }
  return out;
}

// ── Reports ──────────────────────────────────────────────────────────────
const C = (k, l, t = 'text') => ({ k, l, t });
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export const REPORTS = {
  revenue: { title: 'Revenue', module: 'finance', alt: 'payments',
    run: async (r) => ({ columns: [C('date', 'Date'), C('source', 'Source'), C('who', 'Client / customer'), C('ref', 'Reference'), C('amount', 'Amount (₹)', 'money')],
      rows: await q(`SELECT * FROM (
        SELECT ${ist('COALESCE(verified_at, updated_at)')} AS date, 'Audit order' AS source, COALESCE(business, name) AS who, COALESCE(transaction_id, id) AS ref, amount FROM orders WHERE payment_status = 'verified' AND COALESCE(verified_at, updated_at) >= ? AND COALESCE(verified_at, updated_at) < ?
        UNION ALL SELECT paid_at::text, 'Invoice', bill_to, number, total FROM invoices WHERE status = 'paid' AND paid_at >= ?::date AND paid_at <= ?::date) x ORDER BY date DESC`, [r.start, r.end, r.a, r.b]) }) },
  leads: { title: 'Lead generation', module: 'crm',
    run: async (r) => ({ columns: [C('source', 'Source'), C('leads', 'Leads', 'num'), C('won', 'Won', 'num'), C('rate', 'Win rate %', 'num')],
      rows: (await q("SELECT COALESCE(source,'unknown') AS source, COUNT(*) AS leads, COUNT(*) FILTER (WHERE status = 'won') AS won FROM leads WHERE created_at >= ? AND created_at < ? GROUP BY 1 ORDER BY 2 DESC", [r.start, r.end])).map((x) => ({ ...x, leads: +x.leads, won: +x.won, rate: pct(+x.won, +x.leads) })) }) },
  conversion: { title: 'Sales conversion', module: 'crm',
    run: async (r) => ({ columns: [C('service', 'Service'), C('leads', 'Leads', 'num'), C('won', 'Won', 'num'), C('lost', 'Lost', 'num'), C('rate', 'Conversion %', 'num')],
      rows: (await q("SELECT COALESCE(service,'Not specified') AS service, COUNT(*) AS leads, COUNT(*) FILTER (WHERE status = 'won') AS won, COUNT(*) FILTER (WHERE status = 'lost') AS lost FROM leads WHERE created_at >= ? AND created_at < ? GROUP BY 1 ORDER BY 2 DESC", [r.start, r.end])).map((x) => ({ ...x, leads: +x.leads, won: +x.won, lost: +x.lost, rate: pct(+x.won, +x.leads) })) }) },
  clients: { title: 'Client acquisition', module: 'crm',
    run: async (r) => ({ columns: [C('since', 'Client since'), C('name', 'Client'), C('services', 'Services'), C('status', 'Status')],
      rows: await q('SELECT COALESCE(since::text, created_at::date::text) AS since, name, services, status FROM clients WHERE COALESCE(since::text, created_at::date::text) >= ? AND COALESCE(since::text, created_at::date::text) <= ? ORDER BY 1 DESC', [r.a, r.b]) }) },
  employees: { title: 'Employee performance', module: 'team',
    run: async (r) => ({ columns: [C('name', 'Team member'), C('role', 'Role'), C('leads', 'Leads assigned', 'num'), C('won', 'Leads won', 'num'), C('tasks_done', 'Tasks done', 'num'), C('tasks_open', 'Tasks open', 'num'), C('deal_value', 'Open deal value (₹)', 'money')],
      rows: (await q(`SELECT u.name, u.role,
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.created_at >= ? AND l.created_at < ?) AS leads,
        (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status = 'won' AND l.created_at >= ? AND l.created_at < ?) AS won,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.status = 'done' AND t.updated_at >= ? AND t.updated_at < ?) AS tasks_done,
        (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.status = 'pending') AS tasks_open,
        (SELECT COALESCE(SUM(value),0) FROM deals d WHERE d.assigned_to = u.id AND d.stage NOT IN ('won','lost')) AS deal_value
        FROM users u WHERE u.active ORDER BY u.name`, [r.start, r.end, r.start, r.end, r.start, r.end])).map((x) => ({ ...x, leads: +x.leads, won: +x.won, tasks_done: +x.tasks_done, tasks_open: +x.tasks_open, deal_value: +x.deal_value })) }) },
  seo_audits: { title: 'SEO audits', module: 'seo',
    run: async (r) => ({ columns: [C('date', 'Date'), C('website', 'Website'), C('plan', 'Plan'), C('score', 'Score', 'num'), C('pages', 'Pages', 'num'), C('issues', 'Issues', 'num'), C('status', 'Status')],
      rows: await q(`SELECT ${ist('created_at')} AS date, website, plan, score, pages, issues, status FROM audits WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 1000`, [r.start, r.end]) }) },
  content: { title: 'SEO / AEO / GEO content performance', module: 'content',
    run: async (r) => ({ columns: [C('date', 'Date'), C('title', 'Post'), C('status', 'Status'), C('seo', 'SEO', 'num'), C('aeo', 'AEO', 'num'), C('geo', 'GEO', 'num')],
      rows: (await blog.getBlog()).posts.filter((p) => p.date >= r.a && p.date <= r.b).sort((x, y) => String(y.date).localeCompare(String(x.date))).map((p) => { const s = scorePost(p); return { date: p.date, title: p.title, status: blog.statusOf(p), seo: s.seo, aeo: s.aeo, geo: s.geo }; }) }) },
  campaigns: { title: 'Campaigns', module: 'seo',
    run: async () => ({ columns: [C('name', 'Campaign'), C('platform', 'Platform'), C('budget', 'Budget (₹)', 'money'), C('spent', 'Spent (₹)', 'money'), C('leads', 'Leads', 'num'), C('cpl', 'Cost / lead (₹)', 'money'), C('conv', 'Conversion %', 'num')],
      rows: (await q('SELECT name, platform, budget, spent, leads, conversions FROM campaigns ORDER BY created_at DESC')).map((x) => ({ ...x, cpl: x.leads ? Math.round((x.spent / x.leads) * 100) / 100 : null, conv: pct(x.conversions, x.leads) })) }) },
  payments: { title: 'Payments', module: 'payments',
    run: async (r) => ({ columns: [C('date', 'Date'), C('name', 'Customer'), C('plan', 'Plan'), C('amount', 'Amount (₹)', 'money'), C('transaction_id', 'UTR / Txn'), C('payment_status', 'Status')],
      rows: await q(`SELECT ${ist('created_at')} AS date, COALESCE(business, name) AS name, plan, amount, transaction_id, payment_status FROM orders WHERE created_at >= ? AND created_at < ? ORDER BY created_at DESC LIMIT 1000`, [r.start, r.end]) }) },
};

export async function report(actor, key, params) {
  const rep = REPORTS[key];
  if (!rep || !(can(actor, rep.module) || (rep.alt && can(actor, rep.alt)))) return null;
  const r = resolveRange(params);
  const data = await rep.run(r);
  return { key, title: rep.title, range: { from: r.a, to: r.b }, ...data };
}
