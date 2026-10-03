// Click2Client Media admin portal. Every request is authorised server-side
// (session cookie + CSRF header); this file only renders what the API allows.

import { api, setCsrf, esc, fmtDate, hostOf, toast, scoreColor, ICON } from './common.js';

const root = document.getElementById('root');
const TABS = [['overview', 'Overview'], ['payments', 'Payment Verification'], ['leads', 'Leads'], ['audits', 'SEO Audits'], ['settings', 'Settings']];
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
  if (!state.bound) { addEventListener('hashchange', () => { state.tab = location.hash.slice(1) || 'overview'; route(); }); state.bound = true; }
  route();
}

async function route() {
  const view = document.getElementById('view');
  if (!view) return;
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === state.tab));
  view.onclick = null; view.onchange = null;
  try {
    const fn = { overview, payments, leads, audits, settings }[state.tab] || overview;
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
        <td class="nowrap">${o.payment_status !== 'verified' ? `<button class="btn sm accent" data-verify>Verify Payment</button>` : o.audit_id ? `<a class="btn sm ghost" href="/audit/${esc(o.audit_id)}" target="_blank">Open report</a>${o.audit_status === 'failed' ? ' <button class="btn sm" data-restart>Re-run</button>' : ''}` : '<button class="btn sm" data-restart>Start audit</button>'}${o.audit_status !== 'running' ? delBtn : ''}</td>
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

boot();
