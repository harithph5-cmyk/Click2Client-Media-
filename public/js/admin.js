// Click2Client Media admin portal. Every request is authorised server-side
// (session cookie + CSRF header); this file only renders what the API allows.

import { api, setCsrf, esc, fmtDate, hostOf, toast, scoreColor, ICON } from './common.js';

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
  if (!state.bound) { addEventListener('hashchange', () => { state.tab = location.hash.slice(1) || 'overview'; state.pfEdit = null; state.blogEdit = null; route(); }); state.bound = true; }
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

// ── Portfolio ────────────────────────────────────────────────────────────
// Downscale screenshots in the browser (≤1600px wide, top crop, WebP) so
// uploads stay well under the 1 MB server limit.
async function shrinkImage(file) {
  const bmp = await createImageBitmap(file);
  const w = Math.min(1600, bmp.width);
  const sh = Math.min(bmp.height, Math.round(bmp.width * 0.75)); // keep the top of tall full-page screenshots
  const c = Object.assign(document.createElement('canvas'), { width: w, height: Math.round((sh * w) / bmp.width) });
  c.getContext('2d').drawImage(bmp, 0, 0, bmp.width, sh, 0, 0, c.width, c.height);
  for (const q of [0.85, 0.75, 0.6, 0.45]) {
    const url = c.toDataURL('image/webp', q);
    if (url.startsWith('data:image/webp') && url.length < 1_300_000) return url;
  }
  return c.toDataURL('image/jpeg', 0.6);
}

async function portfolio(view) {
  const { projects, stats, categories } = await api('/admin/portfolio');
  const editing = state.pfEdit === 'new' ? {} : projects.find((p) => p.id === state.pfEdit);
  if (editing) return portfolioForm(view, editing, categories);
  const thumb = (p) => (p.mainImage ? `<img src="/portfolio-img/${esc(p.id)}/main?v=${p.mainImage}" alt="" style="width:96px;height:60px;object-fit:cover;object-position:top;border-radius:8px;border:1px solid var(--line)">` : '<div class="tiny muted" style="width:96px;height:60px;display:grid;place-items:center;border:1px dashed var(--line-2);border-radius:8px">No image</div>');
  view.innerHTML = `${head('Website', 'Portfolio', `${projects.length} project${projects.length === 1 ? '' : 's'} on <a href="/portfolio" target="_blank">/portfolio</a>. Order here = order on the page.`, '<a class="btn ghost sm" href="/portfolio" target="_blank">View page ↗</a><button class="btn sm accent" data-new>+ Add project</button>')}
    <div class="card table-wrap"><table class="t"><thead><tr><th>Order</th><th>Screenshot</th><th>Project</th><th>Categories</th><th></th></tr></thead><tbody>
      ${projects.map((p, i) => `<tr data-id="${esc(p.id)}">
        <td class="nowrap"><button class="btn sm quiet" data-up ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button class="btn sm quiet" data-down ${i < projects.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button></td>
        <td>${thumb(p)}</td>
        <td><b>${esc(p.name)}</b>${p.featured ? ' <span class="pill info">Featured</span>' : ''}<div class="tiny muted">${esc(p.industry)}</div></td>
        <td class="small">${esc(p.categories.join(', '))}</td>
        <td class="nowrap"><button class="btn sm ghost" data-edit>Edit</button>${delBtn}</td>
      </tr>`).join('')}
    </tbody></table></div>
    <form class="card card-pad" id="pfStats" style="margin-top:18px">
      <h3>Stat counters</h3><p class="small muted" style="margin-top:4px">Shown as animated counters on the page, e.g. <code>25+</code> · Projects Delivered. Keep them true.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:14px">
        ${[0, 1, 2, 3].map((i) => `<div class="row" style="gap:8px"><input class="input" style="width:80px" name="v${i}" placeholder="25+" value="${esc(stats[i]?.value || '')}"><input class="input" name="l${i}" placeholder="Label" value="${esc(stats[i]?.label || '')}"></div>`).join('')}
      </div>
      <div class="row" style="margin-top:14px"><button class="btn accent" type="submit">Save counters</button></div>
    </form>`;
  const order = projects.map((p) => p.id);
  view.onclick = async (e) => {
    if (e.target.closest('[data-new]')) { state.pfEdit = 'new'; return portfolio(view); }
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id;
    if (e.target.closest('[data-edit]')) { state.pfEdit = id; return portfolio(view); }
    if (e.target.closest('[data-del]')) {
      if (!confirm(`Delete "${tr.querySelector('b').textContent}" from the portfolio? Its images are removed too.`)) return;
      try { await api(`/admin/portfolio/${encodeURIComponent(id)}`, { method: 'DELETE' }); toast('Project deleted'); portfolio(view); } catch (ex) { toast(ex.message); }
    }
    const dir = e.target.closest('[data-up]') ? -1 : e.target.closest('[data-down]') ? 1 : 0;
    if (dir) {
      const i = order.indexOf(id);
      [order[i], order[i + dir]] = [order[i + dir], order[i]];
      try { await api('/admin/portfolio/order', { method: 'PUT', body: { ids: order } }); portfolio(view); } catch (ex) { toast(ex.message); }
    }
  };
  document.getElementById('pfStats').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const s = [0, 1, 2, 3].map((i) => ({ value: f.get(`v${i}`), label: f.get(`l${i}`) }));
    try { await api('/admin/portfolio/stats', { method: 'PUT', body: { stats: s } }); toast('Counters saved'); } catch (ex) { toast(ex.message); }
  };
}

function portfolioForm(view, p, categories) {
  const isNew = !p.id;
  const F = (k, l, hint = '', ph = '') => `<div class="field"><label for="p-${k}">${l}</label><input class="input" id="p-${k}" name="${k}" placeholder="${esc(ph)}" value="${esc(Array.isArray(p[k]) ? p[k].join(', ') : p[k] || '')}">${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const T = (k, l, hint = '') => `<div class="field"><label for="p-${k}">${l}</label><textarea class="input" id="p-${k}" name="${k}" rows="3">${esc(p[k] || '')}</textarea>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const img = (kind, label, hint) => `<div class="card card-pad"><h3>${label}</h3><p class="small muted" style="margin-top:4px">${hint}</p>
    ${isNew ? '<p class="small" style="margin-top:12px">Save the project first, then upload images.</p>' : `<div style="margin-top:12px">${p[kind + 'Image'] ? `<img src="/portfolio-img/${esc(p.id)}/${kind}?v=${p[kind + 'Image']}" alt="" style="width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border-radius:10px;border:1px solid var(--line)">` : '<div class="small muted" style="aspect-ratio:16/10;display:grid;place-items:center;border:1px dashed var(--line-2);border-radius:10px">No image yet</div>'}</div>
    <div class="row wrap-row" style="margin-top:12px"><label class="btn sm accent" style="cursor:pointer">${p[kind + 'Image'] ? 'Replace' : 'Upload'} image<input type="file" data-img="${kind}" accept="image/png,image/jpeg,image/webp" hidden></label>${p[kind + 'Image'] ? `<button class="btn sm ghost" type="button" data-img-del="${kind}">Remove</button>` : ''}</div>`}</div>`;
  view.innerHTML = `${head('Portfolio', isNew ? 'Add project' : `Edit · ${esc(p.name)}`, '', '<button class="btn ghost sm" data-back>← All projects</button>')}
    <div class="two" style="align-items:start">
      <form class="card card-pad" id="pf">
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px">
          ${F('name', 'Project name *', '', 'Carvello Cars')}${F('industry', 'Industry', '', 'Automotive')}
        </div>
        <div class="field" style="margin-top:14px"><label>Categories (for the filter)</label><div class="row wrap-row" style="gap:14px;margin-top:6px">${categories.map((c) => `<label class="small" style="display:inline-flex;gap:6px;align-items:center"><input type="checkbox" name="categories" value="${esc(c)}" ${(p.categories || []).includes(c) ? 'checked' : ''}>${esc(c)}</label>`).join('')}</div></div>
        <div class="stack" style="margin-top:14px;gap:14px">
          ${F('services', 'Services', 'Comma separated', 'Website, SEO, Meta Ads')}
          ${F('highlight', 'Highlight (one line on the card)')}
          ${F('url', 'Live website link (optional)', 'https://… — shows a “Visit site” link')}
          <label class="small" style="display:inline-flex;gap:8px;align-items:center"><input type="checkbox" name="featured" ${p.featured ? 'checked' : ''}> <b>Featured project</b> — shown in the big section below the gallery (only one at a time)</label>
          ${F('tagline', 'Tagline (featured section)')}
          ${F('journey', 'Journey steps', 'Comma separated, e.g. Website, UI/UX, Admin Panel, Lead Generation')}
          ${T('challenge', 'Challenge')}${T('solution', 'Solution')}${T('result', 'Result', 'Only real, measurable outcomes. Leave empty if you don’t have numbers yet.')}
        </div>
        <div class="row" style="margin-top:18px"><button class="btn accent" type="submit">${isNew ? 'Create project' : 'Save changes'}</button></div>
      </form>
      <div class="stack">
        ${img('main', 'Screenshot', 'Shown on the card, in the case study and featured section. A desktop screenshot of the homepage works best. Resized automatically.')}
        ${img('before', 'Old website (“before”)', 'Optional. On the featured project, adding both images shows the Before → After slider.')}
      </div>
    </div>`;
  const back = () => { state.pfEdit = null; portfolio(view); };
  document.getElementById('pf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { ...Object.fromEntries(f), categories: f.getAll('categories'), featured: f.has('featured') };
    try {
      const r = await api(isNew ? '/admin/portfolio' : `/admin/portfolio/${encodeURIComponent(p.id)}`, { method: isNew ? 'POST' : 'PUT', body });
      toast(isNew ? 'Project created — now add a screenshot' : 'Saved');
      state.pfEdit = r.id;
      portfolio(view);
    } catch (ex) { toast(ex.message); }
  };
  view.onclick = async (e) => {
    if (e.target.closest('[data-back]')) return back();
    const del = e.target.closest('[data-img-del]');
    if (del && confirm('Remove this image?')) {
      try { await api(`/admin/portfolio/${encodeURIComponent(p.id)}/image/${del.dataset.imgDel}`, { method: 'DELETE' }); toast('Image removed'); portfolio(view); } catch (ex) { toast(ex.message); }
    }
  };
  view.onchange = async (e) => {
    const kind = e.target.dataset?.img;
    const file = kind && e.target.files[0];
    if (!file) return;
    try {
      toast('Uploading…');
      await api(`/admin/portfolio/${encodeURIComponent(p.id)}/image/${kind}`, { method: 'PUT', body: { dataUrl: await shrinkImage(file) } });
      toast('Image uploaded');
      portfolio(view);
    } catch (ex) { toast(ex.message || 'Could not read that image.'); }
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
