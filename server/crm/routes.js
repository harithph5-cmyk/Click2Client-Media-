// CRM admin API, mounted at /api/admin/crm. Every route sits behind the
// existing admin session + CSRF guard; each also checks the actor's role.

import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import * as store from '../store/db.js';
import * as blog from '../blog.js';
import { hashPassword } from '../security/auth.js';
import { siteSettings } from '../site/render.js';
import { ENTITIES, metaFor, list, create, update, remove } from './entities.js';
import { dashboard, report, REPORTS, resolveRange, istToday } from './dashboard.js';
import { MODULES, can, need, log } from './rbac.js';

const q = store.query; const one = store.queryOne;
const bad = (res, message, status = 400, code = 'invalid') => res.status(status).json({ error: { code, message } });
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PERMS = [...Object.keys(MODULES), 'publish'];
const err = (m, status = 400) => Object.assign(new Error(m), { status });

export const LEAD_OPEN = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation'];

/** Round-robin by workload: the active Sales Executive with the fewest open leads. */
export async function autoAssign(leadId) {
  try {
    const u = await one(`SELECT u.id FROM users u WHERE u.active AND u.role = 'sales' ORDER BY (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id AND l.status IN ('new','contacted','qualified','proposal_sent','negotiation')), u.created_at LIMIT 1`);
    if (u) await q('UPDATE leads SET assigned_to = ? WHERE id = ? AND assigned_to IS NULL', [u.id, leadId]);
  } catch (e) { console.error('[crm] auto-assign failed:', e.message); }
}

const addActivity = (entityType, entityId, type, subject, body, actor) =>
  q('INSERT INTO activities (id, type, subject, body, entity_type, entity_id, actor) VALUES (?,?,?,?,?,?,?)', [store.newId(8), type, subject, body, entityType, entityId, actor]);

const LEAD_TEXT = ['name', 'email', 'phone', 'company', 'website', 'service', 'source', 'location', 'budget', 'requirements'];

export function crmRouter(h) {
  const r = express.Router();
  const wrap = (fn) => h(async (req, res) => {
    try { await fn(req, res); } catch (e) {
      if (e.code === '23503') return bad(res, 'A linked record no longer exists — refresh and try again.');
      if (e.code === '23505') return bad(res, 'That entry already exists.');
      if (!e.status) throw e; bad(res, e.message, e.status);
    }
  });

  // ── Metadata for the UI ──
  r.get('/meta', wrap(async (req, res) => {
    const users = await q('SELECT id, name, role FROM users WHERE active ORDER BY name');
    res.json({ me: req.actor, modules: MODULES, entities: metaFor((m) => can(req.actor, m)), users, leadStatuses: store.LEAD_STATUSES, reports: Object.entries(REPORTS).filter(([, v]) => can(req.actor, v.module) || (v.alt && can(req.actor, v.alt))).map(([k, v]) => ({ key: k, title: v.title })) });
  }));

  // ── Generic entities ──
  const ent = (req) => { const e = ENTITIES[req.params.key]; if (!e) throw err('Unknown module.', 404); if (!can(req.actor, e.module)) throw err('Your role does not have access to this section.', 403); return e; };
  r.get('/e/:key', wrap(async (req, res) => {
    const e = ent(req);
    const filters = Object.fromEntries((e.filters || []).map((f) => [f, req.query[f]]));
    res.json(await list(req.params.key, { q: clean(req.query.q, 80), page: +req.query.page || 1, size: +req.query.size || 25, filters }));
  }));
  r.post('/e/:key', wrap(async (req, res) => {
    ent(req);
    const id = await create(req.params.key, req.body);
    log(req, 'create', req.params.key, id); res.status(201).json({ id });
  }));
  r.put('/e/:key/:id', wrap(async (req, res) => { ent(req); await update(req.params.key, req.params.id, req.body); log(req, 'update', req.params.key, req.params.id); res.json({ ok: true }); }));
  r.delete('/e/:key/:id', wrap(async (req, res) => { ent(req); await remove(req.params.key, req.params.id); log(req, 'delete', req.params.key, req.params.id); res.json({ ok: true }); }));

  // ── Leads ──
  r.use('/leads', need('crm'));
  r.get('/leads', wrap(async (req, res) => {
    const where = []; const args = [];
    const qs = clean(req.query.q, 80);
    if (qs) { where.push('(' + ['name', 'email', 'phone', 'company', 'website', 'service'].map((c) => `l.${c} ILIKE ?`).join(' OR ') + ')'); for (let i = 0; i < 6; i++) args.push(`%${qs.replace(/[%_\\]/g, '\\$&')}%`); }
    for (const c of ['status', 'source', 'assigned_to']) if (req.query[c]) { where.push(`l.${c} = ?`); args.push(String(req.query[c])); }
    const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const size = Math.min(200, Math.max(1, +req.query.size || 25)); const page = Math.max(1, +req.query.page || 1);
    const total = (await one(`SELECT COUNT(*) AS n FROM leads l ${W}`, args)).n;
    const rows = await q(`SELECT l.*, u.name AS assigned_label FROM leads l LEFT JOIN users u ON u.id = l.assigned_to ${W} ORDER BY l.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, args);
    res.json({ rows, total: Number(total), page, size, sources: (await q("SELECT DISTINCT COALESCE(source,'unknown') AS s FROM leads ORDER BY 1")).map((x) => x.s) });
  }));
  const leadBody = async (b, partial) => {
    const d = {};
    for (const k of LEAD_TEXT) if (b[k] !== undefined) d[k] = clean(b[k], k === 'requirements' ? 2000 : 300) || null;
    if (d.email && !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) throw err('Enter a valid email.');
    if (b.status !== undefined) { if (!store.LEAD_STATUSES.includes(b.status)) throw err('Unknown status.'); d.status = b.status; }
    if (b.next_followup !== undefined) { if (b.next_followup && !DATE.test(b.next_followup)) throw err('Follow-up must be a date.'); d.next_followup = b.next_followup || null; }
    if (b.assigned_to !== undefined) { if (b.assigned_to && !(await one('SELECT 1 AS x FROM users WHERE id = ?', [b.assigned_to]))) throw err('Unknown team member.'); d.assigned_to = b.assigned_to || null; }
    if (!partial && !(d.name || d.company) ) throw err('Enter a name or company.');
    if (!partial && !(d.phone || d.email)) throw err('Enter a phone number or email.');
    return d;
  };
  r.post('/leads', wrap(async (req, res) => {
    const d = await leadBody(req.body || {}, false);
    const id = store.newId(8);
    const cols = { ...d, source: d.source || 'manual', whatsapp: d.phone || null, status: d.status || 'new' };
    const keys = Object.keys(cols);
    await q(`INSERT INTO leads (id, created_at, ${keys.join(', ')}) VALUES (?, ?, ${keys.map(() => '?').join(', ')})`, [id, new Date().toISOString(), ...keys.map((k) => cols[k])]);
    if (!cols.assigned_to) await autoAssign(id);
    await addActivity('lead', id, 'note', 'Lead added manually', null, req.actor.name);
    log(req, 'create', 'lead', id, cols.name); res.status(201).json({ id });
  }));
  r.get('/leads/:id', wrap(async (req, res) => {
    const lead = await one('SELECT l.*, u.name AS assigned_label FROM leads l LEFT JOIN users u ON u.id = l.assigned_to WHERE l.id = ?', [req.params.id]);
    if (!lead) throw err('Lead not found.', 404);
    res.json({ lead, activities: await q("SELECT * FROM activities WHERE entity_type = 'lead' AND entity_id = ? ORDER BY created_at DESC LIMIT 100", [lead.id]) });
  }));
  r.put('/leads/:id', wrap(async (req, res) => {
    const old = await one('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!old) throw err('Lead not found.', 404);
    const d = await leadBody(req.body || {}, true);
    const keys = Object.keys(d);
    if (keys.length) await q(`UPDATE leads SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => d[k]), old.id]);
    if (d.status && d.status !== old.status) await addActivity('lead', old.id, 'note', `Stage: ${old.status} → ${d.status}`, null, req.actor.name);
    if (d.assigned_to !== undefined && d.assigned_to !== old.assigned_to) await addActivity('lead', old.id, 'note', 'Lead reassigned', null, req.actor.name);
    log(req, 'update', 'lead', old.id, d.status ? `status ${d.status}` : null); res.json({ ok: true });
  }));
  r.post('/leads/:id/convert', wrap(async (req, res) => {
    const l = await one('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!l) throw err('Lead not found.', 404);
    const to = req.body?.to === 'client' ? 'client' : 'contact';
    let companyId = null;
    if (l.company) {
      companyId = (await one('SELECT id FROM companies WHERE LOWER(name) = LOWER(?)', [l.company]))?.id;
      if (!companyId) { companyId = store.newId(8); await q('INSERT INTO companies (id, name, website, phone, email, location) VALUES (?,?,?,?,?,?)', [companyId, l.company, l.website, l.phone, l.email, l.location]); }
    }
    let contactId = (await one('SELECT id FROM contacts WHERE lead_id = ?', [l.id]))?.id;
    if (!contactId) { contactId = store.newId(8); await q('INSERT INTO contacts (id, name, email, phone, company_id, lead_id) VALUES (?,?,?,?,?,?)', [contactId, l.name || l.company, l.email, l.phone, companyId, l.id]); }
    let clientId = l.converted_client_id;
    if (to === 'client' && !clientId) {
      clientId = store.newId(8);
      await q("INSERT INTO clients (id, name, company_id, email, phone, website, services, status, since, lead_id) VALUES (?,?,?,?,?,?,?, 'active', ?::date, ?)", [clientId, l.company || l.name, companyId, l.email, l.phone, l.website, l.service, istToday(), l.id]);
      await q("UPDATE leads SET converted_client_id = ?, status = 'won' WHERE id = ?", [clientId, l.id]);
      await addActivity('lead', l.id, 'note', 'Converted to client', null, req.actor.name);
    } else if (to === 'contact') await addActivity('lead', l.id, 'note', 'Converted to contact', null, req.actor.name);
    log(req, 'convert', 'lead', l.id, to); res.json({ ok: true, contactId, clientId });
  }));

  // ── Invoices ──
  r.use('/invoices', need('finance'));
  const money = (x) => Math.round(Number(x) * 100) / 100;
  const invoiceBody = (b) => {
    const items = (Array.isArray(b.items) ? b.items : []).map((i) => ({ description: clean(i.description, 300), qty: Number(i.qty) || 0, rate: Number(i.rate) || 0 })).filter((i) => i.description && i.qty > 0);
    if (!items.length) throw err('Add at least one line item with a quantity.');
    if (items.some((i) => i.rate < 0 || i.qty > 1e6 || i.rate > 1e9)) throw err('Check the item quantities and rates.');
    const subtotal = money(items.reduce((s, i) => s + i.qty * i.rate, 0));
    const discount = Math.max(0, money(b.discount || 0));
    if (discount > subtotal) throw err('Discount cannot exceed the subtotal.');
    const gst = Number(b.gst_rate ?? 18);
    if (!(gst >= 0 && gst <= 40)) throw err('GST rate must be between 0 and 40.');
    const tax = money(((subtotal - discount) * gst) / 100);
    const bill_to = clean(b.bill_to, 200);
    if (!bill_to) throw err('Bill-to name is required.');
    for (const k of ['issue_date', 'due_date']) if (b[k] && !DATE.test(b[k])) throw err('Dates must be valid.');
    return { items, d: { client_id: b.client_id || null, bill_to, bill_email: clean(b.bill_email, 200) || null, bill_address: clean(b.bill_address, 500) || null, gstin: clean(b.gstin, 20).toUpperCase() || null, issue_date: b.issue_date || istToday(), due_date: b.due_date || null, subtotal, discount, gst_rate: gst, tax, total: money(subtotal - discount + tax), notes: clean(b.notes, 1000) || null } };
  };
  const nextNumber = async (issue) => {
    const y = Number(issue.slice(0, 4)); const m = Number(issue.slice(5, 7));
    const fy = m >= 4 ? y : y - 1; const prefix = `C2C/${String(fy).slice(2)}-${String(fy + 1).slice(2)}/`;
    const last = await one('SELECT number FROM invoices WHERE number LIKE ? ORDER BY number DESC LIMIT 1', [prefix + '%']);
    return prefix + String((last ? Number(last.number.split('/').pop()) : 0) + 1).padStart(4, '0');
  };
  const saveItems = async (id, items) => {
    await q('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);
    for (const i of items) await q('INSERT INTO invoice_items (id, invoice_id, description, qty, rate, amount) VALUES (?,?,?,?,?,?)', [store.newId(8), id, i.description, i.qty, i.rate, money(i.qty * i.rate)]);
  };
  r.get('/invoices', wrap(async (req, res) => {
    const where = []; const args = [];
    const qs = clean(req.query.q, 80);
    if (qs) { where.push('(bill_to ILIKE ? OR number ILIKE ?)'); args.push(`%${qs}%`, `%${qs}%`); }
    const eff = "CASE WHEN status = 'unpaid' AND due_date < ?::date THEN 'overdue' ELSE status END";
    const today = istToday();
    const outer = req.query.status ? 'WHERE eff = ?' : '';
    const size = 25; const page = Math.max(1, +req.query.page || 1);
    const base = `SELECT *, ${eff} AS eff FROM invoices ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
    const params = [today, ...args, ...(req.query.status ? [String(req.query.status)] : [])];
    const total = (await one(`SELECT COUNT(*) AS n FROM (${base}) x ${outer}`, params)).n;
    const rows = await q(`SELECT * FROM (${base}) x ${outer} ORDER BY created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`, params);
    res.json({ rows, total: Number(total), page, size });
  }));
  r.get('/invoices/:id', wrap(async (req, res) => {
    const inv = await one('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!inv) throw err('Invoice not found.', 404);
    res.json({ invoice: inv, items: await q('SELECT description, qty, rate, amount FROM invoice_items WHERE invoice_id = ? ORDER BY id', [inv.id]) });
  }));
  r.post('/invoices', wrap(async (req, res) => {
    const { items, d } = invoiceBody(req.body || {});
    let id; let lastErr;
    for (let t = 0; t < 4; t++) { // retry if two invoices raced for the same number
      try {
        id = store.newId(8); d.number = await nextNumber(d.issue_date);
        const keys = Object.keys(d);
        await q(`INSERT INTO invoices (id, ${keys.join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`, [id, ...keys.map((k) => d[k])]);
        lastErr = null; break;
      } catch (e) { lastErr = e; if (e.code !== '23505') throw e; }
    }
    if (lastErr) throw lastErr;
    await saveItems(id, items);
    log(req, 'create', 'invoice', id, d.number); res.status(201).json({ id, number: d.number });
  }));
  r.put('/invoices/:id', wrap(async (req, res) => {
    const old = await one('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!old) throw err('Invoice not found.', 404);
    if (old.status === 'paid') throw err('A paid invoice cannot be edited.');
    const { items, d } = invoiceBody(req.body || {});
    const keys = Object.keys(d);
    await q(`UPDATE invoices SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`, [...keys.map((k) => d[k]), old.id]);
    await saveItems(old.id, items);
    log(req, 'update', 'invoice', old.id, old.number); res.json({ ok: true });
  }));
  r.post('/invoices/:id/pay', wrap(async (req, res) => {
    const inv = await one('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!inv) throw err('Invoice not found.', 404);
    if (inv.status === 'paid') throw err('Already marked as paid.');
    const at = DATE.test(req.body?.paid_at || '') ? req.body.paid_at : istToday();
    await q("UPDATE invoices SET status = 'paid', paid_at = ?::date, paid_method = ?, paid_ref = ?, updated_at = NOW() WHERE id = ?", [at, clean(req.body?.method, 40) || null, clean(req.body?.ref, 80) || null, inv.id]);
    log(req, 'paid', 'invoice', inv.id, inv.number); res.json({ ok: true });
  }));
  r.post('/invoices/:id/unpay', wrap(async (req, res) => {
    await q("UPDATE invoices SET status = 'unpaid', paid_at = NULL, paid_method = NULL, paid_ref = NULL, updated_at = NOW() WHERE id = ?", [req.params.id]);
    log(req, 'unpaid', 'invoice', req.params.id); res.json({ ok: true });
  }));
  r.delete('/invoices/:id', wrap(async (req, res) => { await q('DELETE FROM invoices WHERE id = ?', [req.params.id]); log(req, 'delete', 'invoice', req.params.id); res.json({ ok: true }); }));
  // Printable invoice — open and use "Save as PDF" (no PDF library needed).
  r.get('/invoices/:id/print', wrap(async (req, res) => {
    const inv = await one('SELECT * FROM invoices WHERE id = ?', [req.params.id]);
    if (!inv) throw err('Invoice not found.', 404);
    const items = await q('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id', [inv.id]);
    const s = await siteSettings();
    const inr = (x) => '₹' + Number(x).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const half = inv.gst_rate / 2;
    res.type('html').set('Cache-Control', 'no-store').send(`<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title><meta name="robots" content="noindex">
<style>body{font:14px/1.5 system-ui,Segoe UI,sans-serif;color:#0b1b2b;margin:0;padding:32px;max-width:820px;margin:auto}h1{font-size:28px;margin:0}table{width:100%;border-collapse:collapse;margin:22px 0}th{text-align:left;background:#f1f5f9;padding:9px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.04em}td{padding:10px;border-bottom:1px solid #e2e8f0;vertical-align:top}.r{text-align:right}.tot td{border:0;padding:4px 10px}.grand td{font-weight:800;font-size:16px;border-top:2px solid #0b1b2b}.hd{display:flex;justify-content:space-between;gap:24px}.muted{color:#64748b}.badge{display:inline-block;padding:3px 10px;border-radius:99px;font-weight:700;font-size:12px;background:#e2e8f0}.paid{background:#dcfce7;color:#166534}@media print{.np{display:none}body{padding:0}}</style></head><body>
<p class="np"><button onclick="print()" style="padding:8px 16px;font-weight:700">Print / Save as PDF</button></p>
<div class="hd"><div><h1>${esc(s.companyName)}</h1><div class="muted">${esc(s.city || '')}<br>${esc(s.email || '')} · ${esc(s.phone || '')}</div></div>
<div style="text-align:right"><h1 style="font-size:22px">TAX INVOICE</h1><b>${esc(inv.number)}</b><br><span class="badge ${inv.status === 'paid' ? 'paid' : ''}">${esc(inv.status.toUpperCase())}</span></div></div>
<div class="hd" style="margin-top:26px"><div><div class="muted">Bill to</div><b>${esc(inv.bill_to)}</b><br>${esc(inv.bill_address || '')}<br>${esc(inv.bill_email || '')}${inv.gstin ? `<br>GSTIN: ${esc(inv.gstin)}` : ''}</div>
<div style="text-align:right"><div class="muted">Issued</div>${esc(inv.issue_date)}<div class="muted" style="margin-top:6px">Due</div>${esc(inv.due_date || 'On receipt')}</div></div>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead><tbody>${items.map((i) => `<tr><td>${esc(i.description)}</td><td class="r">${+i.qty}</td><td class="r">${inr(i.rate)}</td><td class="r">${inr(i.amount)}</td></tr>`).join('')}</tbody></table>
<table class="tot" style="width:320px;margin-left:auto"><tr><td>Subtotal</td><td class="r">${inr(inv.subtotal)}</td></tr>${inv.discount > 0 ? `<tr><td>Discount</td><td class="r">− ${inr(inv.discount)}</td></tr>` : ''}
<tr><td>CGST @ ${half}%</td><td class="r">${inr(inv.tax / 2)}</td></tr><tr><td>SGST @ ${half}%</td><td class="r">${inr(inv.tax / 2)}</td></tr><tr class="grand"><td>Total</td><td class="r">${inr(inv.total)}</td></tr></table>
${inv.paid_at ? `<p class="muted">Paid on ${esc(inv.paid_at)}${inv.paid_method ? ' via ' + esc(inv.paid_method) : ''}${inv.paid_ref ? ' · ref ' + esc(inv.paid_ref) : ''}</p>` : ''}
${inv.notes ? `<p class="muted">${esc(inv.notes)}</p>` : ''}${s.upiId ? `<p class="muted">Pay by UPI: <b>${esc(s.upiId)}</b></p>` : ''}</body></html>`);
  }));

  // ── Finance: P&L ──
  r.get('/finance/pnl', need('finance'), wrap(async (req, res) => {
    const g = resolveRange(req.query);
    const args = [g.start, g.end, g.a, g.b];
    const stream = `SELECT d, who, svc, amt FROM (
      SELECT (COALESCE(verified_at, updated_at)::timestamptz AT TIME ZONE 'Asia/Kolkata')::date::text AS d, COALESCE(business, name, 'Unknown') AS who, plan AS svc, amount AS amt FROM orders WHERE payment_status = 'verified' AND COALESCE(verified_at, updated_at) >= ? AND COALESCE(verified_at, updated_at) < ?
      UNION ALL SELECT i.paid_at::text, i.bill_to, COALESCE((SELECT description FROM invoice_items it WHERE it.invoice_id = i.id ORDER BY it.id LIMIT 1), 'Invoice'), i.total FROM invoices i WHERE i.status = 'paid' AND i.paid_at >= ?::date AND i.paid_at <= ?::date) s`;
    const revenue = Number((await one(`SELECT COALESCE(SUM(amt),0) AS n FROM (${stream}) t`, args)).n);
    const expenses = Number((await one('SELECT COALESCE(SUM(amount),0) AS n FROM expenses WHERE spent_on >= ?::date AND spent_on <= ?::date', [g.a, g.b])).n);
    res.json({
      range: { from: g.a, to: g.b }, revenue, expenses, profit: revenue - expenses,
      byMonth: await q(`SELECT substr(d,1,7) AS label, SUM(amt) AS revenue FROM (${stream}) t GROUP BY 1 ORDER BY 1`, args),
      byClient: await q(`SELECT who AS label, SUM(amt) AS value FROM (${stream}) t GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, args),
      // Service-wise: audit orders by plan, invoices by line item (pre-tax, so slightly below total revenue)
      byService: await q(`SELECT svc AS label, SUM(amt) AS value FROM (
        SELECT plan AS svc, amount AS amt FROM orders WHERE payment_status = 'verified' AND COALESCE(verified_at, updated_at) >= ? AND COALESCE(verified_at, updated_at) < ?
        UNION ALL SELECT it.description, it.amount FROM invoice_items it JOIN invoices i ON i.id = it.invoice_id WHERE i.status = 'paid' AND i.paid_at >= ?::date AND i.paid_at <= ?::date) t GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, args),
      expensesByCategory: await q("SELECT COALESCE(category,'Uncategorised') AS label, SUM(amount) AS value FROM expenses WHERE spent_on >= ?::date AND spent_on <= ?::date GROUP BY 1 ORDER BY 2 DESC", [g.a, g.b]),
    });
  }));

  // ── Dashboard & reports ──
  // Off-Page command center: one shared workspace document (articles, comment queue, backlink pipeline).
  // ponytail: whole-document save, last write wins; split into tables if several people edit at once.
  r.get('/offpage', need('seo'), wrap(async (req, res) => res.json({ workspace: await store.getSetting('offpage_workspace_v1', null) })));
  r.put('/offpage', need('seo'), wrap(async (req, res) => {
    const w = req.body?.workspace;
    if (!w || !Array.isArray(w.articles) || !Array.isArray(w.comments) || !Array.isArray(w.backlinks)) return bad(res, 'Invalid workspace.');
    if (JSON.stringify(w).length > 1_500_000) return bad(res, 'Workspace is too large.', 413);
    await store.setSetting('offpage_workspace_v1', { articles: w.articles, comments: w.comments, backlinks: w.backlinks });
    log(req, 'update', 'offpage');
    res.json({ ok: true });
  }));
  r.get('/dashboard', need('dashboard'), wrap(async (req, res) => res.json(await dashboard(req.actor, req.query))));
  r.get('/reports/:key', wrap(async (req, res) => {
    const out = await report(req.actor, req.params.key, req.query);
    if (!out) throw err('Report not available for your role.', 403);
    res.json(out);
  }));

  // ── Content calendar (planned items + real blog posts) ──
  r.get('/calendar', need('content'), wrap(async (req, res) => {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : istToday().slice(0, 7);
    const planned = await q("SELECT m.id, m.title, m.planned_on::text AS date, m.planned_on::text AS planned_on, m.kind, m.status, m.writer, u.name AS writer_label, m.keyword, m.notes FROM content_calendar m LEFT JOIN users u ON u.id = m.writer WHERE to_char(m.planned_on, 'YYYY-MM') = ? ORDER BY m.planned_on", [month]);
    const posts = (await blog.getBlog()).posts.filter((p) => String(p.date).startsWith(month)).map((p) => ({ id: p.id, title: p.title, date: p.date, kind: 'blog', status: blog.statusOf(p), writer_label: p.author, source: 'blog' }));
    res.json({ month, items: [...planned.map((x) => ({ ...x, source: 'plan' })), ...posts] });
  }));

  // ── AI draft (always lands as "pending approval"; never auto-publishes) ──
  r.post('/ai/draft', need('content'), wrap(async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) throw err('AI writing is not configured. Add ANTHROPIC_API_KEY on the server.', 503);
    const topic = clean(req.body?.topic, 200); const keyword = clean(req.body?.keyword, 80);
    if (!topic) throw err('Enter a topic.');
    const msg = await new Anthropic().messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 6000,
      system: `You write blog articles for Click2Client Media, a digital marketing agency in Madurai, India. Make each article rank in Google (SEO), be quotable by answer engines (AEO: question headings, a direct 1–2 sentence answer first, lists, FAQs) and citable by generative AI (GEO: clear definitions, concrete facts, named entities). Never invent statistics, quotes, client results or sources — if a fact needs checking write "[verify]" beside it. Reply with ONLY a JSON object: {"title","excerpt"(<=160 chars),"metaTitle"(<=62),"metaDescription"(<=155),"keyword","tags":[],"body"(Markdown: "## " headings, "- " lists, **bold**, [links](https://…), 900+ words),"faqs":[{"q","a"}] (4-6)}.`,
      messages: [{ role: 'user', content: `Topic: ${topic}\nFocus keyword: ${keyword || '(choose the best one)'}` }],
    });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let draft;
    try { draft = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { throw err('The AI reply could not be read. Please try again.', 502); }
    log(req, 'ai-draft', 'blog', null, topic); res.json({ draft });
  }));

  // ── Global search ──
  r.get('/search', wrap(async (req, res) => {
    const s = clean(req.query.q, 60);
    if (s.length < 2) return res.json({ results: [] });
    const like = `%${s.replace(/[%_\\]/g, '\\$&')}%`; const out = []; const A = req.actor;
    const add = (type, rows, f) => rows.forEach((x) => out.push({ type, ...f(x) }));
    if (can(A, 'crm')) {
      add('Lead', await q('SELECT id, name, company, phone, status FROM leads WHERE name ILIKE ? OR company ILIKE ? OR email ILIKE ? OR phone ILIKE ? OR website ILIKE ? ORDER BY created_at DESC LIMIT 5', [like, like, like, like, like]), (x) => ({ title: x.name || x.company, sub: [x.company, x.phone, x.status].filter(Boolean).join(' · '), link: '#leads?q=' + encodeURIComponent(x.name || x.company || '') }));
      add('Client', await q('SELECT name, services FROM clients WHERE name ILIKE ? OR email ILIKE ? OR website ILIKE ? LIMIT 5', [like, like, like]), (x) => ({ title: x.name, sub: x.services, link: '#clients?q=' + encodeURIComponent(x.name) }));
      add('Deal', await q('SELECT name, stage FROM deals WHERE name ILIKE ? OR service ILIKE ? LIMIT 5', [like, like]), (x) => ({ title: x.name, sub: x.stage, link: '#deals?q=' + encodeURIComponent(x.name) }));
    }
    if (can(A, 'payments')) add('Payment', await q('SELECT COALESCE(business, name) AS name, amount, payment_status, transaction_id FROM orders WHERE name ILIKE ? OR business ILIKE ? OR transaction_id ILIKE ? OR email ILIKE ? ORDER BY created_at DESC LIMIT 5', [like, like, like, like]), (x) => ({ title: `${x.name} — ₹${x.amount}`, sub: `${x.payment_status}${x.transaction_id ? ' · ' + x.transaction_id : ''}`, link: '#payments' }));
    if (can(A, 'finance')) add('Invoice', await q('SELECT number, bill_to, total, status FROM invoices WHERE number ILIKE ? OR bill_to ILIKE ? LIMIT 5', [like, like]), (x) => ({ title: `${x.number} — ${x.bill_to}`, sub: `₹${x.total} · ${x.status}`, link: '#invoices?q=' + encodeURIComponent(x.number) }));
    if (can(A, 'seo')) add('SEO audit', await q('SELECT id, website, score, status FROM audits WHERE website ILIKE ? OR business ILIKE ? ORDER BY created_at DESC LIMIT 5', [like, like]), (x) => ({ title: x.website, sub: `${x.status}${x.score != null ? ' · score ' + x.score : ''}`, link: '#audits' }));
    if (can(A, 'content')) {
      const needle = s.toLowerCase();
      for (const p of (await blog.getBlog()).posts.filter((p) => `${p.title} ${p.keyword || ''}`.toLowerCase().includes(needle)).slice(0, 5)) out.push({ type: 'Blog post', title: p.title, sub: blog.statusOf(p), link: '#blog' });
    }
    res.json({ results: out });
  }));

  // ── Notifications (computed live from real records) ──
  r.get('/notifications', wrap(async (req, res) => {
    const A = req.actor; const today = istToday(); const items = []; const n = async (sql, a = []) => Number((await one(sql, a)).n);
    const push = (type, c, text, link, level = 'info') => { if (c > 0) items.push({ key: `${type}:${c}`, type, level, text: text(c), link }); };
    if (can(A, 'crm')) {
      push('new-lead', await n("SELECT COUNT(*) AS n FROM leads WHERE status = 'new'"), (c) => `${c} new lead${c > 1 ? 's' : ''} waiting for first contact`, '#leads');
      push('followup', (await n("SELECT COUNT(*) AS n FROM leads WHERE next_followup <= ?::date AND status NOT IN ('won','lost')", [today])) + (await n("SELECT COUNT(*) AS n FROM tasks WHERE status = 'pending' AND due_date <= ?::date", [today])), (c) => `${c} follow-up${c > 1 ? 's' : ''} due today or overdue`, '#tasks', 'warn');
      push('task-soon', await n("SELECT COUNT(*) AS n FROM tasks WHERE status = 'pending' AND due_date > ?::date AND due_date <= ?::date + 2", [today, today]), (c) => `${c} task deadline${c > 1 ? 's' : ''} in the next 2 days`, '#tasks');
    }
    if (can(A, 'payments')) push('payment', await n("SELECT COUNT(*) AS n FROM orders WHERE payment_status IN ('screenshot_received','under_verification')"), (c) => `${c} payment${c > 1 ? 's' : ''} submitted — verify now`, '#payments', 'warn');
    if (can(A, 'finance')) {
      push('overdue', await n("SELECT COUNT(*) AS n FROM invoices WHERE status = 'unpaid' AND due_date < ?::date", [today]), (c) => `${c} invoice${c > 1 ? 's' : ''} overdue`, '#invoices', 'bad');
      push('renewal', await n("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active' AND next_renewal <= ?::date + 7", [today]), (c) => `${c} subscription${c > 1 ? 's' : ''} renewing within 7 days`, '#subscriptions');
    }
    if (can(A, 'seo')) push('audit', await n("SELECT COUNT(*) AS n FROM audits WHERE status = 'complete' AND completed_at >= ?", [new Date(Date.now() - 864e5).toISOString()]), (c) => `${c} SEO audit${c > 1 ? 's' : ''} completed in the last 24 h`, '#audits');
    if (can(A, 'publish')) push('approval', (await blog.getBlog()).posts.filter((p) => p.pending && !p.published).length, (c) => `${c} blog post${c > 1 ? 's' : ''} awaiting approval`, '#blog', 'warn');
    res.json({ items });
  }));

  // ── Team, roles, activity log ──
  r.use('/team', need('team'));
  r.get('/team/users', wrap(async (req, res) => res.json({
    users: await q('SELECT u.id, u.name, u.email, u.role, u.active, u.last_login, u.created_at, (SELECT COUNT(*) FROM leads l WHERE l.assigned_to = u.id) AS leads, (SELECT COUNT(*) FROM tasks t WHERE t.assigned_to = u.id AND t.status = \'pending\') AS open_tasks FROM users u ORDER BY u.created_at'),
    roles: await q('SELECT key, name, permissions, built_in FROM roles ORDER BY built_in DESC, name'), modules: { ...MODULES, publish: 'Approve & publish content' },
  })));
  r.post('/team/users', wrap(async (req, res) => {
    const b = req.body || {}; const email = clean(b.email, 200).toLowerCase(); const name = clean(b.name, 100);
    if (!name) throw err('Enter a name.');
    if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw err('Enter a valid email.');
    if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) throw err('Password must be at least 8 characters.');
    if (!(await one('SELECT 1 AS x FROM roles WHERE key = ?', [b.role]))) throw err('Choose a role.');
    if (b.role === 'founder') throw err('The Founder role is the shared admin login and cannot be assigned.');
    if (await one('SELECT 1 AS x FROM users WHERE LOWER(email) = ?', [email])) throw err('A team member with this email already exists.');
    const id = store.newId(8);
    await q('INSERT INTO users (id, name, email, role, password_hash) VALUES (?,?,?,?,?)', [id, name, email, b.role, hashPassword(b.password)]);
    log(req, 'create', 'user', id, email); res.status(201).json({ id });
  }));
  r.patch('/team/users/:id', wrap(async (req, res) => {
    const b = req.body || {}; const sets = []; const args = [];
    if (b.name !== undefined) { sets.push('name = ?'); args.push(clean(b.name, 100)); }
    if (b.role !== undefined) { if (b.role === 'founder' || !(await one('SELECT 1 AS x FROM roles WHERE key = ?', [b.role]))) throw err('Choose a valid role.'); sets.push('role = ?'); args.push(b.role); }
    if (b.active !== undefined) { sets.push('active = ?'); args.push(Boolean(b.active)); }
    if (b.password) { if (String(b.password).length < 8) throw err('Password must be at least 8 characters.'); sets.push('password_hash = ?'); args.push(hashPassword(String(b.password))); }
    if (!sets.length) return res.json({ ok: true });
    await q(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ?`, [...args, req.params.id]);
    if (b.active === false) await q('DELETE FROM sessions WHERE user_id = ?', [req.params.id]);
    log(req, 'update', 'user', req.params.id, b.password ? 'password reset' : Object.keys(b).join(',')); res.json({ ok: true });
  }));
  r.put('/team/roles/:key', wrap(async (req, res) => {
    const role = await one('SELECT * FROM roles WHERE key = ?', [req.params.key]);
    if (!role) throw err('Role not found.', 404);
    if (role.key === 'founder') throw err('The Founder role always has full access.');
    const perms = (Array.isArray(req.body?.permissions) ? req.body.permissions : []).filter((p) => PERMS.includes(p));
    await q('UPDATE roles SET permissions = ?::jsonb WHERE key = ?', [JSON.stringify(perms), role.key]);
    log(req, 'update', 'role', role.key, perms.join(',')); res.json({ ok: true });
  }));
  r.get('/team/logs', wrap(async (req, res) => {
    const size = 50; const page = Math.max(1, +req.query.page || 1);
    res.json({ rows: await q(`SELECT at, actor, actor_role, action, entity, entity_id, detail, ip FROM audit_logs ORDER BY at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`), total: Number((await one('SELECT COUNT(*) AS n FROM audit_logs')).n), page, size });
  }));

  return r;
}
