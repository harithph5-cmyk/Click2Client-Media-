// Click2Client Blog Studio — separate publishing portal.
// Run: npm run studio   (from the repo root)  → http://localhost:4300
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as D from './db.js';
import { analyze } from './analyze.js';
import * as ai from './ai.js';
import * as pub from './publisher.js';
import * as google from './google.js';
import { formatBody, faqHtml } from '../server/md.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));

// ── Auth: one owner account from env; signed, HttpOnly, SameSite=Strict cookie ──
const EMAIL = (process.env.STUDIO_EMAIL || 'owner@studio.local').toLowerCase();
const PASSWORD = process.env.STUDIO_PASSWORD || '';
const SECRET = process.env.STUDIO_SECRET || crypto.randomBytes(32).toString('hex'); // random per start unless set
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const safeEq = (a, b) => crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
if (PASSWORD) {
  const salt = crypto.randomBytes(16).toString('hex');
  D.db.prepare('INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,?,?) ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash').run(crypto.randomUUID(), EMAIL, `${salt}:${hash(PASSWORD, salt)}`, new Date().toISOString());
}
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const session = (req) => {
  const c = /(?:^|;\s*)studio=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const [p, s] = (c || '').split('.');
  if (!p || !s || !safeEq(sign(p), s)) return null;
  const d = JSON.parse(Buffer.from(p, 'base64url').toString());
  return d.x > Date.now() ? d : null;
};
const tries = new Map();
const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => res.status(e.status || 500).json({ error: { message: e.status ? e.message : 'Unexpected server error.', code: e.code } }));
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

app.post('/api/login', h(async (req, res) => {
  const n = (tries.get(req.ip) || 0) + 1; tries.set(req.ip, n); setTimeout(() => tries.delete(req.ip), 15 * 60_000).unref();
  if (n > 10) throw bad('Too many attempts. Try again in 15 minutes.', 429);
  const u = D.db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body?.email || '').toLowerCase());
  const [salt, hh] = (u?.password_hash || ':').split(':');
  if (!PASSWORD || !u || !safeEq(hash(String(req.body?.password || ''), salt), hh)) throw bad('Wrong email or password.', 401);
  const p = Buffer.from(JSON.stringify({ e: u.email, x: Date.now() + 7 * 864e5 })).toString('base64url');
  res.setHeader('Set-Cookie', `studio=${p}.${sign(p)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86400}${req.secure ? '; Secure' : ''}`);
  res.json({ ok: true });
}));
app.post('/api/logout', (req, res) => { res.setHeader('Set-Cookie', 'studio=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); res.json({ ok: true }); });

app.use('/api', (req, res, next) => {
  if (!session(req)) return res.status(401).json({ error: { message: 'Sign in required.', code: 'auth' } });
  if (req.method !== 'GET' && req.get('x-studio') !== '1') return res.status(403).json({ error: { message: 'Bad request origin.' } }); // CSRF guard
  next();
});

// ── Helpers ─────────────────────────────────────────────────────────────
const reconcile = (a) => { // a scheduled post whose time passed is live on the website by the site's own rule
  if (a.status === 'scheduled' && a.publishAt && Date.parse(a.publishAt) <= Date.now()) return D.save(a.id, { status: 'published', publishedAt: a.publishAt });
  return a;
};
const STATIC_PAGES = [['/seo-audit', 'Free SEO audit'], ['/seo-tools', 'Free SEO tools'], ['/services', 'Services'], ['/courses', 'Courses'], ['/portfolio', 'Portfolio'], ['/about', 'About Click2Client Media'], ['/enquire', 'Book a consultation']].map(([url, title]) => ({ url, title }));
async function sitePages() {
  const posts = await pub.list().then((r) => r.posts.filter((p) => p.status === 'published').map((p) => ({ url: `/blog/${p.id}`, title: p.title }))).catch(() => []);
  return [...STATIC_PAGES, ...posts];
}
const need = (a, ...f) => { const m = f.filter((k) => !String(a[k] || '').trim()); if (m.length) throw bad(`Missing: ${m.join(', ')}.`); };

// ── State / dashboard ───────────────────────────────────────────────────
app.get('/api/state', h(async (req, res) => res.json({ site: pub.siteBase(), providers: ai.providers(), publisher: pub.configured(), google: google.configured(), categories: D.categories(), settings: { gscSite: D.getSetting('gsc_site'), ga4: D.getSetting('ga4_property') } })));

app.post('/api/publish-test', h(async (req, res) => res.json(await pub.ping().catch((e) => { throw bad(e.message, 502); }))));

app.get('/api/dashboard', h(async (req, res) => {
  const all = D.all().map(reconcile);
  const c = (f) => all.filter(f).length;
  res.json({
    total: all.length, published: c((a) => a.status === 'published'), drafts: c((a) => a.status === 'draft'), scheduled: c((a) => a.status === 'scheduled'),
    review: c((a) => a.status === 'review'), needsUpdate: c((a) => a.needsUpdate),
    recent: all.slice(0, 6).map(({ id, title, status, updatedAt, keyword, publishedUrl }) => ({ id, title, status, updatedAt, keyword, publishedUrl })),
    upcoming: D.calendar().filter((x) => x.planned_date >= new Date().toISOString().slice(0, 10)).slice(0, 6),
    activity: D.history(null, 6),
  });
}));

// ── Articles ────────────────────────────────────────────────────────────
app.get('/api/articles', h(async (req, res) => res.json({ articles: D.all().map(reconcile).map((a) => ({ ...a, image: a.image ? 'yes' : '', body: undefined, scores: ((r) => ({ seo: r.seo.score, aeo: r.aeo.score, geo: r.geo.score }))(analyze({ ...a, body: D.load(a.id).body }, pub.siteBase())) })) })));
app.post('/api/articles', h(async (req, res) => res.status(201).json(D.create(req.body || {}))));
app.get('/api/articles/:id', h(async (req, res) => { const a = D.load(req.params.id); if (!a) throw bad('Not found.', 404); res.json(reconcile(a)); }));
app.put('/api/articles/:id', h(async (req, res) => {
  const b = req.body || {};
  if (b.slug && D.slugTaken(D.slugify(b.slug), req.params.id)) throw bad('Another article already uses this slug.');
  if (b.image && !/^data:image\/(png|jpeg|webp);base64,/.test(b.image)) throw bad('Featured image must be a PNG, JPG or WebP.');
  if (b.image && b.image.length > 1_300_000) throw bad('Featured image is too large (max ~1 MB).');
  const a = D.save(req.params.id, b);
  if (!a) throw bad('Not found.', 404);
  res.json(a);
}));
app.delete('/api/articles/:id', h(async (req, res) => {
  const a = D.load(req.params.id);
  if (!a) throw bad('Not found.', 404);
  if (req.query.remote === '1' && a.remoteSlug) {
    try { await pub.remove(a.remoteSlug); D.logHistory(a.id, 'delete', true, 'Deleted from website', a.publishedUrl); } catch (e) { D.logHistory(a.id, 'delete', false, e.message); throw bad(`Not deleted — the website said: ${e.message}`, 502); }
  }
  D.remove(a.id);
  res.json({ ok: true });
}));
app.get('/api/articles/:id/revisions', h(async (req, res) => res.json({ revisions: D.revisions(req.params.id) })));
app.post('/api/articles/:id/restore', h(async (req, res) => { const a = D.restoreRevision(req.params.id, Number(req.body?.revisionId)); if (!a) throw bad('Revision not found.', 404); res.json(a); }));

app.post('/api/analyze', h(async (req, res) => res.json(analyze({ title: '', slug: '', body: '', metaTitle: '', metaDescription: '', author: '', canonical: '', imageAlt: '', keyword: '', tags: [], faqs: [], manual: {}, ...req.body }, pub.siteBase()))));

// ── AI ──────────────────────────────────────────────────────────────────
const prov = (b) => (['openai', 'gemini'].includes(b?.provider) ? b.provider : ai.providers().openai ? 'openai' : 'gemini');
app.post('/api/ai/generate', h(async (req, res) => {
  const b = req.body || {};
  need(b, 'topic', 'keyword');
  const r = await ai.generate(prov(b), { ...b, sitePages: await sitePages() });
  let slug = D.slugify(r.slug || r.title);
  for (let i = 2; D.slugTaken(slug, ''); i++) slug = `${D.slugify(r.slug || r.title)}-${i}`;
  const a = D.create({
    topic: b.topic, keyword: b.keyword, secondary: b.secondary || (r.keywords || []).join(', '), intent: b.intent, audience: b.audience,
    title: r.title, slug, metaTitle: r.metaTitle, metaDescription: r.metaDescription, excerpt: r.excerpt, body: r.body, faqs: r.faqs, tags: r.tags, category: r.category, author: 'Hari',
    manual: { ai: { outline: r.outline, keywords: r.keywords, internalLinks: r.internalLinks, externalSources: r.externalSources, needsSources: r.needsSources, provider: prov(b) } },
  });
  res.status(201).json(a);
}));
app.post('/api/ai/rewrite', h(async (req, res) => { need(req.body, 'section'); res.json(await ai.rewrite(prov(req.body), req.body)); }));
app.post('/api/ai/faqs', h(async (req, res) => res.json(await ai.faqs(prov(req.body), req.body))));
app.post('/api/ai/improve', h(async (req, res) => res.json(await ai.improve(prov(req.body), req.body))));

// ── Publish / export ────────────────────────────────────────────────────
app.post('/api/articles/:id/publish', h(async (req, res) => {
  const a = D.load(req.params.id);
  if (!a) throw bad('Not found.', 404);
  const mode = ['publish', 'draft', 'schedule'].includes(req.body?.mode) ? req.body.mode : 'publish';
  need(a, 'title', 'slug', 'body');
  if (mode !== 'draft') need(a, 'metaDescription');
  const publishAt = mode === 'schedule' ? new Date(req.body.publishAt).toISOString() : '';
  if (mode === 'schedule' && !(Date.parse(publishAt) > Date.now())) throw bad('Choose a schedule time in the future.');
  const action = mode === 'schedule' ? 'schedule' : mode === 'draft' ? 'save-draft' : a.remoteSlug ? 'update' : 'publish';
  try {
    const r = await pub.push({ ...a, canonical: a.canonical || `${pub.siteBase()}/blog/${a.slug}` }, mode, publishAt);
    const status = mode === 'publish' ? 'published' : mode === 'schedule' ? 'scheduled' : 'draft';
    const saved = D.save(a.id, { status, publishAt, publishedUrl: mode === 'draft' ? '' : r.url, remoteSlug: a.slug, ...(mode === 'publish' ? { publishedAt: new Date().toISOString(), calendarDone: true, canonical: a.canonical || `${pub.siteBase()}/blog/${a.slug}` } : {}), ...(mode === 'schedule' ? { plannedDate: publishAt.slice(0, 10) } : {}) });
    D.logHistory(a.id, action, true, r.verified === false ? 'Accepted by website, but the live URL did not load yet' : 'Confirmed by website', r.url);
    res.json({ ok: true, action, url: r.url, verified: r.verified, article: saved });
  } catch (e) {
    D.logHistory(a.id, action, false, e.message);
    res.status(e.status || 502).json({ error: { message: e.message, code: e.code, exportAvailable: true,
      help: e.code === 'not_configured' || e.code === 'api_missing' ? 'Nothing was published. Deploy the website with server/blog-api.js, set BLOG_API_TOKEN there and here, or use Export and add the article to the website by hand.' : 'Nothing was published.' } });
  }
}));

app.get('/api/articles/:id/export', h(async (req, res) => {
  const a = D.load(req.params.id);
  if (!a) throw bad('Not found.', 404);
  const f = req.query.format;
  const name = a.slug || 'article';
  const dl = (type, ext, body) => res.set({ 'content-type': type, 'content-disposition': `attachment; filename="${name}.${ext}"` }).send(body);
  if (f === 'json') return dl('application/json', 'json', JSON.stringify({ ...a, image: a.image ? '(embedded image omitted)' : '' }, null, 2));
  if (f === 'md') return dl('text/markdown', 'md', `---\ntitle: ${JSON.stringify(a.title)}\nslug: ${a.slug}\nmeta_title: ${JSON.stringify(a.metaTitle)}\nmeta_description: ${JSON.stringify(a.metaDescription)}\ncanonical: ${a.canonical}\ncategory: ${a.category}\ntags: ${a.tags.join(', ')}\nauthor: ${a.author}\n---\n\n${a.body}\n\n${a.faqs.length ? '## Frequently asked questions\n\n' + a.faqs.map((x) => `### ${x.q}\n${x.a}`).join('\n\n') : ''}\n`);
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ld = JSON.stringify(analyze(a, pub.siteBase()).schema).replace(/</g, '\\u003c');
  return dl('text/html', 'html', `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(a.metaTitle || a.title)}</title><meta name="description" content="${esc(a.metaDescription)}"><link rel="canonical" href="${esc(a.canonical || `${pub.siteBase()}/blog/${a.slug}`)}"><script type="application/ld+json">${ld}</script></head><body><article><h1>${esc(a.title)}</h1>${formatBody(a.body)}${faqHtml(a.faqs)}</article></body></html>`);
}));
app.get('/api/history', h(async (req, res) => res.json({ history: D.history(req.query.article || null, 100) })));

// ── Calendar ────────────────────────────────────────────────────────────
app.get('/api/calendar', h(async (req, res) => res.json({ items: D.calendar(), done: D.history(null, 100).filter((x) => x.ok && ['publish', 'update', 'schedule'].includes(x.action)) })));
app.put('/api/calendar/:id', h(async (req, res) => { // plan / reschedule
  const a = D.load(req.params.id);
  if (!a) throw bad('Not found.', 404);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || '')) throw bad('Pick a valid date.');
  if (a.status === 'scheduled') { // the website holds the schedule: move it there too, or fail loudly
    const at = new Date(`${req.body.date}T${(a.publishAt || '').slice(11, 16) || '09:00'}:00Z`).toISOString();
    if (Date.parse(at) <= Date.now()) throw bad('A scheduled article must move to a future time.');
    const r = await pub.push(a, 'schedule', at).catch((e) => { throw bad(`Not rescheduled — the website said: ${e.message}`, 502); });
    D.logHistory(a.id, 'schedule', true, 'Rescheduled', r.url);
    return res.json(D.save(a.id, { plannedDate: req.body.date, publishAt: at }));
  }
  res.json(D.save(a.id, { plannedDate: req.body.date }));
}));

// ── Settings / Google ───────────────────────────────────────────────────
app.put('/api/settings', h(async (req, res) => { D.setSetting('gsc_site', req.body?.gscSite || ''); D.setSetting('ga4_property', req.body?.ga4 || ''); res.json({ ok: true }); }));
const needGoogle = (k) => { if (!google.configured()) throw bad('Google service account is not configured (see blog-studio/.env.example).', 409); if (!D.getSetting(k)) throw bad(k === 'gsc_site' ? 'Set your Search Console property in Settings first.' : 'Set your GA4 property ID in Settings first.', 409); };
app.get('/api/google/performance', h(async (req, res) => { needGoogle('gsc_site'); res.json({ rows: await google.searchPerformance(D.getSetting('gsc_site'), { page: req.query.page || undefined }) }); }));
app.get('/api/google/inspect', h(async (req, res) => { needGoogle('gsc_site'); const u = String(req.query.url || ''); if (!u.startsWith(pub.siteBase())) throw bad('Only URLs on your own site can be inspected.'); res.json(await google.inspectUrl(D.getSetting('gsc_site'), u)); }));
app.get('/api/google/organic', h(async (req, res) => { needGoogle('ga4_property'); res.json({ rows: await google.organicLandingPages(D.getSetting('ga4_property'), { pagePath: req.query.path || undefined }) }); }));

app.use('/api', (req, res) => res.status(404).json({ error: { message: 'Unknown API route.' } }));
// Static: the portal UI, plus the website's own Markdown renderer so the preview matches production.
app.get('/md.js', (req, res) => res.type('text/javascript').sendFile(path.join(here, '..', 'server', 'md.js')));
app.use(express.static(path.join(here, 'public'), { index: 'index.html', maxAge: 0 }));

export default app;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!PASSWORD) { console.error('Set STUDIO_PASSWORD in blog-studio/.env before starting (see .env.example).'); process.exit(1); }
  const port = Number(process.env.STUDIO_PORT || 4300);
  app.listen(port, process.env.STUDIO_HOST || '127.0.0.1', () => console.log(`Blog Studio → http://localhost:${port}\n  AI: ${JSON.stringify(ai.providers())}  Publishing API: ${pub.configured() ? 'token set' : 'NOT configured (export only)'}  Google: ${google.configured() ? 'configured' : 'off'}`));
}
