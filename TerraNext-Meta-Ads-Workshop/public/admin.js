const view = $('#view'), dlg = $('#dlg');
const path = location.pathname.replace(/\/$/, '');
const inr = (p) => '₹' + (p / 100).toLocaleString('en-IN');
const ist = (t) => (t ? new Date(t).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '');
const pill = (s) => `<span class="status ${esc(s)}">${esc(String(s || '').replace('_', ' '))}</span>`;
const toast = (m) => alert(m);

if (path === '/admin/login') loginView(); else boot();

function loginView() {
  view.innerHTML = `<div class="panel" style="max-width:420px"><h1>Admin sign in</h1><form id="lf" style="margin-top:18px">
    <div class="alert bad" id="le" hidden></div>
    <div class="fld"><label for="e">Email</label><input id="e" type="email" autocomplete="username" required></div>
    <div class="fld"><label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required></div>
    <button class="btn btn-blue" type="submit">Sign in</button></form></div>`;
  $('#lf').onsubmit = async (ev) => {
    ev.preventDefault();
    try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: $('#e').value, password: $('#p').value }) }); location.href = '/admin/dashboard'; }
    catch (e) { const x = $('#le'); x.textContent = e.message; x.hidden = false; }
  };
}

async function boot() {
  try { await api('/api/admin/me'); } catch { return (location.href = '/admin/login'); }
  $('#nav').hidden = false;
  $$('#nav a').forEach((a) => a.classList.toggle('on', a.pathname === path));
  $('#out').onclick = async () => { await api('/api/admin/logout', { method: 'POST' }); location.href = '/admin/login'; };
  ({ '/admin/dashboard': dashboard, '/admin': dashboard, '/admin/registrations': () => listView(null, 'Registrations'), '/admin/payments': () => listView('VERIFICATION_PENDING', 'Payment verification queue'), '/admin/workshop-settings': settings }[path] || dashboard)();
}

async function dashboard() {
  const s = await api('/api/admin/stats'), b = s.byStatus, max = Math.max(1, ...s.byDate.map((d) => d.c));
  const k = (n, l) => `<div class="kpi"><b>${n}</b><span>${l}</span></div>`;
  view.innerHTML = `<h1 style="margin:0 0 18px;font-size:1.7rem">Dashboard</h1><div class="kpis">
    ${k(s.total, 'Total registrations')}${k(b.PENDING_PAYMENT || 0, 'Pending payments')}${k(s.submitted, 'Payment details submitted')}${k(b.VERIFICATION_PENDING || 0, 'Awaiting verification')}
    ${k(b.PAID || 0, 'Verified payments')}${k(b.REJECTED || 0, 'Rejected payments')}${k(inr(s.verifiedRevenuePaise), 'Verified revenue')}</div>
    <div class="kpi" style="margin-top:14px"><span>Registrations per day (last 30 days, IST)</span><div class="bars">${s.byDate.map((d) => `<i style="height:${(d.c / max) * 100}%" title="${esc(d.d)}: ${d.c}"></i>`).join('') || '<span>No registrations yet</span>'}</div></div>
    <p class="fine">Revenue counts only payments you marked verified. Pending and rejected are never counted.</p>`;
}

function listView(fixedStatus, title) {
  let page = 1;
  view.innerHTML = `<h1 style="margin:0;font-size:1.7rem">${title}</h1><div class="toolbar"><input id="q" type="search" placeholder="Search name, phone, email, ID, UTR" aria-label="Search">
    ${fixedStatus ? '' : `<select id="st" aria-label="Status"><option value="">All statuses</option><option value="PENDING_PAYMENT">Pending payment</option><option value="VERIFICATION_PENDING">Payment reported / verification pending</option><option value="PAID">Paid</option><option value="REJECTED">Rejected</option><option value="EXPIRED">Expired</option><option value="CANCELLED">Cancelled</option></select>`}</div>
    <div class="tbl"><table><thead><tr><th>ID</th><th>Name</th><th>Mobile</th><th>Email</th><th>Category</th><th>City</th><th>Registered</th><th>Due</th><th>Transaction ref</th><th>Status</th><th>Verified</th><th></th></tr></thead><tbody id="rows"></tbody></table></div>
    <div class="toolbar"><button class="btn btn-line btn-sm" id="pv">Prev</button><span id="pg" style="align-self:center"></span><button class="btn btn-line btn-sm" id="nx">Next</button></div>`;
  const load = async () => {
    const qs = new URLSearchParams({ page, q: $('#q').value, status: fixedStatus || $('#st')?.value || '' });
    const d = await api('/api/admin/registrations?' + qs);
    $('#rows').innerHTML = d.rows.map((r) => `<tr><td><b>${esc(r.public_registration_id)}</b></td><td>${esc(r.full_name)}</td><td>${esc(r.normalized_phone)}</td><td>${esc(r.email)}</td><td>${esc(r.professional_category)}</td><td>${esc(r.city)}</td><td>${ist(r.created_at)}</td><td>${inr(r.amount_due_paise)}</td><td>${esc(r.transaction_reference || '')}</td><td>${pill(r.registration_status)}</td><td>${ist(r.verified_at)}</td><td><button class="btn btn-blue btn-sm" data-id="${esc(r.public_registration_id)}">Open</button></td></tr>`).join('') || '<tr><td colspan="12">Nothing here yet.</td></tr>';
    $('#pg').textContent = `Page ${d.page} of ${d.pages || 1} · ${d.total} total`;
    $('#pv').disabled = page <= 1; $('#nx').disabled = page >= d.pages;
  };
  let t; $('#q').oninput = () => { clearTimeout(t); t = setTimeout(() => { page = 1; load(); }, 300); };
  $('#st')?.addEventListener('change', () => { page = 1; load(); });
  $('#pv').onclick = () => { page--; load(); }; $('#nx').onclick = () => { page++; load(); };
  $('#rows').onclick = (e) => { const id = e.target.dataset.id; if (id) detail(id, load); };
  load();
}

async function detail(pid, reload) {
  const d = await api('/api/admin/registrations/' + encodeURIComponent(pid)), r = d.registration;
  const open = d.submissions.find((s) => s.verification_status === 'SUBMITTED');
  const waText = `Hello ${r.full_name}, your payment for the Master Meta Ads Workshop (Registration ID ${r.public_registration_id}) has been verified. Your seat is confirmed. Joining instructions will be shared here.`;
  dlg.innerHTML = `<div class="dlg"><div style="display:flex;justify-content:space-between;gap:10px"><h2 style="font-size:1.4rem">${esc(r.public_registration_id)} ${pill(r.registration_status)}</h2><button class="btn btn-line btn-sm" id="cl">Close</button></div>
    <dl class="summary"><div><dt>Name</dt><dd>${esc(r.full_name)}</dd></div><div><dt>Mobile / Email</dt><dd>${esc(r.normalized_phone)} · ${esc(r.email)}</dd></div><div><dt>Organization</dt><dd>${esc(r.organization_name)} (${esc(r.professional_category)}, ${esc(r.city)})</dd></div>
    ${r.website_url ? `<div><dt>Website</dt><dd>${esc(r.website_url)}</dd></div>` : ''}${r.learning_goal ? `<div><dt>Wants to learn</dt><dd>${esc(r.learning_goal)}</dd></div>` : ''}<div><dt>Fee due (frozen at signup)</dt><dd>${inr(r.amount_due_paise)}</dd></div></dl>
    <h3>Payment submissions</h3>
    ${d.submissions.map((s) => `<div class="summary"><div><dt>UTR</dt><dd><b>${esc(s.transaction_reference)}</b> ${pill(s.verification_status)}</dd></div><div><dt>Payment date / submitted</dt><dd>${esc(s.payment_date)} · ${ist(s.submitted_at)}</dd></div>
      ${s.duplicateOf ? `<div class="alert warn">Same reference also submitted on ${esc(s.duplicateOf)}</div>` : ''}${s.rejection_reason ? `<div><dt>Reason</dt><dd>${esc(s.rejection_reason)}</dd></div>` : ''}
      ${s.has_screenshot ? `<img class="shot" src="/api/admin/screenshot/${s.id}" alt="Payment screenshot" loading="lazy">` : ''}</div>`).join('') || '<p>No payment submitted yet.</p>'}
    ${open ? `<div class="alert info"><b>Before verifying, check independently</b> in your UPI/bank records:
      <label class="chk"><input type="checkbox" id="ck"><span>Payee is correct · amount is ${inr(r.amount_due_paise)} · payment succeeded · UTR <b>${esc(open.transaction_reference)}</b> not credited to another registration. A screenshot or WhatsApp message alone is not proof.</span></label></div>
      <div class="fld"><label for="rs">Reason (required to reject or request correction)</label><input id="rs" maxlength="300"></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-green btn-sm" data-act="verify">Mark as verified</button><button class="btn btn-line btn-sm" data-act="correct">Request corrected details</button><button class="btn btn-sm" style="background:#fee2e2;color:#991b1b" data-act="reject">Reject</button></div>` : ''}
    ${r.registration_status === 'PAID' ? `<a class="btn btn-green btn-sm" target="_blank" rel="noopener" href="https://wa.me/91${esc(r.normalized_phone)}?text=${encodeURIComponent(waText)}">Send confirmation on WhatsApp</a>` : ''}
    <div class="fld"><label for="nt">Internal note</label><textarea id="nt" rows="2" maxlength="1000">${esc(r.admin_note || '')}</textarea><button class="btn btn-line btn-sm" id="sn" style="justify-self:start">Save note</button></div>
    <h3>Audit trail</h3><div style="font-size:.82rem;color:var(--muted)">${d.audit.map((a) => `${ist(a.created_at)} · ${esc(a.actor_type)} · <b>${esc(a.action)}</b>${a.metadata ? ' · ' + esc(a.metadata) : ''}`).join('<br>') || 'No events'}</div></div>`;
  dlg.showModal();
  $('#cl').onclick = () => dlg.close();
  $('#sn').onclick = async () => { await api(`/api/admin/registrations/${encodeURIComponent(pid)}/note`, { method: 'POST', body: JSON.stringify({ note: $('#nt').value }) }); toast('Note saved'); };
  $$('[data-act]', dlg).forEach((b) => (b.onclick = async () => {
    const act = b.dataset.act;
    if (act === 'verify' && !$('#ck').checked) return toast('Tick the verification checklist first');
    if (act !== 'verify' && !$('#rs').value.trim()) return toast('Enter a reason');
    try { await api(`/api/admin/payments/${open.id}/${act}`, { method: 'POST', body: JSON.stringify({ confirmed: act === 'verify' ? true : undefined, reason: $('#rs')?.value }) }); dlg.close(); reload(); }
    catch (e) { toast(e.message); }
  }));
}

async function settings() {
  const s = await api('/api/admin/settings');
  const f = (id, label, val, type = 'text', extra = '') => `<div class="fld"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val ?? '')}" ${extra}></div>`;
  view.innerHTML = `<h1 style="margin:0 0 18px;font-size:1.7rem">Workshop Settings</h1>
  <div class="panel" style="margin:0 0 20px;width:100%"><h3>Official payment QR</h3>
    <p class="fine">${s.qrConfigured ? 'A QR is configured. Participants see it only after registering. Scan it with a phone to confirm it pays the right account before launch.' : '<b style="color:var(--red)">No QR configured. Payments are disabled.</b>'}</p>
    ${s.qrConfigured ? '<div class="qrbox" style="max-width:300px"><img src="/api/admin/qr?t=' + Date.now() + '" alt="Current QR"></div>' : ''}
    <form id="qf"><input type="file" id="qfile" accept="image/png,image/jpeg,image/webp" required><button class="btn btn-blue btn-sm" style="justify-self:start">Upload new QR</button></form></div>
  <form class="panel" id="sf" style="margin:0;width:100%">
    ${f('title', 'Workshop title', s.title)}<div class="fld"><label for="description">Description</label><textarea id="description" rows="3">${esc(s.description)}</textarea></div>
    <div class="two">${f('eventDate', 'Workshop date', s.eventDate, 'date')}${f('durationMinutes', 'Duration (minutes)', s.durationMinutes, 'number')}</div>
    <div class="two">${f('amountRupees', 'Workshop price (₹), applies to NEW registrations only', s.amountRupees, 'number', 'step="1"')}${f('originalRupees', 'Original price (₹)', s.originalRupees, 'number')}</div>
    <div class="two">${f('offerExpiry', 'Offer expiry (optional, display only)', s.offerExpiry, 'date')}${f('capacity', 'Seat capacity (optional; blank = no limit shown)', s.capacity, 'number')}</div>
    <div class="two">${f('organizer', 'Organizer', s.organizer)}${f('contactNumber', 'Contact / WhatsApp number (10 digits)', s.contactNumber, 'tel')}</div>
    ${f('certificate', 'Certificate information', s.certificate)}${f('recipientName', 'Verified payment recipient name', s.recipientName)}
    ${['privacy', 'terms', 'refund'].map((k) => `<div class="fld"><label for="p_${k}">${{ privacy: 'Privacy policy', terms: 'Terms and conditions', refund: 'Refund and cancellation policy (organizer must approve before launch)' }[k]}</label><textarea id="p_${k}" rows="6">${esc(s.policies[k])}</textarea></div>`).join('')}
    <button class="btn btn-yellow" type="submit">Save settings</button></form>`;
  $('#qf').onsubmit = async (e) => {
    e.preventDefault(); const fd = new FormData(); fd.set('qr', $('#qfile').files[0]);
    try { await api('/api/admin/qr', { method: 'POST', body: fd }); toast('QR updated'); settings(); } catch (er) { toast(er.message); }
  };
  $('#sf').onsubmit = async (e) => {
    e.preventDefault(); const v = (id) => $('#' + id).value, n = (id) => (v(id) === '' ? null : Number(v(id)));
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ title: v('title'), description: v('description'), eventDate: v('eventDate'), durationMinutes: n('durationMinutes'), amountRupees: n('amountRupees'), originalRupees: n('originalRupees'), offerExpiry: v('offerExpiry') || null, capacity: n('capacity'), organizer: v('organizer'), contactNumber: v('contactNumber'), certificate: v('certificate'), recipientName: v('recipientName'), policies: { privacy: v('p_privacy'), terms: v('p_terms'), refund: v('p_refund') } }) });
      toast('Saved');
    } catch (er) { toast(er.message); }
  };
}
