// /portfolio interactions: filters, hover cursor, case-study modal, counters,
// before/after slider, magnetic buttons and hero parallax.
import { esc } from './common.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
let projects = [];
try { projects = JSON.parse($('#pfData').textContent); } catch {}

// ── Filters ──────────────────────────────────────────────────────────────
const cards = $$('.pf-card');
$('.pf-filters')?.addEventListener('click', (e) => {
  const chip = e.target.closest('[data-filter]');
  if (!chip) return;
  $$('.pf-chip').forEach((c) => { c.classList.toggle('on', c === chip); c.setAttribute('aria-pressed', c === chip); });
  const f = chip.dataset.filter;
  const show = (c) => f === 'All' || c.dataset.cats.split('|').includes(f);
  cards.forEach((c) => c.classList.add('out'));
  setTimeout(() => {
    cards.forEach((c) => { c.hidden = !show(c); c.classList.add('in'); });
    $('.pf-empty').hidden = cards.some(show);
    void document.body.offsetHeight; // commit the hidden/out state so the fade-in transitions
    cards.forEach((c) => c.classList.remove('out'));
  }, calm ? 0 : 220);
});

// ── Cursor-follow "View" bubble ─────────────────────────────────────────
const cursor = $('.pf-cursor');
if (fine && cursor) {
  addEventListener('pointermove', (e) => {
    cursor.style.setProperty('--cx', e.clientX + 'px');
    cursor.style.setProperty('--cy', e.clientY + 'px');
    cursor.classList.toggle('on', !!e.target.closest?.('.pf-media'));
  }, { passive: true });
}

// ── Case-study modal ─────────────────────────────────────────────────────
const modal = $('#pfModal');
let lastFocus = null;
function openProject(id) {
  const p = projects.find((x) => x.id === id);
  if (!p) return;
  const block = (t, v) => (v ? `<div class="pf-csr"><h3>${t}</h3><p>${esc(v)}</p></div>` : '');
  $('.pf-modal-body', modal).innerHTML = `
    <div class="pf-m-media">${p.img ? `<img class="pf-img" src="${esc(p.img)}" alt="${esc(p.name)} website">` : (document.querySelector(`.pf-card[data-id="${CSS.escape(p.id)}"] .pf-ph`)?.outerHTML || '')}</div>
    <div class="pf-m-body">
      <span class="pf-industry" style="justify-self:start">${esc(p.industry)}</span>
      <h2 id="pfmTitle">${esc(p.name)}</h2>
      ${p.tagline || p.highlight ? `<p class="lede" style="font-size:17px">${esc(p.tagline || p.highlight)}</p>` : ''}
      ${p.journey?.length ? `<ol class="pf-journey" style="margin:4px 0 0">${p.journey.map((j) => `<li>${esc(j)}</li>`).join('')}</ol>` : ''}
      <ul class="pf-tags">${p.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${block('Challenge', p.challenge)}${block('Solution', p.solution)}${block('Result', p.result)}
      <div class="row wrap-row">${p.url ? `<a class="btn outline" href="${esc(p.url)}" ${p.url.startsWith('/') ? '' : 'target="_blank" rel="noopener"'}>Visit website ↗</a>` : ''}<a class="btn primary" href="/enquire?service=Website%20Development">Start a similar project →</a></div>
    </div>`;
  lastFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add('pf-lock');
  $('.pf-close', modal).focus();
}
function closeModal() {
  if (modal.hidden) return;
  modal.hidden = true;
  document.body.classList.remove('pf-lock');
  lastFocus?.focus();
}
document.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  if (o) return openProject(o.dataset.open);
  if (e.target === modal || e.target.closest('.pf-close')) closeModal();
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ── Counters ─────────────────────────────────────────────────────────────
const counters = $$('[data-count]');
const runCount = (el) => {
  const end = +el.dataset.count, pre = el.dataset.pre, suf = el.dataset.suf, t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / 1400);
    el.textContent = pre + Math.round(end * (1 - (1 - k) ** 3)) + suf;
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
if (!calm && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); runCount(e.target); } }), { threshold: 0.5 });
  counters.forEach((el) => { el.textContent = el.dataset.pre + '0' + el.dataset.suf; io.observe(el); });
}

// ── Before / after ───────────────────────────────────────────────────────
$$('.ba').forEach((ba) => {
  const r = $('.ba-range', ba);
  r.addEventListener('input', () => ba.style.setProperty('--pos', r.value + '%'));
});

// ── Magnetic buttons + hero parallax (fine pointers only) ───────────────
if (fine && !calm) {
  $$('.magnetic').forEach((b) => {
    b.addEventListener('pointermove', (e) => {
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
    });
    b.addEventListener('pointerleave', () => { b.style.transform = ''; });
  });
  const hero = $('#pfHero');
  hero?.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    $$('.fl', hero).forEach((f) => { const d = +f.dataset.depth; f.style.setProperty('--tx', x * d + 'px'); f.style.setProperty('--ty', y * d + 'px'); });
  });
}
