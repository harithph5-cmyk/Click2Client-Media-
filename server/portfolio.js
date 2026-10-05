// Portfolio: projects + stats, stored in the settings table (metadata under
// "portfolio", each image under "pimg:<id>:<kind>"). Edited from the admin
// portal, rendered server-side on /portfolio so search engines see it.

import * as store from './store/db.js';

export const CATEGORIES = ['Websites', 'SEO', 'Branding', 'Social Media', 'Ads', 'UI/UX'];
const KINDS = ['main', 'before'];

// Starting content from the brief. No screenshots or results are invented —
// cards show a branded placeholder until a real screenshot is uploaded.
const SEED = {
  stats: [
    { value: '25+', label: 'Projects Delivered' },
    { value: '15+', label: 'Web Experiences Built' },
    { value: '10+', label: 'Industries Served' },
    { value: '30+', label: 'Digital Campaigns' },
  ],
  projects: [
    { id: 'carvello', name: 'Carvello Cars', industry: 'Automotive', categories: ['Websites', 'UI/UX'], services: ['Website Development', 'UI/UX', 'Admin Dashboard'], highlight: 'A modern digital car-buying experience with an inventory admin dashboard.', url: '', featured: true,
      tagline: 'From a traditional car dealership website to a modern digital car-buying experience.', journey: ['Website', 'UI/UX', 'Admin Panel', 'Lead Generation'],
      challenge: 'A traditional dealership website that didn’t match how customers research and shortlist cars online.', solution: 'A new website and UI/UX built around browsing inventory, plus an admin panel to manage listings and enquiries.', result: '' },
    { id: 'kinderbee', name: 'KinderBee', industry: 'Education / Preschool', categories: ['Websites', 'SEO', 'Social Media', 'Ads'], services: ['Website', 'SEO', 'Digital Marketing'], highlight: 'A friendly preschool website built to be found by local parents.', url: '' },
    { id: 'dc-creations', name: 'DC Creations', industry: 'Photography', categories: ['Websites', 'Social Media', 'Ads'], services: ['Website', 'Social Media Marketing', 'Meta Ads'], highlight: 'A portfolio-first website with social and Meta Ads campaigns.', url: '' },
    { id: 'codelytix', name: 'CODELYTIX Technologies', industry: 'Technology', categories: ['Websites', 'SEO', 'Ads'], services: ['Website', 'SEO', 'Digital Marketing'], highlight: 'A technology company website with SEO and digital marketing.', url: '' },
    { id: 'click2client', name: 'Click2Client Media', industry: 'Agency', categories: ['Branding', 'Websites'], services: ['Branding', 'Website', 'Lead Generation System'], highlight: 'Our own brand, website and built-in SEO audit lead-generation system.', url: '/' },
  ],
};

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const list = (v, n, each = 60) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => clean(x, each)).filter(Boolean).slice(0, n);
const slug = (s) => clean(s, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'project';

export async function getPortfolio() {
  const p = await store.getSetting('portfolio', null);
  return p || structuredClone(SEED);
}
const save = (p) => store.setSetting('portfolio', p);

/** Validates admin input into a project record (never trusts the browser). */
export function sanitizeProject(b, existing = {}) {
  const url = clean(b.url, 300);
  if (url && !/^(https?:\/\/|\/)/i.test(url)) throw new Error('Website link must start with https:// (or / for a page on this site).');
  return {
    ...existing,
    name: clean(b.name, 80) || (() => { throw new Error('Project name is required.'); })(),
    industry: clean(b.industry, 60),
    categories: list(b.categories, 6).filter((c) => CATEGORIES.includes(c)),
    services: list(b.services, 8),
    highlight: clean(b.highlight, 220),
    url,
    featured: Boolean(b.featured),
    tagline: clean(b.tagline, 220),
    journey: list(b.journey, 6, 40),
    challenge: clean(b.challenge, 600),
    solution: clean(b.solution, 600),
    result: clean(b.result, 600),
  };
}

export async function upsertProject(id, body) {
  const p = await getPortfolio();
  const i = id ? p.projects.findIndex((x) => x.id === id) : -1;
  if (id && i < 0) throw Object.assign(new Error('Project not found.'), { status: 404 });
  const rec = sanitizeProject(body, i >= 0 ? p.projects[i] : {});
  if (i >= 0) p.projects[i] = rec;
  else {
    let newId = slug(rec.name);
    while (p.projects.some((x) => x.id === newId)) newId += '-2';
    rec.id = newId;
    p.projects.push(rec);
  }
  if (rec.featured) for (const x of p.projects) if (x !== rec) x.featured = false; // one featured project
  await save(p);
  return rec;
}

export async function deleteProject(id) {
  const p = await getPortfolio();
  p.projects = p.projects.filter((x) => x.id !== id);
  await save(p);
  for (const k of KINDS) await store.setSetting(`pimg:${id}:${k}`, null);
}

export async function reorder(ids) {
  const p = await getPortfolio();
  const pos = new Map(ids.map((id, i) => [id, i]));
  p.projects.sort((a, b) => (pos.get(a.id) ?? 999) - (pos.get(b.id) ?? 999));
  await save(p);
}

export async function saveStats(stats) {
  const p = await getPortfolio();
  p.stats = (Array.isArray(stats) ? stats : []).slice(0, 4).map((s) => ({ value: clean(s.value, 12), label: clean(s.label, 40) })).filter((s) => s.value && s.label);
  await save(p);
}

export async function setImage(id, kind, dataUrl) {
  if (!KINDS.includes(kind)) throw new Error('Unknown image type.');
  const p = await getPortfolio();
  const proj = p.projects.find((x) => x.id === id);
  if (!proj) throw Object.assign(new Error('Project not found.'), { status: 404 });
  if (dataUrl === null) {
    await store.setSetting(`pimg:${id}:${kind}`, null);
    delete proj[`${kind}Image`];
  } else {
    const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) throw new Error('Upload a PNG, JPG or WebP image.');
    if (m[3].length > 1_400_000) throw new Error('Image is too large — please use one under 1 MB.');
    await store.setSetting(`pimg:${id}:${kind}`, { mime: m[1], data: m[3] });
    proj[`${kind}Image`] = Date.now(); // version → cache-busting URL
  }
  await save(p);
}

export const getImage = (id, kind) => (KINDS.includes(kind) ? store.getSetting(`pimg:${id}:${kind}`, null) : null);

// ── Server-side HTML for /portfolio ──────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const imgUrl = (p, kind = 'main') => (p[`${kind}Image`] ? `/portfolio-img/${encodeURIComponent(p.id)}/${kind}?v=${p[`${kind}Image`]}` : null);
const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

function shot(p, cls = '') {
  const src = imgUrl(p);
  if (src) return `<img class="pf-img ${cls}" src="${src}" alt="${esc(p.name)} — ${esc(p.industry)} project by Click2Client Media" loading="lazy" decoding="async">`;
  const h = hue(p.name);
  // Branded placeholder mockup (shown until a real screenshot is uploaded).
  return `<div class="pf-img pf-ph ${cls}" style="--h:${h}" role="img" aria-label="${esc(p.name)} project">
    <div class="ph-bar"><i></i><i></i><i></i></div>
    <div class="ph-body"><span class="ph-mark">${esc(p.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase())}</span><b>${esc(p.name)}</b><small>${esc(p.industry)}</small>
    <div class="ph-lines"><span></span><span></span><span></span></div></div></div>`;
}

export async function portfolioVars() {
  const { projects, stats } = await getPortfolio().catch(() => structuredClone(SEED));
  const featured = projects.find((p) => p.featured) || null;
  const cards = projects.map((p, i) => `
    <article class="pf-card reveal" data-cats="${esc(p.categories.join('|'))}" data-id="${esc(p.id)}" style="--d:${(i % 4) * 70}ms">
      <button class="pf-media" type="button" data-open="${esc(p.id)}" aria-label="View case study: ${esc(p.name)}">
        ${shot(p)}
        <span class="pf-overlay"><span class="pf-ov-ind">${esc(p.industry)}</span><span class="pf-ov-cta">View Case Study →</span></span>
      </button>
      <div class="pf-info">
        <div class="pf-row"><h3>${esc(p.name)}</h3><span class="pf-industry">${esc(p.industry)}</span></div>
        ${p.highlight ? `<p>${esc(p.highlight)}</p>` : ''}
        <ul class="pf-tags">${p.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <div class="pf-actions"><button class="btn outline sm" type="button" data-open="${esc(p.id)}">View Project →</button>${p.url ? `<a class="pf-visit" href="${esc(p.url)}" ${p.url.startsWith('/') ? '' : 'target="_blank" rel="noopener"'}>Visit site ↗</a>` : ''}</div>
      </div>
    </article>`).join('');

  const feat = featured ? `
  <section class="section pf-featured" aria-labelledby="feat-h">
    <div class="wrap">
      <div class="sec-head reveal"><span class="eyebrow">Featured project</span><h2 id="feat-h">${esc(featured.name)}</h2>${featured.tagline ? `<p class="pf-tagline">“${esc(featured.tagline)}”</p>` : ''}</div>
      <div class="pf-feat-grid">
        <div class="pf-device reveal"><div class="pf-device-bar"><i></i><i></i><i></i><span>${esc(featured.url && !featured.url.startsWith('/') ? featured.url.replace(/^https?:\/\//, '') : featured.name.toLowerCase().replace(/\s+/g, '') + '.com')}</span></div>${shot(featured, 'pf-device-img')}</div>
        <div class="pf-feat-copy reveal">
          ${featured.journey.length ? `<ol class="pf-journey">${featured.journey.map((j) => `<li>${esc(j)}</li>`).join('')}</ol>` : ''}
          ${featured.challenge ? `<div class="pf-csr"><h3>Challenge</h3><p>${esc(featured.challenge)}</p></div>` : ''}
          ${featured.solution ? `<div class="pf-csr"><h3>Solution</h3><p>${esc(featured.solution)}</p></div>` : ''}
          ${featured.result ? `<div class="pf-csr"><h3>Result</h3><p>${esc(featured.result)}</p></div>` : ''}
          <button class="btn primary lg magnetic" type="button" data-open="${esc(featured.id)}">Explore Case Study →</button>
        </div>
      </div>
    </div>
  </section>` : '';

  const before = featured && featured.beforeImage && featured.mainImage ? `
  <section class="section tint" aria-labelledby="ba-h">
    <div class="wrap">
      <div class="sec-head center reveal"><span class="eyebrow">Before → After</span><h2 id="ba-h">We don't just redesign websites.</h2><p>We redesign the way businesses are experienced online.</p></div>
      <div class="ba reveal" style="--pos:50%">
        <img src="${imgUrl(featured, 'main')}" alt="${esc(featured.name)} — after: the new website" loading="lazy">
        <div class="ba-before"><img src="${imgUrl(featured, 'before')}" alt="${esc(featured.name)} — before: the old website" loading="lazy"></div>
        <span class="ba-tag ba-tag-b">Before</span><span class="ba-tag ba-tag-a">After</span>
        <span class="ba-handle" aria-hidden="true"></span>
        <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Drag to compare before and after">
      </div>
    </div>
  </section>` : '';

  const statsHtml = stats.length ? `
  <section class="section pf-stats-sec" aria-label="Results">
    <div class="wrap"><ul class="pf-stats">${stats.map((s) => {
      const m = /^(\D*)(\d+)(.*)$/.exec(s.value);
      return `<li class="reveal"><b${m ? ` data-count="${m[2]}" data-pre="${esc(m[1])}" data-suf="${esc(m[3])}"` : ''}>${esc(s.value)}</b><span>${esc(s.label)}</span></li>`;
    }).join('')}</ul></div>
  </section>` : '';

  const filters = ['All', ...CATEGORIES].map((c, i) => `<button type="button" class="pf-chip${i ? '' : ' on'}" data-filter="${esc(c)}" aria-pressed="${i ? 'false' : 'true'}">${esc(c)}</button>`).join('');
  const data = JSON.stringify(projects.map((p) => ({ ...p, img: imgUrl(p) }))).replace(/</g, '\\u003c');
  return { 'pf.cards': cards, 'pf.featured': feat, 'pf.before': before, 'pf.stats': statsHtml, 'pf.filters': filters, 'pf.data': data, 'pf.count': String(projects.length) };
}
