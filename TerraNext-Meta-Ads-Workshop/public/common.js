// Shared: config binding, icons, scroll reveal, counters, consent-gated analytics (no PII ever sent).
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'X-Requested-With': 'fetch', ...(opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...opts.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Request failed'), { status: r.status, fields: j.fields });
  return j;
}

let CONFIG = null;
const configReady = fetch('/api/config').then((r) => r.json()).then((c) => {
  CONFIG = c;
  const v = { price: c.price, original: c.original, savings: c.savings, date: c.eventDateLong, weekday: c.weekday, contact: c.contact, organizer: c.organizer, certificate: c.certificate, hours: c.durationMinutes / 60 };
  $$('[data-bind]').forEach((el) => { if (v[el.dataset.bind] != null) el.textContent = v[el.dataset.bind]; });
  $$('[data-wa]').forEach((el) => { el.href = `https://wa.me/91${c.contact}`; });
  const n = $('#offer-note');
  if (n) {
    const bits = [];
    if (c.offerExpiry) bits.push(`Offer valid until ${new Date(c.offerExpiry + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}.`);
    if (c.seatsLeft != null) bits.push(`${c.seatsLeft} seats remaining.`); // only shown when the admin sets a real capacity
    n.textContent = bits.join(' ');
  }
  return c;
}).catch(() => null);

// ---- analytics (GA4 + Meta Pixel), loaded only after consent and only if IDs are configured ----
function loadTrackers(c) {
  if (c.ga4) {
    const s = document.createElement('script'); s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(c.ga4)}`; document.head.append(s);
    window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); }; gtag('js', new Date()); gtag('config', c.ga4);
  }
  if (c.pixel) {
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', c.pixel); fbq('track', 'PageView');
  }
}
const fired = new Set();
function track(name, params = {}, once = false) { // never pass names, phones, emails, UTRs
  if (once) { if (fired.has(name)) return; fired.add(name); }
  if (window.gtag) gtag('event', name, params);
  if (window.fbq) fbq('trackCustom', name, params);
}
configReady.then((c) => {
  if (!c || !(c.ga4 || c.pixel) || location.pathname.startsWith('/admin')) return;
  let ok = null; try { ok = localStorage.getItem('tn_consent'); } catch {}
  if (ok === 'yes') return loadTrackers(c);
  if (ok === 'no') return;
  const b = document.createElement('div'); b.className = 'consent'; b.setAttribute('role', 'dialog'); b.setAttribute('aria-label', 'Analytics consent');
  b.innerHTML = '<p>We use analytics cookies to measure ad performance. No personal details are shared with them.</p><div><button class="btn btn-blue btn-sm" data-v="yes">Accept</button><button class="btn btn-line btn-sm" data-v="no">Decline</button></div>';
  b.onclick = (e) => { const v = e.target.dataset.v; if (!v) return; try { localStorage.setItem('tn_consent', v); } catch {} b.remove(); if (v === 'yes') loadTrackers(c); };
  document.body.append(b);
});

// ---- UI niceties ----
document.addEventListener('DOMContentLoaded', () => {
  window.lucide?.createIcons();
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12 });
  $$('.rv').forEach((el) => io.observe(el));
  const co = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; co.unobserve(e.target);
    const end = +e.target.dataset.count; let t0;
    const step = (t) => { t0 ??= t; const p = Math.min(1, (t - t0) / 1200); e.target.textContent = Math.round(end * p); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: .6 });
  $$('[data-count]').forEach((el) => co.observe(el));
  $('.burger')?.addEventListener('click', (e) => { const l = $('.links'); const o = l.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); });
  $$('.links a').forEach((a) => a.addEventListener('click', () => $('.links').classList.remove('open')));
  $$('[data-cta]').forEach((a) => a.addEventListener('click', () => track('workshop_cta_click', { location: a.dataset.cta })));
  $$('[data-wa]').forEach((a) => a.addEventListener('click', () => track('whatsapp_click', { location: 'site' })));
  track('page_view', { page: location.pathname.replace(/\/[A-Za-z0-9_-]{43}$/, '/:session') });
});
