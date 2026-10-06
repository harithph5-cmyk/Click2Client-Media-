// Editable site content managed from the admin portal: Brands (client logos)
// and Products. One table (site_items); each kind declares its fields here and
// the admin editor is generated from that. Images live in Supabase Storage —
// only their URLs are stored.

import * as store from './store/db.js';

const { query: q, queryOne: one, tx } = store;

export const KINDS = {
  brand: {
    label: 'Brands', singular: 'Brand', folder: 'Brands', image: 'Logo',
    hint: 'Shown in “Brands we collaborate with” on the home page. Use real clients only, with their permission. A transparent PNG or SVG-style logo works best.',
    fields: [
      { k: 'website', label: 'Website', type: 'url', placeholder: 'https://…' },
    ],
  },
  product: {
    label: 'Products', singular: 'Product', folder: 'Products', image: 'Product image (optional)',
    hint: 'Shown on /products and in the Products band on the home page.',
    fields: [
      { k: 'tag', label: 'Tag', type: 'text', placeholder: 'e.g. Recruitment · AI', max: 60 },
      { k: 'description', label: 'Short description', type: 'textarea', required: true, max: 300 },
      { k: 'points', label: 'Key points', type: 'list', hint: 'One per line — up to 5.', max: 5 },
      { k: 'cta_label', label: 'Button text', type: 'text', placeholder: 'Explore Product', max: 40 },
      { k: 'cta_url', label: 'Button link', type: 'url', placeholder: '/enquire?service=…', hint: 'Leave empty to open the enquiry form with this product selected.' },
      { k: 'color', label: 'Icon colour', type: 'select', options: ['blue', 'purple', 'green', 'orange'] },
    ],
  },
};

const SEED = {
  product: [
    { title: 'ATS System', slug: 'ats', data: { tag: 'Recruitment · AI', description: 'A smarter way to manage recruitment, applications and candidates.', points: ['Collect and organise applications', 'Track every candidate’s stage', 'AI-assisted screening'], cta_label: 'Explore ATS', color: 'blue' } },
    { title: 'AI Quiz System', slug: 'ai-quiz', data: { tag: 'Education · AI', description: 'Create intelligent quizzes and assessments powered by AI — built for students.', points: ['Generate questions with AI', 'Quizzes and assessments', 'Built for students and educators'], cta_label: 'Explore Product', color: 'purple' } },
    { title: 'To-Do List System', slug: 'productivity', data: { tag: 'Productivity', description: 'A simple digital system for managing tasks and productivity.', points: ['Plan and prioritise tasks', 'See what’s done at a glance', 'Simple enough to use daily'], cta_label: 'Explore Product', color: 'green' } },
    { title: 'CRM System', slug: 'crm', data: { tag: 'Sales · Operations', description: 'Manage leads, customers and business operations in one place.', points: ['Capture and follow up leads', 'One record for every customer', 'Day-to-day operations in one place'], cta_label: 'Explore Product', color: 'orange' } },
  ],
  // Clients from the portfolio. Logos are added in the admin (Supabase).
  brand: ['Carvello Cars', 'KinderBee', 'CODELYTIX Technologies', 'Globex Union', 'NimzLiot', 'TerraNext Global Ventures', 'Hi-Light Media'].map((title) => ({ title, data: {} })),
};

// ── Helpers ──────────────────────────────────────────────────────────────
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);
const slugify = (s) => txt(s, 100).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const urlOk = (u, label) => {
  if (u && !/^(https?:\/\/[^\s<>"]+|\/[^\s<>"]*)$/i.test(u)) throw bad(`${label} must start with https:// (or / for a page on this site).`);
  return u;
};
const kindOf = (kind) => { if (!KINDS[kind]) throw bad('Unknown content type.', 404); return KINDS[kind]; };
const iso = (d) => (d instanceof Date ? d.toISOString() : d ? String(d) : null);
const row = (r) => r && ({ ...r, data: r.data || {}, published: Boolean(r.published), display_order: Number(r.display_order), created_at: iso(r.created_at), updated_at: iso(r.updated_at) });

let seeded = null;
function ensureSeed() {
  seeded ||= (async () => {
    for (const [kind, items] of Object.entries(SEED)) {
      const flag = `content_seeded_${kind}`;
      if (await store.getSetting(flag, null)) continue;
      for (const [i, it] of items.entries()) {
        await q('INSERT INTO site_items (id, kind, slug, title, data, display_order) VALUES (?, ?, ?, ?, ?::jsonb, ?) ON CONFLICT (kind, slug) DO NOTHING',
          [store.newId(), kind, it.slug || slugify(it.title), it.title, JSON.stringify(it.data), i + 1]);
      }
      await store.setSetting(flag, new Date().toISOString());
    }
  })().catch((e) => { seeded = null; throw e; });
  return seeded;
}

export async function listItems(kind, { publishedOnly = true } = {}) {
  kindOf(kind);
  await ensureSeed();
  return (await q(`SELECT * FROM site_items WHERE kind = ? ${publishedOnly ? 'AND published' : ''} ORDER BY display_order, created_at`, [kind])).map(row);
}

function clean(kind, b) {
  const def = kindOf(kind);
  const title = txt(b.title, 120);
  if (!title) throw bad(`${def.singular} name is required.`);
  const data = {};
  for (const f of def.fields) {
    const v = b.data?.[f.k];
    if (f.type === 'list') data[f.k] = (Array.isArray(v) ? v : String(v ?? '').split('\n')).map((x) => txt(x, 120)).filter(Boolean).slice(0, f.max || 10);
    else if (f.type === 'url') data[f.k] = urlOk(txt(v, 600), f.label);
    else if (f.type === 'select') data[f.k] = f.options.includes(v) ? v : f.options[0];
    else data[f.k] = txt(v, f.max || (f.type === 'textarea' ? 1000 : 200));
    if (f.required && !data[f.k]?.length) throw bad(`${f.label} is required.`);
  }
  return { title, slug: slugify(b.slug || title) || 'item', data, image: urlOk(txt(b.image, 600), def.image), published: b.published === undefined ? true : Boolean(b.published) };
}

export async function saveItem(kind, id, body) {
  await ensureSeed();
  const r = clean(kind, body);
  const clash = await one('SELECT id FROM site_items WHERE kind = ? AND slug = ?', [kind, r.slug]);
  if (clash && clash.id !== id) throw bad(`Another ${KINDS[kind].singular.toLowerCase()} already uses “${r.slug}”. Change the name or slug.`, 409);
  if (id) {
    const res = await q('UPDATE site_items SET slug = ?, title = ?, data = ?::jsonb, image = ?, published = ?, updated_at = NOW() WHERE id = ? AND kind = ? RETURNING *',
      [r.slug, r.title, JSON.stringify(r.data), r.image, r.published, id, kind]);
    if (!res.length) throw bad('Item not found.', 404);
    return row(res[0]);
  }
  const n = (await one('SELECT COALESCE(MAX(display_order), 0) + 1 AS n FROM site_items WHERE kind = ?', [kind])).n;
  return row((await q('INSERT INTO site_items (id, kind, slug, title, data, image, published, display_order) VALUES (?, ?, ?, ?, ?::jsonb, ?, ?, ?) RETURNING *',
    [store.newId(), kind, r.slug, r.title, JSON.stringify(r.data), r.image, r.published, Number(n)]))[0]);
}

export async function setPublished(kind, id, published) {
  const r = await q('UPDATE site_items SET published = ?, updated_at = NOW() WHERE id = ? AND kind = ? RETURNING *', [Boolean(published), id, kind]);
  if (!r.length) throw bad('Item not found.', 404);
  return row(r[0]);
}
export async function deleteItem(kind, id) {
  const r = await q('DELETE FROM site_items WHERE id = ? AND kind = ? RETURNING id', [id, kind]);
  if (!r.length) throw bad('Item not found.', 404);
}
export async function reorderItems(kind, ids) {
  kindOf(kind);
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string'))].slice(0, 500);
  await tx(async (c) => { for (const [i, id] of list.entries()) await c.query('UPDATE site_items SET display_order = $1 WHERE id = $2 AND kind = $3', [i + 1, id, kind]); });
}

// ── Public HTML ──────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ICON = {
  blue: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 11l2 2 4-4"/></svg>',
  purple: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9.1 9a3 3 0 1 1 4.2 2.7c-.8.4-1.3 1.1-1.3 2v.3M12 17.5h.01"/><circle cx="12" cy="12" r="9.5"/></svg>',
  green: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12 3 3 5-6"/></svg>',
  orange: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>',
};
const C = { blue: 'c1', purple: 'c2', green: 'c3', orange: 'c4' };
const ctaUrl = (p) => p.data.cta_url || `/enquire?service=${encodeURIComponent(p.title)}`;

function productCard(p) {
  const d = p.data;
  return `<article class="pr-card reveal" id="${esc(p.slug)}">
    ${p.image ? `<div class="pr-shot"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" decoding="async"></div>` : ''}
    <div class="pr-top"><span class="pr-icon ${C[d.color] || 'c1'}">${ICON[d.color] || ICON.blue}</span>${d.tag ? `<span class="pr-tag">${esc(d.tag)}</span>` : ''}</div>
    <h3>${esc(p.title)}</h3>
    <p>${esc(d.description)}</p>
    ${d.points?.length ? `<ul class="pr-points">${d.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <a class="pr-cta" href="${esc(ctaUrl(p))}">${esc(d.cta_label || 'Explore Product')} <span>→</span></a>
  </article>`;
}

export async function productsVars() {
  const items = await listItems('product').catch(() => []);
  return { 'products.cards': items.length ? `<div class="pr-grid">${items.map(productCard).join('')}</div>` : '<p class="wk-empty">Products coming soon.</p>' };
}

export async function homeContentVars() {
  const [products, brands] = await Promise.all([listItems('product').catch(() => []), listItems('brand').catch(() => [])]);
  return {
    'home.products': products.length ? `<section class="section tint" aria-labelledby="hp-h"><div class="wrap">
      <div class="split-head reveal"><div class="sec-head"><span class="eyebrow">Our products</span><h2 id="hp-h">Digital systems, ready to use</h2></div><p>Alongside client work, we build our own software for recruitment, learning, productivity and customer management.</p></div>
      <div class="pr-mini">${products.slice(0, 4).map((p) => `<a class="pr-mini-card reveal" href="/products#${esc(p.slug)}"><span class="pr-icon sm ${C[p.data.color] || 'c1'}">${ICON[p.data.color] || ICON.blue}</span><b>${esc(p.title)}</b><span>${esc(p.data.description)}</span></a>`).join('')}</div>
      <p class="wk-all"><a class="btn outline lg" href="/products">View All Products →</a></p></div></section>` : '',
    'home.brands': brands.length ? `<section class="section brands-sec" aria-labelledby="br-h"><div class="wrap">
      <div class="sec-head center reveal"><span class="eyebrow">Brands we collaborate with</span><h2 id="br-h">Trusted by growing businesses</h2></div>
      <ul class="brands reveal">${brands.map((b) => {
        const inner = b.image ? `<img src="${esc(b.image)}" alt="${esc(b.title)} logo" loading="lazy" decoding="async">` : `<span class="brand-word">${esc(b.title)}</span>`;
        return `<li>${b.data.website ? `<a href="${esc(b.data.website)}" target="_blank" rel="noopener nofollow" aria-label="${esc(b.title)}">${inner}</a>` : inner}</li>`;
      }).join('')}</ul></div></section>` : '',
  };
}
