// Config-driven CRUD for the CRM modules. One table of field specs drives the
// validation, the SQL, the list filters AND the admin forms (the browser gets
// the same config from /crm/meta), so every module behaves the same way.

import assert from 'node:assert';
import * as store from '../store/db.js';

const f = (name, label, type = 'text', o = {}) => ({ name, label, type, ...o });
const sel = (name, label, options, o = {}) => f(name, label, 'select', { options, ...o });
const ref = (name, label, entity, o = {}) => f(name, label, 'ref', { entity, ...o });

const STAGES = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];
const PROB = { new: 10, contacted: 20, qualified: 40, proposal_sent: 60, negotiation: 75, won: 100, lost: 0 };

export const ENTITIES = {
  companies: { module: 'crm', table: 'companies', title: 'name', label: 'Company', plural: 'Companies', search: ['name', 'website', 'industry', 'email'], cols: ['name', 'industry', 'website', 'phone', 'location'],
    fields: [f('name', 'Company name', 'text', { required: true }), f('website', 'Website', 'url'), f('industry', 'Industry'), f('phone', 'Phone'), f('email', 'Email', 'email'), f('location', 'Location'), f('notes', 'Notes', 'textarea')] },
  contacts: { module: 'crm', table: 'contacts', title: 'name', label: 'Contact', plural: 'Contacts', search: ['name', 'email', 'phone', 'position'], cols: ['name', 'company_id', 'position', 'phone', 'email'],
    fields: [f('name', 'Full name', 'text', { required: true }), f('email', 'Email', 'email'), f('phone', 'Phone'), ref('company_id', 'Company', 'companies'), f('position', 'Position'), f('notes', 'Notes', 'textarea')] },
  clients: { module: 'crm', table: 'clients', title: 'name', label: 'Client', plural: 'Clients', search: ['name', 'email', 'phone', 'website', 'services'], cols: ['name', 'company_id', 'services', 'status', 'since'], filters: ['status'],
    fields: [f('name', 'Client name', 'text', { required: true }), ref('company_id', 'Company', 'companies'), f('email', 'Email', 'email'), f('phone', 'Phone'), f('website', 'Website', 'url'), f('services', 'Purchased services', 'textarea'), sel('status', 'Status', ['active', 'paused', 'churned'], { def: 'active' }), f('since', 'Client since', 'date'), f('notes', 'Contracts, proposals & notes', 'textarea')] },
  deals: { module: 'crm', table: 'deals', title: 'name', label: 'Deal', plural: 'Deals', search: ['name', 'service'], cols: ['name', 'client_id', 'service', 'value', 'stage', 'probability', 'expected_close', 'assigned_to'], filters: ['stage', 'assigned_to'], order: 'm.created_at DESC',
    fields: [f('name', 'Deal name', 'text', { required: true }), ref('client_id', 'Client', 'clients'), f('service', 'Service'), f('value', 'Deal value (₹)', 'number'), sel('stage', 'Stage', STAGES, { def: 'new' }), f('probability', 'Probability %', 'int'), f('expected_close', 'Expected close', 'date'), ref('assigned_to', 'Assigned to', 'users'), f('notes', 'Notes', 'textarea')],
    before: (d) => { if (d.stage && d.probability == null) d.probability = PROB[d.stage]; } },
  tasks: { module: 'crm', table: 'tasks', title: 'title', label: 'Task', plural: 'Tasks & follow-ups', search: ['title', 'description', 'related'], cols: ['title', 'assigned_to', 'due_date', 'priority', 'status'], filters: ['status', 'priority', 'assigned_to'], order: "(m.status = 'done'), m.due_date NULLS LAST",
    fields: [f('title', 'Task', 'text', { required: true }), f('description', 'Details', 'textarea'), ref('assigned_to', 'Assigned to', 'users'), f('due_date', 'Deadline', 'date'), sel('priority', 'Priority', ['low', 'medium', 'high'], { def: 'medium' }), sel('status', 'Status', ['pending', 'done'], { def: 'pending' }), f('related', 'Related to (lead / client name)')] },
  activities: { module: 'crm', table: 'activities', title: 'subject', label: 'Activity', plural: 'Activities', search: ['subject', 'body'], cols: ['type', 'subject', 'body'], filters: ['entity_type', 'entity_id'], hidden: true,
    fields: [sel('type', 'Type', ['note', 'call', 'email', 'meeting', 'whatsapp'], { def: 'note' }), f('subject', 'Subject'), f('body', 'Details', 'textarea'), f('entity_type', 'Entity', 'text', { required: true }), f('entity_id', 'Entity id', 'text', { required: true })] },
  services: { module: 'crm', table: 'services', title: 'name', label: 'Service', plural: 'Services', search: ['name'], cols: ['name', 'price', 'active'],
    fields: [f('name', 'Service name', 'text', { required: true }), f('price', 'Default price (₹)', 'number'), f('active', 'Active', 'bool', { def: true })] },
  subscriptions: { module: 'finance', table: 'subscriptions', title: 'plan', label: 'Subscription', plural: 'Subscriptions', search: ['plan', 'notes'], cols: ['plan', 'client_id', 'amount', 'cycle', 'next_renewal', 'status'], filters: ['status', 'cycle'], order: 'm.next_renewal NULLS LAST',
    fields: [f('plan', 'Plan (e.g. Monthly SEO)', 'text', { required: true }), ref('client_id', 'Client', 'clients'), f('amount', 'Amount (₹)', 'number'), sel('cycle', 'Billing cycle', ['monthly', 'quarterly', 'yearly'], { def: 'monthly' }), f('start_date', 'Start date', 'date'), f('next_renewal', 'Next renewal', 'date'), sel('status', 'Status', ['active', 'paused', 'cancelled'], { def: 'active' }), f('notes', 'Notes', 'textarea')] },
  expenses: { module: 'finance', table: 'expenses', title: 'title', label: 'Expense', plural: 'Expenses', search: ['title', 'category'], cols: ['title', 'category', 'amount', 'spent_on'], filters: ['category'], order: 'm.spent_on DESC',
    fields: [f('title', 'Expense', 'text', { required: true }), f('category', 'Category'), f('amount', 'Amount (₹)', 'number', { required: true }), f('spent_on', 'Date', 'date', { required: true }), f('notes', 'Notes', 'textarea')] },
  seo_projects: { module: 'seo', table: 'seo_projects', title: 'domain', label: 'SEO project', plural: 'Client websites', search: ['domain', 'name'], cols: ['domain', 'name', 'client_id', 'status'], filters: ['status'],
    fields: [f('domain', 'Website / domain', 'text', { required: true }), f('name', 'Project name'), ref('client_id', 'Client', 'clients'), sel('status', 'Status', ['active', 'paused', 'completed'], { def: 'active' }), f('notes', 'Notes', 'textarea')] },
  seo_keywords: { module: 'seo', table: 'seo_keywords', title: 'keyword', label: 'Keyword', plural: 'Keyword tracking', search: ['keyword', 'target_url'], cols: ['keyword', 'project_id', 'position', 'prev_position', 'volume'], filters: ['project_id'],
    fields: [f('keyword', 'Keyword', 'text', { required: true }), ref('project_id', 'Website', 'seo_projects'), f('target_url', 'Target URL', 'url'), f('position', 'Current rank', 'int'), f('volume', 'Monthly searches', 'int')],
    // Ranking history: each rank change is appended to history and the previous rank kept.
    before: (d, old) => { if (old && d.position != null && d.position !== old.position) { d.prev_position = old.position; d.history = JSON.stringify([...(old.history || []), { d: new Date().toISOString().slice(0, 10), p: d.position }].slice(-60)); } else if (!old && d.position != null) d.history = JSON.stringify([{ d: new Date().toISOString().slice(0, 10), p: d.position }]); } },
  backlinks: { module: 'seo', table: 'backlinks', title: 'source_url', label: 'Backlink', plural: 'Backlinks', search: ['source_url', 'target_url', 'anchor'], cols: ['source_url', 'project_id', 'anchor', 'authority', 'status', 'found_on'], filters: ['project_id', 'status'],
    fields: [f('source_url', 'Linking page URL', 'url', { required: true }), ref('project_id', 'Website', 'seo_projects'), f('target_url', 'Linked-to URL', 'url'), f('anchor', 'Anchor text'), f('authority', 'Authority score (0-100)', 'int'), sel('status', 'Status', ['live', 'lost', 'pending'], { def: 'live' }), f('found_on', 'Found on', 'date')] },
  aeo: { module: 'seo', table: 'visibility_checks', fixed: { track: 'aeo' }, title: 'query', label: 'AEO check', plural: 'AEO — answer engines', search: ['query', 'platform', 'notes'], cols: ['query', 'kind', 'platform', 'visible', 'project_id', 'checked_on'], filters: ['kind', 'visible', 'project_id'],
    fields: [f('query', 'Question / query', 'text', { required: true }), sel('kind', 'Type', ['answer_visibility', 'faq', 'structured_content'], { def: 'answer_visibility' }), sel('platform', 'Platform', ['Google AI Overview', 'Featured snippet', 'People Also Ask', 'Bing Copilot', 'Voice search']), sel('visible', 'We appear?', ['yes', 'partial', 'no'], { def: 'no' }), ref('project_id', 'Website', 'seo_projects'), f('url', 'Page URL', 'url'), f('checked_on', 'Checked on', 'date'), f('notes', 'Notes', 'textarea')] },
  geo: { module: 'seo', table: 'visibility_checks', fixed: { track: 'geo' }, title: 'query', label: 'GEO check', plural: 'GEO — generative engines', search: ['query', 'platform', 'notes'], cols: ['query', 'kind', 'platform', 'visible', 'project_id', 'checked_on'], filters: ['kind', 'visible', 'project_id'],
    fields: [f('query', 'Prompt / brand query', 'text', { required: true }), sel('kind', 'Type', ['ai_presence', 'brand_mention', 'citation', 'entity'], { def: 'brand_mention' }), sel('platform', 'Platform', ['ChatGPT', 'Gemini', 'Perplexity', 'Claude', 'Copilot', 'Google AI Mode']), sel('visible', 'Brand / site mentioned?', ['yes', 'partial', 'no'], { def: 'no' }), ref('project_id', 'Website', 'seo_projects'), f('url', 'Cited URL', 'url'), f('checked_on', 'Checked on', 'date'), f('notes', 'What the AI said', 'textarea')] },
  campaigns: { module: 'seo', table: 'campaigns', title: 'name', label: 'Campaign', plural: 'Campaigns', search: ['name'], cols: ['name', 'platform', 'client_id', 'budget', 'spent', 'leads', 'cpl', 'conv', 'status'], filters: ['platform', 'status'],
    computed: (r) => ({ cpl: r.leads ? Math.round((r.spent / r.leads) * 100) / 100 : null, conv: r.leads ? Math.round((r.conversions / r.leads) * 1000) / 10 : null }),
    fields: [f('name', 'Campaign name', 'text', { required: true }), sel('platform', 'Platform', ['meta', 'google', 'other'], { def: 'meta' }), ref('client_id', 'Client', 'clients'), f('budget', 'Budget (₹)', 'number'), f('spent', 'Amount spent (₹)', 'number'), f('leads', 'Leads generated', 'int'), f('conversions', 'Conversions (clients won)', 'int'), sel('status', 'Status', ['active', 'paused', 'completed'], { def: 'active' }), f('start_date', 'Start', 'date'), f('end_date', 'End', 'date'), f('notes', 'Notes', 'textarea')] },
  content_calendar: { module: 'content', table: 'content_calendar', title: 'title', label: 'Planned content', plural: 'Content plan', search: ['title', 'keyword', 'writer'], cols: ['title', 'planned_on', 'kind', 'status', 'writer', 'keyword'], filters: ['status', 'kind'], order: 'm.planned_on',
    fields: [f('title', 'Title / topic', 'text', { required: true }), f('planned_on', 'Planned date', 'date', { required: true }), sel('kind', 'Type', ['blog', 'landing page', 'social', 'video'], { def: 'blog' }), sel('status', 'Status', ['planned', 'draft', 'scheduled', 'published'], { def: 'planned' }), ref('writer', 'Writer', 'users'), f('keyword', 'Focus keyword'), f('notes', 'Brief', 'textarea')] },
};

const REF_TABLE = { users: 'users', ...Object.fromEntries(Object.entries(ENTITIES).map(([k, v]) => [k, v.table])) };
const titleOf = (entity) => (entity === 'users' ? 'name' : ENTITIES[entity].title);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (m) => Object.assign(new Error(m), { status: 400 });
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);

/** Public description of the entities for the browser (no SQL, no hooks). */
export function metaFor(can) {
  const out = {};
  for (const [k, e] of Object.entries(ENTITIES)) {
    if (!can(e.module)) continue;
    out[k] = { label: e.label, plural: e.plural, cols: e.cols, filters: e.filters || [], fields: e.fields, hidden: Boolean(e.hidden) };
  }
  return out;
}

/** Validates a request body against the entity's fields; returns column → value. */
export function validate(e, body, partial = false) {
  const out = {};
  for (const fd of e.fields) {
    let v = body?.[fd.name];
    if (v === undefined) { if (partial) continue; v = fd.def; }
    if (v === '' || v === null || v === undefined) {
      if (fd.required && !partial) throw bad(`${fd.label} is required.`);
      if (fd.required && partial && body[fd.name] !== undefined) throw bad(`${fd.label} is required.`);
      out[fd.name] = fd.type === 'bool' ? Boolean(v) : null;
      continue;
    }
    switch (fd.type) {
      case 'number': v = Number(v); if (!Number.isFinite(v) || Math.abs(v) > 1e11) throw bad(`${fd.label} must be a number.`); break;
      case 'int': v = Math.round(Number(v)); if (!Number.isFinite(v) || Math.abs(v) > 1e9) throw bad(`${fd.label} must be a whole number.`); break;
      case 'date': v = String(v).slice(0, 10); if (!DATE.test(v) || Number.isNaN(Date.parse(v))) throw bad(`${fd.label} must be a valid date.`); break;
      case 'bool': v = v === true || v === 'true' || v === 'on'; break;
      case 'select': v = String(v); if (!fd.options.includes(v)) throw bad(`${fd.label}: choose one of ${fd.options.join(', ')}.`); break;
      case 'email': v = clean(v, 200).toLowerCase(); if (!/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v)) throw bad(`${fd.label} is not a valid email.`); break;
      case 'url': v = clean(v, 500); if (!/^https?:\/\//i.test(v)) v = v.includes('.') ? 'https://' + v : (() => { throw bad(`${fd.label} must be a web address.`); })(); break;
      case 'textarea': v = String(v).slice(0, 5000); break;
      default: v = clean(v, 300);
    }
    out[fd.name] = v;
  }
  return out;
}

const SEARCH_JOIN = (e) => e.fields.filter((x) => x.type === 'ref').map((x) => ({ col: x.name, table: REF_TABLE[x.entity], title: titleOf(x.entity) }));

export async function list(key, { q = '', page = 1, size = 25, filters = {} } = {}) {
  const e = ENTITIES[key];
  const joins = SEARCH_JOIN(e);
  const where = []; const args = [];
  for (const [k, v] of Object.entries(e.fixed || {})) { where.push(`m.${k} = ?`); args.push(v); }
  if (q) { where.push('(' + e.search.map((c) => `m.${c} ILIKE ?`).join(' OR ') + ')'); for (const _ of e.search) args.push(`%${q.replace(/[%_\\]/g, '\\$&')}%`); }
  for (const [k, v] of Object.entries(filters)) {
    const fd = e.fields.find((x) => x.name === k);
    if (!fd || !['select', 'ref', 'text'].includes(fd.type) || v === '' || v == null) continue;
    where.push(`m.${k} = ?`); args.push(String(v));
  }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const sel = ['m.*', ...joins.map((j, i) => `j${i}.${j.title} AS ${j.col}__label`)].join(', ');
  const from = `FROM ${e.table} m ${joins.map((j, i) => `LEFT JOIN ${j.table} j${i} ON j${i}.id = m.${j.col}`).join(' ')}`;
  const total = (await store.queryOne(`SELECT COUNT(*) AS n ${from} ${W}`, args)).n;
  size = Math.min(100, Math.max(1, size)); page = Math.max(1, page);
  const rows = await store.query(`SELECT ${sel} ${from} ${W} ORDER BY ${e.order || 'm.created_at DESC'} LIMIT ${size} OFFSET ${(page - 1) * size}`, args);
  return { rows: e.computed ? rows.map((r) => ({ ...r, ...e.computed(r) })) : rows, total: Number(total), page, size };
}

export async function create(key, body) {
  const e = ENTITIES[key];
  const d = { ...validate(e, body), ...(e.fixed || {}) };
  e.before?.(d, null);
  const id = store.newId(8);
  const cols = Object.keys(d);
  await store.query(`INSERT INTO ${e.table} (id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`, [id, ...cols.map((c) => d[c])]);
  return id;
}

export async function update(key, id, body) {
  const e = ENTITIES[key];
  const old = await store.queryOne(`SELECT * FROM ${e.table} WHERE id = ?${e.fixed ? ' AND track = ?' : ''}`, [id, ...(e.fixed ? [e.fixed.track] : [])]);
  if (!old) throw Object.assign(new Error('Not found.'), { status: 404 });
  const d = validate(e, body, true);
  e.before?.(d, old);
  const cols = Object.keys(d);
  if (!cols.length) return;
  await store.query(`UPDATE ${e.table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`, [...cols.map((c) => d[c]), id]);
}

export async function remove(key, id) {
  const e = ENTITIES[key];
  await store.query(`DELETE FROM ${e.table} WHERE id = ?${e.fixed ? ' AND track = ?' : ''}`, [id, ...(e.fixed ? [e.fixed.track] : [])]);
}

// Self-check: node server/crm/entities.js
if (process.argv[1]?.endsWith('entities.js')) {
  const e = ENTITIES.deals;
  assert.throws(() => validate(e, {}), /Deal name is required/);
  const d = validate(e, { name: 'X', value: '1500', stage: 'qualified' });
  assert.equal(d.value, 1500); e.before(d); assert.equal(d.probability, 40);
  assert.throws(() => validate(e, { name: 'X', stage: 'bogus' }), /Stage/);
  assert.throws(() => validate(ENTITIES.expenses, { title: 'a', amount: 1, spent_on: '2026-13-45' }), /valid date/);
  assert.equal(validate(ENTITIES.companies, { name: 'A', website: 'a.com' }).website, 'https://a.com');
  assert.equal(ENTITIES.campaigns.computed({ spent: 1000, leads: 10, conversions: 2 }).cpl, 100);
  console.log('entities ok');
  process.exit(0);
}
