// Click2Client Media admin portal. Every request is authorised server-side
// (session cookie + CSRF header); this file only renders what the API allows.

import { api, setCsrf, esc, fmtDate, hostOf, toast, scoreColor, ICON, modal } from './common.js';

import { seoTab } from './seo.js';
import { icon, debounce } from './admin/ui.js';
import { dashboardTab } from './admin/dashboard.js';
import { entityTab } from './admin/entity.js';
import { leadsTab } from './admin/leads.js';
import { invoicesTab, financeTab } from './admin/finance.js';
import { blogTab, calendarTab } from './admin/content.js';
import { reportsTab, teamTab, logsTab } from './admin/reports.js';
const root = document.getElementById('root');
// Sidebar: [group, [[route, label, icon, permission]]]. Items a role cannot use are hidden.
const NAV = [
  ['', [['dashboard', 'Dashboard', 'home', 'dashboard']]],
  ['CRM', [['leads', 'Leads & Enquiries', 'users', 'crm'], ['contacts', 'Contacts', 'user', 'crm'], ['companies', 'Companies', 'building', 'crm'], ['deals', 'Deals (Pipeline)', 'deal', 'crm'], ['clients', 'Clients', 'shield', 'crm'], ['tasks', 'Tasks & Follow-ups', 'check', 'crm']]],
  ['Sales & Payments', [['payments', 'Payments', 'card', 'payments'], ['invoices', 'Invoices', 'file', 'finance'], ['subscriptions', 'Subscriptions', 'repeat', 'finance'], ['finance', 'Revenue & Expenses', 'wallet', 'finance']]],
  ['Marketing & SEO', [['audits', 'SEO Audits', 'search', 'seo'], ['seo', 'SEO Agent', 'chart', 'seo'], ['projects', 'Client Websites', 'globe', 'seo'], ['keywords', 'Keywords & Rankings', 'tag', 'seo'], ['backlinks', 'Backlinks', 'list', 'seo'], ['aeo', 'AEO (AI Search)', 'spark', 'seo'], ['geo', 'GEO (Generative)', 'pin', 'seo'], ['campaigns', 'Campaigns', 'mega', 'seo']]],
  ['Content', [['blog', 'Blog (SEO / AEO / GEO)', 'pen', 'content'], ['calendar', 'Content Calendar', 'cal', 'content'], ['pages', 'Page Content', 'layout', 'content'], ['courses', 'Courses', 'book', 'content'], ['brands', 'Brands', 'tag', 'content']]],
  ['Management', [['reports', 'Reports & Analytics', 'bars', 'reports'], ['team', 'Team Management', 'users', 'team'], ['logs', 'Activity Log', 'clock', 'team'], ['settings', 'Settings', 'gear', 'settings']]],
];
// Routes backed by the generic module page: route -> entity key
const ENT = { contacts: 'contacts', companies: 'companies', deals: 'deals', clients: 'clients', tasks: 'tasks', subscriptions: 'subscriptions', projects: 'seo_projects', keywords: 'seo_keywords', backlinks: 'backlinks', aeo: 'aeo', geo: 'geo', campaigns: 'campaigns' };
const PS = { pending: 'Payment Pending', screenshot_received: 'Screenshot Received', under_verification: 'Payment Under Verification', verified: 'Payment Verified', rejected: 'Payment Rejected' };
const LS = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal_sent: 'Proposal Sent', won: 'Won', lost: 'Lost' };
const PLAN = { free: 'Free 10-page', p25: '25-page', p50: '50-page Growth', internal: 'Internal' };
const planLabel = (p, amount) => (PLAN[p] || p) + ((p === 'p25' || p === 'p50') && amount ? ` · ₹${amount}` : '');
const SRC = { free_audit: 'Free audit', order_p25: '25-page audit order', order_p50: '50-page audit order', enquiry_page: 'Enquiry form', home_form: 'Home page form', seo_implementation: 'Implementation request (report)', website: 'Website' };
const state = { tab: 'dashboard', hq: new URLSearchParams(), meta: null, leadFilter: 'all', auditFilter: 'all', pending: 0 };
function readHash() { const [t, qs = ''] = location.hash.slice(1).split('?'); state.tab = (t === 'overview' ? 'dashboard' : t) || 'dashboard'; state.hq = new URLSearchParams(qs); }
readHash();
const allowed = (perm) => state.meta && (state.meta.me.permissions.includes('*') || state.meta.me.permissions.includes(perm));

// ── Auth ─────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const me = await api('/admin/me');
    setCsrf(me.csrf);
    state.meta = await api('/admin/crm/meta');
    shell();
  } catch {
    loginView();
  }
}

function loginView(msg = '') {
  root.innerHTML = `<div class="login"><form class="card" id="lf">
    <a class="logo-box" href="/" style="display:inline-block"><span class="logo-crop" style="width:200px"><img src="/img/click2client-media-logo.webp" alt="Click2Client Media" width="2000" height="774"></span></a>
    <h1 style="font:700 24px var(--display);margin:22px 0 4px;letter-spacing:-0.02em">Admin portal</h1>
    <p class="small muted">Authorised Click2Client Media staff only.</p>
    <div class="field" style="margin-top:20px"><label for="em">Email <span class="muted">(team members; leave blank for the founder login)</span></label><input class="input" id="em" name="email" type="email" autocomplete="username"></div>
    <div class="field" style="margin-top:12px"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required autofocus></div>
    <p class="small" style="color:var(--fail);margin-top:10px" id="lerr" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
    <button class="btn accent" style="width:100%;margin-top:18px;height:48px" type="submit">Sign in</button>
  </form></div>`;
  document.getElementById('lf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/admin/login', { method: 'POST', body: { email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value } });
      setCsrf(r.csrf);
      state.meta = await api('/admin/crm/meta');
      shell();
    } catch (ex) {
      const el = document.getElementById('lerr');
      el.textContent = ex.message;
      el.hidden = false;
    }
  };
}

// ── Shell ────────────────────────────────────────────────────────────────
function shell() {
  const me = state.meta.me;
  root.innerHTML = `<div class="app"><aside class="sb" id="sb">
      <a class="logo-box" href="/" aria-label="Click2Client Media website"><span class="logo-crop"><img src="/img/click2client-media-logo.webp" alt="Click2Client Media" width="2000" height="774"></span></a>
      ${NAV.map(([g, items]) => { const vis = items.filter((i) => allowed(i[3])); return vis.length ? `<div class="sb-group">${g ? `<div class="sb-label">${g}</div>` : ''}${vis.map(([k, l, ic]) => `<a class="nv" href="#${k}" data-tab="${k}">${icon(ic)}<span>${l}</span>${k === 'payments' ? '<span class="badge-n" id="pbadge" hidden></span>' : ''}</a>`).join('')}</div>` : ''; }).join('')}
      <div class="sb-foot">${allowed('seo') ? '<a href="/app#/new">Audit workspace →</a><br>' : ''}<a href="/" target="_blank" rel="noopener">View website ↗</a></div></aside><div class="sb-bg" id="sbbg"></div>
    <div class="main"><header class="top"><button class="icon-btn menu" id="menu" aria-label="Menu">${icon('menu')}</button>
      <div class="gs">${icon('search')}<input id="gsi" type="search" placeholder="Search leads, clients, deals, payments, invoices, audits, blogs…" autocomplete="off" aria-label="Global search"><div class="drop" id="gsd" hidden></div></div><span style="flex:1"></span>
      <div class="bellwrap"><button class="icon-btn" id="bell" aria-label="Notifications">${icon('bell')}<span class="dot" id="bdot" hidden></span></button><div class="drop" id="nd" hidden></div></div>
      <div class="me"><span class="av">${esc((me.name || 'F')[0].toUpperCase())}</span><div><b>${esc(me.name)}</b><small>${esc(me.role === 'founder' ? 'Founder' : (me.role || '').replace(/^./, (c) => c.toUpperCase()))}</small></div></div>
      <button class="btn sm" id="logout">Sign out</button></header>
    <main class="view" id="view"></main></div></div>`;
  document.getElementById('logout').onclick = async () => { clearInterval(state.noteTimer); await api('/admin/logout', { method: 'POST' }).catch(() => {}); setCsrf(''); state.meta = null; loginView(); };
  const closeNav = () => document.body.classList.remove('nav-open');
  document.getElementById('menu').onclick = () => document.body.classList.toggle('nav-open');
  document.getElementById('sbbg').onclick = closeNav;
  if (!state.bound) { addEventListener('hashchange', () => { readHash(); closeNav(); state.pfEdit = null; state.blogEdit = null; for (const k in (state.ct || {})) state.ct[k].edit = null; if (state.pf) Object.assign(state.pf, { view: 'list', id: null }); if (state.meta) route(); }); state.bound = true; }
  wireTop();
  route();
}

// Global search + notification bell (both computed server-side from real records)
function wireTop() {
  const gi = document.getElementById('gsi'); const gd = document.getElementById('gsd'); const nd = document.getElementById('nd'); const bd = document.getElementById('bdot');
  gi.oninput = debounce(async () => {
    const q = gi.value.trim(); if (q.length < 2) { gd.hidden = true; return; }
    try { const r = await api('/admin/crm/search?q=' + encodeURIComponent(q)); gd.innerHTML = r.results.length ? r.results.map((x) => `<a href="${esc(x.link)}"><span class="ty">${esc(x.type)}</span><span>${esc(x.title)}<small>${esc(x.sub || '')}</small></span></a>`).join('') : '<div class="none">No matches</div>'; gd.hidden = false; } catch (e) { gd.innerHTML = `<div class="none">${esc(e.message)}</div>`; gd.hidden = false; }
  }, 250);
  gd.onclick = () => { gd.hidden = true; gi.value = ''; };
  const seen = () => { try { return JSON.parse(localStorage.getItem('c2c_seen') || '[]'); } catch { return []; } };
  const paint = () => {
    const items = state.notes || []; const s = seen(); const fresh = items.filter((i) => !s.includes(i.key));
    bd.hidden = !fresh.length; bd.textContent = fresh.length;
    nd.innerHTML = items.length ? items.map((i) => `<a class="${esc(i.level)}" href="${esc(i.link)}"><span class="ty">${esc(i.type.replace('-', ' '))}</span><span>${esc(i.text)}${s.includes(i.key) ? '' : ' <b style="color:var(--accent)">•</b>'}</span></a>`).join('') + '<a href="#" data-readall><span class="ty"></span><span class="muted">Mark all as read</span></a>' : '<div class="none">You are all caught up.</div>';
  };
  const load = async () => { try { state.notes = (await api('/admin/crm/notifications')).items; const pn = state.notes.find((i) => i.type === 'payment'); setBadge(pn ? Number(pn.key.split(':')[1]) : 0); paint(); } catch { /* bell is best-effort */ } };
  document.getElementById('bell').onclick = (e) => { e.stopPropagation(); nd.hidden = !nd.hidden; };
  nd.onclick = (e) => { if (e.target.closest('[data-readall]')) { e.preventDefault(); try { localStorage.setItem('c2c_seen', JSON.stringify((state.notes || []).map((i) => i.key))); } catch { /* storage may be blocked */ } paint(); } nd.hidden = true; };
  document.addEventListener('click', (e) => { if (!e.target.closest('.gs')) gd.hidden = true; if (!e.target.closest('.bellwrap')) nd.hidden = true; });
  clearInterval(state.noteTimer); state.noteTimer = setInterval(() => { if (!document.hidden && state.meta) load(); }, 60000);
  load();
}

async function route() {
  const view = document.getElementById('view');
  if (!view || !state.meta) return;
  const nav = NAV.flatMap(([, i]) => i).find(([k]) => k === state.tab);
  if (!nav || !allowed(nav[3])) { if (state.tab !== 'dashboard' && allowed('dashboard')) { location.hash = '#dashboard'; return; } }
  document.querySelectorAll('.sb a.nv').forEach((a) => a.classList.toggle('on', a.dataset.tab === state.tab));
  view.onclick = null; view.onchange = null;
  const ctx = { state, meta: state.meta };
  try {
    const fn = { dashboard: (v) => dashboardTab(v, ctx), leads: (v) => leadsTab(v, ctx), payments, audits, courses: (v) => contentTab(v, 'course'), brands: (v) => contentTab(v, 'brand'), blog: (v) => blogTab(v, ctx), seo: (v) => seoTab(v, { head, state }), settings,
      invoices: (v) => invoicesTab(v, ctx), finance: (v) => financeTab(v, ctx), calendar: (v) => calendarTab(v, ctx), pages: pagesTab, reports: (v) => reportsTab(v, ctx), team: (v) => teamTab(v, ctx), logs: (v) => logsTab(v, ctx),
      ...Object.fromEntries(Object.entries(ENT).map(([r, key]) => [r, (v) => entityTab(v, key, ctx)])) }[state.tab] || ((v) => dashboardTab(v, ctx));
    await fn(view);
  } catch (e) {
    if (e.status === 401) { clearInterval(state.noteTimer); state.meta = null; return loginView('Your session has ended. Please sign in again.'); }
    view.innerHTML = `<div class="card empty"><h3>Could not load this section</h3><p>${esc(e.message)}</p></div>`;
  }
}

const head = (eyebrow, title, sub, right = '') => `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><span class="spacer"></span><div class="row wrap-row">${right}</div></div>`;
const wa = (phone, text = '') => { const d = String(phone || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length === 10 ? '91' + d : d}${text ? '?text=' + encodeURIComponent(text) : ''}` : null; };
const bars = (rows) => {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return rows.length ? `<div class="hbars">${rows.map((r) => `<div class="r"><span class="break">${esc(r.label)}</span><div class="bar"><span style="width:${(100 * r.n) / max}%"></span></div><b style="text-align:right">${r.n}</b></div>`).join('')}</div>` : '<p class="small muted" style="margin-top:10px">No data yet.</p>';
};

// ── Selection & permanent deletion (for clearing test entries) ─────────
const selHead = '<th class="sel"><input type="checkbox" data-sel-all aria-label="Select all"></th>';
const selCell = (id, enabled = true) => `<td class="sel">${enabled ? `<input type="checkbox" data-sel="${esc(id)}" aria-label="Select row">` : ''}</td>`;
const delBtn = '<button class="btn sm quiet del" data-del title="Delete permanently">Delete</button>';
const bulkBar = '<div class="bulk" hidden><b data-sel-count></b><span class="spacer"></span><button class="btn sm danger" data-del-selected>Delete selected</button><button class="btn sm quiet" data-sel-clear>Clear selection</button></div>';

function updateBulk(view) {
  const n = view.querySelectorAll('[data-sel]:checked').length;
  const bar = view.querySelector('.bulk');
  if (!bar) return;
  bar.hidden = !n;
  bar.querySelector('[data-sel-count]').textContent = `${n} selected`;
}

async function deleteIds({ kind, noun, warn }, ids) {
  if (!ids.length) return false;
  const label = `${ids.length} ${noun}${ids.length > 1 ? 's' : ''}`;
  if (!confirm(`Permanently delete ${label}?

${warn}

This cannot be undone.`)) return false;
  try {
    const r = await api(`/admin/${kind}/delete`, { method: 'POST', body: { ids } });
    toast(`Deleted ${r.deleted} ${noun}${r.deleted === 1 ? '' : 's'}`);
    return true;
  } catch (ex) { toast(ex.message); return false; }
}

/** Handles checkbox / delete clicks. Returns true when the click was handled. */
function selectionClick(e, view, opts) {
  const t = e.target;
  if (t.matches('[data-sel-all]')) { view.querySelectorAll('[data-sel]').forEach((c) => (c.checked = t.checked)); updateBulk(view); return true; }
  if (t.matches('[data-sel]')) { updateBulk(view); return true; }
  if (t.closest('[data-sel-clear]')) { view.querySelectorAll('[data-sel], [data-sel-all]').forEach((c) => (c.checked = false)); updateBulk(view); return true; }
  if (t.closest('[data-del-selected]')) {
    const ids = [...view.querySelectorAll('[data-sel]:checked')].map((c) => c.dataset.sel);
    deleteIds(opts, ids).then((ok) => ok && opts.reload());
    return true;
  }
  if (t.closest('[data-del]')) {
    const id = t.closest('tr[data-id]')?.dataset.id;
    if (id) deleteIds(opts, [id]).then((ok) => ok && opts.reload());
    return true;
  }
  return false;
}

// ── Overview / analytics ─────────────────────────────────────────────────
function setBadge(n) {
  state.pending = n;
  const b = document.getElementById('pbadge');
  if (b) { b.hidden = !n; b.textContent = n; }
}

// ── Payment verification ─────────────────────────────────────────────────
async function payments(view) {
  const { orders, statuses } = await api('/admin/orders');
  setBadge(orders.filter((o) => o.payment_status === 'screenshot_received' || o.payment_status === 'under_verification').length);
  view.innerHTML = `${head('Payments', 'Payment Verification', 'Check the WhatsApp screenshot against your UPI app or bank statement, then mark the payment. Only "Payment Verified" starts the paid audit.')}
    ${orders.length ? `<div class="card table-wrap">${bulkBar}<table class="t"><thead><tr>${selHead}<th>Date</th><th>Customer</th><th>Website</th><th>Plan</th><th class="num">Amount</th><th>Payment status</th><th>Transaction ID</th><th>Audit</th><th></th></tr></thead><tbody>
    ${orders.map((o) => {
      const w = wa(o.phone, `Hi ${o.name}, this is Click2Client Media regarding your ${o.plan === 'p50' ? '50-Page SEO Growth Audit' : '25-Page SEO Audit'} order (${o.id}).`);
      return `<tr data-id="${esc(o.id)}">
        ${selCell(o.id, o.audit_status !== 'running')}
        <td class="small nowrap">${fmtDate(o.created_at, true)}</td>
        <td class="small who"><b>${esc(o.name)}</b><br>${esc(o.business || '')}<br><a href="mailto:${esc(o.email)}">${esc(o.email)}</a><br>${esc(o.phone)} ${w ? `· <a href="${w}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td>
        <td class="small break">${esc(o.website)}${o.location ? `<br><span class="muted">${esc(o.category || '')} ${esc(o.location)}</span>` : ''}</td>
        <td class="small">${o.plan === 'p50' ? '50-Page SEO Growth Audit' : '25-Page SEO Audit'}</td>
        <td class="num"><b>₹${o.amount}</b></td>
        <td><select class="mini" data-ps>${statuses.map((st) => `<option value="${st}" ${st === o.payment_status ? 'selected' : ''}>${PS[st]}</option>`).join('')}</select></td>
        <td><input class="input" style="height:34px;width:140px;font-size:12.5px" data-txn placeholder="UPI ref (optional)" value="${esc(o.transaction_id || '')}"></td>
        <td class="small">${o.audit_id ? `${o.audit_status === 'complete' ? `<span class="pill pass">Completed</span> ${o.audit_score ?? ''}` : o.audit_status === 'failed' ? '<span class="pill fail">Failed</span>' : '<span class="pill info">Processing</span>'}` : '<span class="pill unavailable">Pending</span>'}</td>
        <td class="nowrap">${o.payment_status !== 'verified' ? `<button class="btn sm accent" data-verify>Verify Payment</button>` : o.audit_id ? `<a class="btn sm ghost" href="/audit/${esc(o.audit_id)}" target="_blank">Open report</a>${o.audit_status === 'complete' && wa(o.phone) ? `<a class="btn sm" style="background:#25D366;border-color:#25D366;color:#fff;margin-left:6px" target="_blank" rel="noopener" href="${wa(o.phone, `Hi ${o.name}, your ${o.plan === 'p50' ? '50-Page SEO Growth Audit' : '25-Page SEO Audit'} for ${o.website} is ready.\n\nView your dashboard: ${location.origin}/audit/${o.audit_id}\nDownload the PDF report: ${location.origin}/report/${o.audit_id}\n\n— Click2Client Media`)}">Send report on WhatsApp</a>` : ''}${o.audit_status === 'failed' ? ' <button class="btn sm" data-restart>Re-run</button>' : ''}` : '<button class="btn sm" data-restart>Start audit</button>'}${o.audit_status !== 'running' ? delBtn : ''}</td>
      </tr>`;
    }).join('')}</tbody></table></div>` : '<div class="card empty"><h3>No paid orders yet</h3><p>Orders appear here when a visitor chooses the ₹125 or ₹399 audit.</p></div>'}`;

  const save = async (tr, body) => {
    try {
      const r = await api(`/admin/orders/${tr.dataset.id}`, { method: 'PATCH', body });
      toast(r.auditId && body.paymentStatus === 'verified' ? 'Payment verified — audit started' : 'Saved');
      payments(view);
    } catch (ex) { toast(ex.message); }
  };
  view.onchange = (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (e.target.matches('[data-ps]')) {
      const v = e.target.value;
      if (v === 'verified' && !confirm('Mark this payment as VERIFIED? This starts the paid audit.')) return payments(view);
      save(tr, { paymentStatus: v, transactionId: tr.querySelector('[data-txn]').value });
    }
    if (e.target.matches('[data-txn]')) save(tr, { transactionId: e.target.value });
  };
  view.onclick = async (e) => {
    if (selectionClick(e, view, { kind: 'orders', noun: 'order', warn: 'The order, the audit it produced and its lead entry will be removed. Revenue and dashboard numbers update immediately.', reload: () => payments(view) })) return;
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (e.target.closest('[data-verify]')) {
      if (!confirm('Have you confirmed this payment in your UPI app or bank statement? Verifying starts the paid audit.')) return;
      save(tr, { paymentStatus: 'verified', transactionId: tr.querySelector('[data-txn]').value });
    }
    if (e.target.closest('[data-restart]')) {
      try { await api(`/admin/orders/${tr.dataset.id}/restart`, { method: 'POST' }); toast('Audit started'); payments(view); } catch (ex) { toast(ex.message); }
    }
  };
}

// ── Leads ────────────────────────────────────────────────────────────────
async function audits(view) {
  const f = state.auditFilter;
  const { audits: list } = await api(`/admin/audits${f === 'all' ? '' : `?plan=${f}`}`);
  const F = [['all', 'All'], ['free', 'Free'], ['paid', 'Paid'], ['p25', '25-page'], ['p50', '50-page'], ['internal', 'Internal']];
  view.innerHTML = `${head('Audit management', 'SEO Audits', 'Every audit run from the website and the internal workspace.', `<a class="btn sm accent" href="/app#/new">+ Run internal audit</a>`)}
    <div class="filters">${F.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-af="${k}">${l}</button>`).join('')}</div>
    ${list.length ? `<div class="card table-wrap">${bulkBar}<table class="t"><thead><tr>${selHead}<th>Date</th><th>Website</th><th>Customer</th><th>Plan</th><th>Payment</th><th>Audit status</th><th class="num">Pages</th><th class="num">Score</th><th>Report</th></tr></thead><tbody>
      ${list.map((a) => `<tr data-id="${esc(a.id)}">
        ${selCell(a.id, a.status !== 'running')}
        <td class="small nowrap">${fmtDate(a.created_at, true)}</td>
        <td class="break"><b>${esc(hostOf(a.website))}</b></td>
        <td class="small">${esc(a.business || '')}${a.email ? `<br><span class="muted">${esc(a.email)}</span>` : ''}</td>
        <td class="small">${esc(planLabel(a.plan, ''))}</td>
        <td class="small">${a.payment_status ? `<span class="pill ps-${a.payment_status} plain">${PS[a.payment_status]}</span>` : a.plan === 'free' ? 'Free' : '—'}</td>
        <td>${a.status === 'complete' ? '<span class="pill pass">Completed</span>' : a.status === 'running' ? '<span class="pill info">Processing</span>' : '<span class="pill fail">Failed</span>'}</td>
        <td class="num">${a.pages ?? '—'}</td>
        <td class="num">${a.score != null ? `<b style="color:${scoreColor(a.score)}">${a.score}</b>` : '—'}</td>
        <td class="nowrap">${a.status === 'complete' ? (a.plan === 'internal' ? `<a class="btn quiet sm" href="/app#/audit/${esc(a.id)}">Open</a>` : `<a class="btn quiet sm" href="/audit/${esc(a.id)}" target="_blank">Customer view</a><a class="btn quiet sm" href="/app#/audit/${esc(a.id)}">Full data</a>`) : ''}${a.status !== 'running' ? delBtn : ''}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="card empty"><p>No audits in this view yet.</p></div>'}`;
  view.onclick = (e) => {
    if (selectionClick(e, view, { kind: 'audits', noun: 'audit', warn: 'The audit report and its customer link will stop working. Linked orders and leads are kept.', reload: () => audits(view) })) return;
    const c = e.target.closest('[data-af]');
    if (c) { state.auditFilter = c.dataset.af; audits(view); }
  };
}

// ── Settings ─────────────────────────────────────────────────────────────
async function settings(view) {
  const { settings: s, qrConfigured, integrations, pricing } = await api('/admin/settings');
  const F = (k, l, hint = '', type = 'text') => `<div class="field"><label for="s-${k}">${l}</label><input class="input" id="s-${k}" name="${k}" type="${type}" value="${esc(s[k] || '')}">${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  view.innerHTML = `${head('Configuration', 'Settings', 'Contact details, social links and payment details used across the website. Changes apply immediately.')}
    <div class="two" style="align-items:start">
      <form class="card card-pad" id="sf">
        <h3>Contact &amp; social</h3>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
          ${F('phone', 'Phone (display)')}${F('whatsapp', 'WhatsApp number', 'With country code, digits only — e.g. 919940411837')}
          ${F('email', 'Email', '', 'email')}${F('city', 'City')}
          ${F('instagram', 'Instagram URL', '', 'url')}${F('facebook', 'Facebook URL', '', 'url')}
        </div>
        <h3 style="margin-top:24px">UPI payment details</h3>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">${F('upiId', 'UPI ID', 'Shown under the QR and used for the “Open in UPI app” link')}${F('payeeName', 'Payee name')}</div>
        <h3 style="margin-top:24px">Analytics &amp; Google Search Console</h3>
        <p class="small muted" style="margin-top:4px">Optional. Leave empty to keep the site free of analytics. Once set, these funnel events are tracked: <code>audit_started</code>, <code>audit_completed</code>, <code>generate_lead</code>, <code>begin_checkout</code>, <code>payment_submitted</code>, <code>whatsapp_click</code>, <code>phone_click</code>.</p>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px;margin-top:14px">
          ${F('ga4Id', 'GA4 Measurement ID', 'GA4 → Admin → Data streams → Web, e.g. G-AB12CD34EF')}
          ${F('gtmId', 'Google Tag Manager ID (optional)', 'e.g. GTM-ABC1234. Use GA4 or GTM, not both for the same GA4 property.')}
        </div>
        <div style="margin-top:14px">${F('gscVerification', 'Search Console verification code', 'Search Console → Add property → URL prefix → HTML tag: paste the content="…" value (or the whole tag).')}</div>
        <h3 style="margin-top:24px">Testimonials</h3>
        <div class="field" style="margin-top:10px"><textarea class="input" name="testimonials" rows="4" placeholder="Name | Business | Quote">${esc(s.testimonials || '')}</textarea><span class="hint">One per line: <code>Name | Business | Quote</code>. Only add real testimonials you have permission to publish. The section stays hidden while this is empty.</span></div>
        <div class="field" style="margin-top:14px"><label>Report footer</label><textarea class="input" name="reportFooter" rows="2">${esc(s.reportFooter || '')}</textarea></div>
        <div class="row" style="margin-top:18px"><button class="btn accent" type="submit">Save settings</button></div>
      </form>
      <div class="stack">
        <div class="card card-pad">
          <h3>Payment QR code</h3>
          <p class="small muted" style="margin-top:4px">Shown to customers on the ₹${pricing.p25} and ₹${pricing.p50} payment screens.</p>
          <div class="row" style="margin-top:14px;align-items:flex-start;gap:16px">
            <div><img class="qr-prev" src="/api/public/payment-qr?t=${Date.now()}" alt="Payment QR currently shown to customers"><div class="tiny muted" style="margin-top:6px;max-width:160px">${qrConfigured ? 'Uploaded QR (in use)' : 'Built-in QR — harithph5@oksbi'}</div></div>
            <div class="stack"><label class="btn sm accent" style="cursor:pointer">Upload QR image<input type="file" id="qrFile" accept="image/png,image/jpeg,image/webp" hidden></label>${qrConfigured ? '<button class="btn sm ghost" id="qrDel" type="button">Remove (use built-in QR)</button>' : ''}<span class="tiny muted">PNG, JPG or WebP, under 1 MB.</span></div>
          </div>
        </div>
        <form class="card card-pad" id="priceForm"><h3>SEO audit prices</h3><p class="small muted" style="margin-top:4px">Shown on the home page, SEO Audit page, SEO Tools and menu, and charged on new orders. The free 10-page audit stays ₹0. Existing orders keep the price they were placed at.</p>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
            <div class="field"><label for="pr25">25-page audit (₹)</label><input class="input" id="pr25" name="p25" type="number" min="1" max="100000" step="1" value="${pricing.p25}" required></div>
            <div class="field"><label for="pr50">50-page growth audit (₹)</label><input class="input" id="pr50" name="p50" type="number" min="1" max="100000" step="1" value="${pricing.p50}" required></div>
          </div><div class="row" style="margin-top:12px"><button class="btn accent sm" type="submit">Save prices</button></div></form>
        <div class="card"><div class="card-head"><h3>Integrations</h3></div><div class="table-wrap"><table class="t"><tbody>${integrations.map((i) => `<tr><td><b>${esc(i.name)}</b><div class="tiny muted" style="margin-top:3px">${esc(i.usedFor)}</div>${i.envVars.length ? `<div class="mono tiny" style="margin-top:4px">${i.envVars.map(esc).join(' · ')}</div>` : ''}</td><td class="nowrap">${i.configured ? '<span class="pill pass">Connected</span>' : i.partiallyAvailable ? '<span class="pill warning">Limited</span>' : '<span class="pill unavailable">Not set</span>'}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
    </div>`;
  document.getElementById('sf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Settings saved'); } catch (ex) { toast(ex.message); }
  };
  document.getElementById('priceForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (!confirm(`Change prices to ₹${body.p25} (25-page) and ₹${body.p50} (50-page)? New orders will be charged these prices.`)) return;
    try { await api('/admin/pricing', { method: 'PUT', body }); toast('Prices updated on the website'); settings(view); } catch (ex) { toast(ex.message); }
  };
  document.getElementById('qrFile').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) return toast('Please use an image under 1 MB.');
    const r = new FileReader();
    r.onload = async () => {
      try { await api('/admin/settings/qr', { method: 'PUT', body: { dataUrl: r.result } }); toast('QR code updated'); settings(view); } catch (ex) { toast(ex.message); }
    };
    r.readAsDataURL(file);
  };
  const del = document.getElementById('qrDel');
  if (del) del.onclick = async () => { if (!confirm('Remove the payment QR code?')) return; await api('/admin/settings/qr', { method: 'DELETE' }); toast('QR removed'); settings(view); };
}

// ── Images (Supabase Storage) ─────────────────────────────────────────────
// Downscale images in the browser so uploads stay under the 1 MB server limit.
// crop: keep only the top of very tall screenshots (covers); false keeps the whole image.
async function shrinkImage(file, { crop = true } = {}) {
  const bmp = await createImageBitmap(file);
  const sh = crop ? Math.min(bmp.height, Math.round(bmp.width * 0.75)) : bmp.height;
  const scale = Math.min(1, 1600 / bmp.width, 5000 / sh);
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * scale), height: Math.round(sh * scale) });
  c.getContext('2d').drawImage(bmp, 0, 0, bmp.width, sh, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.75, 0.6, 0.45, 0.35]) {
    const url = c.toDataURL('image/webp', q);
    if (url.startsWith('data:image/webp') && url.length < 1_300_000) return url;
  }
  return c.toDataURL('image/jpeg', 0.55);
}

const pfState = state.pf ||= { view: 'list', id: null, filter: 'all', search: '', media: null };
const pfNorm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── Media picker (Supabase Storage) ──────────────────────────────────────
const FOLDER_GUESS = { websites: 'Websites', seo: 'SEO', 'social-media': 'SMM', 'ads-campaigns': 'Paid Ads' };
function pickMedia({ multiple = false, title = 'Choose an image', project = {}, folder: uploadFolder = '' } = {}) {
  return new Promise((resolve) => {
    const words = pfNorm(`${project.title || ''} ${project.client || ''}`).split(' ').filter((w) => w.length >= 3 && !['the', 'and', 'website', 'media', 'system', 'list'].includes(w));
    const score = (f) => words.filter((w) => pfNorm(f.name).includes(w)).length;
    let folder = 'all', search = '', picked = [], files = pfState.media?.files || null, status = pfState.media || null, done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const close = modal(`<div class="mp"><div class="modal-head"><div style="flex:1"><h3 style="font:700 19px var(--display)">${esc(title)}</h3><p class="small muted" id="mpSub">Loading images from Supabase…</p></div><button class="btn sm ghost" data-close>Close</button></div>
      <div class="modal-body"><div id="mpBody"><p class="small muted">Loading…</p></div></div></div>`, {
      onMount: (m, closeFn) => {
        m.closest('.modal').classList.add('modal-wide');
        const render = () => {
          const body = m.querySelector('#mpBody');
          if (!status?.configured) {
            m.querySelector('#mpSub').textContent = 'Supabase is not connected yet — paste an image link instead.';
            body.innerHTML = `<div class="pf-note">Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> to your hosting environment variables to browse and upload Supabase images here.</div>${urlForm()}`;
            return;
          }
          const folders = [...new Set(files.map((f) => f.folder).filter(Boolean))].sort();
          const q = pfNorm(search);
          let shown = files.filter((f) => (folder === 'all' || f.folder === folder) && (!q || pfNorm(f.path).includes(q)));
          shown = shown.map((f) => [score(f), f]).sort((a, b) => b[0] - a[0]).map(([s, f]) => Object.assign(f, { _s: s }));
          m.querySelector('#mpSub').textContent = `${files.length} images in the “${status.bucket}” bucket.${words.length ? ' Matches for this project are shown first.' : ''}`;
          body.innerHTML = `<div class="mp-bar"><div class="filters" style="margin:0">${['all', ...folders].map((fo) => `<button class="chip ${folder === fo ? 'on' : ''}" data-folder="${esc(fo)}">${fo === 'all' ? 'All' : esc(fo)}</button>`).join('')}</div>
              <input class="input" id="mpSearch" type="search" placeholder="Search file names…" value="${esc(search)}" style="height:36px;max-width:220px"></div>
            <div class="mp-grid">${shown.map((f) => `<button type="button" class="mp-item ${picked.includes(f.url) ? 'on' : ''}" data-url="${esc(f.url)}" title="${esc(f.path)}"><img src="${esc(f.url)}" alt="" loading="lazy"><span>${f._s ? '<b>Suggested</b> · ' : ''}${esc(f.name)}</span></button>`).join('') || '<p class="small muted">No images here.</p>'}</div>
            <div class="mp-foot"><label class="btn sm" style="cursor:pointer">Upload to ${esc(folder === 'all' ? (uploadFolder || FOLDER_GUESS[project.category] || 'bucket root') : folder)}<input type="file" id="mpUp" accept="image/png,image/jpeg,image/webp" multiple hidden></label>
              <span class="spacer"></span>${multiple ? `<button class="btn sm accent" data-use ${picked.length ? '' : 'disabled'}>Add ${picked.length || ''} selected</button>` : ''}</div>
            <details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">Or paste an image link</summary>${urlForm()}</details>`;
          const s = body.querySelector('#mpSearch');
          s.oninput = () => { search = s.value; const pos = s.selectionStart; render(); const n = m.querySelector('#mpSearch'); n.focus(); n.setSelectionRange(pos, pos); };
          body.querySelector('#mpUp').onchange = async (e) => {
            const target = folder === 'all' ? (uploadFolder || FOLDER_GUESS[project.category] || '') : folder;
            try {
              for (const file of e.target.files) {
                toast(`Uploading ${file.name}…`);
                const r = await api('/admin/media', { method: 'POST', body: { folder: target, filename: file.name, dataUrl: await shrinkImage(file, { crop: false }) } });
                picked.push(r.url);
              }
              toast('Uploaded to Supabase');
              await load(true);
              if (!multiple) { closeFn(); finish(picked.slice(-1)); }
            } catch (ex) { toast(ex.message || 'Upload failed'); }
          };
        };
        const urlForm = () => `<form class="row" id="mpUrl" style="margin-top:10px;gap:8px"><input class="input" name="u" placeholder="https://…" style="flex:1"><button class="btn sm accent">Use link</button></form>`;
        const load = async (fresh) => {
          try { const r = await api(`/admin/media${fresh ? '?fresh=1' : ''}`); status = r; files = r.files; pfState.media = r; }
          catch (ex) { status = { configured: ex.status !== 503 ? true : false, bucket: '' }; files = []; if (ex.status !== 503) toast(ex.message); }
          render();
        };
        m.addEventListener('click', (e) => {
          const fo = e.target.closest('[data-folder]');
          if (fo) { folder = fo.dataset.folder; return render(); }
          const it = e.target.closest('.mp-item');
          if (it) {
            if (!multiple) { closeFn(); return finish([it.dataset.url]); }
            picked = picked.includes(it.dataset.url) ? picked.filter((u) => u !== it.dataset.url) : [...picked, it.dataset.url];
            return render();
          }
          if (e.target.closest('[data-use]')) { closeFn(); finish(picked); }
        });
        m.addEventListener('submit', (e) => {
          if (e.target.id !== 'mpUrl') return;
          e.preventDefault();
          const u = e.target.u.value.trim();
          if (!/^https?:\/\/\S+$/.test(u)) return toast('Paste a full link starting with https://');
          closeFn(); finish([u]);
        });
        if (files) render(); else load(false);
      },
    });
    // resolve with nothing when closed without choosing
    const obs = new MutationObserver(() => { if (!document.querySelector('.mp')) { obs.disconnect(); finish([]); } });
    obs.observe(document.body, { childList: true });
    void close;
  });
}

// ── Editable content: Courses & Brands ─────────────────────────────────
// The fields come from the server (content.js KINDS), so both tabs share one editor.
const ctState = state.ct ||= {};
async function contentTab(view, kind) {
  const { schema, items, media } = await api(`/admin/content/${kind}`);
  const st = (ctState[kind] ||= { edit: null });
  const editing = st.edit === 'new' ? { title: '', data: {}, published: true } : items.find((x) => x.id === st.edit);
  if (editing) return contentForm(view, kind, schema, editing);
  const publicUrl = { course: '/courses' }[kind] || '/#br-h';
  const thumb = (x) => (x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy" style="width:72px;height:46px;object-fit:${kind === 'brand' ? 'contain' : 'cover'};border-radius:8px;border:1px solid var(--line);background:#fff;display:block">` : `<span class="pf-noimg" style="width:72px;height:46px">${kind === 'brand' ? 'No logo' : 'No image'}</span>`);
  view.innerHTML = `${head('Website', schema.label, esc(schema.hint), `<a class="btn ghost sm" href="${publicUrl}" target="_blank">View on site ↗</a><button class="btn sm accent" data-new>+ Add ${esc(schema.singular)}</button>`)}
    ${media.configured ? '' : '<div class="pf-note"><span><b>Supabase images not connected.</b> Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in your hosting environment variables to upload images. You can paste image links meanwhile.</span></div>'}
    ${items.length ? `<div class="card table-wrap"><table class="t pf-table"><thead><tr><th style="width:34px"></th><th>#</th><th>${esc(schema.image.replace(' (optional)', ''))}</th><th>Name</th><th>Status</th><th>Actions</th></tr></thead><tbody id="ctRows">
      ${items.map((x, i) => `<tr data-id="${esc(x.id)}" draggable="true">
        <td class="pf-grip" title="Drag to reorder">⋮⋮</td><td class="mono small">${String(i + 1).padStart(2, '0')}</td>
        <td>${thumb(x)}</td>
        <td><b>${esc(x.title)}</b>${x.data.category ? `<div class="tiny muted">${esc(x.data.category)}</div>` : x.data.tag ? `<div class="tiny muted">${esc(x.data.tag)}</div>` : x.data.website ? `<div class="tiny muted break">${esc(x.data.website)}</div>` : ''}</td>
        <td><label class="sw" title="Shown on the website"><input type="checkbox" data-pub ${x.published ? 'checked' : ''}><span></span></label> <span class="tiny ${x.published ? '' : 'muted'}">${x.published ? 'Shown' : 'Hidden'}</span></td>
        <td class="nowrap"><button class="btn sm ghost" data-edit>Edit</button><button class="btn sm quiet del" data-del>Delete</button><span class="pf-move"><button class="btn sm quiet" data-up aria-label="Move up">↑</button><button class="btn sm quiet" data-down aria-label="Move down">↓</button></span></td>
      </tr>`).join('')}</tbody></table></div><p class="tiny muted" style="margin-top:8px">Drag rows (or use ↑ ↓) to change the order on the website.</p>`
    : `<div class="card empty"><h3>No ${esc(schema.label.toLowerCase())} yet.</h3><p><button class="btn accent sm" data-new>+ Add ${esc(schema.singular)}</button></p></div>`}`;
  const reload = () => contentTab(view, kind);
  const saveOrder = async () => {
    try { await api(`/admin/content/${kind}/order`, { method: 'PUT', body: { ids: [...view.querySelectorAll('#ctRows tr[data-id]')].map((r) => r.dataset.id) } }); toast('Order saved'); reload(); } catch (ex) { toast(ex.message); }
  };
  view.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-new]')) { st.edit = 'new'; return reload(); }
    const tr = t.closest('tr[data-id]');
    if (!tr) return;
    if (t.closest('[data-edit]')) { st.edit = tr.dataset.id; return reload(); }
    if (t.closest('[data-del]')) {
      if (!confirm(`Delete "${tr.querySelector('b').textContent}"? It is removed from the website. Its image stays in Supabase.`)) return;
      try { await api(`/admin/content/${kind}/${tr.dataset.id}`, { method: 'DELETE' }); toast('Deleted'); reload(); } catch (ex) { toast(ex.message); }
    }
    const dir = t.closest('[data-up]') ? -1 : t.closest('[data-down]') ? 1 : 0;
    if (dir) { const sib = dir < 0 ? tr.previousElementSibling : tr.nextElementSibling; if (sib) { dir < 0 ? sib.before(tr) : sib.after(tr); saveOrder(); } }
  };
  view.onchange = async (e) => {
    if (!e.target.matches('[data-pub]')) return;
    try { await api(`/admin/content/${kind}/${e.target.closest('tr').dataset.id}`, { method: 'PATCH', body: { published: e.target.checked } }); toast(e.target.checked ? 'Shown on the website' : 'Hidden from the website'); reload(); } catch (ex) { toast(ex.message); e.target.checked = !e.target.checked; }
  };
  const body = view.querySelector('#ctRows');
  if (body) {
    let dragging = null;
    body.addEventListener('dragstart', (e) => { dragging = e.target.closest('tr'); dragging.classList.add('dragging'); });
    body.addEventListener('dragover', (e) => { e.preventDefault(); const over = e.target.closest('tr'); if (!over || over === dragging) return; const r = over.getBoundingClientRect(); over[e.clientY > r.top + r.height / 2 ? 'after' : 'before'](dragging); });
    body.addEventListener('dragend', () => { dragging?.classList.remove('dragging'); dragging = null; saveOrder(); });
  }
}

function contentForm(view, kind, schema, x) {
  const isNew = !x.id;
  let image = x.image || '';
  const field = (f) => {
    const v = x.data?.[f.k];
    const id = `cf-${f.k}`;
    const input = f.type === 'textarea' ? `<textarea class="input" id="${id}" name="${f.k}" rows="3" maxlength="${f.max || 1000}">${esc(v || '')}</textarea>`
      : f.type === 'list' ? `<textarea class="input" id="${id}" name="${f.k}" rows="4">${esc((v || []).join('\n'))}</textarea>`
      : f.type === 'select' ? `<select class="input" id="${id}" name="${f.k}">${f.options.map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`
      : `<input class="input" id="${id}" name="${f.k}" value="${esc(v || '')}" placeholder="${esc(f.placeholder || '')}" ${f.max ? `maxlength="${f.max}"` : ''}>`;
    return `<div class="field"><label for="${id}">${esc(f.label)}${f.required ? ' *' : ''}</label>${input}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</div>`;
  };
  view.innerHTML = `${head(schema.label, isNew ? `Add ${esc(schema.singular)}` : `Edit · ${esc(x.title)}`, '', '<button class="btn ghost sm" data-back>← Back</button>')}
    <form id="cf" class="pf-editor">
      <div class="card card-pad stack" style="gap:14px;min-width:0">
        <div class="field"><label for="cf-title">Name *</label><input class="input" id="cf-title" name="title" value="${esc(x.title)}" required maxlength="120"></div>
        ${schema.fields.map(field).join('')}
        <label class="sw-row"><span class="sw"><input type="checkbox" name="published" ${x.published ? 'checked' : ''}><span></span></span> Show on the website</label>
      </div>
      <aside class="pf-side">
        <div class="card card-pad"><div class="row" style="justify-content:space-between"><h3>${esc(schema.image)}</h3><button type="button" class="btn sm quiet" data-img-del ${image ? '' : 'hidden'}>Remove</button></div>
          <div class="pf-imgslot ${kind === 'brand' ? 'small' : ''}" data-img>${image ? `<img src="${esc(image)}" alt="" style="object-fit:${kind === 'brand' ? 'contain' : 'cover'}">` : '<span>Choose from Supabase or upload</span>'}</div>
          <p class="tiny muted" style="margin-top:8px">New uploads go to the “${esc(schema.folder)}” folder in Supabase.</p></div>
      </aside>
      <div class="pf-actions card"><button type="button" class="btn ghost" data-back>Cancel</button><span class="spacer"></span><button type="submit" class="btn accent">${isNew ? `Save ${esc(schema.singular)}` : 'Save Changes'}</button></div>
    </form>`;
  const st = ctState[kind];
  const back = () => { st.edit = null; contentTab(view, kind); };
  const drawImg = () => {
    view.querySelector('[data-img]').innerHTML = image ? `<img src="${esc(image)}" alt="" style="object-fit:${kind === 'brand' ? 'contain' : 'cover'}">` : '<span>Choose from Supabase or upload</span>';
    view.querySelector('[data-img-del]').hidden = !image;
  };
  view.onclick = async (e) => {
    if (e.target.closest('[data-back]')) return back();
    if (e.target.closest('[data-img-del]')) { image = ''; return drawImg(); }
    if (e.target.closest('[data-img]')) {
      const [u] = await pickMedia({ title: `Choose ${schema.image.replace(' (optional)', '').toLowerCase()}`, project: { title: view.querySelector('#cf-title').value }, folder: schema.folder });
      if (u) { image = u; drawImg(); }
    }
  };
  view.onchange = null;
  view.querySelector('#cf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = Object.fromEntries(schema.fields.map((fd) => [fd.k, fd.type === 'list' ? String(f.get(fd.k) || '').split('\n') : f.get(fd.k)]));
    try {
      const saved = await api(isNew ? `/admin/content/${kind}` : `/admin/content/${kind}/${x.id}`, { method: isNew ? 'POST' : 'PUT', body: { title: f.get('title'), data, image, published: f.has('published') } });
      toast(isNew ? 'Saved ✓' : 'Changes saved ✓');
      st.edit = saved.id;
      contentTab(view, kind);
    } catch (ex) { toast(ex.message); }
  };
}

// ── Page Content ─────────────────────────────────────────────────────────
// Every heading, paragraph, button, list item and image on the public pages.
// The list of fields comes from the server (server/pages.js reads the views);
// "Reset" brings back the original copy.
const pgState = state.pg ||= { file: 'home', search: '', dirty: {} };
async function pagesTab(view) {
  const data = await api('/admin/pages');
  const { pages, seo, media } = data;
  let edits = data.edits;
  const dirty = pgState.dirty;
  if (!pages.some((g) => g.file === pgState.file)) pgState.file = pages[0].file;
  const cur = (k, def) => (k in dirty ? dirty[k] : k in edits ? edits[k] : def);
  const editedIn = (g) => g.fields.filter((f) => f.key in edits || `${f.key}~alt` in edits).length + (g.seo && (`seo.${g.seo}.title` in edits || `seo.${g.seo}.description` in edits) ? 1 : 0);
  const plain = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const fieldHtml = (f) => {
    const isEdited = f.key in edits || `${f.key}~alt` in edits;
    const reset = `<button type="button" class="btn sm quiet" data-reset="${esc(f.key)}" ${isEdited || f.key in dirty || `${f.key}~alt` in dirty ? '' : 'hidden'}>Reset</button>`;
    const top = `<div class="row" style="justify-content:space-between;gap:8px"><label for="pg-${esc(f.key)}" class="small"><b>${esc(f.label)}</b>${isEdited ? ' <span class="tiny" style="color:var(--accent)">· edited</span>' : ''}</label>${reset}</div>`;
    if (f.type === 'image') {
      return `<div class="card card-pad stack" style="gap:8px">${top}
        <div class="pf-imgslot small" data-pick="${esc(f.key)}" title="Change image" style="aspect-ratio:16/7"><img src="${esc(cur(f.key, f.default))}" alt="" style="object-fit:contain"></div>
        <div class="field"><label class="tiny muted" for="pg-${esc(f.key)}~alt">Alt text — describes the image for Google and screen readers</label><input class="input" id="pg-${esc(f.key)}~alt" data-k="${esc(f.key)}~alt" value="${esc(cur(`${f.key}~alt`, f.alt))}"></div></div>`;
    }
    const v = cur(f.key, f.default);
    const input = f.type === 'text'
      ? `<input class="input" id="pg-${esc(f.key)}" data-k="${esc(f.key)}" value="${esc(v)}">`
      : `<textarea class="input" id="pg-${esc(f.key)}" data-k="${esc(f.key)}" rows="${Math.min(10, Math.max(2, Math.ceil(v.length / 90)))}">${esc(v)}</textarea>`;
    return `<div class="card card-pad stack" style="gap:8px">${top}${input}${f.type === 'html' ? '<span class="hint">Formatting is kept as HTML (&lt;b&gt;, &lt;em&gt;, &lt;br&gt;, links). Change the words between the tags.</span>' : ''}</div>`;
  };

  const draw = () => {
    const q = pgState.search.trim().toLowerCase();
    const g = pages.find((x) => x.file === pgState.file);
    const list = q ? pages.flatMap((p) => p.fields.filter((f) => [cur(f.key, f.default), f.default, f.alt].some((x) => plain(x).toLowerCase().includes(q))).map((f) => [p, f])) : g.fields.map((f) => [g, f]);
    let lastSection = null;
    const rows = list.map(([p, f]) => {
      const sec = q ? p.label : f.section || 'Top of page';
      const h = sec !== lastSection ? `<h3 class="pg-sec">${esc(sec)}</h3>` : '';
      lastSection = sec;
      return h + fieldHtml(f);
    }).join('');
    const seoBlock = !q && g.seo ? `<details class="card card-pad" ${pgState.seoOpen ? 'open' : ''} id="pgSeo"><summary style="cursor:pointer"><b>Google search listing</b> <span class="tiny muted">— page title and meta description</span></summary>
        <div class="stack" style="gap:12px;margin-top:14px">
          <div class="field"><label for="pg-st">Page title <span class="tiny muted">(about 50–60 characters)</span></label><input class="input" id="pg-st" data-k="seo.${g.seo}.title" value="${esc(cur(`seo.${g.seo}.title`, seo[g.seo]?.title))}" maxlength="120"></div>
          <div class="field"><label for="pg-sd">Meta description <span class="tiny muted">(about 150–160 characters)</span></label><textarea class="input" id="pg-sd" data-k="seo.${g.seo}.description" rows="3" maxlength="320">${esc(cur(`seo.${g.seo}.description`, seo[g.seo]?.description))}</textarea></div>
        </div></details>` : '';
    const n = Object.keys(dirty).length;
    view.innerHTML = `${head('Website', 'Page Content', 'Edit the words and images on every page — changes go live when you save. <b>Reset</b> brings back the original copy. Contact details, prices, products, brands and blog posts have their own tabs.', `<a class="btn ghost sm" href="${esc(g.url)}" target="_blank">View page ↗</a>`)}
      ${media.configured ? '' : '<div class="pf-note"><span><b>Supabase images not connected.</b> You can still paste an image link (https://…) when changing an image.</span></div>'}
      <div class="pg-wrap">
        <aside class="pg-nav card card-pad">
          <input class="input" id="pgSearch" type="search" placeholder="Search all pages…" value="${esc(pgState.search)}">
          ${pages.map((p) => { const e = editedIn(p); return `<button type="button" class="pg-page ${p.file === pgState.file && !q ? 'on' : ''}" data-page="${esc(p.file)}"><span>${esc(p.label)}</span><span class="tiny muted">${p.fields.length}${e ? ` · <b style="color:var(--accent)">${e} edited</b>` : ''}</span></button>`; }).join('')}
        </aside>
        <div class="stack" style="gap:12px;min-width:0">
          ${q ? `<p class="small muted">${list.length} match${list.length === 1 ? '' : 'es'} for “${esc(pgState.search)}”</p>` : ''}
          ${seoBlock}${rows || '<div class="card empty"><p>Nothing matches.</p></div>'}
        </div>
      </div>
      <div class="pf-actions card pg-bar" ${n ? '' : 'hidden'}><b>${n} unsaved change${n === 1 ? '' : 's'}</b><span class="spacer"></span><button type="button" class="btn ghost" data-discard>Discard</button><button type="button" class="btn accent" data-save>Save &amp; publish</button></div>`;
  };
  const refreshBar = () => {
    const n = Object.keys(dirty).length;
    const bar = view.querySelector('.pg-bar');
    bar.hidden = !n;
    bar.querySelector('b').textContent = `${n} unsaved change${n === 1 ? '' : 's'}`;
  };
  const save = async (changes, msg) => {
    try {
      edits = (await api('/admin/pages', { method: 'PUT', body: { changes } })).edits;
      for (const k in changes) delete dirty[k];
      toast(msg);
    } catch (ex) { toast(ex.message); }
    draw();
  };

  draw();
  view.oninput = (e) => {
    if (e.target.id === 'pgSearch') {
      pgState.search = e.target.value;
      const pos = e.target.selectionStart;
      draw();
      const s = view.querySelector('#pgSearch'); s.focus(); s.setSelectionRange(pos, pos);
      return;
    }
    const k = e.target.dataset.k;
    if (!k) return;
    dirty[k] = e.target.value;
    view.querySelector(`[data-reset="${CSS.escape(k.replace(/~alt$/, ''))}"]`)?.removeAttribute('hidden');
    refreshBar();
  };
  view.onchange = null;
  view.onclick = async (e) => {
    const t = e.target;
    const pg = t.closest('[data-page]');
    if (pg) { pgState.file = pg.dataset.page; pgState.search = ''; draw(); window.scrollTo({ top: 0 }); return; }
    if (t.closest('#pgSeo summary')) { pgState.seoOpen = !view.querySelector('#pgSeo').open; return; }
    const r = t.closest('[data-reset]');
    if (r) {
      const keys = [r.dataset.reset, `${r.dataset.reset}~alt`];
      keys.forEach((k) => delete dirty[k]);
      const saved = keys.filter((k) => k in edits);
      return saved.length ? save(Object.fromEntries(saved.map((k) => [k, ''])), 'Original copy restored ✓') : draw();
    }
    const pick = t.closest('[data-pick]');
    if (pick) {
      const [u] = await pickMedia({ title: 'Choose an image', folder: 'Website' });
      if (u) { dirty[pick.dataset.pick] = u; draw(); }
      return;
    }
    if (t.closest('[data-discard]')) { for (const k in dirty) delete dirty[k]; toast('Changes discarded'); return draw(); }
    if (t.closest('[data-save]')) return save({ ...dirty }, 'Saved — live on the website ✓');
  };
}

// ── Blog ─────────────────────────────────────────────────────────────────
boot();
