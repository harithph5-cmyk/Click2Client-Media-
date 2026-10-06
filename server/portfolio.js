// Portfolio CMS: projects, gallery images and categories in Postgres; image
// files in Supabase Storage (only their URLs are stored here). Managed from
// Admin → Portfolio; public pages are rendered on the server for SEO.

import * as store from './store/db.js';
import { formatBody } from './blog.js';

const { query: q, queryOne: one, tx } = store;

// ── Starting content ─────────────────────────────────────────────────────
// Only facts we know. No screenshots, metrics or results are invented: covers
// are picked from Supabase in the admin, results stay empty until added.
const SEED_CATEGORIES = [
  { slug: 'websites', name: 'Websites', short_name: 'Websites', empty_text: 'No projects here yet.' },
  { slug: 'seo', name: 'SEO', short_name: 'SEO', empty_text: 'No projects here yet.' },
  { slug: 'social-media', name: 'Social Media Marketing', short_name: 'Social Media', empty_text: 'No projects here yet.' },
  { slug: 'ads-campaigns', name: 'Ads Campaigns', short_name: 'Ads Campaigns', empty_text: 'Campaign case studies coming soon.' },
  { slug: 'ui-ux', name: 'UI/UX', short_name: 'UI/UX', empty_text: 'UI/UX case studies coming soon.' },
];

const SEED_PROJECTS = [
  {
    slug: 'carvello-cars', title: 'Carvello Cars', category: 'websites', subcategory: 'Website Development', client: 'Carvello Cars',
    industry: 'Automotive', location: 'Dubai, UAE',
    short_description: 'A modern digital car-buying experience with a dynamic inventory and administration system.',
    description: 'Carvello Cars is a pre-owned car dealer in Dubai selling inspected, accident-free cars with warranty and flexible finance. We designed and built their website and the admin system behind it, so the team can run their online showroom and enquiries themselves.',
    services: ['Website Development', 'UI/UX', 'Admin Dashboard', 'Lead Generation'],
    project_url: 'https://www.carvellocars.com/', admin_url: 'https://carvellocars.com/admin/',
    challenge: 'Buying a used car starts online. Carvello needed a website that shows real, current stock with prices and offers, explains why their cars can be trusted — non-accident policy, warranty, finance — and turns interest into a call, WhatsApp message or enquiry. The team also needed to keep that stock up to date every day without a developer.',
    solution: 'A premium, mobile-first dealership website built around the inventory, with a page for every car, clear trust messaging, and enquiry and WhatsApp routes on every page — all managed from a purpose-built admin panel.',
    case_sections: [
      { heading: 'Website Experience', body: 'The home page leads with what matters to a Dubai used-car buyer: hand-picked, inspected and accident-free cars, a one-year engine and gearbox warranty, and 0% down payment options. Separate journeys for buying and selling a car keep both audiences moving.' },
      { heading: 'Inventory Experience', body: 'Every car has its own page with photos, make, model, year, mileage, the regular and offer price, and the saving. Buyers can filter the full inventory by make and sort by price or most recent, and each listing links straight to an enquiry or the dealer’s phone.' },
      { heading: 'Admin Dashboard', body: 'A custom admin panel lets the Carvello team add cars, change prices and offer prices inline, set each car’s status (available, reserved, sold or hidden), choose which cars appear on the home page and set their order. They can also edit text, phone numbers, images and reviews across the site, and download a full backup.' },
      { heading: 'Lead Generation', body: 'Enquiry forms on the home page and on every car page collect the buyer’s name, phone, email and preferred car, and arrive in an enquiries inbox in the admin panel. Call and WhatsApp links are always one tap away.' },
      { heading: 'Responsive Design', body: 'The site is designed mobile-first, because most buyers browse cars on their phone — from the inventory grid to the enquiry form.' },
    ],
    results: 'Carvello runs its own website day to day: the team updates stock, prices and statuses, edits page content and answers enquiries from one admin panel, without needing a developer.',
  },
  { slug: 'kinderbee', title: 'KinderBee', category: 'websites', subcategory: 'Website Development', client: 'KinderBee', industry: 'Education / Preschool',
    short_description: 'A website for KinderBee preschool, built to give parents a clear picture of the school and an easy way to get in touch.', services: ['Website Development'] },
  { slug: 'click2client-media', title: 'Click2Client Media', category: 'websites', subcategory: 'Website Development', client: 'Click2Client Media', industry: 'Digital Agency', location: 'Madurai, India',
    short_description: 'Our own agency website — with a built-in SEO audit tool, blog and the admin system that runs it.',
    services: ['Website Development', 'Branding', 'SEO Audit Tool', 'Admin Dashboard'], technologies: ['Node.js', 'PostgreSQL', 'Supabase'], project_url: '/' },
  { slug: 'kinderbee-seo', title: 'KinderBee', category: 'seo', subcategory: 'SEO', client: 'KinderBee', industry: 'Education / Preschool',
    short_description: 'SEO for KinderBee preschool, helping local parents find the school on Google.', services: ['SEO'] },
  { slug: 'codelytix', title: 'CODELYTIX', category: 'seo', subcategory: 'SEO', client: 'CODELYTIX Technologies', industry: 'Technology',
    short_description: 'SEO for CODELYTIX Technologies, improving how the company is found on Google.', services: ['SEO'] },
  { slug: 'globex-union', title: 'Globex Union', category: 'seo', subcategory: 'SEO', client: 'Globex Union',
    short_description: 'SEO for Globex Union, improving the site’s visibility on Google.', services: ['SEO'] },
  { slug: 'kinderbee-social-media', title: 'KinderBee', category: 'social-media', subcategory: 'Social Media Marketing', client: 'KinderBee', industry: 'Education / Preschool',
    short_description: 'Social media marketing for KinderBee preschool.', services: ['Social Media Marketing'] },
  { slug: 'codelytix-social-media', title: 'CODELYTIX', category: 'social-media', subcategory: 'Social Media Marketing', client: 'CODELYTIX Technologies', industry: 'Technology',
    short_description: 'Social media marketing for CODELYTIX Technologies.', services: ['Social Media Marketing'] },
  { slug: 'nimzliot', title: 'NimzLiot', category: 'social-media', subcategory: 'Social Media Marketing', client: 'NimzLiot',
    short_description: 'Social media marketing for NimzLiot.', services: ['Social Media Marketing'] },
  { slug: 'terranext-global-ventures', title: 'TerraNext Global Ventures', category: 'social-media', subcategory: 'Social Media Marketing', client: 'TerraNext Global Ventures',
    short_description: 'Social media marketing for TerraNext Global Ventures.', services: ['Social Media Marketing'] },
  { slug: 'hi-light-media', title: 'Hi-Light Media', category: 'social-media', subcategory: 'Social Media Marketing', client: 'Hi-Light Media',
    short_description: 'Social media marketing for Hi-Light Media.', services: ['Social Media Marketing'] },
];

let seeded = null;
function ensureSeed() {
  seeded ||= (async () => {
    for (const [i, c] of SEED_CATEGORIES.entries()) {
      await q('INSERT INTO portfolio_categories (slug, name, short_name, empty_text, display_order) VALUES (?, ?, ?, ?, ?) ON CONFLICT (slug) DO NOTHING', [c.slug, c.name, c.short_name, c.empty_text, i + 1]);
    }
    if (await store.getSetting('portfolio_cms_seeded', null)) return migrateCategoriesV2();
    for (const [i, p] of SEED_PROJECTS.entries()) {
      const r = clean(p);
      await q(`INSERT INTO portfolio_projects (id, title, slug, category, subcategory, client, industry, location, year, short_description, description,
        services, technologies, project_url, admin_url, challenge, solution, results, case_sections, featured, published, display_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?, ?, ?, ?, ?::jsonb, ?, TRUE, ?) ON CONFLICT (slug) DO NOTHING`,
      [store.newId(), r.title, r.slug, r.category, r.subcategory, r.client, r.industry, r.location, r.year, r.short_description, r.description,
        JSON.stringify(r.services), JSON.stringify(r.technologies), r.project_url, r.admin_url, r.challenge, r.solution, r.results, JSON.stringify(r.case_sections), r.featured, i + 1]);
    }
    await store.setSetting('portfolio_cms_seeded', new Date().toISOString());
    await migrateCategoriesV2();
  })().then(migrateRestructureV3).catch((e) => { seeded = null; throw e; });
  return seeded;
}

// One-time (Oct 2026): five categories — Websites, SEO, Social Media, Ads Report,
// UI/UX Design. The old "Featured Projects" category is retired: its projects
// move to Websites and keep featured = true (the Featured section uses that flag).
export async function migrateCategoriesV2() {
  if (await store.getSetting('portfolio_categories_v2', null)) return;
  await tx(async (c) => {
    await c.query(`UPDATE portfolio_categories SET name = 'Ads Report', short_name = 'Ads Report', empty_text = 'Ads reports coming soon.' WHERE slug = 'ads-campaigns'`);
    await c.query(`UPDATE portfolio_categories SET name = 'UI/UX Design', short_name = 'UI/UX Design', empty_text = 'UI/UX design projects coming soon.' WHERE slug = 'ui-ux'`);
    await c.query(`UPDATE portfolio_categories SET short_name = 'Social Media' WHERE slug = 'social-media'`);
    if ((await c.query(`SELECT 1 FROM portfolio_categories WHERE slug = 'websites'`)).rows.length) {
      await c.query(`UPDATE portfolio_projects SET category = 'websites', featured = TRUE, updated_at = NOW() WHERE category = 'featured-projects'`);
      await c.query(`DELETE FROM portfolio_categories WHERE slug = 'featured-projects'`);
    }
  });
  await store.setSetting('portfolio_categories_v2', new Date().toISOString());
}

// One-time (Oct 2026): Portfolio = client work only. Products (ATS, AI Quiz,
// To-Do) move to /products; service lists follow the agreed brief; three
// campaign examples are added as unpublished drafts to confirm in the admin.
const PRODUCT_SLUGS = ['to-do-list-website', 'ats-system', 'ai-quiz-for-college-students'];
const V3_SERVICES = {
  'carvello-cars': ['Website Design', 'UI/UX', 'WordPress / Web Development', 'Responsive Design'],
  kinderbee: ['Website Design', 'UI/UX', 'SEO-ready structure', 'Responsive Development'],
  'click2client-media': ['UI/UX', 'Website Development', 'Conversion-focused design', 'SEO structure'],
  'kinderbee-seo': ['Technical SEO', 'On-Page SEO', 'Local SEO', 'Keyword Optimization', 'Website SEO Structure'],
  codelytix: ['Technical SEO', 'On-Page SEO', 'Schema', 'Search Console', 'SEO Strategy'],
  'globex-union': ['SEO Strategy', 'Keyword Research', 'On-Page Optimization', 'Content Optimization'],
};
const ADS_DRAFTS = [
  { slug: 'meta-advertising-campaign', title: 'Meta Advertising Campaign', objective: 'Lead Generation', platform: 'Meta (Facebook & Instagram)' },
  { slug: 'website-development-campaign', title: 'Website Development Campaign', objective: 'Lead Generation', platform: 'Meta / Google' },
  { slug: 'photography-wedding-campaign', title: 'Photography / Wedding Campaign', objective: 'Local Lead Generation', platform: 'Meta (Facebook & Instagram)' },
];
export async function migrateRestructureV3() {
  if (await store.getSetting('portfolio_restructure_v3', null)) return;
  await tx(async (c) => {
    await c.query(`UPDATE portfolio_categories SET name = 'Ads Campaigns', short_name = 'Ads Campaigns', empty_text = 'Campaign case studies coming soon.' WHERE slug = 'ads-campaigns'`);
    await c.query(`UPDATE portfolio_categories SET name = 'UI/UX', short_name = 'UI/UX', empty_text = 'UI/UX case studies coming soon.' WHERE slug = 'ui-ux'`);
    // Products leave the portfolio: removed if untouched, otherwise kept as hidden drafts.
    await c.query(`DELETE FROM portfolio_projects p WHERE p.slug = ANY($1) AND p.cover_image IS NULL
      AND NOT EXISTS (SELECT 1 FROM portfolio_project_images i WHERE i.project_id = p.id)`, [PRODUCT_SLUGS]);
    await c.query('UPDATE portfolio_projects SET published = FALSE, featured = FALSE, updated_at = NOW() WHERE slug = ANY($1)', [PRODUCT_SLUGS]);
    for (const [slug, services] of Object.entries(V3_SERVICES)) {
      await c.query('UPDATE portfolio_projects SET services = $1::jsonb, updated_at = NOW() WHERE slug = $2', [JSON.stringify(services), slug]);
    }
    await c.query(`UPDATE portfolio_projects SET subcategory = 'Agency Website' WHERE slug = 'click2client-media'`);
    // "Featured" now means "shown first in Selected Work on the home page".
    await c.query(`UPDATE portfolio_projects SET featured = (slug = 'carvello-cars')`);
    const n = (await c.query('SELECT COALESCE(MAX(display_order), 0) AS n FROM portfolio_projects')).rows[0].n;
    for (const [i, a] of ADS_DRAFTS.entries()) {
      await c.query(`INSERT INTO portfolio_projects (id, title, slug, category, subcategory, short_description, services, details, featured, published, display_order)
        VALUES ($1, $2, $3, 'ads-campaigns', 'Performance Marketing', $4, $5::jsonb, $6::jsonb, FALSE, FALSE, $7) ON CONFLICT (slug) DO NOTHING`,
      [store.newId(), a.title, a.slug, `A ${a.objective.toLowerCase()} campaign — strategy, creatives, audience targeting and setup.`,
        JSON.stringify(['Campaign Strategy', 'Creative Development', 'Audience Targeting', 'Campaign Setup']),
        JSON.stringify([{ label: 'Platform', value: a.platform }, { label: 'Objective', value: a.objective }]), Number(n) + i + 1]);
    }
  });
  await store.setSetting('portfolio_restructure_v3', new Date().toISOString());
}

// ── Validation ───────────────────────────────────────────────────────────
const txt = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);
export const slugify = (s) => txt(s, 100).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const bad = (message, status = 400) => Object.assign(new Error(message), { status });
const url = (v, label) => {
  const u = txt(v, 600);
  if (u && !/^(https?:\/\/[^\s<>"]+|\/[^\s<>"]*)$/i.test(u)) throw bad(`${label} must be a full link starting with https:// (or / for a page on this site).`);
  return u;
};
const tags = (v, max = 12) => [...new Set((Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => txt(x, 40)).filter(Boolean))].slice(0, max);
const pairs = (v) => (Array.isArray(v) ? v : []).slice(0, 12)
  .map((x) => ({ label: txt(x?.label, 40), value: txt(x?.value, 120) })).filter((x) => x.label && x.value);
const RESERVED = new Set(['featured']);

function clean(b) {
  const title = txt(b.title, 120);
  if (!title) throw bad('Project name is required.');
  const slug = slugify(b.slug || title);
  if (!slug) throw bad('Slug is required.');
  if (RESERVED.has(slug)) throw bad(`“${slug}” is reserved — please choose another slug.`);
  const short = txt(b.short_description, 300);
  if (!short) throw bad('Short description is required.');
  return {
    title, slug, short_description: short,
    category: txt(b.category, 60),
    subcategory: txt(b.subcategory, 80), client: txt(b.client, 120), industry: txt(b.industry, 80), location: txt(b.location, 80), year: txt(b.year, 10),
    description: txt(b.description, 8000), challenge: txt(b.challenge, 4000), solution: txt(b.solution, 4000), results: txt(b.results, 4000), testimonial: txt(b.testimonial, 1500),
    services: tags(b.services), technologies: tags(b.technologies),
    cover_image: url(b.cover_image, 'Cover image'), logo: url(b.logo, 'Logo'),
    project_url: url(b.project_url, 'Project URL'), admin_url: url(b.admin_url, 'Admin URL'),
    case_sections: (Array.isArray(b.case_sections) ? b.case_sections : []).slice(0, 15)
      .map((s) => ({ heading: txt(s?.heading, 120), body: txt(s?.body, 4000), image: url(s?.image, 'Section image') }))
      .filter((s) => s.heading || s.body || s.image),
    details: pairs(b.details), metrics: pairs(b.metrics),
    gallery: (Array.isArray(b.gallery) ? b.gallery : []).slice(0, 40)
      .map((g) => ({ url: url(typeof g === 'string' ? g : g?.url, 'Gallery image'), alt: txt(g?.alt, 200) }))
      .filter((g) => g.url),
    featured: Boolean(b.featured), published: b.published === undefined ? true : Boolean(b.published),
    display_order: Number.isFinite(+b.display_order) && b.display_order !== '' && b.display_order != null ? Math.max(0, Math.min(100000, Math.round(+b.display_order))) : null,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────
const iso = (d) => (d instanceof Date ? d.toISOString() : d ? String(d) : null);
const row = (r) => r && ({
  ...r, services: r.services || [], technologies: r.technologies || [], case_sections: r.case_sections || [], details: r.details || [], metrics: r.metrics || [],
  featured: Boolean(r.featured), published: Boolean(r.published), display_order: Number(r.display_order), created_at: iso(r.created_at), updated_at: iso(r.updated_at),
});

export async function listCategories() {
  await ensureSeed();
  return (await q(`SELECT c.*, COUNT(p.id)::int AS total, COUNT(p.id) FILTER (WHERE p.published)::int AS published
    FROM portfolio_categories c LEFT JOIN portfolio_projects p ON p.category = c.slug GROUP BY c.slug ORDER BY c.display_order, c.name`))
    .map((c) => ({ ...c, display_order: Number(c.display_order), total: Number(c.total), published: Number(c.published) }));
}

export async function listProjects({ publishedOnly = true } = {}) {
  await ensureSeed();
  return (await q(`SELECT * FROM portfolio_projects ${publishedOnly ? 'WHERE published' : ''} ORDER BY display_order, created_at`)).map(row);
}

async function withGallery(p) {
  if (!p) return null;
  p.gallery = (await q('SELECT image_url AS url, alt_text AS alt FROM portfolio_project_images WHERE project_id = ? ORDER BY display_order, created_at', [p.id]))
    .map((g) => ({ url: g.url, alt: g.alt || '' }));
  return p;
}
export async function getProject(id) { await ensureSeed(); return withGallery(row(await one('SELECT * FROM portfolio_projects WHERE id = ?', [id]))); }
export async function getBySlug(slug) { await ensureSeed(); return withGallery(row(await one('SELECT * FROM portfolio_projects WHERE slug = ?', [slug]))); }

// ── Writes (admin only — routes check the session first) ─────────────────
const COLS = ['title', 'slug', 'category', 'subcategory', 'client', 'industry', 'location', 'year', 'short_description', 'description',
  'services', 'technologies', 'cover_image', 'logo', 'project_url', 'admin_url', 'challenge', 'solution', 'results', 'testimonial',
  'case_sections', 'details', 'metrics', 'featured', 'published'];
const JSONCOLS = new Set(['services', 'technologies', 'case_sections', 'details', 'metrics']);
const val = (r, c) => (JSONCOLS.has(c) ? JSON.stringify(r[c]) : r[c] === '' ? null : r[c]);
const ph = (c, i) => `$${i}${JSONCOLS.has(c) ? '::jsonb' : ''}`;

export async function saveProject(id, body) {
  await ensureSeed();
  const r = clean(body);
  if (!(await one('SELECT slug FROM portfolio_categories WHERE slug = ?', [r.category]))) throw bad('Please choose a category.');
  const clash = await one('SELECT id FROM portfolio_projects WHERE slug = ?', [r.slug]);
  if (clash && clash.id !== id) throw bad(`Another project already uses the URL /portfolio/${r.slug}. Change the slug.`, 409);
  return tx(async (c) => {
    if (id) {
      const exists = await c.query('SELECT id FROM portfolio_projects WHERE id = $1', [id]);
      if (!exists.rows.length) throw bad('Project not found.', 404);
      const sets = COLS.map((col, i) => `${col} = ${ph(col, i + 1)}`).join(', ');
      const params = COLS.map((col) => val(r, col));
      let extra = '';
      if (r.display_order != null) { params.push(r.display_order); extra = `, display_order = $${params.length}`; }
      params.push(id);
      await c.query(`UPDATE portfolio_projects SET ${sets}${extra}, updated_at = NOW() WHERE id = $${params.length}`, params);
    } else {
      id = store.newId();
      const order = r.display_order ?? (await c.query('SELECT COALESCE(MAX(display_order), 0) + 1 AS n FROM portfolio_projects')).rows[0].n;
      const cols = ['id', ...COLS, 'display_order'];
      await c.query(`INSERT INTO portfolio_projects (${cols.join(', ')}) VALUES (${cols.map((col, i) => ph(col, i + 1)).join(', ')})`,
        [id, ...COLS.map((col) => val(r, col)), order]);
    }
    await c.query('DELETE FROM portfolio_project_images WHERE project_id = $1', [id]);
    for (const [i, g] of r.gallery.entries()) {
      await c.query('INSERT INTO portfolio_project_images (id, project_id, image_url, alt_text, display_order) VALUES ($1, $2, $3, $4, $5)', [store.newId(), id, g.url, g.alt || null, i + 1]);
    }
    return id;
  }).then(getProject);
}

export async function setFlags(id, { featured, published }) {
  await ensureSeed();
  const sets = []; const params = [];
  if (featured !== undefined) { params.push(Boolean(featured)); sets.push(`featured = ?`); }
  if (published !== undefined) { params.push(Boolean(published)); sets.push(`published = ?`); }
  if (!sets.length) return getProject(id);
  params.push(id);
  const r = await q(`UPDATE portfolio_projects SET ${sets.join(', ')}, updated_at = NOW() WHERE id = ? RETURNING id`, params);
  if (!r.length) throw bad('Project not found.', 404);
  return getProject(id);
}

export async function duplicateProject(id) {
  const p = await getProject(id);
  if (!p) throw bad('Project not found.', 404);
  let slug = `${p.slug}-copy`;
  for (let n = 2; await one('SELECT 1 FROM portfolio_projects WHERE slug = ?', [slug]); n++) slug = `${p.slug}-copy-${n}`;
  return saveProject(null, { ...p, title: `${p.title} (copy)`, slug, published: false, featured: false, display_order: null });
}

/** Removes the project and its gallery references. The image files stay in
 *  Supabase Storage (they may be used elsewhere) — delete them there if needed. */
export async function deleteProject(id) {
  await ensureSeed();
  const r = await q('DELETE FROM portfolio_projects WHERE id = ? RETURNING id', [id]);
  if (!r.length) throw bad('Project not found.', 404);
}

export async function reorder(ids) {
  await ensureSeed();
  const list = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string'))].slice(0, 1000);
  await tx(async (c) => { for (const [i, pid] of list.entries()) await c.query('UPDATE portfolio_projects SET display_order = $1 WHERE id = $2', [i + 1, pid]); });
}

// Categories
export async function saveCategory(slug, b) {
  await ensureSeed();
  const name = txt(b.name, 60);
  if (!name) throw bad('Category name is required.');
  const fields = [name, txt(b.short_name, 40) || null, txt(b.empty_text, 160) || null];
  if (slug) {
    const r = await q('UPDATE portfolio_categories SET name = ?, short_name = ?, empty_text = ? WHERE slug = ? RETURNING slug', [...fields, slug]);
    if (!r.length) throw bad('Category not found.', 404);
    return slug;
  }
  const newSlug = slugify(b.slug || name);
  if (!newSlug) throw bad('Category name must contain letters or numbers.');
  if (await one('SELECT 1 FROM portfolio_categories WHERE slug = ?', [newSlug])) throw bad('That category already exists.', 409);
  const n = (await one('SELECT COALESCE(MAX(display_order), 0) + 1 AS n FROM portfolio_categories')).n;
  await q('INSERT INTO portfolio_categories (slug, name, short_name, empty_text, display_order) VALUES (?, ?, ?, ?, ?)', [newSlug, ...fields, n]);
  return newSlug;
}
export async function deleteCategory(slug) {
  await ensureSeed();
  const n = Number((await one('SELECT COUNT(*) AS n FROM portfolio_projects WHERE category = ?', [slug])).n);
  if (n) throw bad(`Move or delete the ${n} project${n > 1 ? 's' : ''} in this category first.`, 409);
  await q('DELETE FROM portfolio_categories WHERE slug = ?', [slug]);
}
export async function reorderCategories(slugs) {
  await ensureSeed();
  await tx(async (c) => { for (const [i, s] of (Array.isArray(slugs) ? slugs : []).entries()) await c.query('UPDATE portfolio_categories SET display_order = $1 WHERE slug = $2', [i + 1, String(s)]); });
}

// ── Matching uploaded images to projects by file name ────────────────────
const FOLDER_FOR = { websites: 'websites', seo: 'seo', 'social-media': 'smm', 'ads-campaigns': 'paid ads', 'ui-ux': 'ui', 'featured-projects': 'featured' };
const ownFolder = (project, file) => [FOLDER_FOR[project.category], project.featured && 'featured'].some((k) => k && norm(file.folder).includes(k));
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter((t) => t.length >= 3 && !['the', 'and', 'for', 'website', 'media', 'system', 'list'].includes(t));
/** Best file for a project: name contains the project/client words; same-category folder wins ties. */
/** Only files in the project's own category folder count (an SMM project never takes an SEO image). */
export function matchScore(project, file) {
  if (!ownFolder(project, file)) return 0;
  const name = norm(file.name.replace(/\.[a-z0-9]+$/i, ''));
  const words = [...new Set([...tokens(project.title), ...tokens(project.client)])];
  let hits = words.filter((w) => name.includes(w)).length;
  const compact = (v) => norm(v).replace(/ /g, '');
  if (compact(project.title).length >= 5 && compact(name).includes(compact(project.title))) hits += 1; // "To-Do List" → todolist
  return hits ? hits * 10 + 5 : 0;
}
/** Sets a cover for every project that has none, from the best-matching file. */
/** Also fills an empty gallery when several files in the project's own folder match it. */
export async function autoMatchCovers(files) {
  const projects = await listProjects({ publishedOnly: false });
  const done = [];
  for (const p of projects) {
    const ranked = files.map((f) => [matchScore(p, f), f]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
    if (!ranked.length) continue;
    if (!p.cover_image) {
      await q('UPDATE portfolio_projects SET cover_image = ?, updated_at = NOW() WHERE id = ?', [ranked[0][1].url, p.id]);
      done.push({ project: p.title, slug: p.slug, file: ranked[0][1].path });
    }
    const own = ranked.filter(([s]) => s % 10 === 5).map(([, f]) => f); // same-category folder
    const hasGallery = await one('SELECT 1 FROM portfolio_project_images WHERE project_id = ? LIMIT 1', [p.id]);
    if (own.length >= 2 && !hasGallery) {
      for (const [i, f] of own.slice(0, 20).entries()) {
        await q('INSERT INTO portfolio_project_images (id, project_id, image_url, alt_text, display_order) VALUES (?, ?, ?, ?, ?)', [store.newId(), p.id, f.url, `${p.title} — ${f.name.replace(/\.[a-z0-9]+$/i, '')}`, i + 1]);
      }
    }
  }
  return done;
}

// Runs once, in the background, the first time the site starts with Supabase
// connected — so uploaded images appear without any admin clicks. Images the
// admin already chose are never replaced.
let autoRan = false;
export function autoMatchOnce(listMedia, configured) {
  if (autoRan || !configured) return;
  autoRan = true;
  (async () => {
    if (await store.getSetting('portfolio_auto_media_v3', null)) return;
    const files = await listMedia({ fresh: true });
    // The first automatic run could match across folders (e.g. an SEO image on a
    // Social Media project). Clear any bucket cover that is in the wrong folder for
    // its project's category, then match again within the right folders.
    const cleared = [];
    for (const p of await listProjects({ publishedOnly: false })) {
      const f = files.find((x) => x.url === p.cover_image);
      if (f && !ownFolder(p, f)) {
        await q('UPDATE portfolio_projects SET cover_image = NULL, updated_at = NOW() WHERE id = ?', [p.id]);
        cleared.push(p.slug);
      }
    }
    const matched = await autoMatchCovers(files);
    await store.setSetting('portfolio_auto_media_v3', { at: new Date().toISOString(), cleared, matched });
    console.log(`[portfolio] matched Supabase images to ${matched.length} project(s)`);
  })().catch((e) => { autoRan = false; console.error('[portfolio] auto image match skipped —', e.message); });
}

// ── Public HTML ──────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hue = (s) => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const initials = (s) => String(s).replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'C2';
const catName = (cats, slug) => cats.find((c) => c.slug === slug)?.name || '';

function media(p, { eager = false, cls = '' } = {}) {
  if (p.cover_image) return `<img class="wk-img ${cls}" src="${esc(p.cover_image)}" alt="${esc(p.title)}${p.industry ? ` — ${esc(p.industry)}` : ''} project by Click2Client Media" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  return `<div class="wk-img wk-ph ${cls}" style="--h:${hue(p.client || p.title)}" role="img" aria-label="${esc(p.title)}"><span>${esc(initials(p.client || p.title))}</span></div>`;
}
const kicker = (p, cats) => p.subcategory || catName(cats, p.category);
const detail = (p, label) => p.details.find((d) => d.label.toLowerCase() === label.toLowerCase())?.value || '';
const host = (u) => (u && /^https?:\/\//.test(u) ? u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') : '');
const tagList = (items, n = 5) => (items.length ? `<ul class="wk-tags">${items.slice(0, n).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '');
const more = (label = 'View Case Study') => `<span class="wk-more" aria-hidden="true">${label} <i>→</i></span>`;
const titleLink = (p, tag = 'h3') => `<${tag}><a href="/portfolio/${esc(p.slug)}">${esc(p.title)}</a></${tag}>`;

/** Simple card — used on the home page, related projects and custom categories. */
export function cardHtml(p, cats) {
  return `<article class="wk-card" data-cat="${esc(p.category)}">
    <div class="wk-media">${media(p)}</div>
    <div class="wk-body">
      <p class="wk-kicker"><span>${esc(kicker(p, cats))}</span>${p.industry ? `<span>${esc(p.industry)}</span>` : ''}</p>
      ${titleLink(p)}<p class="wk-desc">${esc(p.short_description)}</p>${tagList(p.services, 4)}${more()}
    </div>
  </article>`;
}

// ── One layout per category ──────────────────────────────────────────────
const browser = (p, eager) => `<div class="wk-browser"><div class="wk-bar"><i></i><i></i><i></i><span>${esc(host(p.project_url) || `${p.slug}.com`)}</span></div><div class="wk-screen">${media(p, { eager })}</div></div>`;

function websitesHtml(list, cats) {
  const [lead, ...rest] = list;
  const card = (p, big) => `<article class="wkw-card${big ? ' wkw-lead' : ''} reveal">
      ${browser(p, big)}
      <div class="wkw-info">
        <p class="wk-kicker"><span>${esc(kicker(p, cats))}</span>${p.industry ? `<span>${esc(p.industry)}</span>` : ''}</p>
        ${titleLink(p)}
        <p class="wk-desc">${esc(p.short_description)}</p>${tagList(p.services)}${more(p.project_url ? 'View Project' : 'View Case Study')}
      </div>
    </article>`;
  return `${card(lead, true)}${rest.length ? `<div class="wkw-grid">${rest.map((p) => card(p, false)).join('')}</div>` : ''}`;
}

function seoHtml(list, cats) {
  return `<div class="wks-grid">${list.map((p) => `<article class="wks-card reveal">
      <div class="wks-dash">
        <div class="wks-dash-top"><span class="dot"></span><b>${esc(p.client || p.title)}</b><span class="wks-chip">${p.metrics.length ? 'Project results' : 'SEO workspace'}</span></div>
        <div class="wks-shot">${media(p)}</div>
        ${p.metrics.length ? `<div class="wks-metrics">${p.metrics.slice(0, 4).map((m) => `<div><span>${esc(m.label)}</span><b>${esc(m.value)}</b></div>`).join('')}</div>` : ''}
      </div>
      <div class="wk-body">
        <p class="wk-kicker"><span>${esc(kicker(p, cats))}</span>${p.industry ? `<span>${esc(p.industry)}</span>` : ''}</p>
        ${titleLink(p)}<p class="wk-desc">${esc(p.short_description)}</p>
        ${p.services.length ? `<ul class="wks-checks">${p.services.slice(0, 5).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}${more()}
      </div>
    </article>`).join('')}</div>`;
}

function socialHtml(list) {
  const tiles = (p) => {
    const imgs = [p.cover_image, ...p.gallery.map((g) => g.url)].filter(Boolean).filter((u, i, a) => a.indexOf(u) === i);
    if (imgs.length < 3) return `<div class="wkm-feed one">${media(p)}</div>`;
    return `<div class="wkm-feed">${imgs.slice(0, 9).map((u) => `<img src="${esc(u)}" alt="${esc(p.title)} creative" loading="lazy" decoding="async">`).join('')}</div>`;
  };
  return `<div class="wkm-grid">${list.map((p) => `<article class="wkm-card reveal">
      <header class="wkm-head"><span class="wkm-avatar" style="--h:${hue(p.client || p.title)}">${esc(initials(p.client || p.title))}</span><div><b>${esc(p.client || p.title)}</b><span>${esc(p.industry || 'Social Media Marketing')}</span></div></header>
      <div class="wkm-media">${tiles(p)}<div class="wkm-flow" aria-hidden="true"><span>Strategy</span><i>→</i><span>Content</span><i>→</i><span>Design</span><i>→</i><span>Execution</span></div></div>
      <div class="wk-body">${titleLink(p)}<p class="wk-desc">${esc(p.short_description)}</p>${tagList(p.services, 4)}${more()}</div>
    </article>`).join('')}</div>`;
}

function adsHtml(list) {
  const row = (k, v) => (v ? `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>` : '');
  return `<div class="wka-grid">${list.map((p) => `<article class="wka-card reveal">
      <header class="wka-head"><span class="wka-platform">${esc(detail(p, 'Platform') || 'Paid social & search')}</span><span class="wka-status">${p.metrics.length ? 'Results' : 'Campaign'}</span></header>
      ${titleLink(p)}
      <dl class="wka-rows">${row('Campaign', p.subcategory || 'Performance Marketing')}${row('Objective', detail(p, 'Objective'))}${row('Creative', detail(p, 'Creative'))}${row('Audience', detail(p, 'Audience'))}${row('Budget', detail(p, 'Budget'))}</dl>
      ${p.cover_image ? `<div class="wka-creative">${media(p)}</div>` : ''}
      ${p.metrics.length ? `<div class="wka-results">${p.metrics.slice(0, 4).map((m) => `<div><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}</div>`
        : `<div class="wka-scope"><span>What we delivered</span>${tagList(p.services.length ? p.services : ['Campaign Strategy', 'Creative Development', 'Audience Targeting', 'Campaign Setup'], 6)}</div>`}
      ${more()}
    </article>`).join('')}</div>`;
}

function uiuxHtml(list) {
  return `<div class="wku-grid">${list.map((p) => `<article class="wku-card reveal">
      <div class="wku-canvas"><span class="wku-frame-label">▢ ${esc(p.title)}</span><div class="wku-frame">${media(p)}</div></div>
      <div class="wk-body">
        ${titleLink(p)}<p class="wk-desc">${esc(p.short_description)}</p>
        <dl class="wku-meta"><div><dt>Discipline</dt><dd>UI/UX Design</dd></div>${detail(p, 'Platform') ? `<div><dt>Platform</dt><dd>${esc(detail(p, 'Platform'))}</dd></div>` : ''}${detail(p, 'Design Approach') ? `<div><dt>Approach</dt><dd>${esc(detail(p, 'Design Approach'))}</dd></div>` : ''}</dl>${more()}
      </div>
    </article>`).join('')}</div>`;
}

const LAYOUT = { websites: websitesHtml, seo: seoHtml, 'social-media': socialHtml, 'ads-campaigns': adsHtml, 'ui-ux': uiuxHtml };
const INTRO = {
  websites: 'Websites and web platforms designed and built to turn visitors into enquiries.',
  seo: 'Search work that makes businesses easier to find — from technical fixes to on-page content.',
  'social-media': 'Content, creatives and campaigns that give brands a consistent voice on social.',
  'ads-campaigns': 'Performance campaigns planned around one goal: the right leads at the right cost.',
  'ui-ux': 'Interfaces, flows and design systems shaped around how people actually use them.',
};

export async function portfolioVars() {
  const [cats, projects, imgs] = await Promise.all([listCategories(), listProjects(),
    q('SELECT project_id, image_url AS url, alt_text AS alt FROM portfolio_project_images ORDER BY project_id, display_order, created_at')]);
  for (const p of projects) p.gallery = imgs.filter((g) => g.project_id === p.id).map((g) => ({ url: g.url, alt: g.alt || '' }));
  const nav = cats.map((c) => `<button type="button" class="wk-chip" data-filter="${esc(c.slug)}" aria-pressed="false">${esc(c.short_name || c.name)} <span>${c.published}</span></button>`).join('');
  const sections = cats.map((c, i) => {
    const list = projects.filter((p) => p.category === c.slug);
    const body = list.length ? (LAYOUT[c.slug] || ((l) => `<div class="wk-grid">${l.map((p) => cardHtml(p, cats)).join('')}</div>`))(list, cats)
      : `<p class="wk-empty">${esc(c.empty_text || 'No projects here yet.')}</p>`;
    return `<section class="wk-cat wk-cat--${esc(c.slug)}" id="${esc(c.slug)}" data-cat="${esc(c.slug)}" aria-labelledby="h-${esc(c.slug)}">
      <header class="wk-cat-head reveal"><span class="wk-cat-n">${String(i + 1).padStart(2, '0')}</span><div><h2 id="h-${esc(c.slug)}">${esc(c.name)}</h2>${INTRO[c.slug] ? `<p>${esc(INTRO[c.slug])}</p>` : ''}</div><span class="wk-cat-count">${list.length} ${list.length === 1 ? 'project' : 'projects'}</span></header>
      ${body}
    </section>`;
  }).join('');
  const covers = projects.filter((p) => p.cover_image).slice(0, 3);
  return {
    'wk.nav': nav,
    'wk.sections': sections,
    'wk.count': String(projects.length),
    'wk.heroArt': covers.length >= 2 ? `<div class="wk-hero-art" aria-hidden="true">${covers.map((p, i) => `<div class="wk-hero-shot s${i + 1}"><div class="wk-bar"><i></i><i></i><i></i></div><img src="${esc(p.cover_image)}" alt="" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}></div>`).join('')}</div>` : '',
  };
}

/** Compact "Selected Work" block for the home page: featured first, 3–6 projects. */
export async function homeWorkHtml() {
  try {
    const [cats, projects] = await Promise.all([listCategories(), listProjects()]);
    const pick = [...projects.filter((p) => p.featured), ...projects.filter((p) => !p.featured && p.cover_image), ...projects.filter((p) => !p.featured && !p.cover_image)].slice(0, 6);
    if (pick.length < 3) return '';
    return `<section class="section" aria-labelledby="sw-h"><div class="wrap">
      <div class="split-head reveal"><div class="sec-head"><span class="eyebrow">Portfolio</span><h2 id="sw-h">Selected Work</h2></div><p>A look at the websites, search and marketing work we've delivered for our clients.</p></div>
      <div class="wk-grid">${pick.map((p) => cardHtml(p, cats)).join('')}</div>
      <p class="wk-all"><a class="btn outline lg" href="/portfolio">View all projects →</a></p></div></section>`;
  } catch (e) {
    console.error('[portfolio] home section skipped —', e.message);
    return '';
  }
}

export async function projectVars(p, base) {
  const [cats, all] = await Promise.all([listCategories(), listProjects()]);
  const cat = catName(cats, p.category);
  const facts = [['Client', p.client], ['Industry', p.industry], ['Location', p.location], ['Year', p.year], ['Type', p.subcategory && p.subcategory !== cat ? p.subcategory : ''], ...p.details.map((d) => [d.label, d.value])].filter(([, v]) => v);
  const block = (h, body) => (body ? `<section class="wk-block reveal"><h2>${esc(h)}</h2><div class="bl-prose">${formatBody(body)}</div></section>` : '');
  const ext = (u) => !u.startsWith('/');
  const related = [...all.filter((x) => x.id !== p.id && x.category === p.category), ...all.filter((x) => x.id !== p.id && x.category !== p.category && x.cover_image)].slice(0, 3);
  const img = p.cover_image ? (p.cover_image.startsWith('/') ? base + p.cover_image : p.cover_image) : `${base}/img/click2client-media-logo.webp`;
  return {
    'wk.title': esc(p.title),
    'wk.cat': esc(p.subcategory || cat),
    'wk.catSlug': esc(p.category),
    'wk.short': esc(p.short_description),
    'wk.logo': p.logo ? `<img class="wk-logo" src="${esc(p.logo)}" alt="${esc(p.client || p.title)} logo" loading="lazy">` : '',
    'wk.links': [p.project_url && `<a class="btn primary" href="${esc(p.project_url)}"${ext(p.project_url) ? ' target="_blank" rel="noopener"' : ''}>Visit website ↗</a>`,
      p.admin_url && `<a class="btn outline" href="${esc(p.admin_url)}" target="_blank" rel="noopener nofollow">View admin panel ↗</a>`].filter(Boolean).join(''),
    'wk.facts': facts.length || p.services.length || p.technologies.length ? `<dl class="wk-facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}
      ${p.services.length ? `<div class="wide"><dt>Services</dt><dd><ul class="wk-tags">${p.services.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></dd></div>` : ''}
      ${p.technologies.length ? `<div class="wide"><dt>Technologies</dt><dd><ul class="wk-tags">${p.technologies.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></dd></div>` : ''}</dl>` : '',
    'wk.cover': p.cover_image ? `<figure class="wk-cover reveal"><img src="${esc(p.cover_image)}" alt="${esc(p.title)} — ${esc(cat)} project" fetchpriority="high"></figure>` : '',
    'wk.body': [
      block('Overview', p.description), block('The challenge', p.challenge), block('The solution', p.solution),
      ...p.case_sections.map((s) => `<section class="wk-block reveal">${s.heading ? `<h2>${esc(s.heading)}</h2>` : ''}${s.body ? `<div class="bl-prose">${formatBody(s.body)}</div>` : ''}${s.image ? `<figure class="wk-shot"><img src="${esc(s.image)}" alt="${esc(s.heading || p.title)}" loading="lazy"></figure>` : ''}</section>`),
      p.metrics.length ? `<section class="wk-block reveal"><h2>Project results</h2><div class="wk-results">${p.metrics.map((m) => `<div><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}</div></section>` : '',
      block('Project outcome', p.results),
      p.testimonial ? `<blockquote class="wk-quote reveal">“${esc(p.testimonial)}”${p.client ? `<cite>— ${esc(p.client)}</cite>` : ''}</blockquote>` : '',
    ].join(''),
    'wk.gallery': p.gallery.length ? `<section class="wk-gallery reveal" aria-label="Project gallery"><h2>Gallery</h2><div class="wk-gal">${p.gallery.map((g) => `<a href="${esc(g.url)}" target="_blank" rel="noopener"><img src="${esc(g.url)}" alt="${esc(g.alt || p.title)}" loading="lazy"></a>`).join('')}</div></section>` : '',
    'wk.related': related.length ? `<section class="section tint" aria-labelledby="rel-h"><div class="wrap"><div class="split-head reveal"><div class="sec-head"><span class="eyebrow">More work</span><h2 id="rel-h">Related projects</h2></div><p><a href="/portfolio">View all projects →</a></p></div><div class="wk-grid">${related.map((x) => cardHtml(x, cats)).join('')}</div></div></section>` : '',
    'ogImage': esc(img),
    'ogType': 'article',
    'wk.seoTitle': `${p.title} | ${p.subcategory || cat} Case Study | Click2Client Media`,
  };
}

