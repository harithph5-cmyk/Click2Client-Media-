// The audit agent pipeline:
//   validate → crawl → collect (robots, sitemap, security, links, tech,
//   performance, backlinks) → rule engine → score → prioritise → AI
//   interpretation → report.
// Each stage emits real progress events. A failing data source never fails
// the whole audit — it is recorded as unavailable.

import { normalizeInputUrl, safeFetch, checkStatus, pool, AuditInputError } from '../lib/net.js';
import { config } from '../config.js';
import { parsePage, sameSite } from './parse.js';
import { fetchRobots, isAllowed } from './robots.js';
import { analyzeSitemaps } from './sitemap.js';
import { detectTechnologies, detectAnalytics } from './detect.js';
import { inspectCertificate, checkHttpRedirect, securityHeaders } from './security.js';
import { runPageSpeed } from './performance.js';
import { analyzeKeywords } from './keywords.js';
import { runChecks } from './checks.js';
import { computeScore, buildIssues, groupIssues, buildRoadmap } from './scoring.js';
import { interpret } from './ai.js';
import { getBacklinks, getTraffic } from '../integrations/providers.js';

export const MODES = {
  homepage: { label: 'Homepage audit', maxPages: 1 },
  quick: { label: 'Quick audit', maxPages: 10 },
  full: { label: 'Full site audit', maxPages: 50 },
};

export const STAGES = [
  { id: 'validate', label: 'Scanning website' },
  { id: 'fetch', label: 'Fetching homepage' },
  { id: 'robots', label: 'Checking robots.txt & sitemap' },
  { id: 'crawl', label: 'Discovering pages' },
  { id: 'security', label: 'Checking technical SEO & HTTPS' },
  { id: 'links', label: 'Checking links' },
  { id: 'performance', label: 'Checking performance' },
  { id: 'external', label: 'Checking external data sources' },
  { id: 'analyze', label: 'Checking metadata, headings & images' },
  { id: 'ai', label: 'Generating recommendations' },
];

const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|avif|svg|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|webm|ico|css|js|xml|txt|json)(\?|$)/i;

function urlFacts(u) {
  try {
    const x = new URL(u);
    return {
      url: u,
      length: u.length,
      depth: x.pathname.split('/').filter(Boolean).length,
      underscores: x.pathname.includes('_'),
      uppercase: /[A-Z]/.test(x.pathname),
      params: Boolean(x.search),
      hyphens: (x.pathname.match(/-/g) || []).length,
      extension: /\.\w{2,5}$/.exec(x.pathname)?.[0] || null,
    };
  } catch {
    return null;
  }
}

function pageRecord(requestedUrl, res) {
  const rec = {
    requestedUrl,
    finalUrl: res.url,
    status: res.status ?? null,
    redirects: res.redirects || [],
    headers: res.headers || {},
    timing: res.timing || {},
    bytes: res.bytes || 0,
    truncated: res.truncated || false,
    error: res.ok ? null : res.error,
    fetchedAt: new Date().toISOString(),
    parsed: null,
  };
  const ct = rec.headers['content-type'] || '';
  if (res.ok && res.body && /html|xml\+xhtml/i.test(ct || 'text/html')) {
    rec.parsed = parsePage(res.body, res.url);
    rec.html = res.body;
  }
  return rec;
}

// Strip heavy fields before persisting.
function storablePage(p) {
  const x = p.parsed;
  return {
    url: p.finalUrl,
    requestedUrl: p.requestedUrl,
    status: p.status,
    error: p.error,
    redirects: p.redirects,
    timing: p.timing,
    bytes: p.bytes,
    fetchedAt: p.fetchedAt,
    ...(x && {
      title: x.title.text,
      titleCount: x.title.values.length,
      metaDescription: x.metaDescription.text,
      metaKeywords: x.metaKeywords,
      metaRobots: x.metaRobots,
      canonicals: x.canonicals,
      headings: x.headings,
      headingOrder: x.headingOrder.slice(0, 120),
      wordCount: x.wordCount,
      textRatio: x.htmlBytes ? +((100 * x.textBytes) / x.htmlBytes).toFixed(1) : null,
      htmlBytes: x.htmlBytes,
      lang: x.lang,
      viewport: x.viewport,
      og: x.og,
      twitter: x.twitter,
      jsonLd: x.jsonLd,
      images: x.images.slice(0, 300),
      links: x.links.slice(0, 600),
      hreflang: x.hreflang,
      resourceCounts: x.resourceCounts,
      mixedContent: x.mixedContent,
      textExcerpt: x.text.slice(0, 3000),
    }),
  };
}

export async function runAudit(rawInput, emit = () => {}) {
  const startedAt = Date.now();
  const stage = (id, status, detail) => emit({ type: 'stage', stage: id, status, detail, at: Date.now() });
  const warnings = [];
  const deadlineAt = rawInput.deadlineAt || Infinity;
  const timeLeft = () => deadlineAt - Date.now();

  // 1. Validate ─────────────────────────────────────────────────────────
  stage('validate', 'running');
  const mode = MODES[rawInput.mode] ? rawInput.mode : 'homepage';
  const maxPages = Math.min(
    mode === 'full' ? Math.max(2, parseInt(rawInput.crawlLimit, 10) || MODES.full.maxPages) : MODES[mode].maxPages,
    config.crawler.maxPagesCeiling
  );
  const input = {
    url: rawInput.url,
    mode,
    maxPages,
    businessName: (rawInput.businessName || '').slice(0, 120),
    location: (rawInput.location || '').slice(0, 120),
    city: (rawInput.city || '').slice(0, 80),
    country: (rawInput.country || '').slice(0, 80),
    category: (rawInput.category || '').slice(0, 120),
    keywords: (Array.isArray(rawInput.keywords) ? rawInput.keywords : String(rawInput.keywords || '').split(','))
      .map((k) => k.trim()).filter(Boolean).slice(0, 8),
    usePageSpeed: rawInput.usePageSpeed !== false,
    skipAI: rawInput.skipAI === true,
  };
  const startUrl = normalizeInputUrl(input.url); // throws AuditInputError
  stage('validate', 'done', startUrl.toString());

  // 2. Homepage ─────────────────────────────────────────────────────────
  stage('fetch', 'running', startUrl.toString());
  let res = await safeFetch(startUrl.toString());
  if (!res.ok && startUrl.protocol === 'https:' && ['tls', 'refused', 'reset'].includes(res.error?.code)) {
    const httpUrl = startUrl.toString().replace(/^https:/, 'http:');
    const alt = await safeFetch(httpUrl);
    if (alt.ok) {
      warnings.push(`HTTPS failed (${res.error.message}); the audit continued over HTTP.`);
      res = alt;
    }
  }
  if (!res.ok) {
    throw new AuditInputError(`We could not reach ${startUrl.host}: ${res.error?.message || 'unknown error'}`, res.error?.code || 'unreachable');
  }
  const home = pageRecord(startUrl.toString(), res);
  if (home.status === 403 || home.status === 401) {
    throw new AuditInputError(`${startUrl.host} refused our request (HTTP ${home.status}). The site may block automated audits or require a login. Whitelisting our user agent or temporarily relaxing bot protection will allow an audit.`, 'blocked');
  }
  if (home.status === 429) throw new AuditInputError(`${startUrl.host} is rate-limiting requests (HTTP 429). Please try again in a few minutes.`, 'rate_limited');
  if (home.status >= 500) throw new AuditInputError(`${startUrl.host} returned a server error (HTTP ${home.status}). The website may be down.`, 'server_error');
  if (!home.parsed) {
    throw new AuditInputError(`${home.finalUrl} did not return an HTML page (Content-Type: ${home.headers['content-type'] || 'unknown'}).`, 'not_html');
  }
  if (home.status === 404) warnings.push('The homepage returned HTTP 404 — results reflect the error page that was served.');
  const origin = new URL(home.finalUrl).origin;
  stage('fetch', 'done', `HTTP ${home.status} · ${(home.bytes / 1024).toFixed(0)} KB · ${home.timing.ttfbMs} ms`);

  // 3. Robots & sitemap ────────────────────────────────────────────────
  stage('robots', 'running');
  let robots = null, sitemap = null;
  try {
    robots = await fetchRobots(origin);
    if (robots.available) {
      const path = new URL(home.finalUrl).pathname;
      robots.homeAllowed = isAllowed(robots.parsed, path, 'Googlebot');
    }
  } catch (e) { robots = { available: false, error: { message: e.message } }; }
  try { sitemap = await analyzeSitemaps(origin, robots?.sitemaps || []); } catch (e) { sitemap = { found: false, checked: [], error: e.message }; }
  stage('robots', 'done', `${robots?.available ? 'robots.txt found' : 'no robots.txt'} · ${sitemap?.found ? `sitemap with ${sitemap.urlCount} URLs` : 'no sitemap found'}`);

  // 4. Crawl ───────────────────────────────────────────────────────────
  const pages = [home];
  const crawlSkipped = [];
  if (maxPages > 1) {
    stage('crawl', 'running', `0 / ${maxPages - 1}`);
    const seen = new Set([home.finalUrl.replace(/\/$/, ''), home.requestedUrl.replace(/\/$/, '')]);
    const queue = [];
    const enqueue = (u) => {
      if (!u) return;
      const key = u.split('#')[0].replace(/\/$/, '');
      if (seen.has(key) || SKIP_EXT.test(u) || !sameSite(u, origin)) return;
      if (robots?.parsed && !isAllowed(robots.parsed, new URL(u).pathname + new URL(u).search, 'Click2ClientSEOAudit').allowed) {
        crawlSkipped.push({ url: u, reason: 'Disallowed by robots.txt' });
        seen.add(key);
        return;
      }
      seen.add(key);
      queue.push(u);
    };
    // Homepage links first (most important pages), then sitemap URLs.
    home.parsed.links.filter((l) => l.type === 'internal' && !l.nofollow).forEach((l) => enqueue(l.url));
    (sitemap?.sampleUrls || []).forEach(enqueue);

    let done = 0;
    let stoppedForTime = false;
    while (pages.length < maxPages && queue.length) {
      if (timeLeft() < 150_000) { stoppedForTime = true; break; }
      const batch = queue.splice(0, Math.min(config.crawler.concurrency, maxPages - pages.length));
      const results = await pool(batch, config.crawler.concurrency, async (u) => pageRecord(u, await safeFetch(u)));
      for (const r of results) {
        pages.push(r);
        done++;
        if (r.parsed && pages.length < maxPages * 3) r.parsed.links.filter((l) => l.type === 'internal' && !l.nofollow).forEach((l) => enqueue(l.url));
      }
      stage('crawl', 'running', `${done} / ${Math.min(maxPages - 1, done + queue.length)} pages`);
    }
    if (stoppedForTime) warnings.push(`The crawl stopped at ${pages.length} pages to finish within the time limit. Very slow or very large sites may need a smaller audit.`);
    stage('crawl', 'done', `${pages.length} page(s) fetched${crawlSkipped.length ? ` · ${crawlSkipped.length} skipped by robots.txt` : ''}`);
  } else {
    stage('crawl', 'skipped', 'Homepage audit — no additional pages crawled');
  }

  // 5. Security ────────────────────────────────────────────────────────
  stage('security', 'running');
  const host = new URL(home.finalUrl).hostname;
  const altHost = host.startsWith('www.') ? host.slice(4) : `www.${host}`;
  const [cert, httpRedirect, hostAltRes, favRes] = await Promise.all([
    inspectCertificate(host).catch((e) => ({ available: false, error: e.message })),
    checkHttpRedirect(host).catch((e) => ({ checked: false, error: e.message })),
    safeFetch(`${new URL(home.finalUrl).protocol}//${altHost}/`, { maxBytes: 128 * 1024, timeoutMs: 10000 }).catch(() => null),
    home.parsed.favicon ? Promise.resolve(null) : checkStatus(new URL('/favicon.ico', origin).toString()).catch(() => null),
  ]);
  let hostAlt = { checked: false };
  if (hostAltRes) {
    if (hostAltRes.ok) {
      const finalHost = new URL(hostAltRes.url).hostname;
      hostAlt = { checked: true, altHost, primaryHost: host, altUrl: `${new URL(home.finalUrl).protocol}//${altHost}/`, status: hostAltRes.redirects[0]?.status || hostAltRes.status, finalUrl: hostAltRes.url, consolidated: finalHost === host, duplicate: finalHost !== host && hostAltRes.status === 200 };
    } else {
      hostAlt = { checked: true, altHost, primaryHost: host, altUrl: `https://${altHost}/`, status: null, consolidated: false, duplicate: false, unreachable: true };
    }
  }
  const security = { cert, httpRedirect, headers: securityHeaders(home.headers), hostAlt };
  const faviconFallback = favRes?.ok && favRes.status === 200 ? new URL('/favicon.ico', origin).toString() : null;
  stage('security', 'done', `${home.finalUrl.startsWith('https') ? 'HTTPS' : 'HTTP'}${cert?.available ? ` · certificate ${cert.valid ? 'valid' : 'invalid'}` : ''}`);

  // 6. Links ───────────────────────────────────────────────────────────
  stage('links', 'running');
  const crawledStatus = new Map(pages.map((p) => [p.requestedUrl.replace(/\/$/, ''), p.status]));
  const allLinks = home.parsed.links.filter((l) => l.type === 'internal' || l.type === 'external');
  const uniq = [...new Map(allLinks.map((l) => [l.url, l])).values()];
  const internalToCheck = uniq.filter((l) => l.type === 'internal' && !SKIP_EXT.test(l.url));
  const externalToCheck = uniq.filter((l) => l.type === 'external');
  const limit = config.crawler.linkCheckLimit;
  const linkBudget = timeLeft() < 120_000 ? Math.min(limit, 20) : limit;
  const toCheck = [...internalToCheck.slice(0, Math.ceil(linkBudget * 0.6)), ...externalToCheck.slice(0, Math.floor(linkBudget * 0.4))];
  let checkedCount = 0;
  const linkChecks = await pool(toCheck, 6, async (l) => {
    const known = crawledStatus.get(l.url.replace(/\/$/, ''));
    let status = known ?? null, error = null, finalUrl = null;
    if (status == null) {
      const r = await checkStatus(l.url);
      status = r.ok ? r.status : null;
      error = r.ok ? null : r.error?.message;
      finalUrl = r.url;
    }
    checkedCount++;
    if (checkedCount % 10 === 0) stage('links', 'running', `${checkedCount} / ${toCheck.length} links checked`);
    return { url: l.url, anchor: l.anchor, type: l.type, nofollow: l.nofollow, status, error, finalUrl };
  });
  stage('links', 'done', `${linkChecks.length} of ${uniq.length} unique links checked`);

  // 7. Performance ─────────────────────────────────────────────────────
  let pagespeed = null;
  if (input.usePageSpeed && timeLeft() < 75_000) {
    pagespeed = { enabled: false, mobile: null, desktop: null, note: 'PageSpeed Insights was skipped to finish within the time limit.' };
    stage('performance', 'skipped', 'Skipped to stay within the time limit');
  } else if (input.usePageSpeed) {
    stage('performance', 'running', 'Google PageSpeed Insights (mobile & desktop) — usually 20–60 seconds');
    pagespeed = await runPageSpeed(home.finalUrl).catch((e) => ({ enabled: true, mobile: { available: false, error: e.message }, desktop: { available: false, error: e.message } }));
    const ok = [pagespeed.mobile, pagespeed.desktop].filter((x) => x?.available).length;
    stage('performance', 'done', ok ? `Mobile ${pagespeed.mobile?.score ?? '—'} · Desktop ${pagespeed.desktop?.score ?? '—'}` : 'PageSpeed data unavailable');
  } else {
    pagespeed = { enabled: false, mobile: null, desktop: null, note: 'PageSpeed Insights was not requested for this audit.' };
    stage('performance', 'skipped', 'PageSpeed not requested');
  }

  // 8. External data ───────────────────────────────────────────────────
  stage('external', 'running');
  const domain = host.replace(/^www\./, '');
  const [backlinks, traffic] = await Promise.all([getBacklinks(domain).catch((e) => ({ available: false, reason: e.message })), getTraffic(domain).catch((e) => ({ available: false, reason: e.message }))]);
  stage('external', 'done', `Backlinks: ${backlinks.available ? backlinks.source : 'not connected'} · Traffic: ${traffic.available ? traffic.source : 'not connected'}`);

  // 9. Rule engine ─────────────────────────────────────────────────────
  stage('analyze', 'running');
  const allHtml = pages.filter((p) => p.html).map((p) => p.html).join('\n');
  const technologies = detectTechnologies(allHtml, { ...home.parsed, scripts: pages.flatMap((p) => p.parsed?.scripts || []), generator: home.parsed.generator }, home.headers);
  const analytics = detectAnalytics(allHtml, { scripts: pages.flatMap((p) => p.parsed?.scripts || []) });
  home.keywords = analyzeKeywords(home.parsed, home.finalUrl, input.keywords);

  const discoveredInternal = [...new Set(pages.flatMap((p) => (p.parsed?.links || []).filter((l) => l.type === 'internal').map((l) => l.url)))];
  const urlAnalysis = discoveredInternal.map(urlFacts).filter(Boolean).slice(0, 500);

  const checks = runChecks({ input, home, pages, robots, sitemap, security, pagespeed, linkChecks, urlAnalysis, analytics, faviconFallback });
  const platforms = technologies.detected.map((t) => t.name);
  const score = computeScore(checks);
  const issues = buildIssues(checks, platforms);
  const groups = groupIssues(issues);
  const roadmap = buildRoadmap(issues);
  const counts = {
    critical: issues.filter((i) => i.priority === 'CRITICAL').length,
    high: issues.filter((i) => i.priority === 'HIGH').length,
    medium: issues.filter((i) => i.priority === 'MEDIUM').length,
    low: issues.filter((i) => i.priority === 'LOW').length,
    passed: checks.filter((c) => c.status === 'pass').length,
    warnings: checks.filter((c) => c.status === 'warning').length,
    failed: checks.filter((c) => c.status === 'fail').length,
    unavailable: checks.filter((c) => c.status === 'unavailable' || c.status === 'info').length,
  };
  stage('analyze', 'done', `${checks.length} checks · ${issues.length} issues · score ${score.overall}`);

  const { parsed: _p, html: _h, keywords: _k, ...robotsLite } = robots || {};
  const audit = {
    schemaVersion: 1,
    website: home.finalUrl,
    domain,
    auditDate: new Date().toISOString(),
    durationMs: 0,
    input,
    mode,
    pagesAnalyzed: pages.filter((p) => p.parsed).length,
    pagesRequested: pages.length,
    score,
    counts,
    // RAW EVIDENCE — written once by the crawler/collectors, never by AI.
    evidence: {
      pages: pages.map(storablePage),
      keywords: home.keywords,
      robots: robots ? { ...robotsLite, parsed: undefined } : null,
      sitemap,
      security,
      performance: {
        measured: { ttfbMs: home.timing.ttfbMs, totalMs: home.timing.totalMs, htmlBytes: home.parsed.htmlBytes, transferBytes: home.bytes, compression: home.headers['content-encoding'] || null, resources: home.parsed.resourceCounts, source: 'Measured by the audit server (single request)' },
        pagespeed,
      },
      technologies,
      analytics,
      server: { server: home.headers.server || null, poweredBy: home.headers['x-powered-by'] || null, contentType: home.headers['content-type'] || null, cacheControl: home.headers['cache-control'] || null, httpVersion: null, headers: Object.fromEntries(Object.entries(home.headers).filter(([k]) => !/cookie/i.test(k)).slice(0, 40)) },
      links: { checked: linkChecks, totalUnique: uniq.length, internalUnique: internalToCheck.length, externalUnique: externalToCheck.length },
      urls: urlAnalysis,
      backlinks,
      traffic,
      crawlSkipped,
    },
    checks,
    issues,
    issueGroups: groups,
    roadmap,
    warnings,
    // AI INTERPRETATION — separate namespace.
    interpretation: { ai: null },
  };

  // 10. AI ─────────────────────────────────────────────────────────────
  stage('ai', 'running');
  audit.interpretation.ai = input.skipAI ? { available: false, reason: 'Consultant analysis is included with paid audits.' }
    : timeLeft() < 45_000 ? { available: false, reason: 'Consultant analysis was skipped to finish within the time limit. Rule-based guidance is shown instead.' }
    : await interpret(audit, { timeoutMs: Math.min(120_000, timeLeft() - 25_000) });
  stage('ai', audit.interpretation.ai.available ? 'done' : 'skipped', audit.interpretation.ai.available ? 'Consultant analysis ready' : audit.interpretation.ai.reason);

  audit.durationMs = Date.now() - startedAt;
  return audit;
}
