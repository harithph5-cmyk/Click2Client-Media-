// Free SEO tools (/seo-tools). One registry drives the hub page, each tool's
// landing page and the API. Live tools reuse the audit engine's safe fetcher
// (public hosts only, size/time limits) and parser. Tools that need paid data
// sources or AI are listed as "coming soon" until they are built.

import { normalizeInputUrl, safeFetch, checkStatus, pool, AuditInputError } from './lib/net.js';
import { parsePage } from './engine/parse.js';
import { fetchRobots, isAllowed } from './engine/robots.js';
import { analyzeSitemaps } from './engine/sitemap.js';

export const CATEGORIES = [
  { id: 'on-page', n: '01', name: 'On-Page SEO Tools', intro: 'Check and fix the parts of a page search engines read first.' },
  { id: 'keyword', n: '02', name: 'Keyword Research Tools', intro: 'Find, group and plan the words your customers search for.' },
  { id: 'technical', n: '03', name: 'Technical SEO Tools', intro: 'Speed, crawling, redirects and the files search engines rely on.' },
  { id: 'local', n: '04', name: 'Local SEO Toolkit', intro: 'Tools to help local businesses get discovered.', star: true },
  { id: 'backlink', n: '05', name: 'Backlink & Off-Page Tools', intro: 'Understand the links pointing to a website.' },
  { id: 'ai', n: '06', name: 'AI SEO Tools', intro: 'AI help for titles, briefs, FAQs and content.' },
  { id: 'geo', n: '07', name: 'GEO & AI Search Tools', intro: 'Is your brand visible to AI? See how prepared your website is for ChatGPT, Gemini, Perplexity and the next generation of search.', star: true },
];

const T = (cat, slug, name, desc, run) => ({ cat, slug, name, desc, live: Boolean(run), run });
const soon = (cat, names) => names.map((name) => T(cat, null, name, ''));

// ── Shared helpers ───────────────────────────────────────────────────────
const bad = (message) => Object.assign(new Error(message), { status: 400 });
const check = (status, label, detail = '') => ({ status, label, detail });
async function loadPage(input) {
  const url = normalizeInputUrl(input);
  const res = await safeFetch(url.toString());
  if (!res.ok) throw bad(res.error?.message || 'Could not load that page.');
  if (!/html/i.test(res.headers['content-type'] || '')) throw bad(`That address returned ${res.headers['content-type'] || 'a non-HTML file'}, not a web page.`);
  return { url: res.url, res, page: parsePage(res.body, res.url) };
}
const len = (s) => (s ? [...s].length : 0);
const score = (checks) => {
  const graded = checks.filter((c) => c.status !== 'info');
  if (!graded.length) return null;
  return Math.round((100 * graded.reduce((n, c) => n + (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0)) / graded.length);
};

function titleChecks(p) {
  const t = p.title.text; const n = len(t);
  return [
    !t ? check('fail', 'Title tag', 'Missing — every page needs a unique <title>.')
      : n < 30 ? check('warn', 'Title tag', `${n} characters — short. Aim for 50–60.`)
      : n > 60 ? check('warn', 'Title tag', `${n} characters — may be cut off in Google. Aim for 50–60.`)
      : check('pass', 'Title tag', `${n} characters — a good length.`),
    p.title.values.length > 1 ? check('warn', 'Multiple title tags', `${p.title.values.length} found — keep one.`) : null,
  ].filter(Boolean);
}
function descChecks(p) {
  const d = p.metaDescription.text; const n = len(d);
  return [
    !d ? check('fail', 'Meta description', 'Missing — Google will pick text from the page instead.')
      : n < 70 ? check('warn', 'Meta description', `${n} characters — short. Aim for 120–160.`)
      : n > 160 ? check('warn', 'Meta description', `${n} characters — may be cut off. Aim for 120–160.`)
      : check('pass', 'Meta description', `${n} characters — a good length.`),
    p.metaDescription.values.length > 1 ? check('warn', 'Multiple meta descriptions', `${p.metaDescription.values.length} found — keep one.`) : null,
  ].filter(Boolean);
}
function headingChecks(p) {
  const h1 = p.headings.h1.filter(Boolean);
  const out = [h1.length === 0 ? check('fail', 'H1 heading', 'No H1 — add one main heading that says what the page is about.')
    : h1.length > 1 ? check('warn', 'H1 heading', `${h1.length} H1 headings — usually one is clearest.`)
    : check('pass', 'H1 heading', `“${h1[0].slice(0, 90)}”`)];
  let prev = 0; const skips = [];
  for (const h of p.headingOrder) { if (prev && h.level > prev + 1) skips.push(`H${prev} → H${h.level}`); prev = h.level; }
  out.push(skips.length ? check('warn', 'Heading order', `Skipped levels: ${[...new Set(skips)].slice(0, 5).join(', ')}.`) : check('pass', 'Heading order', 'No skipped levels.'));
  const empty = p.headingOrder.filter((h) => !h.text).length;
  if (empty) out.push(check('warn', 'Empty headings', `${empty} heading tag(s) with no text.`));
  return out;
}
function imageChecks(p) {
  const imgs = p.images;
  const missing = imgs.filter((i) => i.alt === null).length;
  if (!imgs.length) return [check('info', 'Images', 'No images found on this page.')];
  return [missing ? check(missing > imgs.length / 2 ? 'fail' : 'warn', 'Image ALT text', `${missing} of ${imgs.length} images have no alt attribute.`) : check('pass', 'Image ALT text', `All ${imgs.length} images have an alt attribute.`)];
}
function canonicalChecks(p, url) {
  const c = p.canonicals;
  if (!c.length) return [check('warn', 'Canonical URL', 'No canonical tag — add one pointing to the preferred URL.')];
  if (c.length > 1) return [check('fail', 'Canonical URL', `${c.length} canonical tags — search engines may ignore them all.`)];
  const self = c[0].resolved && c[0].resolved.replace(/\/$/, '') === url.replace(/\/$/, '');
  return [check(self ? 'pass' : 'info', 'Canonical URL', self ? 'Points to this page.' : `Points to ${c[0].resolved || c[0].raw}.`)];
}
function siteBasics(p, url) {
  const noindex = p.metaRobots.some((m) => /noindex/i.test(m));
  return [
    check(url.startsWith('https:') ? 'pass' : 'fail', 'HTTPS', url.startsWith('https:') ? 'The page is served securely.' : 'Not served over HTTPS.'),
    check(noindex ? 'fail' : 'pass', 'Indexable', noindex ? 'A robots meta tag says noindex — Google will not show this page.' : 'No noindex tag found.'),
    check(p.viewport ? 'pass' : 'fail', 'Mobile viewport', p.viewport ? 'Viewport tag present.' : 'No viewport tag — the page may not display well on phones.'),
    check(p.lang ? 'pass' : 'warn', 'Language', p.lang ? `lang="${p.lang}"` : 'No lang attribute on <html>.'),
    check(p.og['og:title'] && p.og['og:image'] ? 'pass' : 'warn', 'Social sharing (Open Graph)', p.og['og:title'] && p.og['og:image'] ? 'Title and image set.' : 'Missing og:title or og:image — shared links will look plain.'),
    check(p.jsonLd.length ? 'pass' : 'warn', 'Structured data', p.jsonLd.length ? `Found: ${p.jsonLd.slice(0, 6).join(', ')}` : 'No JSON-LD schema found.'),
    check(p.wordCount >= 300 ? 'pass' : 'warn', 'Content length', `${p.wordCount} words${p.wordCount < 300 ? ' — thin pages rarely rank well.' : '.'}`),
  ];
}
function fullCheck(p, url) {
  return [...titleChecks(p), ...descChecks(p), ...headingChecks(p), ...imageChecks(p), ...canonicalChecks(p, url), ...siteBasics(p, url)];
}
const STOP = new Set('a an and are as at be but by for from has have in into is it its of on or our that the their this to was we were will with you your can not all more about also any been more most other out over so than then there these they those up what when which who why how i me my he she him her us them do does did just only very'.split(' '));
function terms(text, n) {
  const words = (text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).filter((w) => w.length > 1);
  const counts = new Map();
  for (let i = 0; i + n <= words.length; i++) {
    const g = words.slice(i, i + n);
    if (STOP.has(g[0]) || STOP.has(g[n - 1]) || g.every((w) => /^\d+$/.test(w))) continue;
    const k = g.join(' ');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return { total: words.length, top: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 15) };
}

// ── Live tools ───────────────────────────────────────────────────────────
async function websiteChecker({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = fullCheck(page, url);
  return { url, score: score(checks), checks };
}
async function scoreChecker(body) {
  const r = await websiteChecker(body);
  const order = { fail: 0, warn: 1, pass: 2, info: 3 };
  r.checks.sort((a, b) => order[a.status] - order[b.status]);
  r.summary = r.score >= 80 ? 'Strong on-page basics. A full audit will find deeper issues across the site.' : r.score >= 50 ? 'Some important basics need attention — start with the red items.' : 'Several core SEO basics are missing. Fixing the red items first will make the biggest difference.';
  return r;
}
async function metaAnalyzer({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = [...titleChecks(page), ...descChecks(page)];
  return { url, score: score(checks), checks, serp: { title: page.title.text || '(no title)', url, description: page.metaDescription.text || '(no meta description — Google will choose text from the page)' } };
}
async function metaGenerator(b) {
  const f = (k, n) => String(b?.[k] ?? '').trim().slice(0, n);
  const title = f('title', 120); const desc = f('description', 300); const url = f('pageUrl', 500); const image = f('image', 500); const site = f('siteName', 80);
  if (!title) throw bad('Enter a page title.');
  const e = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const lines = [`<title>${e(title)}</title>`, desc && `<meta name="description" content="${e(desc)}">`, url && `<link rel="canonical" href="${e(url)}">`,
    `<meta property="og:type" content="website">`, `<meta property="og:title" content="${e(title)}">`, desc && `<meta property="og:description" content="${e(desc)}">`,
    url && `<meta property="og:url" content="${e(url)}">`, image && `<meta property="og:image" content="${e(image)}">`, site && `<meta property="og:site_name" content="${e(site)}">`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${e(title)}">`, desc && `<meta name="twitter:description" content="${e(desc)}">`, image && `<meta name="twitter:image" content="${e(image)}">`].filter(Boolean);
  const checks = [len(title) > 60 ? check('warn', 'Title length', `${len(title)} characters — may be cut off. Aim for 50–60.`) : check('pass', 'Title length', `${len(title)} characters.`),
    !desc ? check('warn', 'Description', 'Add a description of 120–160 characters.') : len(desc) > 160 ? check('warn', 'Description length', `${len(desc)} characters — may be cut off.`) : check('pass', 'Description length', `${len(desc)} characters.`)];
  return { checks, code: lines.join('\n'), serp: { title, url: url || 'https://yourwebsite.com/page', description: desc || '' } };
}
async function headingChecker({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = headingChecks(page);
  return { url, score: score(checks), checks, tree: page.headingOrder.slice(0, 120) };
}
async function keywordDensity({ url: input, keyword }) {
  const { url, page } = await loadPage(input);
  const one = terms(page.text, 1); const two = terms(page.text, 2); const three = terms(page.text, 3);
  const pct = (c) => `${((100 * c) / Math.max(1, one.total)).toFixed(2)}%`;
  const out = { url, checks: [check('info', 'Words on page', `${page.wordCount} words analysed.`)], tables: [
    { title: 'Top keywords', cols: ['Keyword', 'Count', 'Density'], rows: one.top.map(([k, c]) => [k, c, pct(c)]) },
    { title: 'Top 2-word phrases', cols: ['Phrase', 'Count', 'Density'], rows: two.top.map(([k, c]) => [k, c, pct(c)]) },
    { title: 'Top 3-word phrases', cols: ['Phrase', 'Count', 'Density'], rows: three.top.map(([k, c]) => [k, c, pct(c)]) },
  ] };
  const kw = String(keyword || '').trim().toLowerCase().slice(0, 80);
  if (kw) {
    const n = (page.text.toLowerCase().match(new RegExp(`(^|[^\\p{L}\\p{N}])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'gu')) || []).length;
    const d = (100 * n * kw.split(/\s+/).length) / Math.max(1, one.total);
    const inTitle = (page.title.text || '').toLowerCase().includes(kw); const inH1 = page.headings.h1.join(' ').toLowerCase().includes(kw); const inDesc = (page.metaDescription.text || '').toLowerCase().includes(kw);
    out.checks.push(check(n === 0 ? 'fail' : d > 4 ? 'warn' : 'pass', `“${kw}” on the page`, `${n} time(s) · ${d.toFixed(2)}% density${d > 4 ? ' — may read as keyword stuffing.' : ''}`),
      check(inTitle ? 'pass' : 'warn', 'In the title', inTitle ? 'Yes' : 'No'), check(inH1 ? 'pass' : 'warn', 'In the H1', inH1 ? 'Yes' : 'No'), check(inDesc ? 'pass' : 'warn', 'In the meta description', inDesc ? 'Yes' : 'No'));
  }
  return out;
}
async function imageAlt({ url: input }) {
  const { url, page } = await loadPage(input);
  const imgs = page.images;
  const rows = imgs.slice(0, 150).map((i) => [i.filename || i.src, i.alt === null ? 'Missing' : i.alt === '' ? '(empty — decorative)' : i.alt, i.alt === null ? 'fail' : /\.(jpe?g|png|webp|gif)$|^img[_-]?\d+|^dsc/i.test(i.alt) ? 'warn' : i.alt.length > 125 ? 'warn' : 'pass']);
  const missing = imgs.filter((i) => i.alt === null).length; const fileLike = rows.filter((r) => r[2] === 'warn').length;
  const checks = [...imageChecks(page), fileLike ? check('warn', 'Weak ALT text', `${fileLike} image(s) use file names or very long ALT text.`) : null].filter(Boolean);
  return { url, score: imgs.length ? Math.round((100 * (imgs.length - missing)) / imgs.length) : null, checks, tables: imgs.length ? [{ title: `Images (${imgs.length})`, cols: ['Image', 'ALT text', ''], rows, statusCol: 2 }] : [] };
}
async function canonicalChecker({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = canonicalChecks(page, url);
  const c = page.canonicals[0];
  if (c?.resolved) {
    if (!/^https?:\/\//i.test(c.raw)) checks.push(check('warn', 'Relative canonical', 'Use a full absolute URL (https://…).'));
    if (c.resolved !== url.replace(/\/$/, '') && c.resolved !== url) {
      const st = await checkStatus(c.resolved).catch(() => null);
      checks.push(st?.status === 200 ? check('pass', 'Canonical target', `${c.resolved} returns 200.`) : check('fail', 'Canonical target', `${c.resolved} returns ${st?.status || 'an error'}.`));
    }
  }
  return { url, score: score(checks), checks };
}
async function robotsChecker({ url: input }) {
  const u = normalizeInputUrl(input);
  const r = await fetchRobots(u.origin);
  const checks = [];
  if (!r.available) checks.push(check(r.status === 404 ? 'warn' : 'fail', 'robots.txt', r.note || r.error?.message || 'Could not read robots.txt.'));
  else {
    checks.push(check('pass', 'robots.txt', `Found at ${r.url}`));
    const path = u.pathname || '/';
    for (const agent of ['Googlebot', 'Bingbot', '*']) {
      const a = isAllowed(r.parsed, path, agent);
      checks.push(check(a.allowed ? 'pass' : 'fail', `${agent === '*' ? 'All crawlers' : agent} → ${path}`, a.allowed ? 'Allowed' : `Blocked by “${a.rule?.type}: ${a.rule?.path}”`));
    }
    checks.push(check(r.parsed.sitemaps.length ? 'pass' : 'warn', 'Sitemap listed', r.parsed.sitemaps.length ? r.parsed.sitemaps.join(', ') : 'Add a “Sitemap:” line pointing to your XML sitemap.'));
  }
  return { url: u.toString(), score: score(checks), checks, tables: r.parsed ? [{ title: 'Rules', cols: ['User-agent', 'Rules'], rows: r.parsed.groups.slice(0, 30).map((g) => [g.agents.join(', '), g.rules.map((x) => `${x.type}: ${x.path}`).join('\n') || '(none)']) }] : [] };
}
async function sitemapChecker({ url: input }) {
  const u = normalizeInputUrl(input);
  const robots = await fetchRobots(u.origin);
  const s = await analyzeSitemaps(u.origin, robots.parsed?.sitemaps || []);
  const checks = [
    check(s.found ? 'pass' : 'fail', 'XML sitemap', s.found ? `Found: ${s.primary.url}` : 'No valid XML sitemap found at the usual locations.'),
    check(s.referencedInRobots ? 'pass' : 'warn', 'Listed in robots.txt', s.referencedInRobots ? 'Yes' : 'Add a “Sitemap:” line to robots.txt.'),
  ];
  if (s.found) checks.push(check(s.urlCount ? 'pass' : 'warn', 'URLs in sitemap', `${s.urlCount}${s.urlCountIsPartial ? '+ (partial count of a sitemap index)' : ''}`));
  return { url: u.origin, score: score(checks), checks, tables: s.sampleUrls?.length ? [{ title: 'Sample URLs', cols: ['URL'], rows: s.sampleUrls.slice(0, 50).map((x) => [x]) }] : [] };
}
async function schemaValidator({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = [
    check(page.jsonLd.length ? 'pass' : 'warn', 'JSON-LD structured data', page.jsonLd.length ? `${page.jsonLd.length} type(s): ${page.jsonLd.join(', ')}` : 'None found.'),
    page.jsonLdErrors.length ? check('fail', 'JSON syntax errors', `${page.jsonLdErrors.length} script block(s) are not valid JSON and will be ignored.`) : check('pass', 'JSON syntax', 'All JSON-LD blocks parse correctly.'),
    check(page.hasMicrodata ? 'info' : 'info', 'Microdata', page.hasMicrodata ? 'itemscope markup present.' : 'None.'),
  ];
  return { url, score: score(checks), checks, note: 'This checks that your structured data is valid JSON and lists its types. To check eligibility for Google rich results, also run Google’s Rich Results Test.' };
}
async function ogChecker({ url: input }) {
  const { url, page } = await loadPage(input);
  const og = page.og; const tw = page.twitter;
  const checks = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map((k) => check(og[k] ? 'pass' : k === 'og:image' || k === 'og:title' ? 'fail' : 'warn', k, og[k] || 'Missing'));
  if (og['og:image']) {
    const img = new URL(og['og:image'], url).toString();
    const st = await checkStatus(img).catch(() => null);
    checks.push(check(st?.status === 200 ? 'pass' : 'fail', 'og:image loads', st?.status === 200 ? 'Yes' : `Returned ${st?.status || 'an error'}.`));
  }
  checks.push(check(tw['twitter:card'] ? 'pass' : 'warn', 'twitter:card', tw['twitter:card'] || 'Missing'));
  return { url, score: score(checks), checks, og: { title: og['og:title'] || page.title.text || '', description: og['og:description'] || page.metaDescription.text || '', image: og['og:image'] ? new URL(og['og:image'], url).toString() : '', site: new URL(url).hostname } };
}
async function internalLinks({ url: input }) {
  const { url, page } = await loadPage(input);
  const internal = page.links.filter((l) => l.type === 'internal');
  const unique = [...new Set(internal.map((l) => l.url))];
  const noAnchor = internal.filter((l) => !l.anchor).length; const nofollow = internal.filter((l) => l.nofollow).length;
  const checks = [check(internal.length ? 'pass' : 'warn', 'Internal links', `${internal.length} links to ${unique.length} unique pages.`),
    noAnchor ? check('warn', 'Links without anchor text', `${noAnchor} — search engines use link text to understand pages.`) : check('pass', 'Anchor text', 'Every internal link has text.'),
    nofollow ? check('warn', 'Nofollow internal links', `${nofollow} — usually unnecessary on your own pages.`) : check('pass', 'Nofollow', 'No nofollow internal links.')];
  return { url, score: score(checks), checks, tables: [{ title: 'Internal links', cols: ['Anchor text', 'URL'], rows: internal.slice(0, 150).map((l) => [l.anchor || '(no text)', l.url]) }] };
}
async function brokenLinks({ url: input }) {
  const { url, page } = await loadPage(input);
  const targets = [...new Set(page.links.filter((l) => l.type === 'internal' || l.type === 'external').map((l) => l.url))].slice(0, 60);
  const results = [];
  await pool(targets, 6, async (t) => { const r = await checkStatus(t).catch(() => null); results.push([t, r?.status || 'Error']); });
  const broken = results.filter(([, s]) => s === 'Error' || s >= 400);
  const checks = [check(broken.length ? 'fail' : 'pass', 'Broken links', broken.length ? `${broken.length} of ${results.length} links checked are broken.` : `All ${results.length} links checked work.`)];
  if (targets.length === 60) checks.push(check('info', 'Limit', 'The first 60 links on the page were checked. A full SEO audit checks every page.'));
  return { url, score: score(checks), checks, tables: [{ title: 'Links checked', cols: ['URL', 'Status'], rows: results.sort((a, b) => (b[1] === 'Error' ? 999 : b[1]) - (a[1] === 'Error' ? 999 : a[1])).map(([u, s]) => [u, String(s)]) }] };
}
async function redirectChecker({ url: input }) {
  const u = normalizeInputUrl(input);
  const res = await safeFetch(u.toString(), { readBody: false });
  const hops = [...(res.redirects || []).map((r) => [r.url, String(r.status), r.location]), [res.url, String(res.status || 'Error'), '—']];
  const n = res.redirects?.length || 0;
  const checks = [res.ok ? check(res.status < 400 ? 'pass' : 'fail', 'Final response', `HTTP ${res.status}`) : check('fail', 'Final response', res.error?.message || 'Request failed'),
    check(n === 0 ? 'pass' : n === 1 ? 'pass' : 'warn', 'Redirect hops', n === 0 ? 'No redirects.' : `${n} redirect(s)${n > 1 ? ' — chains slow pages down; point links straight to the final URL.' : '.'}`)];
  if ((res.redirects || []).some((r) => r.status === 302 || r.status === 307)) checks.push(check('warn', 'Temporary redirects', 'A 302/307 is used — use 301 for permanent moves.'));
  return { url: u.toString(), score: score(checks), checks, tables: [{ title: 'Redirect path', cols: ['URL', 'Status', 'Goes to'], rows: hops }] };
}

export const TOOLS = [
  T('on-page', 'website-seo-checker', 'Website SEO Checker', 'Check any page for the on-page SEO basics: title, description, headings, images, canonical, indexing, mobile, schema and more.', websiteChecker),
  T('on-page', 'seo-score-checker', 'SEO Score Checker', 'Get an instant on-page SEO score out of 100 for any page, with the issues to fix first.', scoreChecker),
  T('on-page', 'meta-analyzer', 'Meta Title & Description Analyzer', 'Check your title tag and meta description length and see how the page looks in Google.', metaAnalyzer),
  T('on-page', 'meta-generator', 'Meta Tag Generator', 'Generate the title, description, Open Graph and Twitter tags for a page, ready to paste.', metaGenerator),
  T('on-page', 'heading-checker', 'Heading Structure Checker', 'See the H1–H6 outline of any page and find missing, duplicate or skipped headings.', headingChecker),
  T('on-page', 'keyword-density', 'Keyword Density Checker', 'Find the most-used words and phrases on a page and check how often your target keyword appears.', keywordDensity),
  T('on-page', 'image-alt-checker', 'Image ALT Text Checker', 'Find images with missing or weak ALT text on any page.', imageAlt),
  T('on-page', 'canonical-checker', 'Canonical URL Checker', 'Check a page’s canonical tag and whether it points to a working URL.', canonicalChecker),
  T('on-page', 'robots-checker', 'Robots.txt Checker', 'Read a site’s robots.txt and check whether Google and Bing are allowed to crawl a page.', robotsChecker),
  T('on-page', 'sitemap-checker', 'XML Sitemap Checker', 'Find a website’s XML sitemap, check it is valid and count its URLs.', sitemapChecker),
  T('on-page', 'schema-validator', 'Schema Markup Validator', 'Check that a page’s JSON-LD structured data is valid and see which schema types it uses.', schemaValidator),
  T('on-page', 'open-graph-checker', 'Open Graph Preview', 'Preview how a link looks when shared on WhatsApp, Facebook or LinkedIn and check its Open Graph tags.', ogChecker),
  T('on-page', 'internal-link-checker', 'Internal Link Checker', 'List every internal link on a page and spot links without anchor text or with nofollow.', internalLinks),
  T('on-page', 'broken-link-checker', 'Broken Link Checker', 'Check the links on a page and find the ones that return errors.', brokenLinks),
  T('on-page', 'redirect-checker', 'Redirect Checker', 'Follow a URL’s redirects hop by hop and see the status code of each step.', redirectChecker),
  ...soon('keyword', ['Keyword Suggestion Tool', 'Keyword Difficulty Checker', 'Keyword Density Analyzer', 'Long-Tail Keyword Generator', 'Keyword Clustering Tool', 'Search Intent Classifier', 'Related Keywords Generator', 'Question Keyword Generator', 'Keyword-to-Content Generator', 'SERP Preview Tool']),
  ...soon('technical', ['Page Speed Checker', 'Core Web Vitals Checker', 'Mobile SEO Checker', 'HTTPS / SSL Checker', 'HTTP Status Code Checker', 'Redirect Chain Checker', 'URL Inspection Tool', 'Robots.txt Generator', 'XML Sitemap Generator', 'Hreflang Generator', 'Schema Generator', '.htaccess Redirect Generator', 'URL Encoder / Decoder']),
  ...soon('local', ['Local SEO Checker', 'Google Business Profile Audit', 'NAP Consistency Checker', 'Local Business Schema Generator', 'Google Review Link Generator', 'Local Keyword Generator', 'Google Maps Ranking Checklist', 'Citation Checker', 'Local SERP Checker']),
  ...soon('backlink', ['Backlink Checker', 'Backlink Profile Analyzer', 'Link Analyzer', 'Toxic Link Checker', 'Referring Domain Checker', 'Broken Backlink Finder', 'Anchor Text Analyzer']),
  ...soon('ai', ['AI Meta Title Generator', 'AI Meta Description Generator', 'AI SEO Content Brief Generator', 'AI Keyword Cluster Generator', 'AI FAQ Generator', 'AI Schema Generator', 'AI Internal Linking Suggestions', 'AI SEO Content Optimizer', 'AI Search Intent Analyzer', 'AI Blog Outline Generator', 'AI SEO Rewrite Tool', 'AI GEO/AEO Optimizer']),
  ...soon('geo', ['AI Search Visibility Checker', 'ChatGPT Brand Mention Checker', 'Perplexity Visibility Checker', 'AI Citation Readiness Checker', 'AI Search Content Analyzer', 'GEO Score Checker', 'Entity Optimization Checker', 'E-E-A-T Content Checker']),
];
export const liveTool = (slug) => TOOLS.find((t) => t.live && t.slug === slug) || null;
export const FORM_TOOLS = new Set(['meta-generator']);

export async function runTool(slug, body) {
  const tool = liveTool(slug);
  if (!tool) throw Object.assign(new Error('Unknown tool.'), { status: 404 });
  try {
    return { tool: tool.name, ...(await tool.run(body || {})) };
  } catch (e) {
    if (e instanceof AuditInputError) throw Object.assign(new Error(e.message), { status: 400 });
    throw e;
  }
}

// ── Public HTML ──────────────────────────────────────────────────────────
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function hubVars() {
  const live = TOOLS.filter((t) => t.live).length;
  return {
    'tools.count': String(TOOLS.length),
    'tools.live': String(live),
    'tools.cats': CATEGORIES.map((c) => {
      const list = TOOLS.filter((t) => t.cat === c.id);
      return `<section class="tl-cat${c.star ? ' star' : ''} reveal" id="${c.id}" aria-labelledby="tc-${c.id}">
        <header><span class="tl-n">${c.n}</span><div><h2 id="tc-${c.id}">${esc(c.name)}</h2><p>${esc(c.intro)}</p></div><span class="tl-count">${list.filter((t) => t.live).length ? `${list.filter((t) => t.live).length} live · ` : ''}${list.length} tools</span></header>
        <ul class="tl-grid">${list.map((t) => t.live
          ? `<li><a class="tl-card" href="/seo-tools/${t.slug}"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span><i>Use tool →</i></a></li>`
          : `<li><div class="tl-card soon"><b>${esc(t.name)}</b><span class="tl-soon">Coming soon</span></div></li>`).join('')}</ul>
      </section>`;
    }).join(''),
  };
}

export function toolVars(tool) {
  const cat = CATEGORIES.find((c) => c.id === tool.cat);
  const related = TOOLS.filter((t) => t.live && t.slug !== tool.slug).slice(0, 6);
  const form = FORM_TOOLS.has(tool.slug)
    ? `<div class="tl-form-grid"><div class="field"><label for="f-title">Page title *</label><input class="input" id="f-title" name="title" maxlength="120" required></div>
       <div class="field"><label for="f-site">Site name</label><input class="input" id="f-site" name="siteName" maxlength="80"></div>
       <div class="field full"><label for="f-desc">Meta description</label><textarea class="input" id="f-desc" name="description" rows="3" maxlength="300"></textarea></div>
       <div class="field"><label for="f-purl">Page URL</label><input class="input" id="f-purl" name="pageUrl" placeholder="https://"></div>
       <div class="field"><label for="f-img">Share image URL</label><input class="input" id="f-img" name="image" placeholder="https://"></div></div>
       <button class="btn primary lg" type="submit">Generate Meta Tags</button>`
    : `<div class="tl-url"><input class="input" name="url" placeholder="Enter your website — e.g. yourbusiness.in" inputmode="url" autocomplete="url" required aria-label="Website URL">${tool.slug === 'keyword-density' ? '<input class="input" name="keyword" placeholder="Target keyword (optional)" aria-label="Target keyword">' : ''}<button class="btn primary lg" type="submit">Check →</button></div>`;
  return {
    'tool.name': esc(tool.name), 'tool.desc': esc(tool.desc), 'tool.slug': esc(tool.slug), 'tool.cat': esc(cat?.name || ''), 'tool.catId': esc(tool.cat),
    'tool.form': form,
    'tool.related': related.map((t) => `<a class="tl-card" href="/seo-tools/${t.slug}"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span><i>Use tool →</i></a>`).join(''),
  };
}
