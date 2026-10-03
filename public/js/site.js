// Public website behaviour. Progressive enhancement only: every page's
// content is already in the server-rendered HTML.

import { api, esc, modal } from './common.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Mobile menu ──────────────────────────────────────────────────────────
const menuBtn = $('#menuBtn');
const panel = $('#mobileMenu');
if (menuBtn && panel) {
  const set = (open) => {
    panel.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('menu-open', open);
  };
  menuBtn.addEventListener('click', () => set(panel.hidden));
  panel.addEventListener('click', (e) => e.target.closest('a') && set(false));
  addEventListener('keydown', (e) => e.key === 'Escape' && set(false));
}

// ── Scroll reveal ────────────────────────────────────────────────────────
const io = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
$$('.reveal').forEach((el) => io.observe(el));

// ── Hero: Website → SEO → Traffic → Leads → Clients ──────────────────────
const journey = $$('#journey div');
const bars = $$('#heroChart span');
if (journey.length) {
  const heights = [[18, 22, 20, 26, 24, 28], [24, 30, 32, 36, 40, 44], [30, 40, 46, 52, 58, 66], [36, 48, 56, 64, 72, 80], [40, 54, 62, 72, 84, 94]];
  let i = 0;
  const tick = () => {
    journey.forEach((d, k) => d.classList.toggle('on', k <= i));
    bars.forEach((b, k) => (b.style.height = heights[i][k] + '%'));
    i = (i + 1) % journey.length;
  };
  tick();
  if (!reduced) setInterval(tick, 1600);
}

// ── Form helpers ─────────────────────────────────────────────────────────
function showMsg(form, text, ok = false) {
  const m = $('.form-msg', form);
  m.textContent = text;
  m.className = `full form-msg ${ok ? 'ok' : 'err'}`;
  m.hidden = false;
  m.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
async function submitting(form, fn) {
  const btn = $('button[type=submit]', form);
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Please wait…';
  try { await fn(); } finally { btn.disabled = false; btn.innerHTML = label; }
}

// Free audit
const freeForm = $('#freeForm');
if (freeForm) {
  freeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(freeForm, async () => {
      try {
        const r = await api('/public/audits/free', { method: 'POST', body: Object.fromEntries(new FormData(freeForm)) });
        location.href = `/audit/${encodeURIComponent(r.id)}${r.existing ? '?existing=1' : ''}`;
      } catch (ex) { showMsg(freeForm, ex.message); }
    });
  });
}

// Enquiry
const enquiry = $('#enquiryForm');
if (enquiry) {
  const svc = new URLSearchParams(location.search).get('service');
  if (svc) {
    const sel = $('#e-service');
    if (![...sel.options].some((o) => o.value === svc || o.text === svc)) sel.add(new Option(svc, svc));
    sel.value = svc;
  }
  enquiry.addEventListener('submit', (e) => {
    e.preventDefault();
    submitting(enquiry, async () => {
      try {
        await api('/public/leads', { method: 'POST', body: { ...Object.fromEntries(new FormData(enquiry)), source: 'enquiry_page' } });
        enquiry.reset();
        showMsg(enquiry, 'Thank you — your enquiry has been received. We will get back to you shortly.', true);
      } catch (ex) { showMsg(enquiry, ex.message); }
    });
  });
}

// ── Services explorer ────────────────────────────────────────────────────
const areas = $$('.area[data-area]');
if (areas.length) {
  const panels = $$('[data-panel]');
  const select = (id, scroll) => {
    areas.forEach((a) => { const on = a.dataset.area === id; a.classList.toggle('on', on); a.setAttribute('aria-selected', String(on)); });
    panels.forEach((p) => (p.hidden = p.dataset.panel !== id));
    if (scroll) $(`[data-panel="${id}"]`).scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  areas.forEach((a) => a.addEventListener('click', () => { select(a.dataset.area, false); history.replaceState(null, '', '#' + a.dataset.area); }));
  const fromHash = () => {
    const h = location.hash.slice(1);
    const map = { 'ui-ux': 'website-development', 'web-applications': 'website-development' };
    const id = map[h] || h;
    if (panels.some((p) => p.dataset.panel === id)) { select(id, true); if (map[h]) setTimeout(() => document.getElementById(h)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }
    else select(areas[0].dataset.area, false);
  };
  addEventListener('hashchange', fromHash);
  fromHash();
}

// ── Paid audit order (₹125 / ₹399) ──────────────────────────────────────
const PLAN_COPY = {
  p25: { name: '25-Page SEO Audit', btn: 'Continue to Payment' },
  p50: { name: '50-Page SEO Growth Audit', btn: 'Continue to Payment' },
};
$$('[data-order]').forEach((btn) => btn.addEventListener('click', () => openOrder(btn.dataset.order)));
if (/^#order-(p25|p50)$/.test(location.hash)) openOrder(location.hash.slice(7));

function openOrder(plan) {
  const copy = PLAN_COPY[plan];
  if (!copy) return;
  const price = $(`#plan-${plan} .price`)?.firstChild?.textContent?.trim() || '';
  modal(`
    <div class="modal-head"><div><span class="eyebrow">${plan === 'p50' ? 'Premium audit' : 'Paid audit'}</span>
      <h2 style="font:700 24px var(--display);margin-top:6px;letter-spacing:-0.02em">${esc(copy.name)}</h2>
      <p class="small" style="margin-top:4px">One-time payment · <b style="color:var(--ink)">${esc(price)}</b></p></div>
      <span class="spacer"></span><button class="btn quiet sm" data-close aria-label="Close">✕</button></div>
    <div class="modal-body">
      <div class="pay-steps" aria-hidden="true"><span class="on"></span><span></span><span></span></div>
      <p class="small" style="margin-bottom:14px"><b style="color:var(--ink)">Step 1 of 3 — Your details.</b> Next you'll see our UPI QR code, then send us the payment screenshot on WhatsApp.</p>
      <form class="form-grid" novalidate>
        <div class="field"><label>Full name *</label><input class="input" name="name" autocomplete="name" required></div>
        <div class="field"><label>Business name *</label><input class="input" name="business" autocomplete="organization" required></div>
        <div class="field"><label>Email address *</label><input class="input" name="email" type="email" autocomplete="email" required></div>
        <div class="field"><label>WhatsApp number *</label><input class="input" name="phone" type="tel" autocomplete="tel" placeholder="+91" required></div>
        <div class="field full"><label>Website URL *</label><input class="input" name="url" inputmode="url" placeholder="yourbusiness.in" required></div>
        <details class="full"><summary class="small" style="cursor:pointer;font-weight:600;color:var(--ink)">Optional details</summary>
          <div class="form-grid" style="margin-top:12px">
            <div class="field"><label>Business category</label><input class="input" name="category" placeholder="e.g. Dental clinic"></div>
            <div class="field"><label>Target location</label><input class="input" name="location" placeholder="e.g. Madurai"></div>
            <div class="field full"><label>Additional requirements</label><textarea class="input" name="requirements" rows="3"></textarea></div>
          </div></details>
        <div class="full form-msg err" role="alert" hidden></div>
        <div class="full"><button class="btn primary lg" style="width:100%" type="submit">${esc(copy.btn)} →</button></div>
        <p class="full note">We never ask for your UPI PIN, OTP, card or bank details.</p>
      </form>
    </div>`, {
    onMount(el) {
      const form = $('form', el);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        submitting(form, async () => {
          try {
            const r = await api('/public/orders', { method: 'POST', body: { ...Object.fromEntries(new FormData(form)), plan } });
            location.href = `/order/${encodeURIComponent(r.token)}`;
          } catch (ex) { showMsg(form, ex.message); }
        });
      });
    },
  });
}
