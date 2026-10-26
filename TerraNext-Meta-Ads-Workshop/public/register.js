const form = $('#f');
let started = false;
form.addEventListener('input', () => { if (!started) { started = true; track('registration_form_start'); } });

const RULES = {
  fullName: (v) => v.trim().length >= 2 || 'Enter your full name',
  phone: (v) => /^[6-9]\d{9}$/.test(normalizePhone(v)) || 'Enter a valid 10-digit Indian mobile number',
  email: (v) => /^\S+@\S+\.\S+$/.test(v.trim()) || 'Enter a valid email address',
  organization: (v) => v.trim().length >= 2 || 'Enter your business or organization name',
  city: (v) => v.trim().length >= 2 || 'Enter your city',
  category: (v) => !!v || 'Choose a category',
  website: (v) => !v.trim() || /^https?:\/\/\S+\.\S+/i.test(v.trim()) || 'Website must start with http:// or https://',
};
function normalizePhone(s) { let d = s.replace(/\D/g, ''); if (d.length === 12 && d.startsWith('91')) d = d.slice(2); else if (d.length === 11 && d[0] === '0') d = d.slice(1); return d; }
function showErr(name, msg) {
  const el = $(`[data-for="${name}"]`), inp = form.elements[name];
  if (el) el.textContent = msg || '';
  if (inp) inp.setAttribute('aria-invalid', msg ? 'true' : 'false');
}
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const top = $('#top-err'); top.hidden = true;
  const d = Object.fromEntries(new FormData(form));
  let bad = null;
  for (const [k, rule] of Object.entries(RULES)) { const r = rule(d[k] || ''); showErr(k, r === true ? '' : r); if (r !== true) bad ??= k; }
  for (const k of ['reviewed', 'consent']) { const ok = form.elements[k].checked; showErr(k, ok ? '' : k === 'consent' ? 'Please accept the privacy notice' : 'Please confirm you reviewed the workshop details'); if (!ok) bad ??= k; }
  if (bad) return form.elements[bad].focus();
  track('registration_form_submit');
  const btn = $('#go'); btn.disabled = true;
  try {
    const r = await api('/api/register', { method: 'POST', body: JSON.stringify({ ...d, consent: true, reviewed: true }) });
    track('registration_created');
    location.href = r.paymentUrl; // server-issued opaque session link
  } catch (err) {
    btn.disabled = false;
    if (err.fields) Object.entries(err.fields).forEach(([k, m]) => showErr(k, m));
    top.textContent = err.message; top.hidden = false; top.scrollIntoView({ block: 'center' });
  }
});
