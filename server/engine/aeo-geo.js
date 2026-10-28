// AEO (answer engine) and GEO (generative engine) page analysis.
// Pure functions: HTML in, evidence-backed checks out. Nothing here claims to know how any answer engine ranks or
// cites content. Scores are a DOCUMENTED HEURISTIC (see METHOD), not an industry standard. Anything that needs an
// outside data source (AI citations, brand mentions in answers, third-party references) is reported as NOT MEASURED.
import * as cheerio from 'cheerio';
import { isAllowed } from './robots.js';

export const METHOD = {
  version: '1.0.0',
  kind: 'documented heuristic readiness score',
  disclaimer: 'This score is a heuristic of how clear, attributed and machine-readable a page is. It is not an official or industry-standard ranking, and it does not predict whether any search or answer engine will use or cite the page.',
  formula: 'Each check has a weight. pass earns 100% of it, warn 50%, fail 0%. Checks marked info or unavailable are left out. Score = round(100 x earned / possible); null if nothing could be graded.',
  basis: 'Checks follow Google\'s published guidance on helpful, people-first content and on structured data matching visible content, plus common answer-formatting practice. Effects on answer engines are not verified.',
};

const NOT_MEASURED = [
  'Whether any answer engine or AI assistant cites or mentions this brand or page (needs an authorised data source; no results were collected)',
  'Third-party references and independent sources about the brand',
  'Rankings, traffic, impressions or clicks',
];

const wc = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
const cut = (s, n = 160) => (s && s.length > n ? s.slice(0, n) + '...' : s || '');
const QUESTION = /^(who|what|why|how|when|where|which|can|could|does|do|did|is|are|was|should|will|would|may)\b/i;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

export function scoreChecks(checks) {
  const graded = checks.filter((c) => c.status === 'pass' || c.status === 'warn' || c.status === 'fail');
  const possible = graded.reduce((n, c) => n + c.weight, 0);
  const earned = graded.reduce((n, c) => n + c.weight * (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0);
  return { score: possible ? Math.round((100 * earned) / possible) : null, graded: graded.length, excluded: checks.length - graded.length };
}
const chk = (id, status, weight, title, evidence, recommendation = null) => ({ id, status, weight, title, evidence, recommendation });

function jsonLdBlocks($) {
  const blocks = []; let errors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const j = JSON.parse($(el).contents().text());
      const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === 'object' ? [x, ...(x['@graph'] ? flat(x['@graph']) : [])] : []);
      blocks.push(...flat(j));
    } catch { errors++; }
  });
  const typesOf = (b) => [].concat(b['@type'] || []).map(String);
  return { blocks, errors, types: [...new Set(blocks.flatMap(typesOf))], typesOf };
}

// One pass over the document collecting everything the checks need.
export function extract(html, pageUrl) {
  const $ = cheerio.load(String(html || ''));
  const ld = jsonLdBlocks($);
  const meta = (n) => $(`meta[name="${n}"], meta[property="${n}"]`).attr('content') || '';
  const dateStrings = [meta('article:published_time'), meta('article:modified_time'), meta('og:updated_time'), meta('datePublished'), meta('dateModified'),
    ...ld.blocks.flatMap((b) => [b.datePublished, b.dateModified]), ...$('time[datetime]').map((_, e) => $(e).attr('datetime')).get()].filter(Boolean);
  const dates = dateStrings.map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()));
  const latest = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
  const authors = [...new Set([meta('author'), ...ld.blocks.flatMap((b) => [].concat(b.author || []).map((a) => (typeof a === 'string' ? a : a?.name))),
    $('[rel="author"], [itemprop="author"], .author, .byline').first().text().trim()].filter(Boolean).map((a) => cut(a, 80)))];
  const body = cheerio.load($.html()); body('script,style,noscript,svg,iframe').remove();
  const main = body('main, article').first().length ? body('main, article').first() : body('body');
  const scope = cheerio.load(main.html() || ''); scope('nav,footer,header,aside,form').remove();
  const headings = []; scope('h1,h2,h3,h4').each((_, e) => headings.push({ level: Number(e.tagName[1]), text: scope(e).text().replace(/\s+/g, ' ').trim() }));
  const paragraphs = scope('p').map((_, e) => scope(e).text().replace(/\s+/g, ' ').trim()).get().filter(Boolean);
  let afterH1 = '', seenH1 = false;
  scope('h1, p').each((_, e) => { if (afterH1) return; if (e.tagName === 'h1') seenH1 = true; else if (seenH1) { const t = scope(e).text().replace(/\s+/g, ' ').trim(); if (wc(t) >= 5) afterH1 = t; } });
  const pageHost = host(pageUrl);
  const external = new Map();
  scope('a[href]').each((_, e) => { try { const u = new URL(scope(e).attr('href'), pageUrl); if (/^https?:$/.test(u.protocol) && host(u.href) && host(u.href) !== pageHost) external.set(u.hostname + u.pathname, u.href); } catch { /* ignore bad hrefs */ } });
  const allLinks = $('a[href]').map((_, e) => ({ href: $(e).attr('href') || '', text: $(e).text().trim().toLowerCase() })).get();
  const text = scope.root().text().replace(/\s+/g, ' ').trim();
  return {
    url: pageUrl, title: $('title').first().text().trim(), h1: headings.filter((h) => h.level === 1).map((h) => h.text), headings, paragraphs, afterH1,
    lists: scope('ul, ol').length, tables: scope('table').length, text, wordCount: wc(text),
    ld, authors, latest, external: [...external.values()], ogSiteName: meta('og:site_name'),
    hasAbout: allLinks.some((l) => /about/.test(l.href + ' ' + l.text)), hasContact: allLinks.some((l) => /contact/.test(l.href + ' ' + l.text) || /^(tel|mailto):/i.test(l.href)),
    semantic: { main: $('main').length > 0, article: $('article').length > 0 },
    numericSentences: (text.match(/[^.!?]*\d[^.!?]*[.!?]/g) || []).filter((s) => /\d/.test(s)).length,
  };
}

/* ---------- AEO ---------- */
export function analyseAeo(html, pageUrl, now = new Date()) {
  const x = extract(html, pageUrl);
  const checks = [];
  const w = wc(x.afterH1);
  checks.push(!x.h1.length ? chk('aeo.direct_answer', 'info', 3, 'Direct answer under the main heading', 'No H1 was found, so the opening answer cannot be located.', 'Add one clear main heading that states the topic or question.')
    : !x.afterH1 ? chk('aeo.direct_answer', 'warn', 3, 'Direct answer under the main heading', 'No opening paragraph of 5 or more words follows the H1.', 'Open with a short paragraph that answers the main question directly.')
    : w >= 15 && w <= 80 ? chk('aeo.direct_answer', 'pass', 3, 'Direct answer under the main heading', `The first paragraph after the H1 is ${w} words: "${cut(x.afterH1)}"`)
    : chk('aeo.direct_answer', 'warn', 3, 'Direct answer under the main heading', `The first paragraph after the H1 is ${w} words (a concise answer is usually 15 to 80): "${cut(x.afterH1)}"`, 'Lead with a self-contained answer of one to three sentences, then add detail.'));
  const qh = x.headings.filter((h) => h.level >= 2 && (h.text.endsWith('?') || QUESTION.test(h.text)));
  checks.push(qh.length >= 2 ? chk('aeo.question_headings', 'pass', 2, 'Question-style headings', `${qh.length} headings are phrased as questions, e.g. "${cut(qh[0].text, 80)}".`)
    : qh.length === 1 ? chk('aeo.question_headings', 'warn', 2, 'Question-style headings', `Only 1 heading is phrased as a question: "${cut(qh[0].text, 80)}".`, 'Where readers genuinely ask questions, use those questions as headings.')
    : x.wordCount >= 300 ? chk('aeo.question_headings', 'warn', 2, 'Question-style headings', 'No headings are phrased as questions on a page of 300+ words.', 'If the page answers common questions, label those sections with the question.')
    : chk('aeo.question_headings', 'info', 2, 'Question-style headings', 'The page is short, so question headings are not assessed.'));
  const avg = x.paragraphs.length ? Math.round(x.paragraphs.reduce((n, p) => n + wc(p), 0) / x.paragraphs.length) : 0;
  checks.push(x.wordCount < 80 ? chk('aeo.structure', 'info', 2, 'Scannable structure', `Only ${x.wordCount} words of main content were found, so structure is not assessed.`)
    : (x.lists + x.tables > 0 || avg <= 70) && x.headings.length >= 2 ? chk('aeo.structure', 'pass', 2, 'Scannable structure', `${x.headings.length} headings, ${x.lists} lists, ${x.tables} tables, average paragraph ${avg} words.`)
    : chk('aeo.structure', 'warn', 2, 'Scannable structure', `${x.headings.length} headings, ${x.lists} lists, ${x.tables} tables, average paragraph ${avg} words.`, 'Break long passages into short paragraphs, add subheadings, and use lists or tables for steps and comparisons.'));
  const faq = x.ld.blocks.filter((b) => x.ld.typesOf(b).includes('FAQPage'));
  const faqQs = faq.flatMap((b) => [].concat(b.mainEntity || []).map((q) => String(q?.name || '').trim()).filter(Boolean));
  const lowText = x.text.toLowerCase(); const missing = faqQs.filter((q) => !lowText.includes(q.toLowerCase().slice(0, 60)));
  checks.push(!faq.length ? chk('aeo.faq_consistency', 'info', 2, 'FAQ markup matches visible content', 'No FAQPage markup. That is fine: add an FAQ only where it is genuinely useful to readers.')
    : missing.length ? chk('aeo.faq_consistency', 'fail', 2, 'FAQ markup matches visible content', `${missing.length} of ${faqQs.length} FAQ questions in the markup do not appear in the visible text, e.g. "${cut(missing[0], 80)}".`, 'Structured data must describe content visible on the page. Show the questions and answers, or remove the markup.')
    : chk('aeo.faq_consistency', 'pass', 2, 'FAQ markup matches visible content', `All ${faqQs.length} FAQ questions in the markup appear in the visible text.`));
  checks.push(x.authors.length ? chk('aeo.author_attribution', 'pass', 2, 'Author or publisher attribution', `Attribution found: ${x.authors.slice(0, 3).join(', ')}.`)
    : chk('aeo.author_attribution', 'warn', 2, 'Author or publisher attribution', 'No author or byline was found in the page, meta tags or markup.', 'Name the real author or the organisation responsible, with credentials where relevant. Never invent an author.'));
  checks.push(x.external.length >= 2 ? chk('aeo.sources', 'pass', 2, 'Cited sources', `${x.external.length} outbound links to other sites in the main content, e.g. ${x.external.slice(0, 2).join(', ')}.`)
    : x.wordCount < 300 ? chk('aeo.sources', 'info', 2, 'Cited sources', `${x.external.length} outbound source links; the page is short, so this is not assessed.`)
    : chk('aeo.sources', 'warn', 2, 'Cited sources', `${x.external.length} outbound source links in 300+ words of content.`, 'Where you state facts or figures, link to the original source.'));
  checks.push(x.latest ? chk('aeo.date', 'pass', 1, 'Date shown', `Latest date found: ${x.latest.toISOString().slice(0, 10)}.`) : chk('aeo.date', 'info', 1, 'Date shown', 'No publication or update date was found. Add one only if it is true and kept accurate.'));
  checks.push(x.ld.errors ? chk('aeo.structured_data', 'warn', 1, 'Structured data is valid JSON', `${x.ld.errors} JSON-LD block(s) could not be parsed.`, 'Fix the JSON syntax so the markup can be read.')
    : x.ld.types.length ? chk('aeo.structured_data', 'pass', 1, 'Structured data is valid JSON', `JSON-LD types found: ${x.ld.types.slice(0, 6).join(', ')}.`)
    : chk('aeo.structured_data', 'info', 1, 'Structured data is valid JSON', 'No JSON-LD found. Add types that truthfully describe the page (for example Article or Organization).'));
  const s = scoreChecks(checks);
  return { kind: 'aeo', url: pageUrl, analysedAt: now.toISOString(), score: s.score, graded: s.graded, excluded: s.excluded, checks, facts: { wordCount: x.wordCount, headings: x.headings.length, jsonLdTypes: x.ld.types.slice(0, 10) }, method: METHOD, notMeasured: NOT_MEASURED };
}

/* ---------- GEO ---------- */
// User-agent tokens as commonly published by each vendor. UNVERIFIED here: check each vendor's current documentation.
export const CRAWLERS = ['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'CCBot'];

export function analyseGeo(html, pageUrl, { robotsParsed = null, robotsAvailable = false, llmsTxt = null, now = new Date() } = {}) {
  const x = extract(html, pageUrl);
  const checks = [];
  const entityTypes = ['Organization', 'LocalBusiness', 'Person', 'Product', 'ProfessionalService', 'Corporation', 'WebSite'];
  const ent = x.ld.blocks.find((b) => b.name && x.ld.typesOf(b).some((t) => entityTypes.includes(t)));
  checks.push(!ent ? chk('geo.entity_schema', 'fail', 3, 'Entity described in structured data', 'No Organization, LocalBusiness, Person or Product markup with a name was found.', 'Add JSON-LD that truthfully names the business and links to its official profiles and website.')
    : ent.url || ent.sameAs ? chk('geo.entity_schema', 'pass', 3, 'Entity described in structured data', `${x.ld.typesOf(ent)[0]} "${cut(String(ent.name), 60)}" with ${ent.url ? 'a url' : ''}${ent.url && ent.sameAs ? ' and ' : ''}${ent.sameAs ? 'sameAs links' : ''}.`)
    : chk('geo.entity_schema', 'warn', 3, 'Entity described in structured data', `${x.ld.typesOf(ent)[0]} "${cut(String(ent.name), 60)}" has no url or sameAs.`, 'Add the official website url and links to real profiles (sameAs).'));
  const sameAs = [].concat(ent?.sameAs || []).filter((u) => typeof u === 'string');
  checks.push(sameAs.length >= 2 ? chk('geo.sameas', 'pass', 2, 'Links to official profiles', `${sameAs.length} sameAs links: ${sameAs.slice(0, 3).join(', ')}.`)
    : chk('geo.sameas', 'warn', 2, 'Links to official profiles', `${sameAs.length} sameAs link(s) found.`, 'List the official profiles that really belong to the business (for example business listings and social accounts).'));
  const names = [x.ogSiteName, ent?.name].filter(Boolean).map((n) => String(n).toLowerCase());
  const t = x.title.toLowerCase();
  checks.push(!names.length ? chk('geo.brand_consistency', 'info', 2, 'Consistent brand name', 'No og:site_name or entity name to compare with the page title.')
    : names.some((n) => t.includes(n)) ? chk('geo.brand_consistency', 'pass', 2, 'Consistent brand name', `Brand name "${cut(names[0], 60)}" matches the page title "${cut(x.title, 60)}".`)
    : chk('geo.brand_consistency', 'warn', 2, 'Consistent brand name', `Brand name "${cut(names[0], 60)}" does not appear in the page title "${cut(x.title, 60)}".`, 'Use the same business name in the title, structured data and sharing tags.'));
  checks.push(x.hasAbout && x.hasContact ? chk('geo.contact_identity', 'pass', 2, 'About and contact information reachable', 'Links to an About page and to contact details (or a tel/mailto link) were found.')
    : x.hasAbout || x.hasContact ? chk('geo.contact_identity', 'warn', 2, 'About and contact information reachable', `Found a link for ${x.hasAbout ? 'About' : 'contact'} only.`, 'Link to both an About page and clear contact details.')
    : chk('geo.contact_identity', 'fail', 2, 'About and contact information reachable', 'No About or contact links were found.', 'Make who the business is and how to reach it easy to find.'));
  if (robotsAvailable) {
    const path = (() => { try { const u = new URL(pageUrl); return u.pathname + u.search; } catch { return '/'; } })();
    const access = CRAWLERS.map((a) => ({ agent: a, allowed: isAllowed(robotsParsed, path, a).allowed }));
    const classic = access.filter((a) => ['Googlebot', 'Bingbot'].includes(a.agent) && !a.allowed);
    const blocked = access.filter((a) => !a.allowed).map((a) => a.agent);
    checks.push(classic.length ? chk('geo.crawler_access', 'fail', 3, 'Crawler access in robots.txt', `Blocked for: ${blocked.join(', ')}. Blocking ${classic.map((c) => c.agent).join(' and ')} stops normal search crawling of this page.`, 'Confirm this is intended. If the page should appear in search, allow these crawlers.')
      : chk('geo.crawler_access', blocked.length ? 'info' : 'pass', 3, 'Crawler access in robots.txt', blocked.length ? `Allowed for search crawlers. Blocked for: ${blocked.join(', ')}. Whether to allow AI-related crawlers is a business decision, not an error.` : 'robots.txt allows all of the crawlers checked.', blocked.length ? 'Decide deliberately which AI-related crawlers to allow; this check does not judge the choice.' : null));
  } else checks.push(chk('geo.crawler_access', 'unavailable', 3, 'Crawler access in robots.txt', 'robots.txt could not be read, so crawler access was not checked.'));
  const age = x.latest ? (now - x.latest) / 86400000 : null;
  checks.push(age == null ? chk('geo.freshness', 'info', 1, 'Content freshness', 'No publication or update date was found.')
    : age <= 365 ? chk('geo.freshness', 'pass', 1, 'Content freshness', `Latest date ${x.latest.toISOString().slice(0, 10)} (${Math.round(age)} days ago).`)
    : chk('geo.freshness', 'warn', 1, 'Content freshness', `Latest date ${x.latest.toISOString().slice(0, 10)} is ${Math.round(age)} days old.`, 'Review the content and update it only where facts have really changed. Do not change dates without changing the content.'));
  checks.push(x.numericSentences >= 3 && x.external.length >= 1 ? chk('geo.evidence', 'pass', 2, 'Evidence for factual claims', `${x.numericSentences} sentences with figures and ${x.external.length} outbound source link(s).`)
    : x.wordCount < 150 ? chk('geo.evidence', 'info', 2, 'Evidence for factual claims', 'The page is too short to assess.')
    : chk('geo.evidence', 'warn', 2, 'Evidence for factual claims', `${x.numericSentences} sentences with figures and ${x.external.length} outbound source link(s).`, 'Support specific claims with data, original research or a link to the primary source.'));
  checks.push(!x.ld.errors && x.ld.types.length && (x.semantic.main || x.semantic.article) ? chk('geo.machine_readable', 'pass', 1, 'Machine-readable structure', `Valid JSON-LD (${x.ld.types.slice(0, 4).join(', ')}) and semantic main/article markup.`)
    : chk('geo.machine_readable', 'warn', 1, 'Machine-readable structure', `JSON-LD types: ${x.ld.types.length}, parse errors: ${x.ld.errors}, main/article element: ${x.semantic.main || x.semantic.article}.`, 'Use valid JSON-LD and semantic HTML (main, article, headings).'));
  checks.push(llmsTxt == null ? chk('geo.llms_txt', 'unavailable', 0, 'llms.txt file (experimental)', 'Not checked.')
    : chk('geo.llms_txt', 'info', 0, 'llms.txt file (experimental)', llmsTxt ? 'An /llms.txt file exists.' : 'No /llms.txt file. This is an informal proposal, and no verified evidence shows it affects results; it is not scored.'));
  checks.push(chk('geo.third_party', 'unavailable', 0, 'Third-party references and AI citations', 'Not measured: this needs an authorised data source and documented test queries. No citations or mentions are reported or assumed.'));
  const s = scoreChecks(checks);
  return { kind: 'geo', url: pageUrl, analysedAt: now.toISOString(), score: s.score, graded: s.graded, excluded: s.excluded, checks, facts: { jsonLdTypes: x.ld.types.slice(0, 10), externalSources: x.external.length }, method: METHOD, notMeasured: NOT_MEASURED };
}
