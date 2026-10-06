// /portfolio: category filter (no reload). Supports deep links like /portfolio#seo.
const grid = document.getElementById('wkGrid');
const chips = [...document.querySelectorAll('.wk-chip')];
const empty = document.getElementById('wkEmpty');
const cards = grid ? [...grid.querySelectorAll('.wk-card')] : [];
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

function apply(filter, { animate = true } = {}) {
  const chip = chips.find((c) => c.dataset.filter === filter) || chips[0];
  if (!chip) return;
  filter = chip.dataset.filter;
  chips.forEach((c) => { c.classList.toggle('on', c === chip); c.setAttribute('aria-pressed', c === chip); });
  chip.scrollIntoView({ block: 'nearest', inline: 'center', behavior: animate && !calm ? 'smooth' : 'auto' });
  const show = (c) => c.dataset.cat === filter;
  const swap = () => {
    cards.forEach((c) => { c.hidden = !show(c); });
    const none = !cards.some(show);
    empty.hidden = !none;
    if (none) empty.textContent = chip.dataset.empty || 'No projects here yet.';
    grid.classList.remove('is-fading');
  };
  if (!animate || calm) return swap();
  grid.classList.add('is-fading');
  setTimeout(swap, 180);
}

document.querySelector('.wk-filters')?.addEventListener('click', (e) => {
  const chip = e.target.closest('.wk-chip');
  if (!chip) return;
  apply(chip.dataset.filter);
  history.replaceState(null, '', chip === chips[0] ? location.pathname : `#${chip.dataset.filter}`);
});

if (location.hash.length > 1) apply(decodeURIComponent(location.hash.slice(1)), { animate: false });
