// Click2Client Media admin portal. Every request is authorised server-side
// (session cookie + CSRF header); this file only renders what the API allows.

import { api, setCsrf, esc, fmtDate, hostOf, toast, scoreColor, ICON, modal } from './common.js';

const root = document.getElementById('root');
const TABS = [['overview', 'Overview'], ['payments', 'Payment Verification'], ['leads', 'Leads'], ['audits', 'SEO Audits'], ['portfolio', 'Portfolio'], ['blog', 'Blog'], ['settings', 'Settings']];
const PS = { pending: 'Payment Pending', screenshot_received: 'Screenshot Received', under_verification: 'Payment Under Verification', verified: 'Payment Verified', rejected: 'Payment Rejected' };
const LS = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal_sent: 'Proposal Sent', won: 'Won', lost: 'Lost' };
const PLAN = { free: 'Free 10-page', p25: '25-page', p50: '50-page Growth', internal: 'Internal' };
const planLabel = (p, amount) => (PLAN[p] || p) + ((p === 'p25' || p === 'p50') && amount ? ` · ₹${amount}` : '');
const SRC = { free_audit: 'Free audit', order_p25: '25-page audit order', order_p50: '50-page audit order', enquiry_page: 'Enquiry form', seo_implementation: 'Implementation request (report)', website: 'Website' };
const state = { tab: location.hash.slice(1) || 'overview', leadFilter: 'all', auditFilter: 'all', pending: 0 };

// ── Auth ─────────────────────────────────────────────────────────────────
async function boot() {
  try {
    const me = await api('/admin/me');
    setCsrf(me.csrf);
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
    <div class="field" style="margin-top:20px"><label for="pw">Password</label><input class="input" id="pw" name="password" type="password" autocomplete="current-password" required autofocus></div>
    <p class="small" style="color:var(--fail);margin-top:10px" id="lerr" ${msg ? '' : 'hidden'}>${esc(msg)}</p>
    <button class="btn accent" style="width:100%;margin-top:18px;height:48px" type="submit">Sign in</button>
  </form></div>`;
  document.getElementById('lf').onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api('/admin/login', { method: 'POST', body: { password: document.getElementById('pw').value } });
      setCsrf(r.csrf);
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
  root.innerHTML = `
    <header class="topbar"><div class="topbar-in">
      <a class="logo-box" href="/" aria-label="Click2Client Media website"><span class="logo-crop"><img src="/img/click2client-media-logo.webp" alt="Click2Client Media" width="2000" height="774"></span></a>
      <nav class="tabs" id="tabs">${TABS.map(([k, l]) => `<a href="#${k}" data-tab="${k}">${l}${k === 'payments' ? '<span class="badge-n" id="pbadge" hidden></span>' : ''}</a>`).join('')}</nav>
      <span class="spacer"></span>
      <a class="btn ghost sm" href="/app#/new">Audit workspace</a>
      <button class="btn sm" id="logout">Sign out</button>
    </div></header>
    <main class="view" id="view"></main>`;
  document.getElementById('logout').onclick = async () => { await api('/admin/logout', { method: 'POST' }).catch(() => {}); setCsrf(''); loginView(); };
  if (!state.bound) { addEventListener('hashchange', () => { state.tab = location.hash.slice(1) || 'overview'; state.pfEdit = null; state.blogEdit = null; if (state.pf) Object.assign(state.pf, { view: 'list', id: null }); route(); }); state.bound = true; }
  route();
}

async function route() {
  const view = document.getElementById('view');
  if (!view) return;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === state.tab));
  view.onclick = null; view.onchange = null;
  try {
    const fn = { overview, payments, leads, audits, portfolio, blog: blogTab, settings }[state.tab] || overview;
    await fn(view);
  } catch (e) {
    if (e.status === 401) return loginView('Your session has ended. Please sign in again.');
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
async function overview(view) {
  const s = await api('/admin/stats');
  setBadge(s.pendingVerification);
  const conv = s.freeAudits ? Math.round((100 * s.verifiedOrders) / s.freeAudits) : null;
  view.innerHTML = `${head('Dashboard', 'Overview', 'Leads, audits and revenue from the website.')}
    <div class="kpis">
      <div class="kpi hl"><div class="n">₹${Number(s.revenue).toLocaleString('en-IN')}</div><div class="l">Revenue (verified payments)</div></div>
      <div class="kpi"><div class="n">${s.leads}</div><div class="l">Total leads</div></div>
      <div class="kpi"><div class="n">${s.newLeads}</div><div class="l">New leads (uncontacted)</div></div>
      <div class="kpi"><div class="n" style="color:${s.pendingVerification ? 'var(--fail)' : 'inherit'}">${s.pendingVerification}</div><div class="l">Payments awaiting verification</div></div>
      <div class="kpi"><div class="n">${s.audits}</div><div class="l">Total audits completed</div></div>
      <div class="kpi"><div class="n">${s.freeAudits}</div><div class="l">Free audits</div></div>
      <div class="kpi"><div class="n">${s.paidAudits}</div><div class="l">Paid audits</div></div>
      <div class="kpi"><div class="n">${conv == null ? '—' : conv + '%'}</div><div class="l">Free → paid conversion</div></div>
      <div class="kpi"><div class="n" style="color:${scoreColor(s.avgScore)}">${s.avgScore ?? '—'}</div><div class="l">Average SEO score</div></div>
      <div class="kpi"><div class="n">${s.wonLeads}</div><div class="l">Leads won</div></div>
    </div>
    <div class="two" style="margin-top:18px">
      <div class="card card-pad"><h3>Most requested services</h3>${bars(s.byService)}</div>
      <div class="card card-pad"><h3>Lead sources</h3>${bars(s.bySource.map((r) => ({ ...r, label: SRC[r.label] || r.label })))}</div>
      <div class="card card-pad"><h3>Most audited industries</h3>${bars(s.byIndustry)}</div>
      <div class="card card-pad"><h3>Audits by plan</h3>${bars(s.byPlan.map((r) => ({ ...r, label: planLabel(r.label, '') })))}</div>
    </div>`;
}

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
async function leads(view) {
  const { leads: all, statuses } = await api('/admin/leads');
  const f = state.leadFilter;
  const list = f === 'all' ? all : all.filter((l) => l.status === f);
  view.innerHTML = `${head('CRM', 'Leads', `${all.length} lead${all.length === 1 ? '' : 's'} from forms, free audits and paid orders.`, `<button class="btn ghost sm" id="csv">Export CSV</button>`)}
    <div class="filters">${['all', ...statuses].map((s) => `<button class="chip ${f === s ? 'on' : ''}" data-lf="${s}">${s === 'all' ? 'All' : LS[s]}<span class="n">${s === 'all' ? all.length : all.filter((l) => l.status === s).length}</span></button>`).join('')}</div>
    ${list.length ? `<div class="card table-wrap">${bulkBar}<table class="t"><thead><tr>${selHead}<th>Date</th><th>Name</th><th>Contact</th><th>Company / website</th><th>Service</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>
      ${list.map((l) => { const w = wa(l.whatsapp || l.phone, `Hi ${l.name}, this is Click2Client Media.`); return `<tr data-id="${esc(l.id)}">
        ${selCell(l.id)}
        <td class="small nowrap">${fmtDate(l.created_at, true)}</td>
        <td><b>${esc(l.name)}</b>${l.message ? `<div class="tiny muted" style="max-width:260px">${esc(l.message.slice(0, 160))}</div>` : ''}</td>
        <td class="small">${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a><br>` : ''}${esc(l.phone || '')}${w ? ` · <a href="${w}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td>
        <td class="small break">${esc(l.company || '')}${l.website ? `<br><span class="muted">${esc(hostOf(l.website))}</span>` : ''}${l.audit_id ? `<br><a href="/audit/${esc(l.audit_id)}" target="_blank">View audit</a>` : ''}</td>
        <td class="small">${esc(l.service || '—')}</td>
        <td class="small">${esc(SRC[l.source] || l.source || '')}</td>
        <td><select class="mini" data-ls>${statuses.map((s) => `<option value="${s}" ${s === l.status ? 'selected' : ''}>${LS[s]}</option>`).join('')}</select></td>
        <td>${delBtn}</td>
      </tr>`; }).join('')}</tbody></table></div>` : '<div class="card empty"><p>No leads in this view.</p></div>'}`;
  view.onclick = (e) => {
    if (selectionClick(e, view, { kind: 'leads', noun: 'lead', warn: 'Only the lead entries are removed; any linked audits and orders are kept.', reload: () => leads(view) })) return;
    const c = e.target.closest('[data-lf]');
    if (c) { state.leadFilter = c.dataset.lf; leads(view); }
    if (e.target.id === 'csv') {
      const cols = ['created_at', 'name', 'email', 'phone', 'whatsapp', 'company', 'website', 'service', 'source', 'status', 'message'];
      const csv = [cols.join(','), ...list.map((l) => cols.map((k) => `"${String(l[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
      a.download = `click2client-leads-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    }
  };
  view.onchange = async (e) => {
    if (!e.target.matches('[data-ls]')) return;
    try { await api(`/admin/leads/${e.target.closest('tr').dataset.id}`, { method: 'PATCH', body: { status: e.target.value } }); toast('Lead updated'); } catch (ex) { toast(ex.message); }
  };
}

// ── Audits ───────────────────────────────────────────────────────────────
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
        <div class="card card-pad"><h3>Audit prices</h3><p class="small muted" style="margin-top:4px">25-page: <b style="color:var(--ink)">₹${pricing.p25}</b> · 50-page: <b style="color:var(--ink)">₹${pricing.p50}</b>. Prices are set on the server (<code>PRICE_25_PAGE_AUDIT</code>, <code>PRICE_50_PAGE_AUDIT</code>) so they can't be changed from a browser.</p></div>
        <div class="card"><div class="card-head"><h3>Integrations</h3></div><div class="table-wrap"><table class="t"><tbody>${integrations.map((i) => `<tr><td><b>${esc(i.name)}</b><div class="tiny muted" style="margin-top:3px">${esc(i.usedFor)}</div>${i.envVars.length ? `<div class="mono tiny" style="margin-top:4px">${i.envVars.map(esc).join(' · ')}</div>` : ''}</td><td class="nowrap">${i.configured ? '<span class="pill pass">Connected</span>' : i.partiallyAvailable ? '<span class="pill warning">Limited</span>' : '<span class="pill unavailable">Not set</span>'}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
    </div>`;
  document.getElementById('sf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/admin/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); toast('Settings saved'); } catch (ex) { toast(ex.message); }
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

// ── Portfolio (CMS) ──────────────────────────────────────────────────────
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
const pfSlug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const pfWhen = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const pfThumb = (p, w = 72) => (p.cover_image ? `<img src="${esc(p.cover_image)}" alt="" loading="lazy" style="width:${w}px;height:${Math.round(w * 0.625)}px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--line);display:block">` : `<span class="pf-noimg" style="width:${w}px;height:${Math.round(w * 0.625)}px">No image</span>`);

async function portfolio(view) {
  const data = await api('/admin/portfolio');
  pfState.data = data;
  if (pfState.view === 'edit') return pfEditor(view, data);
  if (pfState.view === 'categories') return pfCategories(view, data);
  return pfList(view, data);
}

function pfList(view, { projects, categories, media }) {
  const cat = (s) => categories.find((c) => c.slug === s);
  const q = pfNorm(pfState.search);
  const list = projects.filter((p) => (pfState.filter === 'all' || (pfState.filter === 'featured' ? p.featured : p.category === pfState.filter)) && (!q || pfNorm(`${p.title} ${p.client} ${p.slug} ${p.industry}`).includes(q)));
  const canDrag = pfState.filter === 'all' && !q;
  const stat = (n, l, hl) => `<div class="kpi${hl ? ' hl' : ''}"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  view.innerHTML = `${head('Website', 'Portfolio', `${projects.length} project${projects.length === 1 ? '' : 's'} · ${projects.filter((p) => p.published).length} published on <a href="/portfolio" target="_blank">/portfolio</a>. The order here is the order on the website.`,
    '<a class="btn ghost sm" href="/portfolio" target="_blank">View portfolio ↗</a><button class="btn sm" data-cats>Manage categories</button><button class="btn sm accent" data-new>+ Add Project</button>')}
    ${media.configured ? `<div class="pf-note ok"><span>Images: Supabase bucket <b>${esc(media.bucket)}</b> connected.</span><button class="btn sm ghost" data-automatch title="Sets a cover for every project without one, using image file names">Auto-match covers from Supabase</button></div>`
      : `<div class="pf-note"><span><b>Connect Supabase images.</b> Add <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code> in Hostinger → your Node.js app → Environment variables, then redeploy. Until then you can paste image links by hand.</span></div>`}
    <div class="kpis pf-kpis">${stat(projects.length, 'Total projects', true)}${stat(projects.filter((p) => p.featured).length, 'On home page')}${categories.map((c) => stat(c.total, esc(c.short_name || c.name))).join('')}</div>
    <div class="pf-toolbar">
      <div class="filters" style="margin:0">${[['all', 'All', projects.length], ['featured', '★ Home page', projects.filter((p) => p.featured).length], ...categories.map((c) => [c.slug, c.short_name || c.name, c.total])].map(([k, l, n]) => `<button class="chip ${pfState.filter === k ? 'on' : ''}" data-pff="${esc(k)}">${esc(l)}<span class="n">${n}</span></button>`).join('')}</div>
      <input class="input" id="pfSearch" type="search" placeholder="Search projects…" value="${esc(pfState.search)}" style="max-width:240px;height:38px">
    </div>
    ${list.length ? `<div class="card table-wrap"><table class="t pf-table"><thead><tr><th style="width:34px"></th><th>#</th><th>Project</th><th>Category</th><th title="Shown first in Selected Work on the home page">Home ★</th><th>Status</th><th class="num">Order</th><th>Last updated</th><th>Actions</th></tr></thead><tbody id="pfRows">
      ${list.map((p) => `<tr data-id="${esc(p.id)}" ${canDrag ? 'draggable="true"' : ''}>
        <td class="pf-grip" title="${canDrag ? 'Drag to reorder' : 'Show All (no search) to reorder'}">${canDrag ? '⋮⋮' : ''}</td>
        <td class="mono small">${String(projects.indexOf(p) + 1).padStart(2, '0')}</td>
        <td><div class="row" style="gap:12px;align-items:center;flex-wrap:nowrap">${pfThumb(p)}<div style="min-width:0"><b>${esc(p.title)}</b><div class="tiny muted break">/portfolio/${esc(p.slug)}</div></div></div></td>
        <td class="small">${esc(cat(p.category)?.name || p.category)}${p.subcategory && p.subcategory !== cat(p.category)?.name ? `<div class="tiny muted">${esc(p.subcategory)}</div>` : ''}</td>
        <td><label class="sw" title="Show first on the home page"><input type="checkbox" data-flag="featured" ${p.featured ? 'checked' : ''}><span></span></label></td>
        <td><label class="sw" title="Published"><input type="checkbox" data-flag="published" ${p.published ? 'checked' : ''}><span></span></label> <span class="tiny ${p.published ? '' : 'muted'}">${p.published ? 'Published' : 'Draft'}</span></td>
        <td class="num mono small">${p.display_order}</td>
        <td class="small nowrap">${pfWhen(p.updated_at)}</td>
        <td class="nowrap"><button class="btn sm ghost" data-edit>Edit</button><a class="btn sm quiet" href="/portfolio/${esc(p.slug)}" target="_blank">Preview</a><button class="btn sm quiet" data-dup>Duplicate</button><button class="btn sm quiet del" data-del>Delete</button>
          ${canDrag ? '<span class="pf-move"><button class="btn sm quiet" data-up aria-label="Move up">↑</button><button class="btn sm quiet" data-down aria-label="Move down">↓</button></span>' : ''}</td>
      </tr>`).join('')}</tbody></table></div>`
    : `<div class="card empty"><h3>No projects found.</h3><p><button class="btn accent sm" data-new>+ Add Project</button></p></div>`}`;

  const reload = () => portfolio(view);
  const saveOrder = async () => {
    const ids = [...view.querySelectorAll('#pfRows tr[data-id]')].map((r) => r.dataset.id);
    try { await api('/admin/portfolio/order', { method: 'PUT', body: { ids } }); toast('Order saved'); reload(); } catch (ex) { toast(ex.message); }
  };
  view.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-new]')) { Object.assign(pfState, { view: 'edit', id: null }); return reload(); }
    if (t.closest('[data-cats]')) { pfState.view = 'categories'; return reload(); }
    const f = t.closest('[data-pff]');
    if (f) { pfState.filter = f.dataset.pff; return pfList(view, pfState.data); }
    if (t.closest('[data-automatch]')) {
      try { const { matched } = await api('/admin/portfolio/media/auto-match', { method: 'POST' }); toast(matched.length ? `Cover set for ${matched.length} project${matched.length > 1 ? 's' : ''}` : 'No new matches — pick covers in each project'); reload(); } catch (ex) { toast(ex.message); }
      return;
    }
    const tr = t.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (t.closest('[data-edit]')) { Object.assign(pfState, { view: 'edit', id }); return reload(); }
    if (t.closest('[data-dup]')) {
      try { const p = await api(`/admin/portfolio/projects/${id}/duplicate`, { method: 'POST' }); toast('Duplicated as a draft'); Object.assign(pfState, { view: 'edit', id: p.id }); reload(); } catch (ex) { toast(ex.message); }
    }
    if (t.closest('[data-del]')) {
      if (!confirm(`Delete "${tr.querySelector('b').textContent}"?\n\nIt is removed from the website and its gallery links are removed. The image files stay in Supabase.`)) return;
      try { await api(`/admin/portfolio/projects/${id}`, { method: 'DELETE' }); toast('Project deleted'); reload(); } catch (ex) { toast(ex.message); }
    }
    const dir = t.closest('[data-up]') ? -1 : t.closest('[data-down]') ? 1 : 0;
    if (dir) {
      const sib = dir < 0 ? tr.previousElementSibling : tr.nextElementSibling;
      if (sib) { dir < 0 ? sib.before(tr) : sib.after(tr); saveOrder(); }
    }
  };
  view.onchange = async (e) => {
    const flag = e.target.dataset?.flag;
    if (!flag) return;
    const id = e.target.closest('tr').dataset.id;
    try { await api(`/admin/portfolio/projects/${id}`, { method: 'PATCH', body: { [flag]: e.target.checked } }); toast(flag === 'featured' ? (e.target.checked ? 'Shown first on the home page' : 'Removed from home page highlights') : (e.target.checked ? 'Published' : 'Moved to drafts')); reload(); } catch (ex) { toast(ex.message); e.target.checked = !e.target.checked; }
  };
  const s = view.querySelector('#pfSearch');
  s.oninput = () => { pfState.search = s.value; const pos = s.selectionStart; pfList(view, pfState.data); const n = view.querySelector('#pfSearch'); n.focus(); n.setSelectionRange(pos, pos); };

  // Drag & drop reordering
  const body = view.querySelector('#pfRows');
  if (body && canDrag) {
    let dragging = null;
    body.addEventListener('dragstart', (e) => { dragging = e.target.closest('tr'); dragging.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      const over = e.target.closest('tr');
      if (!over || over === dragging) return;
      const r = over.getBoundingClientRect();
      over[e.clientY > r.top + r.height / 2 ? 'after' : 'before'](dragging);
    });
    body.addEventListener('dragend', () => { dragging?.classList.remove('dragging'); dragging = null; saveOrder(); });
  }
}

// ── Tag input (services / technologies) ──────────────────────────────────
function tagBox(name, values, suggestions) {
  return `<div class="tagbox" data-tags="${name}">${values.map((v) => `<span class="tag">${esc(v)}<button type="button" aria-label="Remove ${esc(v)}">×</button></span>`).join('')}
    <input list="dl-${name}" placeholder="Type and press Enter"><datalist id="dl-${name}">${suggestions.filter((s) => !values.includes(s)).map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>`;
}
const readTags = (root, name) => [...root.querySelectorAll(`[data-tags="${name}"] .tag`)].map((t) => t.firstChild.textContent);
function bindTags(root, onChange) {
  root.querySelectorAll('.tagbox').forEach((box) => {
    const input = box.querySelector('input');
    const add = () => {
      const vals = input.value.split(',').map((v) => v.trim()).filter(Boolean);
      for (const v of vals) if (!readTags(root, box.dataset.tags).includes(v)) input.insertAdjacentHTML('beforebegin', `<span class="tag">${esc(v)}<button type="button" aria-label="Remove ${esc(v)}">×</button></span>`);
      input.value = '';
      onChange();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
      if (e.key === 'Backspace' && !input.value) { box.querySelector('.tag:last-of-type')?.remove(); onChange(); }
    });
    input.addEventListener('change', () => { if (input.value && [...box.querySelectorAll('option')].some((o) => o.value === input.value)) add(); });
    input.addEventListener('blur', () => input.value && add());
    box.addEventListener('click', (e) => { if (e.target.matches('.tag button')) { e.target.parentElement.remove(); onChange(); } else input.focus(); });
  });
}

// ── Media picker (Supabase Storage) ──────────────────────────────────────
const FOLDER_GUESS = { websites: 'Websites', seo: 'SEO', 'social-media': 'SMM', 'ads-campaigns': 'Paid Ads' };
function pickMedia({ multiple = false, title = 'Choose an image', project = {} } = {}) {
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
            <div class="mp-foot"><label class="btn sm" style="cursor:pointer">Upload to ${esc(folder === 'all' ? (FOLDER_GUESS[project.category] || 'bucket root') : folder)}<input type="file" id="mpUp" accept="image/png,image/jpeg,image/webp" multiple hidden></label>
              <span class="spacer"></span>${multiple ? `<button class="btn sm accent" data-use ${picked.length ? '' : 'disabled'}>Add ${picked.length || ''} selected</button>` : ''}</div>
            <details style="margin-top:12px"><summary class="small muted" style="cursor:pointer">Or paste an image link</summary>${urlForm()}</details>`;
          const s = body.querySelector('#mpSearch');
          s.oninput = () => { search = s.value; const pos = s.selectionStart; render(); const n = m.querySelector('#mpSearch'); n.focus(); n.setSelectionRange(pos, pos); };
          body.querySelector('#mpUp').onchange = async (e) => {
            const target = folder === 'all' ? (FOLDER_GUESS[project.category] || '') : folder;
            try {
              for (const file of e.target.files) {
                toast(`Uploading ${file.name}…`);
                const r = await api('/admin/portfolio/media', { method: 'POST', body: { folder: target, filename: file.name, dataUrl: await shrinkImage(file, { crop: false }) } });
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
          try { const r = await api(`/admin/portfolio/media${fresh ? '?fresh=1' : ''}`); status = r; files = r.files; pfState.media = r; }
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

// Label / value rows (project details, results)
const pairRow = (x = {}, ph = '') => `<div class="row pf-pair" style="gap:8px;flex-wrap:nowrap"><input class="input" data-pk="label" placeholder="${esc(ph || 'Label')}" value="${esc(x.label || '')}" style="flex:1;min-width:0"><input class="input" data-pk="value" placeholder="Value" value="${esc(x.value || '')}" style="flex:1.4;min-width:0"><button type="button" class="btn sm quiet del" data-pair-del aria-label="Remove">×</button></div>`;
const pairRows = (items = [], hints = []) => (items.length ? items.map((x) => pairRow(x)).join('') : hints.slice(0, 2).map((h) => pairRow({}, h)).join(''));
const readPairs = (root, name) => [...root.querySelectorAll(`[data-pairs="${name}"] .pf-pair`)].map((r) => ({ label: r.querySelector('[data-pk=label]').value.trim(), value: r.querySelector('[data-pk=value]').value.trim() })).filter((x) => x.label && x.value);

// ── Project editor ───────────────────────────────────────────────────────
async function pfEditor(view, { projects, categories }) {
  const isNew = !pfState.id;
  const p = isNew ? { title: '', slug: '', category: pfState.filter !== 'all' && pfState.filter !== 'featured' ? pfState.filter : categories[0]?.slug, services: [], technologies: [], gallery: [], case_sections: [], featured: false, published: true }
    : await api(`/admin/portfolio/projects/${pfState.id}`);
  const all = (k) => [...new Set(projects.flatMap((x) => x[k] || []))].sort();
  let slugTouched = !isNew;
  let gallery = [...(p.gallery || [])];
  const imgs = { cover_image: p.cover_image || '', logo: p.logo || '' };
  const F = (k, l, extra = '', hint = '') => `<div class="field"><label for="pf-${k}">${l}</label><input class="input" id="pf-${k}" name="${k}" value="${esc(p[k] ?? '')}" ${extra}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const T = (k, l, rows = 4, hint = '') => `<div class="field"><label for="pf-${k}">${l}</label><textarea class="input" id="pf-${k}" name="${k}" rows="${rows}">${esc(p[k] ?? '')}</textarea>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const section = (s = {}, i) => `<div class="pf-sec" data-sec><div class="row" style="gap:8px"><input class="input" data-k="heading" placeholder="Section heading (e.g. Admin Dashboard)" value="${esc(s.heading || '')}" style="flex:1"><button type="button" class="btn sm quiet" data-sec-up aria-label="Move up">↑</button><button type="button" class="btn sm quiet del" data-sec-del>Remove</button></div>
    <textarea class="input" data-k="body" rows="4" placeholder="What you did and why it matters">${esc(s.body || '')}</textarea>
    <div class="row" style="gap:8px;align-items:center"><input type="hidden" data-k="image" value="${esc(s.image || '')}">${s.image ? `<img src="${esc(s.image)}" alt="" style="width:96px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--line)">` : ''}<button type="button" class="btn sm ghost" data-sec-img>${s.image ? 'Change image' : 'Add image'}</button>${s.image ? '<button type="button" class="btn sm quiet" data-sec-img-del>Remove image</button>' : ''}</div></div>`;

  view.innerHTML = `${head('Portfolio', isNew ? 'Add Project' : `Edit · ${esc(p.title)}`, isNew ? 'Fields marked * are required. Everything else is optional and only shows on the website when filled in.' : `Last updated ${pfWhen(p.updated_at)}`, `<button class="btn ghost sm" data-cancel>← All projects</button>`)}
    <form id="pfForm" class="pf-editor">
      <div class="stack" style="gap:18px;min-width:0">
        <div class="card card-pad stack" style="gap:14px"><h3>Project</h3>
          <div class="pf-g2">${F('title', 'Project Name *', 'required maxlength="120"')}${F('slug', 'Slug *', 'required maxlength="80"', `URL: /portfolio/<b id="slugOut">${esc(p.slug || '…')}</b>`)}</div>
          <div class="pf-g2"><div class="field"><label for="pf-category">Category *</label><select class="input" id="pf-category" name="category">${categories.map((c) => `<option value="${esc(c.slug)}" ${c.slug === p.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>${F('subcategory', 'Subcategory / type', 'placeholder="e.g. Website Development, AI / EdTech"')}</div>
          <div class="pf-g2">${F('client', 'Client')}${F('industry', 'Industry', 'placeholder="e.g. Automotive"')}</div>
          <div class="pf-g2">${F('location', 'Location', 'placeholder="e.g. Dubai, UAE"')}${F('year', 'Year', 'maxlength="10" placeholder="2025"')}</div>
          ${T('short_description', 'Short Description *', 2, 'One or two sentences — shown on the card and used as the Google description. <span id="sdCount"></span>')}
          ${T('description', 'Full Description', 5, 'Leave a blank line between paragraphs. Supports **bold**, - bullets and [links](https://…).')}
          <div class="field"><label>Services</label>${tagBox('services', p.services || [], all('services'))}</div>
          <div class="field"><label>Technologies</label>${tagBox('technologies', p.technologies || [], all('technologies'))}</div>
          <div class="pf-g2">${F('project_url', 'Project URL', 'placeholder="https://…"')}${F('admin_url', 'Admin URL', 'placeholder="https://…/admin"')}</div>
        </div>
        <div class="card card-pad stack" style="gap:14px"><h3>Case study</h3><p class="small muted" style="margin-top:-8px">Only filled-in sections appear on the project page. Don't add numbers you can't prove.</p>
          ${T('challenge', 'Challenge', 4)}${T('solution', 'Solution', 4)}
          <div class="field"><label>More sections</label><div id="secs" class="stack" style="gap:12px">${(p.case_sections || []).map(section).join('')}</div><button type="button" class="btn sm ghost" data-sec-add style="margin-top:10px;align-self:flex-start">+ Add section</button><span class="hint">e.g. Website Experience, Inventory Experience, Admin Dashboard, Lead Generation, Responsive Design.</span></div>
        </div>
        <div class="card card-pad stack" style="gap:14px"><h3>Card details &amp; results</h3>
          <div class="field"><label>Project details</label><div class="stack" style="gap:8px" data-pairs="details">${pairRows(p.details, ['Platform', 'Objective', 'Audience', 'Budget', 'Creative', 'Design Approach'])}</div>
            <button type="button" class="btn sm ghost" data-pair-add="details" style="margin-top:8px;align-self:flex-start">+ Add detail</button>
            <span class="hint">Shown on the card and project page. Ads cards use Platform, Objective, Creative, Audience, Budget. UI/UX cards use Platform and Design Approach.</span></div>
          <div class="field"><label>Results (real numbers only)</label><div class="stack" style="gap:8px" data-pairs="metrics">${pairRows(p.metrics, ['SEO Score', 'Technical Health', 'Keyword Growth', 'Organic Visibility'])}</div>
            <button type="button" class="btn sm ghost" data-pair-add="metrics" style="margin-top:8px;align-self:flex-start">+ Add result</button>
            <span class="hint">Shown as “Project results” — only add numbers from real reports (e.g. Search Console, Ads Manager). Leave empty otherwise; the card then shows the work delivered.</span></div>
          ${T('results', 'Results / Project outcome', 3, 'Only real outcomes. Leave empty if you don’t have them.')}${T('testimonial', 'Testimonial', 2, 'A real quote from the client, with their permission.')}
        </div>
        <div class="card card-pad"><h3>Visibility</h3>
          <div class="pf-g3" style="margin-top:12px">
            <label class="sw-row"><span class="sw"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}><span></span></span> Show first on the home page</label>
            <label class="sw-row"><span class="sw"><input type="checkbox" name="published" ${p.published ? 'checked' : ''}><span></span></span> Published</label>
            ${F('display_order', 'Display order', 'type="number" min="0" step="1"', 'Lower shows first. Or drag in the list.')}
          </div>
        </div>
      </div>
      <aside class="pf-side">
        <div class="card card-pad"><h3>Live preview</h3><div id="pv" style="margin-top:12px"></div></div>
        <div class="card card-pad"><div class="row" style="justify-content:space-between"><h3>Cover image</h3>${imgs.cover_image ? '<button type="button" class="btn sm quiet" data-img-del="cover_image">Remove</button>' : ''}</div>
          <div class="pf-imgslot" data-img="cover_image">${imgs.cover_image ? `<img src="${esc(imgs.cover_image)}" alt="">` : '<span>Choose from Supabase or upload</span>'}</div></div>
        <div class="card card-pad"><div class="row" style="justify-content:space-between"><h3>Logo</h3>${imgs.logo ? '<button type="button" class="btn sm quiet" data-img-del="logo">Remove</button>' : ''}</div>
          <div class="pf-imgslot small" data-img="logo">${imgs.logo ? `<img src="${esc(imgs.logo)}" alt="" style="object-fit:contain">` : '<span>Add logo</span>'}</div></div>
        <div class="card card-pad"><div class="row" style="justify-content:space-between"><h3>Gallery</h3><button type="button" class="btn sm ghost" data-gal-add>+ Add images</button></div>
          <p class="tiny muted" style="margin-top:4px">Drag to reorder · ★ sets the cover</p><div id="gal" class="pf-gal"></div></div>
      </aside>
      <div class="pf-actions card"><button type="button" class="btn ghost" data-cancel>Cancel</button><span class="spacer"></span><button type="submit" class="btn" data-mode="preview">Save &amp; Preview</button><button type="submit" class="btn accent" data-mode="save">${isNew ? 'Save Project' : 'Save Changes'}</button></div>
    </form>`;

  const form = view.querySelector('#pfForm');
  const val = (k) => form.elements[k]?.value?.trim() || '';
  const sections = () => [...form.querySelectorAll('[data-sec]')].map((s) => ({ heading: s.querySelector('[data-k=heading]').value, body: s.querySelector('[data-k=body]').value, image: s.querySelector('[data-k=image]').value }));
  const collect = () => ({
    title: val('title'), slug: val('slug'), category: val('category'), subcategory: val('subcategory'), client: val('client'), industry: val('industry'),
    location: val('location'), year: val('year'), short_description: val('short_description'), description: val('description'),
    services: readTags(form, 'services'), technologies: readTags(form, 'technologies'), project_url: val('project_url'), admin_url: val('admin_url'),
    challenge: val('challenge'), solution: val('solution'), results: val('results'), testimonial: val('testimonial'), case_sections: sections(),
    details: readPairs(form, 'details'), metrics: readPairs(form, 'metrics'),
    featured: form.elements.featured.checked, published: form.elements.published.checked, display_order: val('display_order'),
    cover_image: imgs.cover_image, logo: imgs.logo, gallery,
  });
  const preview = () => {
    const d = collect();
    const c = categories.find((x) => x.slug === d.category);
    view.querySelector('#pv').innerHTML = `<div class="pv-card${d.featured ? ' dark' : ''}">
      <div class="pv-media">${d.cover_image ? `<img src="${esc(d.cover_image)}" alt="">` : `<span>${esc((d.client || d.title || 'C2').slice(0, 2).toUpperCase())}</span>`}</div>
      <div class="pv-body"><p class="pv-kicker">${esc(d.featured && d.subcategory ? d.subcategory : c?.name || '')}${d.industry ? ` · <span>${esc(d.industry)}</span>` : ''}</p>
      <h4>${esc(d.title || 'Project name')}</h4><p class="pv-desc">${esc(d.short_description || 'Short description')}</p>
      <div class="pv-tags">${d.services.slice(0, 4).map((s) => `<span>${esc(s)}</span>`).join('')}</div><p class="pv-more">View Project →</p></div></div>
      <p class="tiny muted" style="margin-top:8px">${d.published ? 'Published' : 'Draft — not visible on the website'}${d.featured ? ' · ★ Home page' : ''}</p>`;
    view.querySelector('#slugOut').textContent = d.slug || pfSlug(d.title) || '…';
    const n = d.short_description.length;
    view.querySelector('#sdCount').textContent = `${n}/300`;
  };
  const drawGallery = () => {
    view.querySelector('#gal').innerHTML = gallery.length ? gallery.map((g, i) => `<div class="pf-gi${g.url === imgs.cover_image ? ' cover' : ''}" draggable="true" data-i="${i}"><img src="${esc(g.url)}" alt="${esc(g.alt)}">
      <div class="pf-gi-tools"><button type="button" data-gal-cover="${i}" title="Set as cover">★</button><button type="button" data-gal-del="${i}" title="Remove from gallery">×</button></div></div>`).join('') : '<p class="tiny muted">No gallery images.</p>';
  };
  const setImg = (k, url) => { imgs[k] = url; pfEditor.redraw(); };
  pfEditor.redraw = () => {
    for (const k of ['cover_image', 'logo']) {
      const slot = view.querySelector(`[data-img="${k}"]`);
      slot.innerHTML = imgs[k] ? `<img src="${esc(imgs[k])}" alt=""${k === 'logo' ? ' style="object-fit:contain"' : ''}>` : `<span>${k === 'logo' ? 'Add logo' : 'Choose from Supabase or upload'}</span>`;
      const del = slot.parentElement.querySelector(`[data-img-del="${k}"]`);
      if (imgs[k] && !del) slot.parentElement.querySelector('.row').insertAdjacentHTML('beforeend', `<button type="button" class="btn sm quiet" data-img-del="${k}">Remove</button>`);
      if (!imgs[k] && del) del.remove();
    }
    drawGallery(); preview();
  };
  bindTags(form, preview);
  pfEditor.redraw();

  form.addEventListener('input', (e) => {
    if (e.target.name === 'slug') slugTouched = true;
    if (e.target.name === 'title' && !slugTouched) form.elements.slug.value = pfSlug(e.target.value);
    preview();
  });
  form.addEventListener('change', preview);
  const projectCtx = () => ({ title: val('title'), client: val('client'), category: val('category') });
  view.onclick = async (e) => {
    const t = e.target;
    if (t.closest('[data-cancel]')) { Object.assign(pfState, { view: 'list', id: null }); return portfolio(view); }
    const slot = t.closest('[data-img]');
    if (slot) { const [u] = await pickMedia({ title: slot.dataset.img === 'logo' ? 'Choose a logo' : 'Choose the cover image', project: projectCtx() }); if (u) setImg(slot.dataset.img, u); return; }
    const del = t.closest('[data-img-del]');
    if (del) return setImg(del.dataset.imgDel, '');
    if (t.closest('[data-gal-add]')) {
      const urls = await pickMedia({ multiple: true, title: 'Add gallery images', project: projectCtx() });
      for (const u of urls) if (!gallery.some((g) => g.url === u)) gallery.push({ url: u, alt: '' });
      if (urls.length && !imgs.cover_image) imgs.cover_image = urls[0];
      return pfEditor.redraw();
    }
    if (t.dataset.galCover) { imgs.cover_image = gallery[+t.dataset.galCover].url; toast('Cover image set'); return pfEditor.redraw(); }
    if (t.dataset.galDel) { gallery.splice(+t.dataset.galDel, 1); return pfEditor.redraw(); }
    const pa = t.closest('[data-pair-add]');
    if (pa) { view.querySelector(`[data-pairs="${pa.dataset.pairAdd}"]`).insertAdjacentHTML('beforeend', pairRow({})); return; }
    if (t.closest('[data-pair-del]')) { t.closest('.pf-pair').remove(); preview(); return; }
    if (t.closest('[data-sec-add]')) { view.querySelector('#secs').insertAdjacentHTML('beforeend', section({})); return; }
    const sec = t.closest('[data-sec]');
    if (sec && t.closest('[data-sec-del]')) { sec.remove(); return; }
    if (sec && t.closest('[data-sec-up]')) { sec.previousElementSibling?.before(sec); return; }
    if (sec && t.closest('[data-sec-img-del]')) { sec.outerHTML = section({ ...sections()[[...view.querySelectorAll('[data-sec]')].indexOf(sec)], image: '' }); return; }
    if (sec && t.closest('[data-sec-img]')) {
      const [u] = await pickMedia({ title: 'Choose a section image', project: projectCtx() });
      if (u) { const i = [...view.querySelectorAll('[data-sec]')].indexOf(sec); sec.outerHTML = section({ ...sections()[i], image: u }); }
    }
  };
  // Gallery drag & drop
  const gal = view.querySelector('#gal');
  let from = null;
  gal.addEventListener('dragstart', (e) => { from = +e.target.closest('.pf-gi')?.dataset.i; });
  gal.addEventListener('dragover', (e) => e.preventDefault());
  gal.addEventListener('drop', (e) => {
    e.preventDefault();
    const to = +e.target.closest('.pf-gi')?.dataset.i;
    if (Number.isNaN(from) || Number.isNaN(to) || from === to) return;
    gallery.splice(to, 0, gallery.splice(from, 1)[0]);
    drawGallery();
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const mode = e.submitter?.dataset.mode || 'save';
    const body = collect();
    if (!body.slug) body.slug = pfSlug(body.title);
    try {
      const saved = await api(isNew ? '/admin/portfolio/projects' : `/admin/portfolio/projects/${p.id}`, { method: isNew ? 'POST' : 'PUT', body });
      toast(isNew ? 'Project saved ✓' : 'Changes saved ✓');
      if (mode === 'preview') window.open(`/portfolio/${saved.slug}`, '_blank');
      Object.assign(pfState, { view: 'edit', id: saved.id });
      portfolio(view);
    } catch (ex) { toast(ex.message); }
  };
}

// ── Categories ───────────────────────────────────────────────────────────
function pfCategories(view, { categories }) {
  view.innerHTML = `${head('Portfolio', 'Manage categories', 'Categories become the filter buttons on /portfolio, in this order. The empty message shows when a category has no published projects.', '<button class="btn ghost sm" data-back>← All projects</button>')}
    <div class="card table-wrap"><table class="t"><thead><tr><th>Order</th><th>Name</th><th>Filter label</th><th>Empty message</th><th class="num">Projects</th><th></th></tr></thead><tbody>
      ${categories.map((c, i) => `<tr data-slug="${esc(c.slug)}">
        <td class="nowrap"><button class="btn sm quiet" data-cup ${i ? '' : 'disabled'}>↑</button><button class="btn sm quiet" data-cdown ${i < categories.length - 1 ? '' : 'disabled'}>↓</button></td>
        <td><input class="input" data-k="name" value="${esc(c.name)}" style="height:36px"><div class="tiny muted">#${esc(c.slug)}</div></td>
        <td><input class="input" data-k="short_name" value="${esc(c.short_name || '')}" style="height:36px"></td>
        <td><input class="input" data-k="empty_text" value="${esc(c.empty_text || '')}" style="height:36px"></td>
        <td class="num">${c.published}/${c.total}</td>
        <td class="nowrap"><button class="btn sm accent" data-csave>Save</button><button class="btn sm quiet del" data-cdel ${c.total ? 'disabled title="Has projects"' : ''}>Delete</button></td>
      </tr>`).join('')}</tbody></table></div>
    <form class="card card-pad row wrap-row" id="catAdd" style="margin-top:16px;gap:10px;align-items:flex-end">
      <div class="field" style="flex:1;min-width:180px"><label>New category</label><input class="input" name="name" placeholder="e.g. Branding" required></div>
      <div class="field" style="flex:1;min-width:180px"><label>Empty message</label><input class="input" name="empty_text" placeholder="No projects here yet."></div>
      <button class="btn accent">Add category</button></form>`;
  const reload = () => portfolio(view);
  view.onclick = async (e) => {
    if (e.target.closest('[data-back]')) { pfState.view = 'list'; return reload(); }
    const tr = e.target.closest('tr[data-slug]');
    if (!tr) return;
    const slug = tr.dataset.slug;
    const get = (k) => tr.querySelector(`[data-k=${k}]`).value;
    try {
      if (e.target.closest('[data-csave]')) { await api(`/admin/portfolio/categories/${slug}`, { method: 'PUT', body: { name: get('name'), short_name: get('short_name'), empty_text: get('empty_text') } }); toast('Category saved'); reload(); }
      if (e.target.closest('[data-cdel]') && confirm('Delete this category?')) { await api(`/admin/portfolio/categories/${slug}`, { method: 'DELETE' }); toast('Category deleted'); reload(); }
      const dir = e.target.closest('[data-cup]') ? -1 : e.target.closest('[data-cdown]') ? 1 : 0;
      if (dir) {
        const slugs = categories.map((c) => c.slug);
        const i = slugs.indexOf(slug);
        [slugs[i], slugs[i + dir]] = [slugs[i + dir], slugs[i]];
        await api('/admin/portfolio/categories/order', { method: 'PUT', body: { slugs } }); reload();
      }
    } catch (ex) { toast(ex.message); }
  };
  view.querySelector('#catAdd').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/admin/portfolio/categories', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast('Category added'); reload(); } catch (ex) { toast(ex.message); }
  };
}

// ── Blog ─────────────────────────────────────────────────────────────────
async function blogTab(view) {
  const { posts } = await api('/admin/blog');
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const editing = state.blogEdit === 'new' ? {} : posts.find((p) => p.id === state.blogEdit);
  if (editing) return blogForm(view, editing);
  view.innerHTML = `${head('Website', 'Blog', `${posts.filter((p) => p.published).length} published · ${posts.filter((p) => !p.published).length} draft. Published posts appear on <a href="/blog" target="_blank">/blog</a> and in the sitemap.`, '<a class="btn ghost sm" href="/blog" target="_blank">View blog ↗</a><button class="btn sm accent" data-new>+ New post</button>')}
    ${posts.length ? `<div class="card table-wrap"><table class="t"><thead><tr><th>Date</th><th>Title</th><th>Category</th><th>Status</th><th></th></tr></thead><tbody>
      ${posts.map((p) => `<tr data-id="${esc(p.id)}">
        <td class="small nowrap">${esc(p.date)}</td>
        <td><b>${esc(p.title)}</b><div class="tiny muted">/blog/${esc(p.id)}</div></td>
        <td class="small">${esc(p.category || '—')}</td>
        <td>${p.published ? '<span class="pill pass">Published</span>' : '<span class="pill unavailable">Draft</span>'}</td>
        <td class="nowrap">${p.published ? `<a class="btn sm quiet" href="/blog/${esc(p.id)}" target="_blank">View</a>` : ''}<button class="btn sm ghost" data-edit>Edit</button>${delBtn}</td>
      </tr>`).join('')}</tbody></table></div>` : '<div class="card empty"><h3>No posts yet</h3><p>Write your first article — it shows on /blog as soon as you publish it.</p></div>'}`;
  view.onclick = async (e) => {
    if (e.target.closest('[data-new]')) { state.blogEdit = 'new'; return blogTab(view); }
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (e.target.closest('[data-edit]')) { state.blogEdit = tr.dataset.id; return blogTab(view); }
    if (e.target.closest('[data-del]') && confirm(`Delete "${tr.querySelector('b').textContent}"? This cannot be undone.`)) {
      try { await api(`/admin/blog/${encodeURIComponent(tr.dataset.id)}`, { method: 'DELETE' }); toast('Post deleted'); blogTab(view); } catch (ex) { toast(ex.message); }
    }
  };
}

function blogForm(view, p) {
  const isNew = !p.id;
  const F = (k, l, hint = '', extra = '') => `<div class="field"><label for="b-${k}">${l}</label><input class="input" id="b-${k}" name="${k}" value="${esc(p[k] || '')}" ${extra}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  view.innerHTML = `${head('Blog', isNew ? 'New post' : 'Edit post', '', '<button class="btn ghost sm" data-back>← All posts</button>')}
    <div class="two" style="align-items:start;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)">
      <form class="card card-pad stack" id="bf" style="gap:14px">
        ${F('title', 'Title *', '', 'required maxlength="140"')}
        ${F('excerpt', 'Summary', 'One or two sentences. Shown on the blog page and used as the Google description.', 'maxlength="300"')}
        <div class="field"><label for="b-body">Article</label><textarea class="input" id="b-body" name="body" rows="22" style="font:15px/1.6 var(--mono)">${esc(p.body || '')}</textarea>
          <span class="hint">Leave a blank line between paragraphs. <code>## Heading</code> · <code>### Sub-heading</code> · <code>- bullet</code> · <code>1. numbered</code> · <code>&gt; quote</code> · <code>**bold**</code> · <code>*italic*</code> · <code>[link text](https://…)</code> · <code>![image description](https://…)</code></span></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
          ${F('category', 'Category', 'e.g. SEO, Meta Ads, Websites', 'maxlength="40"')}
          ${F('author', 'Author', '', 'placeholder="Hari"')}
          ${F('date', 'Publish date', '', 'type="date"')}
          ${F('slug', 'URL slug', 'Leave empty to create it from the title.', `placeholder="${esc(p.id || 'auto')}"`)}
        </div>
        <label class="small" style="display:inline-flex;gap:8px;align-items:center"><input type="checkbox" name="published" ${p.published ? 'checked' : ''}> <b>Published</b> — visible on the website (unticked = draft)</label>
        <div class="row"><button class="btn accent" type="submit">${isNew ? 'Create post' : 'Save post'}</button></div>
      </form>
      <div class="card card-pad"><h3>Cover image</h3><p class="small muted" style="margin-top:4px">Shown on the blog page, at the top of the article and when the link is shared. Wide images (16:9) work best. Resized automatically.</p>
        ${isNew ? '<p class="small" style="margin-top:12px">Save the post first, then add a cover image.</p>' : `<div style="margin-top:12px">${p.cover ? `<img src="/blog-img/${esc(p.id)}?v=${p.cover}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;border:1px solid var(--line)">` : '<div class="small muted" style="aspect-ratio:16/9;display:grid;place-items:center;border:1px dashed var(--line-2);border-radius:10px">No cover yet</div>'}</div>
        <div class="row wrap-row" style="margin-top:12px"><label class="btn sm accent" style="cursor:pointer">${p.cover ? 'Replace' : 'Upload'} cover<input type="file" data-cover accept="image/png,image/jpeg,image/webp" hidden></label>${p.cover ? '<button class="btn sm ghost" type="button" data-cover-del>Remove</button>' : ''}</div>`}
      </div>
    </div>`;
  if (!p.slug) view.querySelector('#b-slug').value = p.id || '';
  document.getElementById('bf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { ...Object.fromEntries(f), published: f.has('published') };
    try {
      const r = await api(isNew ? '/admin/blog' : `/admin/blog/${encodeURIComponent(p.id)}`, { method: isNew ? 'POST' : 'PUT', body });
      toast(r.published ? 'Saved and published' : 'Saved as draft');
      state.blogEdit = r.id;
      blogTab(view);
    } catch (ex) { toast(ex.message); }
  };
  view.onclick = async (e) => {
    if (e.target.closest('[data-back]')) { state.blogEdit = null; return blogTab(view); }
    if (e.target.closest('[data-cover-del]') && confirm('Remove the cover image?')) {
      try { await api(`/admin/blog/${encodeURIComponent(p.id)}/cover`, { method: 'DELETE' }); toast('Cover removed'); blogTab(view); } catch (ex) { toast(ex.message); }
    }
  };
  view.onchange = async (e) => {
    const file = e.target.matches('[data-cover]') && e.target.files[0];
    if (!file) return;
    try {
      toast('Uploading…');
      await api(`/admin/blog/${encodeURIComponent(p.id)}/cover`, { method: 'PUT', body: { dataUrl: await shrinkImage(file) } });
      toast('Cover uploaded');
      blogTab(view);
    } catch (ex) { toast(ex.message || 'Could not read that image.'); }
  };
}

boot();
