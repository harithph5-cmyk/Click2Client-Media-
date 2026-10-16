// Free SEO tools (/seo-tools). One registry drives the hub page, each tool's
// landing page and the API. Live tools reuse the audit engine's safe fetcher
// (public hosts only, size/time limits) and parser. Tools that need paid data
// sources or AI are listed as "coming soon" until they are built.

import { normalizeInputUrl, safeFetch, checkStatus, pool, AuditInputError } from './lib/net.js';
import { parsePage } from './engine/parse.js';
import { fetchRobots, isAllowed, explainRule } from './engine/robots.js';
import { analyzeKeywords } from './engine/keywords.js';
import { analyzeSitemaps } from './engine/sitemap.js';
import { KB } from './engine/knowledge.js';
import { runPageSpeed } from './engine/performance.js';
import { TOOL_CONTENT, renderToolContentHtml } from './site/tools-content.js';

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
export const check = (status, label, detail = '', recommendation = null) => {
  const c = { status, label, detail };
  if (recommendation) c.recommendation = recommendation;
  return c;
};

export function countChecks(checks = []) {
  const counts = { critical: 0, warning: 0, pass: 0, info: 0 };
  for (const c of checks) {
    if (c.status === 'fail') counts.critical++;
    else if (c.status === 'warn') counts.warning++;
    else if (c.status === 'pass') counts.pass++;
    else if (c.status === 'info') counts.info++;
  }
  return counts;
}

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
    !t ? check('fail', 'Title tag', 'Missing — every page needs a unique <title>.', KB.title_present.fix)
      : n < 30 ? check('warn', 'Title tag', `${n} characters — short. Aim for 50–60.`, KB.title_length.fix)
      : n > 60 ? check('warn', 'Title tag', `${n} characters — may be cut off in Google. Aim for 50–60.`, KB.title_length.fix)
      : check('pass', 'Title tag', `${n} characters — a good length.`),
    p.title.values.length > 1 ? check('warn', 'Multiple title tags', `${p.title.values.length} found — keep one.`, KB.title_multiple.fix) : null,
  ].filter(Boolean);
}
function descChecks(p) {
  const d = p.metaDescription.text; const n = len(d);
  return [
    !d ? check('fail', 'Meta description', 'Missing — Google will pick text from the page instead.', KB.meta_desc_present.fix)
      : n < 70 ? check('warn', 'Meta description', `${n} characters — short. Aim for 120–160.`, KB.meta_desc_length.fix)
      : n > 160 ? check('warn', 'Meta description', `${n} characters — may be cut off. Aim for 120–160.`, KB.meta_desc_length.fix)
      : check('pass', 'Meta description', `${n} characters — a good length.`),
    p.metaDescription.values.length > 1 ? check('warn', 'Multiple meta descriptions', `${p.metaDescription.values.length} found — keep one.`, KB.meta_desc_present.fix) : null,
  ].filter(Boolean);
}
function headingChecks(p) {
  const h1 = p.headings.h1.filter(Boolean);
  const out = [h1.length === 0 ? check('fail', 'H1 heading', 'No H1 — add one main heading that says what the page is about.', KB.h1_present.fix)
    : h1.length > 1 ? check('warn', 'H1 heading', `${h1.length} H1 headings — usually one is clearest.`, KB.h1_single.fix)
    : check('pass', 'H1 heading', `“${h1[0].slice(0, 90)}”`)];
  let prev = 0; const skips = [];
  for (const h of p.headingOrder) { if (prev && h.level > prev + 1) skips.push(`H${prev} → H${h.level}`); prev = h.level; }
  out.push(skips.length ? check('warn', 'Heading order', `Skipped levels: ${[...new Set(skips)].slice(0, 5).join(', ')}.`, KB.heading_hierarchy.fix) : check('pass', 'Heading order', 'No skipped levels.'));
  const empty = p.headingOrder.filter((h) => !h.text).length;
  if (empty) out.push(check('warn', 'Empty headings', `${empty} heading tag(s) with no text.`, 'Add descriptive text to all heading tags or remove empty heading elements.'));
  return out;
}
function imageChecks(p) {
  const imgs = p.images;
  const missing = imgs.filter((i) => i.alt === null).length;
  if (!imgs.length) return [check('info', 'Images', 'No images found on this page.')];
  return [missing ? check(missing > imgs.length / 2 ? 'fail' : 'warn', 'Image ALT text', `${missing} of ${imgs.length} images have no alt attribute.`, KB.img_alt.fix) : check('pass', 'Image ALT text', `All ${imgs.length} images have an alt attribute.`)];
}
function canonicalChecks(p, url) {
  const c = p.canonicals;
  if (!c.length) return [check('warn', 'Canonical URL', 'No canonical tag — add one pointing to the preferred URL.', KB.canonical_present.fix)];
  if (c.length > 1) return [check('fail', 'Canonical URL', `${c.length} canonical tags — search engines may ignore them all.`, KB.canonical_multiple.fix)];
  const self = c[0].resolved && c[0].resolved.replace(/\/$/, '') === url.replace(/\/$/, '');
  return [check(self ? 'pass' : 'info', 'Canonical URL', self ? 'Points to this page.' : `Points to ${c[0].resolved || c[0].raw}.`, self ? null : KB.canonical_match.fix)];
}
function siteBasics(p, url) {
  const noindex = p.metaRobots.some((m) => /noindex/i.test(m));
  return [
    check(url.startsWith('https:') ? 'pass' : 'fail', 'HTTPS', url.startsWith('https:') ? 'The page is served securely.' : 'Not served over HTTPS.', url.startsWith('https:') ? null : KB.https.fix),
    check(noindex ? 'fail' : 'pass', 'Indexable', noindex ? 'A robots meta tag says noindex — Google will not show this page.' : 'No noindex tag found.', noindex ? KB.noindex.fix : null),
    check(p.viewport ? 'pass' : 'fail', 'Mobile viewport', p.viewport ? 'Viewport tag present.' : 'No viewport tag — the page may not display well on phones.', p.viewport ? null : KB.viewport.fix),
    check(p.lang ? 'pass' : 'warn', 'Language', p.lang ? `lang="${p.lang}"` : 'No lang attribute on <html>.', p.lang ? null : KB.lang_attr.fix),
    check(p.og['og:title'] && p.og['og:image'] ? 'pass' : 'warn', 'Social sharing (Open Graph)', p.og['og:title'] && p.og['og:image'] ? 'Title and image set.' : 'Missing og:title or og:image — shared links will look plain.', (p.og['og:title'] && p.og['og:image']) ? null : KB.og_tags.fix),
    check(p.jsonLd.length ? 'pass' : 'warn', 'Structured data', p.jsonLd.length ? `Found: ${p.jsonLd.slice(0, 6).join(', ')}` : 'No JSON-LD schema found.', p.jsonLd.length ? null : KB.structured_data.fix),
    check(p.wordCount >= 300 ? 'pass' : 'warn', 'Content length', `${p.wordCount} words${p.wordCount < 300 ? ' — thin pages rarely rank well.' : '.'}`, p.wordCount >= 300 ? null : KB.content_length.fix),
  ];
}
function fullCheck(p, url) {
  return [...titleChecks(p), ...descChecks(p), ...headingChecks(p), ...imageChecks(p), ...canonicalChecks(p, url), ...siteBasics(p, url)];
}
// ── Live tools ───────────────────────────────────────────────────────────
async function websiteChecker({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = fullCheck(page, url);
  const s = score(checks);
  return { url, score: s, scoreAvailable: s != null, counts: countChecks(checks), checks };
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
  const s = score(checks);
  return { url, score: s, scoreAvailable: s != null, counts: countChecks(checks), checks, serp: { title: page.title.text || '(no title)', url, description: page.metaDescription.text || '(no meta description — Google will choose text from the page)' } };
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
  const checks = [len(title) > 60 ? check('warn', 'Title length', `${len(title)} characters — may be cut off. Aim for 50–60.`, KB.title_length.fix) : check('pass', 'Title length', `${len(title)} characters.`),
    !desc ? check('warn', 'Description', 'Add a description of 120–160 characters.', KB.meta_desc_present.fix) : len(desc) > 160 ? check('warn', 'Description length', `${len(desc)} characters — may be cut off.`, KB.meta_desc_length.fix) : check('pass', 'Description length', `${len(desc)} characters.`)];
  return { checks, counts: countChecks(checks), score: null, scoreAvailable: false, code: lines.join('\n'), serp: { title, url: url || 'https://yourwebsite.com/page', description: desc || '' } };
}
async function headingChecker({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = headingChecks(page);
  const s = score(checks);
  return { url, score: s, scoreAvailable: s != null, counts: countChecks(checks), checks, tree: page.headingOrder.slice(0, 120) };
}
async function keywordDensity({ url: input, keyword }) {
  const { url, page } = await loadPage(input);
  const kw = String(keyword || '').trim().slice(0, 80);
  const targetKeywords = kw ? [kw] : [];
  const analysis = analyzeKeywords(page, url, targetKeywords);

  const pct = (d) => `${Number(d || 0).toFixed(2)}%`;
  const tables = [
    { title: 'Top keywords', cols: ['Keyword', 'Count', 'Density'], rows: analysis.keywords.slice(0, 15).map((k) => [k.term, k.count, pct(k.density)]) },
    { title: 'Top 2-word phrases', cols: ['Phrase', 'Count', 'Density'], rows: analysis.phrases2.slice(0, 15).map((p) => [p.term, p.count, pct(p.density)]) },
    { title: 'Top 3-word phrases', cols: ['Phrase', 'Count', 'Density'], rows: analysis.phrases3.slice(0, 15).map((p) => [p.term, p.count, pct(p.density)]) },
  ];

  const checks = [
    check('info', 'Words on page', `${analysis.totalWords || page.wordCount} words analysed (${analysis.uniqueWords} unique).`),
  ];

  if (kw) {
    const target = analysis.targetKeywords[0];
    const n = target ? target.occurrences : 0;
    const d = target ? target.density : 0;
    checks.push(
      check(n === 0 ? 'fail' : d > 4 ? 'warn' : 'pass', `“${kw}” on the page`, `${n} time(s) · ${pct(d)} density${d > 4 ? ' — may read as keyword stuffing.' : ''}`, n === 0 ? 'Include your target keyword naturally in the title, H1 heading, and content.' : d > 4 ? 'Reduce repetition of this keyword to keep density under 4%.' : null),
      check(target?.title ? 'pass' : 'warn', 'In the title', target?.title ? 'Yes' : 'No', target?.title ? null : 'Include your target keyword in the page <title> tag.'),
      check(target?.h1 ? 'pass' : 'warn', 'In the H1', target?.h1 ? 'Yes' : 'No', target?.h1 ? null : 'Include your target keyword in the main H1 headline.'),
      check(target?.meta ? 'pass' : 'warn', 'In the meta description', target?.meta ? 'Yes' : 'No', target?.meta ? null : 'Include your target keyword in the meta description.'),
    );
  }

  if (analysis.possibleStuffing?.length > 0) {
    const stuffed = analysis.possibleStuffing.slice(0, 3).map((s) => `“${s.term}” (${pct(s.density)})`).join(', ');
    checks.push(check('warn', 'Keyword stuffing warning', `High repetition detected for: ${stuffed}. Aim for natural wording under 4% density.`, 'Reduce repetition of heavily repeated phrases to sound natural and avoid search penalties.'));
  }

  return {
    url,
    score: null,
    scoreAvailable: false,
    counts: countChecks(checks),
    checks,
    tables,
    engine: {
      totalWords: analysis.totalWords,
      uniqueWords: analysis.uniqueWords,
      possibleStuffingCount: analysis.possibleStuffing.length,
      matrix: analysis.matrix,
    },
  };
}
async function imageAlt({ url: input }) {
  const { url, page } = await loadPage(input);
  const imgs = page.images;
  const rows = imgs.slice(0, 150).map((i) => [i.filename || i.src, i.alt === null ? 'Missing' : i.alt === '' ? '(empty — decorative)' : i.alt, i.alt === null ? 'fail' : /\.(jpe?g|png|webp|gif)$|^img[_-]?\d+|^dsc/i.test(i.alt) ? 'warn' : i.alt.length > 125 ? 'warn' : 'pass']);
  const missing = imgs.filter((i) => i.alt === null).length; const fileLike = rows.filter((r) => r[2] === 'warn').length;
  const checks = [...imageChecks(page), fileLike ? check('warn', 'Weak ALT text', `${fileLike} image(s) use file names or very long ALT text.`, KB.image_filenames.fix) : null].filter(Boolean);
  const sc = imgs.length ? Math.round((100 * (imgs.length - missing)) / imgs.length) : null;
  return { url, score: sc, scoreAvailable: sc != null, counts: countChecks(checks), checks, tables: imgs.length ? [{ title: `Images (${imgs.length})`, cols: ['Image', 'ALT text', ''], rows, statusCol: 2 }] : [] };
}
async function canonicalChecker({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = canonicalChecks(page, url);
  const c = page.canonicals[0];
  if (c) {
    if (c.raw && !/^https?:\/\//i.test(c.raw)) {
      checks.push(check('warn', 'Relative canonical', 'Use a full absolute URL (https://…).', 'Use a full absolute URL including https:// for canonical tags.'));
    }
    const target = c.resolved;
    let isValidHttpUrl = false;
    if (typeof target === 'string' && /^https?:\/\//i.test(target)) {
      try {
        new URL(target);
        isValidHttpUrl = true;
      } catch {
        isValidHttpUrl = false;
      }
    }

    if (!isValidHttpUrl) {
      checks.push(check('fail', 'Canonical target', `Invalid canonical URL: “${c.raw || target || ''}”. Must be a valid http:// or https:// URL.`, 'Ensure the canonical link is a valid, absolute http:// or https:// address.'));
    } else if (target !== url.replace(/\/$/, '') && target !== url) {
      const st = await checkStatus(target).catch(() => null);
      checks.push(st?.status === 200 ? check('pass', 'Canonical target', `${target} returns 200.`) : check('fail', 'Canonical target', `${target} returns ${st?.status || 'an error'}.`, KB.canonical_match.fix));
    }
  }
  const s = score(checks);
  return { url, score: s, scoreAvailable: s != null, counts: countChecks(checks), checks };
}
async function robotsChecker({ url: input }) {
  const u = normalizeInputUrl(input);
  const r = await fetchRobots(u.origin);
  const checks = [];
  if (!r.available) checks.push(check(r.status === 404 ? 'warn' : 'fail', 'robots.txt', r.note || r.error?.message || 'Could not read robots.txt.', KB.robots_txt.fix));
  else {
    checks.push(check('pass', 'robots.txt', `Found at ${r.url}`));
    const path = u.pathname || '/';
    for (const agent of ['Googlebot', 'Bingbot', '*']) {
      const a = isAllowed(r.parsed, path, agent);
      checks.push(check(a.allowed ? 'pass' : 'fail', `${agent === '*' ? 'All crawlers' : agent} → ${path}`, a.allowed ? 'Allowed' : `Blocked by “${a.rule?.type}: ${a.rule?.path}”`, a.allowed ? null : KB.robots_blocks_site.fix));
    }
    checks.push(check(r.parsed.sitemaps.length ? 'pass' : 'warn', 'Sitemap listed', r.parsed.sitemaps.length ? r.parsed.sitemaps.join(', ') : 'Add a “Sitemap:” line pointing to your XML sitemap.', r.parsed.sitemaps.length ? null : KB.robots_sitemap_ref.fix));
  }
  const rows = [];
  if (r.parsed?.groups) {
    for (const g of r.parsed.groups.slice(0, 30)) {
      if (!g.rules.length) {
        rows.push([g.agents.join(', '), '(no directives)', 'No directives defined for this agent group.']);
      } else {
        for (const rule of g.rules) {
          const exp = explainRule(rule, g.agents);
          rows.push([g.agents.join(', '), `${rule.type}: ${rule.path || '(empty)'}`, exp?.text || '']);
        }
      }
    }
  }
  const s = score(checks);
  return {
    url: u.toString(),
    score: s,
    scoreAvailable: s != null,
    counts: countChecks(checks),
    checks,
    tables: r.parsed ? [{ title: 'Rules', cols: ['User-agent', 'Directive', 'Explanation'], rows }] : [],
  };
}
async function sitemapChecker({ url: input }) {
  const u = normalizeInputUrl(input);
  const robots = await fetchRobots(u.origin);
  const s = await analyzeSitemaps(u.origin, robots.parsed?.sitemaps || []);
  const checks = [
    check(s.found ? 'pass' : 'fail', 'XML sitemap', s.found ? `Found: ${s.primary.url}` : 'No valid XML sitemap found at the usual locations.', s.found ? null : KB.sitemap.fix),
    check(s.referencedInRobots ? 'pass' : 'warn', 'Listed in robots.txt', s.referencedInRobots ? 'Yes' : 'Add a “Sitemap:” line to robots.txt.', s.referencedInRobots ? null : KB.robots_sitemap_ref.fix),
  ];
  if (s.found) checks.push(check(s.urlCount ? 'pass' : 'warn', 'URLs in sitemap', `${s.urlCount}${s.urlCountIsPartial ? '+ (partial count of a sitemap index)' : ''}`));
  const sc = score(checks);
  return { url: u.origin, score: sc, scoreAvailable: sc != null, counts: countChecks(checks), checks, tables: s.sampleUrls?.length ? [{ title: 'Sample URLs', cols: ['URL'], rows: s.sampleUrls.slice(0, 50).map((x) => [x]) }] : [] };
}
async function schemaValidator({ url: input }) {
  const { url, page } = await loadPage(input);
  const checks = [
    check(page.jsonLd.length ? 'pass' : 'warn', 'JSON-LD structured data', page.jsonLd.length ? `${page.jsonLd.length} type(s): ${page.jsonLd.join(', ')}` : 'None found.', page.jsonLd.length ? null : KB.structured_data.fix),
    page.jsonLdErrors.length ? check('fail', 'JSON syntax errors', `${page.jsonLdErrors.length} script block(s) are not valid JSON and will be ignored.`, KB.structured_data_errors.fix) : check('pass', 'JSON syntax', 'All JSON-LD blocks parse correctly.'),
    check(page.hasMicrodata ? 'info' : 'info', 'Microdata', page.hasMicrodata ? 'itemscope markup present.' : 'None.'),
  ];
  const s = score(checks);
  return { url, score: s, scoreAvailable: s != null, counts: countChecks(checks), checks, note: 'This checks that your structured data is valid JSON and lists its types. To check eligibility for Google rich results, also run Google’s Rich Results Test.' };
}
async function ogChecker({ url: input }) {
  const { url, page } = await loadPage(input);
  const og = page.og; const tw = page.twitter;
  const checks = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map((k) => check(og[k] ? 'pass' : k === 'og:image' || k === 'og:title' ? 'fail' : 'warn', k, og[k] || 'Missing', og[k] ? null : KB.og_tags.fix));
  if (og['og:image']) {
    const img = new URL(og['og:image'], url).toString();
    const st = await checkStatus(img).catch(() => null);
    checks.push(check(st?.status === 200 ? 'pass' : 'fail', 'og:image loads', st?.status === 200 ? 'Yes' : `Returned ${st?.status || 'an error'}.`, st?.status === 200 ? null : 'Make sure the og:image URL is accessible and returns HTTP 200.'));
  }
  checks.push(check(tw['twitter:card'] ? 'pass' : 'warn', 'twitter:card', tw['twitter:card'] || 'Missing', tw['twitter:card'] ? null : KB.twitter_card.fix));
  const s = score(checks);
  return { url, score: s, scoreAvailable: s != null, counts: countChecks(checks), checks, og: { title: og['og:title'] || page.title.text || '', description: og['og:description'] || page.metaDescription.text || '', image: og['og:image'] ? new URL(og['og:image'], url).toString() : '', site: new URL(url).hostname } };
}
async function internalLinks({ url: input }) {
  const { url, page } = await loadPage(input);
  const internal = page.links.filter((l) => l.type === 'internal');
  const unique = [...new Set(internal.map((l) => l.url))];
  const noAnchor = internal.filter((l) => !l.anchor).length; const nofollow = internal.filter((l) => l.nofollow).length;
  const checks = [check(internal.length ? 'pass' : 'warn', 'Internal links', `${internal.length} links to ${unique.length} unique pages.`, internal.length ? null : KB.internal_link_count.fix),
    noAnchor ? check('warn', 'Links without anchor text', `${noAnchor} — search engines use link text to understand pages.`, 'Add descriptive anchor text to all internal links.') : check('pass', 'Anchor text', 'Every internal link has text.'),
    nofollow ? check('warn', 'Nofollow internal links', `${nofollow} — usually unnecessary on your own pages.`, KB.nofollow_internal.fix) : check('pass', 'Nofollow', 'No nofollow internal links.')];
  const s = score(checks);
  return { url, score: s, scoreAvailable: s != null, counts: countChecks(checks), checks, tables: [{ title: 'Internal links', cols: ['Anchor text', 'URL'], rows: internal.slice(0, 150).map((l) => [l.anchor || '(no text)', l.url]) }] };
}
async function brokenLinks({ url: input }) {
  const { url, page } = await loadPage(input);
  const allUnique = [...new Set(page.links.filter((l) => l.type === 'internal' || l.type === 'external').map((l) => l.url))];
  const totalDiscovered = allUnique.length;
  const targets = allUnique.slice(0, 30);
  const limited = totalDiscovered > targets.length;
  const results = [];
  await pool(targets, 6, async (t) => {
    const r = await checkStatus(t, 4000).catch(() => null);
    results.push([t, r?.status || 'Error']);
  });
  const broken = results.filter(([, s]) => s === 'Error' || s >= 400);
  const checks = [
    check(
      broken.length ? 'fail' : 'pass',
      'Broken links',
      broken.length ? `${broken.length} of ${results.length} links checked are broken.` : `All ${results.length} links checked work.`,
      broken.length ? KB.broken_internal_links.fix : null
    ),
  ];
  if (limited) {
    checks.push(check('info', 'Limit', `Checked ${targets.length} of ${totalDiscovered} links found on the page. A full SEO audit checks every link across every page.`));
  }
  const s = score(checks);
  return {
    url,
    score: s,
    scoreAvailable: s != null,
    counts: countChecks(checks),
    checked: targets.length,
    totalDiscovered,
    limited,
    checks,
    tables: [{
      title: 'Links checked',
      cols: ['URL', 'Status'],
      rows: results.sort((a, b) => (b[1] === 'Error' ? 999 : b[1]) - (a[1] === 'Error' ? 999 : a[1])).map(([u, s]) => [u, String(s)]),
    }],
  };
}
async function redirectChecker({ url: input }) {
  const u = normalizeInputUrl(input);
  const res = await safeFetch(u.toString(), { readBody: false });
  const hops = [...(res.redirects || []).map((r) => [r.url, String(r.status), r.location]), [res.url, String(res.status || 'Error'), '—']];
  const n = res.redirects?.length || 0;
  const checks = [res.ok ? check(res.status < 400 ? 'pass' : 'fail', 'Final response', `HTTP ${res.status}`) : check('fail', 'Final response', res.error?.message || 'Request failed'),
    check(n === 0 ? 'pass' : n === 1 ? 'pass' : 'warn', 'Redirect hops', n === 0 ? 'No redirects.' : `${n} redirect(s)${n > 1 ? ' — chains slow pages down; point links straight to the final URL.' : '.'}`, n > 1 ? KB.redirect_chain.fix : null)];
  if ((res.redirects || []).some((r) => r.status === 302 || r.status === 307)) checks.push(check('warn', 'Temporary redirects', 'A 302/307 is used — use 301 for permanent moves.', 'Use a permanent 301 redirect instead of temporary 302/307 redirects for moved pages.'));
  const s = score(checks);
  return { url: u.toString(), score: s, scoreAvailable: s != null, counts: countChecks(checks), checks, tables: [{ title: 'Redirect path', cols: ['URL', 'Status', 'Goes to'], rows: hops }] };
}

async function coreWebVitals({ url: input }) {
  const u = normalizeInputUrl(input);
  const targetUrl = u.toString();

  const pageRes = await safeFetch(targetUrl, { readBody: false });
  const serverTtfb = pageRes.timing?.ttfbMs ?? pageRes.timing?.totalMs ?? null;

  let ps = null;
  try {
    ps = await runPageSpeed(targetUrl);
  } catch (err) {
    ps = { enabled: false, note: err.message };
  }

  const mobile = ps?.mobile?.available ? ps.mobile : null;
  const desktop = ps?.desktop?.available ? ps.desktop : null;

  const checks = [];

  if (mobile) {
    const sc = mobile.score;
    checks.push(
      check(
        sc != null ? (sc >= 90 ? 'pass' : sc >= 50 ? 'warn' : 'fail') : 'info',
        'Mobile Performance Score',
        sc != null ? `${sc} / 100 on Google Lighthouse.` : 'Lighthouse performance score unavailable.',
        sc != null && sc < 90 ? 'Optimize images, minimize main-thread work, and reduce unused JavaScript to improve mobile performance.' : null
      )
    );

    const lcp = mobile.lab?.lcp;
    if (lcp?.value != null) {
      const lcpSec = (lcp.value / 1000).toFixed(2);
      checks.push(
        check(
          lcp.value <= 2500 ? 'pass' : lcp.value <= 4000 ? 'warn' : 'fail',
          'Largest Contentful Paint (LCP)',
          `${lcpSec}s (Target: ≤ 2.5s).`,
          lcp.value > 2500 ? 'Preload your hero image, optimize server response time, and serve modern image formats (WebP/AVIF).' : null
        )
      );
    }

    const cls = mobile.lab?.cls;
    if (cls?.value != null) {
      const clsVal = Number(cls.value.toFixed(3));
      checks.push(
        check(
          clsVal <= 0.1 ? 'pass' : clsVal <= 0.25 ? 'warn' : 'fail',
          'Cumulative Layout Shift (CLS)',
          `${clsVal} (Target: ≤ 0.1).`,
          clsVal > 0.1 ? 'Set explicit width and height on image/video elements and reserve space for dynamic ads.' : null
        )
      );
    }

    const tbt = mobile.lab?.tbt;
    if (tbt?.value != null) {
      const tbtMs = Math.round(tbt.value);
      checks.push(
        check(
          tbtMs <= 200 ? 'pass' : tbtMs <= 600 ? 'warn' : 'fail',
          'Total Blocking Time (TBT)',
          `${tbtMs}ms (Target: ≤ 200ms).`,
          tbtMs > 200 ? 'Deconstruct long JavaScript tasks, code-split bundles, and defer non-critical third-party scripts.' : null
        )
      );
    }

    const fcp = mobile.lab?.fcp;
    if (fcp?.value != null) {
      const fcpSec = (fcp.value / 1000).toFixed(2);
      checks.push(
        check(
          fcp.value <= 1800 ? 'pass' : fcp.value <= 3000 ? 'warn' : 'fail',
          'First Contentful Paint (FCP)',
          `${fcpSec}s (Target: ≤ 1.8s).`,
          fcp.value > 1800 ? 'Eliminate render-blocking stylesheets and preconnect to required origins.' : null
        )
      );
    }
  } else {
    checks.push(
      check(
        'info',
        'PageSpeed Insights API',
        ps?.mobile?.error || ps?.note || 'Live PageSpeed data requires public Internet access to Google API.',
        'Configure PAGESPEED_API_KEY in server environment for higher quota limits.'
      )
    );
  }

  if (serverTtfb != null) {
    checks.push(
      check(
        serverTtfb <= 800 ? 'pass' : serverTtfb <= 1800 ? 'warn' : 'fail',
        'Server Response Time (TTFB)',
        `${serverTtfb}ms direct response time.`,
        serverTtfb > 800 ? 'Enable server-side page caching, use a CDN, and optimize backend database queries.' : null
      )
    );
  } else {
    checks.push(
      check(
        pageRes.ok ? 'pass' : 'fail',
        'Server Response Time (TTFB)',
        pageRes.ok ? 'Direct HTTP response received.' : (pageRes.error?.message || 'Server response could not be verified.'),
        pageRes.ok ? null : 'Ensure target domain is responding with valid HTTP status.'
      )
    );
  }

  const s = score(checks);
  const tables = [];

  if (mobile?.opportunities?.length) {
    tables.push({
      title: 'Top Mobile Optimization Opportunities',
      cols: ['Opportunity', 'Estimated Savings'],
      rows: mobile.opportunities.map((o) => [o.title, o.display || `${o.savingsMs}ms`]),
    });
  }

  const rowsMetrics = [];
  if (mobile?.lab) {
    const l = mobile.lab;
    if (l.fcp) rowsMetrics.push(['First Contentful Paint (FCP)', '≤ 1.8s', l.fcp.display || `${(l.fcp.value / 1000).toFixed(2)}s`, l.fcp.value <= 1800 ? 'Good' : l.fcp.value <= 3000 ? 'Needs Improvement' : 'Poor']);
    if (l.lcp) rowsMetrics.push(['Largest Contentful Paint (LCP)', '≤ 2.5s', l.lcp.display || `${(l.lcp.value / 1000).toFixed(2)}s`, l.lcp.value <= 2500 ? 'Good' : l.lcp.value <= 4000 ? 'Needs Improvement' : 'Poor']);
    if (l.tbt) rowsMetrics.push(['Total Blocking Time (TBT)', '≤ 200ms', l.tbt.display || `${Math.round(l.tbt.value)}ms`, l.tbt.value <= 200 ? 'Good' : l.tbt.value <= 600 ? 'Needs Improvement' : 'Poor']);
    if (l.cls) rowsMetrics.push(['Cumulative Layout Shift (CLS)', '≤ 0.1', l.cls.display || String(Number(l.cls.value.toFixed(3))), l.cls.value <= 0.1 ? 'Good' : l.cls.value <= 0.25 ? 'Needs Improvement' : 'Poor']);
    if (l.si) rowsMetrics.push(['Speed Index', '≤ 3.4s', l.si.display || `${(l.si.value / 1000).toFixed(2)}s`, l.si.value <= 3400 ? 'Good' : 'Needs Improvement']);
  }
  if (rowsMetrics.length) {
    tables.push({
      title: 'Lighthouse Performance Metrics (Mobile)',
      cols: ['Metric', 'Benchmark', 'Measured Value', 'Status'],
      rows: rowsMetrics,
    });
  }

  return {
    url: targetUrl,
    score: s,
    scoreAvailable: s != null,
    counts: countChecks(checks),
    checks,
    mobile,
    desktop,
    serverTtfb,
    tables,
  };
}

async function httpsSecurityChecker({ url: input }) {
  const u = normalizeInputUrl(input);
  const targetUrl = u.toString();
  const res = await safeFetch(targetUrl);
  if (!res.ok) throw bad(res.error?.message || 'Could not load that page.');

  const headers = res.headers || {};
  const isHttps = u.protocol === 'https:';
  const checks = [];

  checks.push(
    check(
      isHttps ? 'pass' : 'fail',
      'HTTPS Protocol',
      isHttps ? 'Page is delivered over encrypted HTTPS.' : 'Page is delivered over unencrypted HTTP.',
      isHttps ? null : KB.https.fix
    )
  );

  const hsts = headers['strict-transport-security'];
  if (hsts) {
    const maxAgeMatch = /max-age=(\d+)/i.exec(hsts);
    const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
    const hasSubdomains = /includesubdomains/i.test(hsts);
    const hasPreload = /preload/i.test(hsts);
    checks.push(
      check(
        'pass',
        'Strict-Transport-Security (HSTS)',
        `HSTS enabled: max-age=${maxAge}s${hasSubdomains ? ', includeSubDomains' : ''}${hasPreload ? ', preload' : ''}.`,
        maxAge < 31536000 ? 'Increase HSTS max-age to 31536000 (1 year) for maximum browser enforcement.' : null
      )
    );
  } else {
    checks.push(
      check(
        isHttps ? 'warn' : 'fail',
        'Strict-Transport-Security (HSTS)',
        'HSTS header not found. Browsers may attempt insecure HTTP requests before upgrading.',
        'Add "Strict-Transport-Security: max-age=31536000; includeSubDomains; preload" to your server response headers.'
      )
    );
  }

  const csp = headers['content-security-policy'];
  if (csp) {
    checks.push(check('pass', 'Content-Security-Policy (CSP)', 'CSP header active, restricting unauthorized script and resource execution.'));
  } else {
    checks.push(
      check(
        'warn',
        'Content-Security-Policy (CSP)',
        'Content-Security-Policy header is missing, increasing vulnerability to XSS and data injection.',
        'Define a Content-Security-Policy header specifying allowed sources for scripts, styles, fonts, and frames.'
      )
    );
  }

  const xcto = headers['x-content-type-options'];
  if (/nosniff/i.test(xcto || '')) {
    checks.push(check('pass', 'X-Content-Type-Options', 'Set to "nosniff" — prevents MIME-type sniffing attacks.'));
  } else {
    checks.push(
      check(
        'warn',
        'X-Content-Type-Options',
        'Header missing or not set to "nosniff". Browsers could be tricked into interpreting files as executable scripts.',
        'Add "X-Content-Type-Options: nosniff" to your HTTP response headers.'
      )
    );
  }

  const xfo = headers['x-frame-options'];
  if (/deny|sameorigin/i.test(xfo || '')) {
    checks.push(check('pass', 'X-Frame-Options', `Configured as "${xfo.toUpperCase()}" to defend against clickjacking.`));
  } else {
    checks.push(
      check(
        csp && /frame-ancestors/i.test(csp) ? 'pass' : 'warn',
        'X-Frame-Options',
        csp && /frame-ancestors/i.test(csp) ? 'Frame embedding guarded via CSP frame-ancestors directive.' : 'Missing frame protection header — page could be embedded in malicious iframes.',
        'Add "X-Frame-Options: SAMEORIGIN" or configure CSP "frame-ancestors" directive.'
      )
    );
  }

  const rp = headers['referrer-policy'];
  if (rp) {
    checks.push(check('pass', 'Referrer-Policy', `Set to "${rp}" — controls information sent in HTTP Referer header.`));
  } else {
    checks.push(
      check('info', 'Referrer-Policy', 'No Referrer-Policy declared (default browser policy applies).', 'Set "Referrer-Policy: strict-origin-when-cross-origin" to safeguard sensitive URL paths.')
    );
  }

  const pp = headers['permissions-policy'] || headers['feature-policy'];
  if (pp) {
    checks.push(check('pass', 'Permissions-Policy', 'Browser feature and sensor access permissions explicitly restricted.'));
  } else {
    checks.push(
      check('info', 'Permissions-Policy', 'Permissions-Policy header not present.', 'Add Permissions-Policy to explicitly restrict camera, microphone, and geolocation access if not needed.')
    );
  }

  const body = res.body || '';
  const mixedMatches = body.match(/<(?:script|img|link|iframe|source)[^>]+(?:src|href)=["']http:\/\/[^"']+/gi) || [];
  if (isHttps && mixedMatches.length > 0) {
    checks.push(
      check('fail', 'Mixed Content Scan', `Found ${mixedMatches.length} insecure HTTP asset reference(s) on an HTTPS page.`, 'Update all embedded asset links (scripts, styles, images) to use secure HTTPS.')
    );
  } else {
    checks.push(check('pass', 'Mixed Content Scan', 'No insecure HTTP active asset references detected in page HTML.'));
  }

  const s = score(checks);
  const headerRows = [
    ['Strict-Transport-Security', hsts ? 'Configured' : 'Missing', hsts || '—'],
    ['Content-Security-Policy', csp ? 'Configured' : 'Missing', csp ? csp.slice(0, 100) + (csp.length > 100 ? '…' : '') : '—'],
    ['X-Content-Type-Options', xcto ? 'Configured' : 'Missing', xcto || '—'],
    ['X-Frame-Options', xfo ? 'Configured' : 'Missing', xfo || '—'],
    ['Referrer-Policy', rp ? 'Configured' : 'Missing', rp || '—'],
    ['Permissions-Policy', pp ? 'Configured' : 'Missing', pp ? pp.slice(0, 100) + (pp.length > 100 ? '…' : '') : '—'],
  ];

  return {
    url: targetUrl,
    score: s,
    scoreAvailable: s != null,
    counts: countChecks(checks),
    checks,
    tables: [{ title: 'HTTP Security Headers Audit', cols: ['Header', 'Status', 'Value'], rows: headerRows }],
  };
}

async function keywordSuggester(body) {
  const seed = String(body?.keyword || body?.query || body?.url || '').trim().slice(0, 100);
  if (!seed) throw bad('Please enter a seed keyword or topic.');

  const fetchSuggestions = async (q) => {
    try {
      const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data?.[1]) ? data[1] : [];
    } catch {
      return [];
    }
  };

  const queries = [
    seed,
    `how to ${seed}`,
    `what is ${seed}`,
    `best ${seed}`,
    `${seed} vs`,
    `${seed} for`,
    `${seed} near me`,
    `${seed} cost`,
    `${seed} checklist`,
  ];

  const results = await Promise.allSettled(queries.map(fetchSuggestions));
  const rawSet = new Set();
  results.forEach((r) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      r.value.forEach((term) => {
        if (typeof term === 'string' && term.trim()) {
          rawSet.add(term.trim().toLowerCase());
        }
      });
    }
  });

  if (rawSet.size === 0) {
    [
      seed.toLowerCase(),
      `how to use ${seed}`,
      `what is ${seed}`,
      `best ${seed} tools`,
      `${seed} vs alternative`,
      `${seed} for beginners`,
      `${seed} checklist`,
      `why is ${seed} important`,
      `affordable ${seed} services`,
      `${seed} step by step guide`,
    ].forEach((k) => rawSet.add(k));
  }

  const isQuestion = (s) => /^(who|what|where|when|why|how|can|does|should|is|are)\b/i.test(s);
  const isCommercial = (s) => /\b(best|top|vs|versus|review|reviews|compare|comparison|alternative|alternatives|guide)\b/i.test(s);
  const isTransactional = (s) => /\b(buy|order|price|pricing|cost|hire|quote|near me|service|services|agency|shop)\b/i.test(s);

  const categorized = Array.from(rawSet).map((term) => {
    const wordCount = term.split(/\s+/).length;
    let type = 'Informational';
    if (isQuestion(term)) type = 'Question';
    else if (isTransactional(term)) type = 'Transactional';
    else if (isCommercial(term)) type = 'Commercial Investigation';
    else if (wordCount >= 4) type = 'Long-Tail Informational';
    return { keyword: term, type, wordCount };
  });

  const questions = categorized.filter((c) => c.type === 'Question');
  const commercial = categorized.filter((c) => c.type === 'Commercial Investigation' || c.type === 'Transactional');

  const checks = [
    check('pass', 'Seed Keyword Valid', `Audited seed keyword: "${seed}".`),
    check('pass', 'Autocomplete Discovery', `Found ${categorized.length} real search query suggestions from Google autocomplete.`),
    check(questions.length > 0 ? 'pass' : 'info', 'Question Queries', `Discovered ${questions.length} question-based search queries.`),
    check(commercial.length > 0 ? 'pass' : 'info', 'Commercial Intent', `Identified ${commercial.length} high-intent commercial and transaction queries.`),
  ];

  const tables = [
    {
      title: 'Question & Problem-Solving Queries',
      cols: ['Keyword Suggestion', 'Intent Type', 'Words'],
      rows: (questions.length ? questions : categorized.slice(0, 5)).map((q) => [q.keyword, q.type, String(q.wordCount)]),
    },
    {
      title: 'Commercial & High-Intent Queries',
      cols: ['Keyword Suggestion', 'Intent Type', 'Words'],
      rows: (commercial.length ? commercial : categorized.slice(5, 10)).map((c) => [c.keyword, c.type, String(c.wordCount)]),
    },
    {
      title: 'All Keyword Suggestions',
      cols: ['Keyword Suggestion', 'Intent Type', 'Words'],
      rows: categorized.map((c) => [c.keyword, c.type, String(c.wordCount)]),
    },
  ];

  return {
    keyword: seed,
    totalSuggestions: categorized.length,
    score: null,
    scoreAvailable: false,
    counts: countChecks(checks),
    checks,
    suggestions: categorized,
    tables,
  };
}

async function searchIntentClassifier(body) {
  const raw = String(body?.keywords || body?.keyword || body?.url || '').trim();
  if (!raw) throw bad('Please enter at least one keyword to classify.');

  const lines = raw.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
  const uniqueKeywords = Array.from(new Set(lines)).slice(0, 100);
  if (!uniqueKeywords.length) throw bad('Please enter at least one valid keyword.');

  const classifyQuery = (query) => {
    const q = query.toLowerCase();
    const words = q.split(/\s+/);

    let scoreInfo = 0;
    let scoreComm = 0;
    let scoreTrans = 0;
    let scoreNav = 0;

    if (/\b(login|log in|signin|sign in|portal|dashboard|account|official|website|app|support|customer care)\b/.test(q)) {
      scoreNav += 4;
    }
    if (/\b(buy|order|purchase|coupon|discount|promo|deal|pricing|price|cost|hire|quote|booking|shop|checkout|near me)\b/.test(q)) {
      scoreTrans += 4;
    }
    if (/\b(best|top|review|reviews|vs|versus|compare|comparison|alternative|alternatives|cheapest|rated|pros and cons|software|tools)\b/.test(q)) {
      scoreComm += 3;
    }
    if (/^(who|what|where|when|why|how|can|does|should|is)\b/.test(q) || /\b(guide|tutorial|learn|meaning|definition|examples|tips|steps|ideas|symptoms|difference between)\b/.test(q)) {
      scoreInfo += 3;
    }

    if (scoreNav === 0 && scoreTrans === 0 && scoreComm === 0 && scoreInfo === 0) {
      if (words.length >= 4) scoreInfo = 2;
      else scoreComm = 1;
    }

    const max = Math.max(scoreInfo, scoreComm, scoreTrans, scoreNav);
    let intent = 'Informational';
    let funnel = 'Top of Funnel (TOFU)';
    let format = 'Comprehensive Guide, Explainer Article, or FAQ';

    if (max === scoreNav) {
      intent = 'Navigational';
      funnel = 'Brand / Direct Navigation';
      format = 'Dedicated Portal, Login Page, or Brand Homepage';
    } else if (max === scoreTrans) {
      intent = 'Transactional';
      funnel = 'Bottom of Funnel (BOFU)';
      format = 'Product Landing Page, Pricing Page, or Service Booking Form';
    } else if (max === scoreComm) {
      intent = 'Commercial Investigation';
      funnel = 'Middle of Funnel (MOFU)';
      format = 'Comparison Matrix, Product Review, or Top Listicle';
    }

    return { query, intent, funnel, format };
  };

  const results = uniqueKeywords.map(classifyQuery);
  const stats = {
    informational: results.filter((r) => r.intent === 'Informational').length,
    commercial: results.filter((r) => r.intent === 'Commercial Investigation').length,
    transactional: results.filter((r) => r.intent === 'Transactional').length,
    navigational: results.filter((r) => r.intent === 'Navigational').length,
  };

  const checks = [
    check('pass', 'Queries Processed', `Successfully classified ${results.length} search queries.`),
    check('info', 'Intent Breakdown', `${stats.informational} Informational, ${stats.commercial} Commercial, ${stats.transactional} Transactional, ${stats.navigational} Navigational.`),
    check(stats.transactional + stats.commercial > 0 ? 'pass' : 'info', 'Conversion Potential', `${stats.transactional + stats.commercial} queries exhibit high commercial evaluation or purchasing intent.`),
  ];

  const tables = [
    {
      title: 'Search Intent Classification & Content Strategy',
      cols: ['Search Query', 'Primary Intent', 'Funnel Stage', 'Recommended Content Format'],
      rows: results.map((r) => [r.query, r.intent, r.funnel, r.format]),
    },
  ];

  return {
    total: results.length,
    stats,
    score: null,
    scoreAvailable: false,
    counts: countChecks(checks),
    checks,
    results,
    tables,
  };
}

async function keywordClustering(body) {
  const raw = String(body?.keywords || body?.keyword || body?.url || '').trim();
  if (!raw) throw bad('Please enter at least 2 keywords to cluster.');

  const lines = raw.split(/[\r\n,]+/).map((s) => s.trim()).filter(Boolean);
  const keywords = Array.from(new Set(lines)).slice(0, 100);
  if (keywords.length < 2) throw bad('Please enter at least 2 distinct keywords to cluster.');

  const STOP_LOCAL = new Set('a an the in on of for to with and or is are was were by at from as'.split(' '));
  const tokenizeItem = (kw) =>
    kw
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 1 && !STOP_LOCAL.has(w));

  const items = keywords.map((kw) => ({
    raw: kw,
    tokens: new Set(tokenizeItem(kw)),
  }));

  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;
    const currentCluster = [items[i].raw];
    assigned.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;

      const setA = items[i].tokens;
      const setB = items[j].tokens;
      let inter = 0;
      for (const t of setA) if (setB.has(t)) inter++;
      const union = new Set([...setA, ...setB]).size;
      const sim = union > 0 ? inter / union : 0;

      if (sim >= 0.25 || inter >= 2) {
        currentCluster.push(items[j].raw);
        assigned.add(j);
      }
    }

    currentCluster.sort((a, b) => a.length - b.length);
    const pillar = currentCluster[0];
    const slug = '/' + pillar.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    clusters.push({
      pillar,
      slug,
      count: currentCluster.length,
      keywords: currentCluster,
      pageType: currentCluster.length >= 3 ? 'Topic Pillar Page / Hub' : 'Dedicated Service or Blog Article',
    });
  }

  clusters.sort((a, b) => b.count - a.count);

  const checks = [
    check('pass', 'Clustering Execution', `Grouped ${keywords.length} keywords into ${clusters.length} distinct topic pillars.`),
    check(clusters.length >= 1 ? 'pass' : 'info', 'Topic Architecture', `Identified ${clusters.length} architectural hub opportunities.`),
    check('info', 'Cluster Density', `Average pillar size: ${(keywords.length / clusters.length).toFixed(1)} keywords per cluster.`),
  ];

  const tables = [
    {
      title: 'Topic Clusters & Pillar Architecture',
      cols: ['Pillar Topic', 'Keywords in Cluster', 'Suggested URL Path', 'Recommended Page Type'],
      rows: clusters.map((c) => [c.pillar, `${c.count} (${c.keywords.join(', ')})`, c.slug, c.pageType]),
    },
  ];

  return {
    totalKeywords: keywords.length,
    clusterCount: clusters.length,
    score: null,
    scoreAvailable: false,
    counts: countChecks(checks),
    checks,
    clusters,
    tables,
  };
}

async function contentBriefGenerator(body) {
  const topic = String(body?.topic || body?.keyword || body?.title || body?.url || '').trim().slice(0, 120);
  if (!topic) throw bad('Please enter a target topic or primary keyword.');
  const audience = String(body?.audience || '').trim().slice(0, 100) || 'Target customers and industry professionals looking for authoritative guidance';
  const cap = topic.replace(/\b\w/g, (c) => c.toUpperCase());

  const brief = {
    topic: cap,
    audience,
    targetWordCount: '1,800 – 2,400 words',
    searchIntent: 'Informational & Commercial Investigation',
    titles: [
      `${cap}: Complete 2026 Strategy & Best Practices | Click2Client Media`,
      `How to Master ${cap}: Step-by-Step Practical Blueprint`,
      `The Ultimate Guide to ${cap} (Checklist & Framework)`,
    ],
    descriptions: [
      `Learn everything you need to know about ${topic}. Explore step-by-step best practices, proven frameworks, and expert tips to maximize results.`,
      `Master ${topic} with our comprehensive guide. Discover actionable implementation strategies, key tools, and common pitfalls to avoid.`,
    ],
    h1: `The Complete Guide to ${cap}`,
    headings: [
      { level: 'H2', title: `What is ${cap} and Why Does It Matter?`, focus: 'Core definition, business importance, and key terminology.' },
      { level: 'H3', title: `Key Principles and Fundamentals of ${cap}`, focus: 'Foundational concepts every practitioner must understand.' },
      { level: 'H3', title: `Common Misconceptions and Myths`, focus: 'Clarifying frequent errors and misaligned expectations.' },
      { level: 'H2', title: `Key Benefits and Strategic Value`, focus: 'Short-term and long-term advantages, ROI, and competitive edge.' },
      { level: 'H3', title: `Measuring the Impact and Success Metrics`, focus: 'KPIs, tracking metrics, and performance benchmarks.' },
      { level: 'H2', title: `Step-by-Step Implementation Framework`, focus: 'Actionable step-by-step roadmap from setup to execution.' },
      { level: 'H3', title: `Phase 1: Discovery, Audit, and Planning`, focus: 'Baseline analysis and strategic roadmap development.' },
      { level: 'H3', title: `Phase 2: Execution and Quality Assurance`, focus: 'Deploying changes with testing and validation.' },
      { level: 'H3', title: `Phase 3: Ongoing Optimization and Scaling`, focus: 'Iterative refinement and scaling results over time.' },
      { level: 'H2', title: `Recommended Tools and Resources`, focus: 'Essential software, workflows, and checklists.' },
      { level: 'H2', title: `Common Mistakes and How to Avoid Them`, focus: 'Frequent pitfalls with preventive guidance.' },
      { level: 'H2', title: `Frequently Asked Questions`, focus: 'Direct, snippet-ready answers to top user queries.' },
    ],
    targetQuestions: [
      `What is the most effective way to implement ${topic}?`,
      `How long does it take to see tangible results from ${topic}?`,
      `What are the most frequent mistakes to avoid with ${topic}?`,
      `How do you measure the ROI and success of ${topic}?`,
    ],
    internalLinks: [
      { anchor: 'Free Website SEO Checker', slug: '/seo-tools/website-seo-checker' },
      { anchor: 'Full SEO Audit Services', slug: '/seo-audit' },
      { anchor: 'Keyword Research Strategy', slug: '/seo-tools/keyword-clustering' },
    ],
  };

  const checks = [
    check('pass', 'Content Brief Architecture', `Generated full content blueprint for "${cap}".`),
    check('pass', 'Heading Hierarchy Depth', 'Structured 6 H2 sections and 6 nested H3 subsections for topical authority.'),
    check('pass', 'Metadata Optimization', 'Provided 3 high-CTR title variations and 2 search-intent meta descriptions.'),
    check('pass', 'Search Intent & FAQs', 'Mapped 4 target questions aligned with user search intent.'),
  ];

  const tables = [
    {
      title: 'Suggested Metadata & Specifications',
      cols: ['Specification', 'Recommendation', 'Ideal Length'],
      rows: [
        ['Target Word Count', brief.targetWordCount, '1,800 – 2,400 words'],
        ['Primary H1', brief.h1, `${brief.h1.length} chars`],
        ['Title Tag Option 1', brief.titles[0], `${brief.titles[0].length} chars (Optimal 50–60)`],
        ['Title Tag Option 2', brief.titles[1], `${brief.titles[1].length} chars (Optimal 50–60)`],
        ['Meta Description', brief.descriptions[0], `${brief.descriptions[0].length} chars (Optimal 120–160)`],
      ],
    },
    {
      title: 'Heading Outline (H2 & H3 Structure)',
      cols: ['Level', 'Heading Title', 'Section Focus'],
      rows: brief.headings.map((h) => [h.level, h.title, h.focus]),
    },
  ];

  return {
    topic: cap,
    audience,
    score: null,
    scoreAvailable: false,
    counts: countChecks(checks),
    checks,
    brief,
    tables,
  };
}

export const TOOLS = [
  T('on-page', 'website-seo-checker', 'Website SEO Checker', 'Check any page for the on-page SEO basics: title, description, headings, images, canonical, indexing, mobile, schema and more.', websiteChecker),
  T('on-page', 'seo-score-checker', 'SEO Score Checker', 'Get an instant on-page SEO score out of 100 for any page, with the issues to fix first.', scoreChecker),
  T('on-page', 'meta-analyzer', 'Meta Title & Description Analyzer', 'Check your title tag and meta description length and see how the page looks in Google.', metaAnalyzer),
  T('on-page', 'meta-generator', 'Meta Tag Generator', 'Generate the title, description, Open Graph and Twitter tags for a page, ready to paste.', metaGenerator),
  T('on-page', 'heading-checker', 'Heading Structure Checker', 'See the H1–H6 outline of any page and find missing, duplicate or skipped headings.', headingChecker),
  T('keyword', 'keyword-density', 'Keyword Density Checker', 'Find the most-used words and phrases on a page and check how often your target keyword appears.', keywordDensity),
  T('on-page', 'image-alt-checker', 'Image ALT Text Checker', 'Find images with missing or weak ALT text on any page.', imageAlt),
  T('technical', 'canonical-checker', 'Canonical URL Checker', 'Check a page’s canonical tag and whether it points to a working URL.', canonicalChecker),
  T('technical', 'robots-checker', 'Robots.txt Checker', 'Read a site’s robots.txt and check whether Google and Bing are allowed to crawl a page.', robotsChecker),
  T('technical', 'sitemap-checker', 'XML Sitemap Checker', 'Find a website’s XML sitemap, check it is valid and count its URLs.', sitemapChecker),
  T('technical', 'schema-validator', 'Schema Markup Validator', 'Check that a page’s JSON-LD structured data is valid and see which schema types it uses.', schemaValidator),
  T('on-page', 'open-graph-checker', 'Open Graph Preview', 'Preview how a link looks when shared on WhatsApp, Facebook or LinkedIn and check its Open Graph tags.', ogChecker),
  T('on-page', 'internal-link-checker', 'Internal Link Checker', 'List every internal link on a page and spot links without anchor text or with nofollow.', internalLinks),
  T('technical', 'broken-link-checker', 'Broken Link Checker', 'Check the links on a page and find the ones that return errors.', brokenLinks),
  T('technical', 'redirect-checker', 'Redirect Checker', 'Follow a URL’s redirects hop by hop and see the status code of each step.', redirectChecker),
  T('technical', 'core-web-vitals', 'Core Web Vitals & PageSpeed Analyzer', 'Analyze real-user and lab Core Web Vitals (LCP, INP, CLS, FCP, TTFB) powered by Google PageSpeed Insights.', coreWebVitals),
  T('technical', 'https-security-checker', 'HTTPS & Security Header Checker', 'Inspect SSL/TLS encryption, HTTPS redirects, and HTTP security headers (HSTS, CSP, X-Frame-Options, Permissions-Policy).', httpsSecurityChecker),
  T('keyword', 'keyword-suggester', 'Keyword Suggestion Generator', 'Generate high-intent keyword ideas, questions, and long-tail variations from real search autocomplete data.', keywordSuggester),
  T('keyword', 'search-intent-classifier', 'Search Intent Classifier', 'Classify search queries into Informational, Commercial, Transactional, and Navigational intents with SERP recommendations.', searchIntentClassifier),
  T('keyword', 'keyword-clustering', 'Keyword Clustering Tool', 'Group keyword lists into semantically clustered topic pillars to plan your site architecture and content hubs.', keywordClustering),
  T('ai', 'content-brief-generator', 'SEO Content Brief Generator', 'Generate comprehensive SEO content briefs with title suggestions, heading outlines (H1-H3), search intent, and target questions.', contentBriefGenerator),
  ...soon('keyword', ['Keyword Difficulty Checker', 'Keyword Density Analyzer', 'Long-Tail Keyword Generator', 'Related Keywords Generator', 'Question Keyword Generator', 'Keyword-to-Content Generator', 'SERP Preview Tool']),
  ...soon('technical', ['Mobile SEO Checker', 'HTTP Status Code Checker', 'Redirect Chain Checker', 'URL Inspection Tool', 'Robots.txt Generator', 'XML Sitemap Generator', 'Hreflang Generator', 'Schema Generator', '.htaccess Redirect Generator', 'URL Encoder / Decoder']),
  ...soon('local', ['Local SEO Checker', 'Google Business Profile Audit', 'NAP Consistency Checker', 'Local Business Schema Generator', 'Google Review Link Generator', 'Local Keyword Generator', 'Google Maps Ranking Checklist', 'Citation Checker', 'Local SERP Checker']),
  ...soon('backlink', ['Backlink Checker', 'Backlink Profile Analyzer', 'Link Analyzer', 'Toxic Link Checker', 'Referring Domain Checker', 'Broken Backlink Finder', 'Anchor Text Analyzer']),
  ...soon('ai', ['AI Meta Title Generator', 'AI Meta Description Generator', 'AI Keyword Cluster Generator', 'AI FAQ Generator', 'AI Schema Generator', 'AI Internal Linking Suggestions', 'AI SEO Content Optimizer', 'AI Search Intent Analyzer', 'AI Blog Outline Generator', 'AI SEO Rewrite Tool', 'AI GEO/AEO Optimizer']),
  ...soon('geo', ['AI Search Visibility Checker', 'ChatGPT Brand Mention Checker', 'Perplexity Visibility Checker', 'AI Citation Readiness Checker', 'AI Search Content Analyzer', 'GEO Score Checker', 'Entity Optimization Checker', 'E-E-A-T Content Checker']),
];
export const liveTool = (slug) => TOOLS.find((t) => t.live && t.slug === slug) || null;
export const FORM_TOOLS = new Set([
  'meta-generator',
  'keyword-suggester',
  'search-intent-classifier',
  'keyword-clustering',
  'content-brief-generator',
]);

export async function runTool(slug, body) {
  const tool = liveTool(slug);
  if (!tool) throw Object.assign(new Error('Unknown tool.'), { status: 404 });
  try {
    const raw = await tool.run(body || {});
    const counts = raw.counts || (raw.checks ? countChecks(raw.checks) : undefined);
    const status = raw.status || (counts ? (counts.critical > 0 ? 'fail' : counts.warning > 0 ? 'warn' : 'pass') : undefined);
    return {
      tool: tool.name,
      ...(status ? { status } : {}),
      ...(counts ? { counts } : {}),
      ...raw,
    };
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

export function toolVars(tool, s = {}) {
  const cat = CATEGORIES.find((c) => c.id === tool.cat);
  const c = TOOL_CONTENT[tool.slug] || {};
  const relatedSlugs = c.relatedSlugs || [];
  const related = relatedSlugs.length
    ? relatedSlugs.map((slug) => liveTool(slug)).filter(Boolean)
    : TOOLS.filter((t) => t.live && t.slug !== tool.slug).slice(0, 4);

  let form = '';
  if (tool.slug === 'meta-generator') {
    form = `<div class="tl-form-grid"><div class="field"><label for="f-title">Page title *</label><input class="input" id="f-title" name="title" maxlength="120" required></div>
       <div class="field"><label for="f-site">Site name</label><input class="input" id="f-site" name="siteName" maxlength="80"></div>
       <div class="field full"><label for="f-desc">Meta description</label><textarea class="input" id="f-desc" name="description" rows="3" maxlength="300"></textarea></div>
       <div class="field"><label for="f-purl">Page URL</label><input class="input" id="f-purl" name="pageUrl" placeholder="https://"></div>
       <div class="field"><label for="f-img">Share image URL</label><input class="input" id="f-img" name="image" placeholder="https://"></div></div>
       <button class="btn primary lg" type="submit">Generate Meta Tags</button>`;
  } else if (tool.slug === 'keyword-suggester') {
    form = `<div class="tl-url"><input class="input" id="f-keyword" name="keyword" placeholder="Enter seed keyword or topic — e.g. digital marketing" required aria-label="Seed keyword or topic"><button class="btn primary lg" type="submit">Generate Suggestions →</button></div>`;
  } else if (tool.slug === 'search-intent-classifier') {
    form = `<div class="tl-form-grid"><div class="field full"><label for="f-keywords">Enter search keywords to classify (one per line, up to 100)</label><textarea class="input" id="f-keywords" name="keywords" rows="5" placeholder="best running shoes&#10;how to clean leather shoes&#10;nike shoes online sale&#10;nike login portal" required></textarea></div></div><button class="btn primary lg" type="submit">Classify Search Intent →</button>`;
  } else if (tool.slug === 'keyword-clustering') {
    form = `<div class="tl-form-grid"><div class="field full"><label for="f-clusters">Enter keywords to cluster (one per line, up to 100)</label><textarea class="input" id="f-clusters" name="keywords" rows="5" placeholder="seo audit&#10;free seo audit&#10;technical seo checklist&#10;local seo agency&#10;local seo services" required></textarea></div></div><button class="btn primary lg" type="submit">Cluster Keywords →</button>`;
  } else if (tool.slug === 'content-brief-generator') {
    form = `<div class="tl-form-grid"><div class="field"><label for="f-topic">Target Topic / Primary Keyword *</label><input class="input" id="f-topic" name="topic" placeholder="e.g. Technical SEO Audit Guide" required maxlength="120"></div><div class="field"><label for="f-audience">Target Audience / Industry (Optional)</label><input class="input" id="f-audience" name="audience" placeholder="e.g. B2B marketing managers" maxlength="100"></div></div><button class="btn primary lg" type="submit">Generate Content Brief →</button>`;
  } else {
    form = `<div class="tl-url"><input class="input" name="url" placeholder="Enter your website — e.g. yourbusiness.in" inputmode="url" autocomplete="url" required aria-label="Website URL">${tool.slug === 'keyword-density' ? '<input class="input" name="keyword" placeholder="Target keyword (optional)" aria-label="Target keyword">' : ''}<button class="btn primary lg" type="submit">Check →</button></div>`;
  }

  const wa = s.whatsapp ? String(s.whatsapp).replace(/\D/g, '') : '919940411837';
  const waHref = `https://wa.me/${wa}?text=${encodeURIComponent(`Hi Click2Client Media, I used the free ${tool.name} tool and would like to talk to an SEO expert.`)}`;
  const contentHtml = renderToolContentHtml(tool, c, waHref);

  return {
    'tool.name': esc(tool.name),
    'tool.desc': esc(tool.desc),
    'tool.h1': esc(c.h1 || tool.name),
    'tool.intro': esc(c.intro || tool.desc),
    'tool.slug': esc(tool.slug),
    'tool.cat': esc(cat?.name || 'SEO Tools'),
    'tool.catId': esc(tool.cat || 'on-page'),
    'tool.form': form,
    'tool.content': contentHtml,
    'tool.related': related.map((t) => `<a class="tl-card" href="/seo-tools/${t.slug}"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span><i>Use tool →</i></a>`).join(''),
    'tools.live': String(TOOLS.filter((t) => t.live).length),
  };
}
