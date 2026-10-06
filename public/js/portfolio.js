// /portfolio: sticky category nav. Clicking a category shows only that section
// (no reload); "Show all work" brings every section back. While showing all,
// the nav highlights the section currently on screen.
const chips = [...document.querySelectorAll('.wk-chip')];
const sections = [...document.querySelectorAll('.wk-cat')];
const lib = document.getElementById('wkLibrary');
const reset = document.getElementById('wkReset');
const nav = document.querySelector('.wk-nav');
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
let filter = null;

const mark = (slug) => chips.forEach((c) => { const on = c.dataset.filter === slug; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on && !!filter)); if (on) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: calm ? 'auto' : 'smooth' }); });
const toTop = () => { const y = lib.getBoundingClientRect().top + scrollY - (nav?.offsetHeight || 0) - 12; if (scrollY > y) scrollTo({ top: y, behavior: calm ? 'auto' : 'smooth' }); };

function show(slug, { animate = true } = {}) {
  filter = sections.some((s) => s.dataset.cat === slug) ? slug : null;
  const swap = () => {
    sections.forEach((s) => { s.hidden = Boolean(filter) && s.dataset.cat !== filter; });
    sections.forEach((s) => s.querySelectorAll('.reveal').forEach((r) => r.classList.add('in')));
    reset.hidden = !filter;
    mark(filter);
    lib.classList.remove('is-fading');
    history.replaceState(null, '', filter ? `#${filter}` : location.pathname);
  };
  if (!animate || calm) return swap();
  lib.classList.add('is-fading');
  setTimeout(() => { swap(); toTop(); }, 180);
}

document.querySelector('.wk-filters')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.wk-chip');
  if (chip) show(chip.dataset.filter === filter ? null : chip.dataset.filter);
});
reset?.addEventListener('click', () => show(null));

// Scroll-spy while all sections are visible
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    if (filter) return;
    const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (hit) chips.forEach((c) => c.classList.toggle('on', c.dataset.filter === hit.target.dataset.cat));
  }, { rootMargin: '-45% 0px -50% 0px' });
  sections.forEach((s) => io.observe(s));
}

if (location.hash.length > 1) show(decodeURIComponent(location.hash.slice(1)), { animate: false });
