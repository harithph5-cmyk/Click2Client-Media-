// Interactions for /products (catalogue filter + search) and /courses (syllabus
// toggles + enquiry form). Shared header, menu and scroll-reveal live in site.js.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const track = (n, p) => { try { window.c2cTrack?.(n, p); } catch { /* analytics is optional */ } };

// ── Products: category tabs, search, expandable groups ───────────────────
const groupsEl = $('#pcGroups');
if (groupsEl) {
  const COLLAPSED = 6;
  const tabs = $$('.pc-tab');
  const groups = $$('.pc-group', groupsEl);
  const search = $('#pcSearch');
  const status = $('#pcStatus');
  const empty = $('#pcEmpty');
  const total = $$('.pc-card', groupsEl).length;
  const expanded = new Set();
  let cat = 'all';

  const render = (animate) => {
    const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const collapse = cat === 'all' && !terms.length;
    let shown = 0;
    for (const g of groups) {
      const inCat = cat === 'all' || g.dataset.cat === cat;
      const cards = $$('.pc-card', g);
      const matches = cards.filter((c) => terms.every((t) => c.dataset.q.includes(t)));
      const limit = collapse && !expanded.has(g.dataset.cat) ? COLLAPSED : Infinity;
      cards.forEach((c) => { c.hidden = !(inCat && matches.includes(c) && matches.indexOf(c) < limit); });
      g.hidden = !(inCat && matches.length);
      const more = $('.pc-more', g) || (matches.length > COLLAPSED && g.appendChild(Object.assign(document.createElement('button'), { type: 'button', className: 'pc-more' })));
      if (more) {
        more.hidden = !(collapse && matches.length > COLLAPSED);
        const open = expanded.has(g.dataset.cat);
        more.textContent = open ? 'Show fewer' : `Show all ${matches.length}`;
        more.setAttribute('aria-expanded', String(open));
        more.onclick = () => { open ? expanded.delete(g.dataset.cat) : expanded.add(g.dataset.cat); render(false); };
      }
      if (inCat) shown += matches.length;
    }
    empty.hidden = shown > 0;
    status.textContent = terms.length || cat !== 'all' ? `Showing ${shown} of ${total} software solutions` : '';
    if (animate) { groupsEl.classList.remove('pc-fade'); void groupsEl.offsetWidth; groupsEl.classList.add('pc-fade'); }
  };

  tabs.forEach((t) => t.addEventListener('click', () => {
    cat = t.dataset.cat;
    tabs.forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
    render(true);
  }));
  search.addEventListener('input', () => render(false));
  render(false);
}

// ── Courses: syllabus toggle + enquiry dialog ────────────────────────────
$$('[data-syl]').forEach((b) => b.addEventListener('click', () => {
  const panel = document.getElementById(b.dataset.syl);
  const open = panel.hidden;
  panel.hidden = !open;
  b.setAttribute('aria-expanded', String(open));
  b.textContent = open ? 'Hide Course Details' : 'View Course Details';
}));

const dlg = $('#enqDialog');
if (dlg) {
  const form = $('#enqForm');
  const msg = $('#enqMsg');
  const say = (text, ok) => { msg.hidden = !text; msg.className = 'form-msg' + (ok ? ' ok' : ''); msg.textContent = text; };
  let opener = null;

  $$('[data-enquire]').forEach((b) => b.addEventListener('click', () => {
    opener = b;
    const sel = form.elements.course;
    sel.value = [...sel.options].some((o) => o.value === b.dataset.enquire) ? b.dataset.enquire : '';
    say('');
    dlg.showModal();
    form.elements.name.focus();
    track('enquiry_open', { service: b.dataset.enquire || '' });
  }));
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
  dlg.addEventListener('close', () => opener?.focus());

  // Same rules as the server (/api/public/leads); the server re-checks everything.
  const rules = {
    name: (v) => v.trim().length >= 2 || 'Please enter your full name.',
    email: (v) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Please enter a valid email address.',
    phone: (v) => (/^\+?[\d\s-]{7,18}$/.test(v.trim()) && v.replace(/\D/g, '').length >= 7) || 'Please enter a valid phone number.',
    course: (v) => !!v || 'Please choose a course.',
    mode: (v) => !!v || 'Please choose a learning mode.',
  };
  const validate = () => {
    let first = null;
    for (const [k, rule] of Object.entries(rules)) {
      const el = form.elements[k], r = rule(el.value), bad = r !== true;
      $(`.err[data-for="${k}"]`, form).textContent = bad ? r : '';
      el.setAttribute('aria-invalid', String(bad));
      if (bad && !first) first = el;
    }
    first?.focus();
    return !first;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;
    const btn = $('button[type="submit"]', form);
    btn.disabled = true; btn.textContent = 'Sending…'; say('');
    const f = Object.fromEntries(new FormData(form));
    try {
      const res = await fetch('/api/public/leads', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: f.name, email: f.email, phone: f.phone, service: f.course, source: 'course_enquiry', message: `Preferred learning mode: ${f.mode}${f.message ? `\n\n${f.message}` : ''}` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || 'We could not send your enquiry. Please try again or contact us on WhatsApp.');
      track('generate_lead', { lead_source: 'course_enquiry', service: f.course });
      form.reset();
      say('Thank you — your enquiry has been received. Our team will contact you about the next batch.', true);
    } catch (ex) {
      say(ex instanceof TypeError ? 'We could not reach the server. Please check your connection and try again.' : ex.message);
    } finally { btn.disabled = false; btn.textContent = 'Send Enquiry'; }
  });
}

// ── Shared polish: progress bar, count-up, card spotlight, sticky CTA ────
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const bar = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'pl-progress', 'aria-hidden': 'true' }));
const sticky = $('#plSticky');
const onScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? Math.min(scrollY / max, 1) : 0})`;
  sticky?.classList.toggle('on', scrollY > 700);
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

const countIO = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (!e.isIntersecting) return;
  countIO.unobserve(e.target);
  const to = Number(e.target.dataset.count), t0 = performance.now();
  const tick = (t) => { const k = Math.min((t - t0) / 1100, 1); e.target.textContent = Math.round(to * (1 - (1 - k) ** 3)); if (k < 1) requestAnimationFrame(tick); };
  if (!reduced) requestAnimationFrame(tick);
}), { threshold: 0.6 });
$$('[data-count]').forEach((el) => countIO.observe(el));

document.addEventListener('pointermove', (e) => {
  const c = e.target.closest?.('.fp, .pc-card, .hl, .ex, .cc');
  if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', `${e.clientX - r.left}px`);
  c.style.setProperty('--my', `${e.clientY - r.top}px`);
});
$$('.pc-card, .ex, .hl').forEach((el, i) => el.style.setProperty('--i', i % 6));

// Popular-search chips
$$('.pc-pop [data-q]').forEach((b) => b.addEventListener('click', () => {
  $('.pc-tab[data-cat="all"]').click();
  const s = $('#pcSearch'); s.value = b.dataset.q; s.dispatchEvent(new Event('input')); s.focus({ preventScroll: true });
}));
