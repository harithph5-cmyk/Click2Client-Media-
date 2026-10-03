// SEO rule engine. Turns raw evidence into factual checks with a status.
// Pure & deterministic: same evidence in → same checks out.
//
// status: pass | warning | fail | info | unavailable
//   info/unavailable are excluded from scoring (never penalise what we
//   could not verify).

export const CATEGORIES = {
  onpage: { label: 'On-Page SEO', weight: 22 },
  technical: { label: 'Technical SEO', weight: 20 },
  content: { label: 'Content & Keywords', weight: 12 },
  performance: { label: 'Performance', weight: 12 },
  mobile: { label: 'Mobile', weight: 10 },
  security: { label: 'Security', weight: 10 },
  images: { label: 'Images', weight: 6 },
  links: { label: 'Links', weight: 5 },
  social: { label: 'Social', weight: 3 },
  local: { label: 'Local SEO', weight: 5 },
  analytics: { label: 'Analytics', weight: 0 },
};

const EARN = { pass: 1, warning: 0.5, fail: 0 };
const len = (s) => (s ? [...s].length : 0);
const q = (s, n = 120) => (s == null ? '—' : `"${s.length > n ? s.slice(0, n) + '…' : s}"`);
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

export function runChecks(data) {
  const checks = [];
  const { home, pages, input } = data;
  const hp = home.parsed;
  const okPages = pages.filter((p) => p.parsed && p.status === 200);

  const add = (c) => {
    checks.push({ evidenceType: 'verified', pagesEvaluated: 1, ...c });
  };

  // Per-page check aggregated across all crawled pages.
  const perPage = (id, category, title, severity, fn) => {
    const results = [];
    for (const p of okPages) {
      const r = fn(p.parsed, p);
      if (r) results.push({ url: p.finalUrl, ...r });
    }
    if (!results.length) return;
    const homeRes = results.find((r) => r.url === home.finalUrl) || results[0];
    const bad = results.filter((r) => r.status !== 'pass');
    const earned = results.reduce((s, r) => s + (EARN[r.status] ?? 1), 0) / results.length;
    let status = homeRes.status;
    let value = homeRes.value;
    let evidence = homeRes.evidence;
    if (status === 'pass' && bad.length) {
      status = bad.some((b) => b.status === 'fail') && bad.length / results.length > 0.5 ? 'fail' : 'warning';
      value = `${bad.length} of ${results.length} pages`;
      evidence = bad.slice(0, 8).map((b) => `${b.url} — ${Array.isArray(b.value) ? b.value.join(', ') : b.value}`);
    } else if (bad.length > 1 && results.length > 1) {
      value = `${value} (homepage) · ${bad.length} of ${results.length} pages affected`;
    }
    add({
      id, category, title, severity, status,
      value, expected: homeRes.expected, evidence,
      earned,
      pagesEvaluated: results.length,
      affected: results.length > 1 ? { count: bad.length, total: results.length, pages: bad.slice(0, 50).map((b) => ({ url: b.url, value: b.value, status: b.status })) } : null,
    });
  };

  // ── HTTP / indexability ───────────────────────────────────────────────
  add({
    id: 'status_code', category: 'technical', title: 'Homepage HTTP status', severity: 'critical',
    status: home.status === 200 ? 'pass' : 'fail',
    value: `HTTP ${home.status}`, expected: 'HTTP 200',
    evidence: home.redirects.length ? `${home.requestedUrl} → ${home.finalUrl} (${home.redirects.length} redirect${home.redirects.length > 1 ? 's' : ''})` : `${home.finalUrl} responded ${home.status}`,
  });
  const brokenPages = pages.filter((p) => p !== home && p.status && p.status >= 400);
  if (pages.length > 1) {
    add({
      id: 'broken_internal_links', category: 'links', title: 'Crawled pages returning errors', severity: 'high',
      status: brokenPages.length ? 'fail' : 'pass',
      value: `${brokenPages.length} of ${pages.length - 1} internal pages`,
      expected: 'All internal pages return 200',
      evidence: brokenPages.length ? brokenPages.slice(0, 10).map((p) => `${p.requestedUrl} → HTTP ${p.status}`) : 'Every crawled internal page responded successfully.',
      affected: { count: brokenPages.length, total: pages.length - 1, pages: brokenPages.map((p) => ({ url: p.requestedUrl, value: `HTTP ${p.status}`, status: 'fail' })) },
      _source: 'crawl',
    });
  }

  perPage('noindex', 'technical', 'Indexability (noindex)', 'critical', (p, rec) => {
    const meta = p.metaRobots.join(', ');
    const header = rec.headers['x-robots-tag'] || '';
    const blocked = /noindex/i.test(meta) || /noindex/i.test(header);
    return {
      status: blocked ? 'fail' : 'pass',
      value: blocked ? `noindex via ${/noindex/i.test(meta) ? 'meta robots' : 'X-Robots-Tag header'}` : 'Indexable',
      expected: 'No noindex on pages meant to rank',
      evidence: meta || header ? `meta robots: ${meta || '—'} · X-Robots-Tag: ${header || '—'}` : 'No robots meta tag or X-Robots-Tag header (defaults to index, follow).',
    };
  });

  if (data.robots?.available) {
    const rootCheck = data.robots.homeAllowed;
    if (rootCheck && !rootCheck.allowed) {
      add({
        id: 'robots_blocks_site', category: 'technical', title: 'robots.txt blocks the homepage', severity: 'critical', status: 'fail',
        value: `Blocked by "${rootCheck.rule.type}: ${rootCheck.rule.path}"`, expected: 'Public pages crawlable',
        evidence: `Rule applies to Googlebot / all crawlers in ${data.robots.url}`,
      });
    }
  }

  // ── Title & meta ─────────────────────────────────────────────────────
  perPage('title_present', 'onpage', 'Title tag', 'critical', (p) => ({
    status: p.title.text ? 'pass' : 'fail',
    value: p.title.text ? q(p.title.text) : 'Missing',
    expected: 'A unique, descriptive <title>',
    evidence: p.title.text ? `${len(p.title.text)} characters` : 'No <title> element found in the HTML.',
  }));
  perPage('title_length', 'onpage', 'Title length', 'medium', (p) => {
    if (!p.title.text) return null;
    const n = len(p.title.text);
    return {
      status: n >= 30 && n <= 60 ? 'pass' : n < 15 || n > 75 ? 'fail' : 'warning',
      value: `${n} characters`, expected: '30–60 characters',
      evidence: q(p.title.text),
    };
  });
  if (hp.title.values.length > 1) {
    add({ id: 'title_multiple', category: 'onpage', title: 'Multiple title tags', severity: 'low', status: 'warning', value: `${hp.title.values.length} <title> tags`, expected: 'Exactly one', evidence: hp.title.values.map((t) => q(t, 80)) });
  }
  perPage('meta_desc_present', 'onpage', 'Meta description', 'high', (p) => ({
    status: p.metaDescription.text ? 'pass' : 'fail',
    value: p.metaDescription.text ? q(p.metaDescription.text, 170) : 'Missing',
    expected: 'A unique description of the page',
    evidence: p.metaDescription.text ? `${len(p.metaDescription.text)} characters` : 'No <meta name="description"> found.',
  }));
  perPage('meta_desc_length', 'onpage', 'Meta description length', 'low', (p) => {
    if (!p.metaDescription.text) return null;
    const n = len(p.metaDescription.text);
    return { status: n >= 70 && n <= 160 ? 'pass' : 'warning', value: `${n} characters`, expected: '70–160 characters', evidence: q(p.metaDescription.text, 170) };
  });

  // ── Headings ─────────────────────────────────────────────────────────
  perPage('h1_present', 'onpage', 'H1 heading', 'high', (p) => ({
    status: p.headings.h1.length ? 'pass' : 'fail',
    value: p.headings.h1.length ? q(p.headings.h1[0], 90) : 'No H1 found',
    expected: 'One descriptive H1',
    evidence: p.headings.h1.length ? `${p.headings.h1.length} H1 tag(s)` : 'No <h1> element in the HTML.',
  }));
  perPage('h1_single', 'onpage', 'Single H1', 'low', (p) => {
    if (p.headings.h1.length <= 1) return p.headings.h1.length ? { status: 'pass', value: '1 H1', expected: '1 H1', evidence: q(p.headings.h1[0], 90) } : null;
    return { status: 'warning', value: `${p.headings.h1.length} H1 tags`, expected: '1 H1 (recommended)', evidence: p.headings.h1.slice(0, 6).map((h) => q(h, 80)) };
  });
  perPage('heading_hierarchy', 'onpage', 'Heading hierarchy', 'low', (p) => {
    const skips = [];
    let prev = 0;
    for (const h of p.headingOrder) {
      if (prev && h.level > prev + 1) skips.push(`H${prev} → H${h.level} at ${q(h.text, 50)}`);
      prev = h.level;
    }
    if (!p.headingOrder.length) return null;
    return { status: skips.length ? 'warning' : 'pass', value: skips.length ? `${skips.length} skipped level(s)` : 'Logical order', expected: 'No skipped heading levels', evidence: skips.length ? skips.slice(0, 6) : `${p.headingOrder.length} headings in sequence` };
  });

  // ── Content ──────────────────────────────────────────────────────────
  perPage('content_length', 'content', 'Content depth', 'medium', (p) => ({
    status: p.wordCount >= 300 ? 'pass' : p.wordCount >= 100 ? 'warning' : 'fail',
    value: `${p.wordCount.toLocaleString('en-IN')} words`, expected: '300+ words of useful content (guideline, not a rule)',
    evidence: `Visible text extracted from the HTML (scripts, styles and navigation code excluded).`,
  }));
  perPage('text_html_ratio', 'content', 'Text-to-HTML ratio', 'low', (p) => {
    const r = p.htmlBytes ? (100 * p.textBytes) / p.htmlBytes : 0;
    return { status: r >= 10 ? 'pass' : 'warning', value: `${r.toFixed(1)}%`, expected: '≥ 10% (diagnostic only)', evidence: `${(p.textBytes / 1024).toFixed(1)} KB text in ${(p.htmlBytes / 1024).toFixed(1)} KB HTML` };
  });
  if (hp.emptyAppRoot || (hp.wordCount < 60 && hp.resourceCounts.scripts >= 5)) {
    add({
      id: 'js_rendering', category: 'technical', title: 'Content depends on JavaScript', severity: 'high', status: 'warning', evidenceType: 'detected',
      value: `${hp.wordCount} words in initial HTML; ${hp.resourceCounts.scripts} scripts`, expected: 'Main content present in HTML',
      evidence: hp.emptyAppRoot ? 'An empty application root element (#root / #app / #__next) was found — content is rendered client-side.' : 'Very little text in the initial HTML relative to script usage.',
    });
  }

  const kw = home.keywords;
  if (kw?.possibleStuffing?.length) {
    add({
      id: 'keyword_stuffing', category: 'content', title: 'Possible keyword over-use', severity: 'medium', status: 'warning', evidenceType: 'detected',
      value: kw.possibleStuffing.map((k) => `${k.term} (${k.density}%)`).join(', '), expected: 'No single term above ~4% of words',
      evidence: `Measured across ${kw.totalWords} words on the homepage.`,
    });
  }
  for (const t of kw?.targetKeywords || []) {
    const mk = (id, where, sev, flag) => add({
      id, category: 'content', title: `Target keyword in ${where}: "${t.term}"`, severity: sev, status: flag ? 'pass' : 'warning',
      value: flag ? 'Present' : 'Not found', expected: `Keyword appears in the ${where}`,
      evidence: `Checked homepage ${where}.`, keyword: t.term, instanceKey: `${id}:${t.term}`,
    });
    mk('kw_in_title', 'title', 'medium', t.title);
    mk('kw_in_h1', 'H1', 'medium', t.h1);
    mk('kw_in_meta', 'meta description', 'low', t.meta);
    mk('kw_in_content', 'content', 'medium', t.content);
  }

  // ── Images ───────────────────────────────────────────────────────────
  perPage('img_alt', 'images', 'Image ALT attributes', 'medium', (p) => {
    const imgs = p.images.filter((i) => i.src !== '(inline data URI)');
    if (!imgs.length) return null;
    const missing = imgs.filter((i) => i.alt === null);
    const share = missing.length / imgs.length;
    return {
      status: missing.length === 0 ? 'pass' : share <= 0.2 ? 'warning' : 'fail',
      value: `${missing.length} of ${imgs.length} images missing ALT`, expected: 'Every meaningful image has ALT text',
      evidence: missing.length ? missing.slice(0, 8).map((i) => i.src) : `All ${imgs.length} images have an alt attribute.`,
    };
  });
  const allImgs = hp.images.filter((i) => i.src !== '(inline data URI)');
  if (allImgs.length) {
    const generic = allImgs.filter((i) => /^(img|dsc|dcim|image|photo|pxl|screenshot|whatsapp[ _-]image|untitled|unnamed|download)[\W_]*\d*/i.test(i.filename || '') || /^[0-9a-f-]{20,}\.\w+$/i.test(i.filename || ''));
    add({ id: 'image_filenames', category: 'images', title: 'Descriptive image filenames', severity: 'low', status: generic.length / allImgs.length > 0.3 ? 'warning' : 'pass', value: `${generic.length} of ${allImgs.length} generic filenames`, expected: 'Descriptive, hyphenated filenames', evidence: generic.length ? generic.slice(0, 8).map((i) => i.filename) : 'Filenames look descriptive.' });
    const noDims = allImgs.filter((i) => !i.width || !i.height);
    add({ id: 'image_dimensions', category: 'images', title: 'Image width/height attributes', severity: 'low', status: noDims.length / allImgs.length > 0.5 ? 'warning' : 'pass', value: `${noDims.length} of ${allImgs.length} without dimensions`, expected: 'Width and height set', evidence: noDims.length ? noDims.slice(0, 6).map((i) => i.src) : 'All images declare dimensions.' });
    const modern = allImgs.filter((i) => /\.(webp|avif)(\?|$)/i.test(i.src) || /[?&](format|fm)=(webp|avif)/i.test(i.src));
    const raster = allImgs.filter((i) => /\.(jpe?g|png|webp|avif)(\?|$)/i.test(i.src));
    if (raster.length >= 3) add({ id: 'image_format', category: 'images', title: 'Modern image formats', severity: 'low', status: modern.length ? 'pass' : 'warning', evidenceType: 'detected', value: `${modern.length} of ${raster.length} WebP/AVIF (by URL)`, expected: 'WebP or AVIF for photos', evidence: 'Determined from file extensions in image URLs. CDNs that convert formats on the fly may not be visible here.' });
    if (allImgs.length >= 8) {
      const lazy = allImgs.filter((i) => i.loading === 'lazy' || /lazy/i.test(i.src));
      add({ id: 'image_lazy', category: 'images', title: 'Lazy-loading of images', severity: 'low', status: lazy.length ? 'pass' : 'warning', evidenceType: 'detected', value: `${lazy.length} of ${allImgs.length} lazy-loaded`, expected: 'Below-the-fold images lazy-loaded', evidence: 'Based on loading="lazy" attributes. JavaScript lazy-loaders may not be visible in HTML.' });
    }
  }

  // ── Canonical ────────────────────────────────────────────────────────
  perPage('canonical_present', 'technical', 'Canonical tag', 'medium', (p) => ({
    status: p.canonicals.length ? 'pass' : 'warning',
    value: p.canonicals.length ? p.canonicals[0].resolved : 'Missing',
    expected: 'Self-referencing canonical',
    evidence: p.canonicals.length ? `href="${p.canonicals[0].raw}"` : 'No <link rel="canonical"> found.',
  }));
  perPage('canonical_multiple', 'technical', 'Single canonical tag', 'high', (p) => {
    if (p.canonicals.length < 2) return p.canonicals.length ? { status: 'pass', value: '1 canonical', expected: '1', evidence: p.canonicals[0].resolved } : null;
    return { status: 'fail', value: `${p.canonicals.length} canonical tags`, expected: 'Exactly one', evidence: p.canonicals.map((c) => c.resolved) };
  });
  const norm = (u) => { try { const x = new URL(u); return (x.protocol + '//' + x.host.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + x.search).toLowerCase(); } catch { return u; } };
  perPage('canonical_match', 'technical', 'Canonical points to this page', 'medium', (p, rec) => {
    if (p.canonicals.length !== 1 || !p.canonicals[0].resolved) return null;
    const c = p.canonicals[0].resolved;
    const same = norm(c) === norm(rec.finalUrl);
    let crossHost = false;
    try { crossHost = new URL(c).hostname.replace(/^www\./, '') !== new URL(rec.finalUrl).hostname.replace(/^www\./, ''); } catch {}
    const schemeDiff = !same && norm(c.replace(/^http:/, 'https:')) === norm(rec.finalUrl.replace(/^http:/, 'https:'));
    return {
      status: same ? 'pass' : crossHost || schemeDiff ? 'fail' : 'warning',
      value: same ? 'Self-referencing' : crossHost ? 'Points to another domain' : schemeDiff ? 'Protocol mismatch' : 'Points to a different URL',
      expected: 'Canonical = current URL (for normal pages)',
      evidence: `Page: ${rec.finalUrl} · Canonical: ${c}`,
    };
  });

  // ── Robots & sitemap ─────────────────────────────────────────────────
  if (data.robots) {
    if (data.robots.available) {
      add({ id: 'robots_txt', category: 'technical', title: 'robots.txt', severity: 'medium', status: 'pass', value: `Found (HTTP ${data.robots.status})`, expected: 'Accessible robots.txt', evidence: `${data.robots.url} · ${data.robots.groups.length} user-agent group(s)` });
      add({ id: 'robots_sitemap_ref', category: 'technical', title: 'Sitemap referenced in robots.txt', severity: 'low', status: data.robots.sitemaps.length ? 'pass' : 'warning', value: data.robots.sitemaps.length ? data.robots.sitemaps.join(', ') : 'No Sitemap: line', expected: 'Sitemap: <url> line', evidence: data.robots.url });
    } else if (data.robots.status === 404 || data.robots.status >= 200) {
      add({ id: 'robots_txt', category: 'technical', title: 'robots.txt', severity: 'medium', status: 'warning', value: data.robots.note || 'Not available', expected: 'Accessible robots.txt', evidence: `${data.robots.url} → ${data.robots.status ? 'HTTP ' + data.robots.status : data.robots.error?.message}` });
    } else {
      add({ id: 'robots_txt', category: 'technical', title: 'robots.txt', severity: 'medium', status: 'unavailable', value: 'Could not be verified', evidence: data.robots.error?.message || 'Request failed' });
    }
  }
  if (data.sitemap) {
    const s = data.sitemap;
    const invalid = s.checked.find((c) => c.accessible && c.valid === false && c.source === 'robots.txt');
    add({
      id: 'sitemap', category: 'technical', title: 'XML sitemap', severity: 'medium',
      status: s.found ? (invalid ? 'warning' : 'pass') : 'warning',
      value: s.found ? `${s.primary.url} (${s.primary.type === 'index' ? `index of ${s.childrenTotal} sitemaps` : `${s.urlCount} URLs`})` : 'Not found',
      expected: 'Valid XML sitemap',
      evidence: s.found ? `${s.urlCount}${s.urlCountIsPartial ? '+' : ''} URLs discovered${invalid ? ` · Invalid sitemap also referenced: ${invalid.url}` : ''}` : s.checked.map((c) => `${c.url} → ${c.status ? 'HTTP ' + c.status : c.error || 'no response'}${c.note ? ' (' + c.note + ')' : ''}`),
    });
  }

  // ── Technical misc ───────────────────────────────────────────────────
  add({ id: 'lang_attr', category: 'technical', title: 'HTML lang attribute', severity: 'low', status: hp.lang ? 'pass' : 'warning', value: hp.lang || 'Missing', expected: 'e.g. lang="en-IN"', evidence: hp.lang ? `<html lang="${hp.lang}">` : '<html> has no lang attribute.' });
  add({ id: 'charset', category: 'technical', title: 'Character encoding', severity: 'low', status: hp.charset || /charset/i.test(home.headers['content-type'] || '') ? 'pass' : 'warning', value: hp.charset || (/charset=([\w-]+)/i.exec(home.headers['content-type'] || '')?.[1]) || 'Not declared', expected: 'UTF-8', evidence: `Content-Type: ${home.headers['content-type'] || '—'}` });
  add({ id: 'doctype', category: 'technical', title: 'Doctype', severity: 'low', status: hp.doctype ? 'pass' : 'warning', value: hp.doctype ? `<!DOCTYPE ${hp.doctype}>` : 'Missing', expected: '<!DOCTYPE html>', evidence: 'Checked start of HTML document.' });
  if (hp.deprecatedTags.length || hp.flash) add({ id: 'deprecated_html', category: 'technical', title: 'Obsolete HTML', severity: 'low', status: 'warning', value: [...hp.deprecatedTags.map((t) => `<${t}>`), hp.flash ? 'Flash embed' : null].filter(Boolean).join(', '), expected: 'Modern HTML5', evidence: 'Found in homepage HTML.' });
  if (hp.jsonLdErrors.length) add({ id: 'structured_data_errors', category: 'technical', title: 'Structured data syntax', severity: 'medium', status: 'fail', value: `${hp.jsonLdErrors.length} invalid JSON-LD block(s)`, expected: 'Valid JSON', evidence: hp.jsonLdErrors.map((e) => e + '…') });
  add({ id: 'structured_data', category: 'technical', title: 'Structured data (schema.org)', severity: 'medium', status: hp.jsonLd.length || hp.hasMicrodata ? 'pass' : 'warning', value: hp.jsonLd.length ? hp.jsonLd.slice(0, 10).join(', ') : hp.hasMicrodata ? 'Microdata present' : 'None found', expected: 'Organization / LocalBusiness / WebSite JSON-LD', evidence: hp.jsonLd.length ? `${hp.jsonLd.length} schema type(s) in JSON-LD` : 'No JSON-LD or microdata on the homepage.' });
  add({ id: 'favicon', category: 'technical', title: 'Favicon', severity: 'low', status: hp.favicon || data.faviconFallback ? 'pass' : 'warning', value: hp.favicon || data.faviconFallback || 'Not found', expected: 'Favicon declared', evidence: hp.favicon ? '<link rel="icon"> present' : data.faviconFallback ? '/favicon.ico responds 200' : 'No <link rel="icon"> and /favicon.ico not found.' });

  const htmlKb = hp.htmlBytes / 1024;
  add({ id: 'html_size', category: 'performance', title: 'HTML document size', severity: 'medium', status: htmlKb <= 300 ? 'pass' : htmlKb <= 1024 ? 'warning' : 'fail', value: `${htmlKb.toFixed(0)} KB${home.truncated ? '+ (truncated)' : ''}`, expected: '≤ 300 KB HTML', evidence: `Uncompressed HTML of ${home.finalUrl}` });
  const ttfb = home.timing.ttfbMs;
  add({ id: 'response_time', category: 'performance', title: 'Server response time', severity: 'medium', status: ttfb <= 800 ? 'pass' : ttfb <= 1800 ? 'warning' : 'fail', value: `${ttfb} ms`, expected: '≤ 800 ms', evidence: `Time to first byte measured from the audit server (single request; network distance affects this). Full HTML download: ${home.timing.totalMs} ms.` });
  const enc = home.headers['content-encoding'];
  add({ id: 'compression', category: 'performance', title: 'Text compression', severity: 'medium', status: enc && /gzip|br|zstd|deflate/i.test(enc) ? 'pass' : 'warning', value: enc || 'None', expected: 'gzip or br', evidence: `Content-Encoding header: ${enc || 'absent'}` });

  // ── PageSpeed ────────────────────────────────────────────────────────
  const ps = data.pagespeed;
  const psCheck = (strategy, id, sev) => {
    const r = ps?.[strategy];
    if (!r || !r.available) {
      add({ id, category: 'performance', title: `PageSpeed (${strategy})`, severity: sev, status: 'unavailable', evidenceType: 'unavailable', value: 'Could not be verified', evidence: r?.error || ps?.note || 'PageSpeed Insights was not run.' });
      return;
    }
    add({ id, category: 'performance', title: `PageSpeed performance (${strategy})`, severity: sev, status: r.score >= 90 ? 'pass' : r.score >= 50 ? 'warning' : 'fail', value: `${r.score} / 100`, expected: '90+', evidence: `Google Lighthouse ${r.lighthouseVersion} lab test · LCP ${r.lab.lcp?.display ?? '—'} · TBT ${r.lab.tbt?.display ?? '—'} · CLS ${r.lab.cls?.display ?? '—'}`, evidenceType: 'verified', source: 'Google PageSpeed Insights' });
  };
  psCheck('mobile', 'pagespeed_mobile', 'high');
  psCheck('desktop', 'pagespeed_desktop', 'medium');
  const field = ps?.mobile?.field;
  if (field) {
    const cat = field.overall;
    add({ id: 'cwv_field', category: 'performance', title: `Core Web Vitals (real users, ${field.scope === 'url' ? 'this page' : 'whole site'})`, severity: 'high', status: cat === 'FAST' ? 'pass' : cat === 'AVERAGE' ? 'warning' : cat === 'SLOW' ? 'fail' : 'info', value: cat || 'No assessment', expected: 'FAST (all metrics good)', evidence: `Chrome UX Report · LCP p75 ${field.lcp ? field.lcp.percentile + ' ms' : '—'} · INP p75 ${field.inp ? field.inp.percentile + ' ms' : '—'} · CLS p75 ${field.cls ? (field.cls.percentile / 100).toFixed(2) : '—'}`, source: 'Chrome UX Report via PageSpeed Insights' });
  } else {
    add({ id: 'cwv_field', category: 'performance', title: 'Core Web Vitals (real users)', severity: 'high', status: 'unavailable', evidenceType: 'unavailable', value: 'Could not be verified', evidence: ps?.mobile?.available ? 'Google has no real-user (CrUX) data for this site — common for low-traffic sites.' : 'Core Web Vitals could not be verified from the available data.' });
  }

  // ── Mobile ───────────────────────────────────────────────────────────
  const vp = hp.viewport;
  add({ id: 'viewport', category: 'mobile', title: 'Viewport meta tag', severity: 'high', status: vp && /width\s*=\s*device-width/i.test(vp) ? 'pass' : vp ? 'warning' : 'fail', value: vp ? q(vp) : 'Missing', expected: 'width=device-width, initial-scale=1', evidence: vp ? '<meta name="viewport"> found' : 'No viewport meta tag — mobile browsers will render a zoomed-out desktop layout.' });
  if (vp) add({ id: 'viewport_zoom', category: 'mobile', title: 'Pinch-zoom allowed', severity: 'low', status: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp) ? 'warning' : 'pass', value: /user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/i.test(vp) ? 'Zoom restricted' : 'Zoom allowed', expected: 'Zoom not disabled', evidence: q(vp) });
  const mob = ps?.mobile;
  if (mob?.available) {
    const fs = mob.fontSizeAudit?.score, tt = mob.tapTargetsAudit?.score;
    if (fs != null) add({ id: 'mobile_font', category: 'mobile', title: 'Legible font sizes (Lighthouse)', severity: 'medium', status: fs === 1 ? 'pass' : 'warning', value: fs === 1 ? 'Legible' : 'Some text too small', expected: '≥ 60% of text at 12px+', evidence: 'Google Lighthouse mobile audit', source: 'Google PageSpeed Insights' });
    if (tt != null) add({ id: 'mobile_tap', category: 'mobile', title: 'Tap target sizing (Lighthouse)', severity: 'medium', status: tt === 1 ? 'pass' : 'warning', value: tt === 1 ? 'Adequate' : 'Some targets too small/close', expected: 'Tap targets ≥ 48px', evidence: 'Google Lighthouse mobile audit', source: 'Google PageSpeed Insights' });
  }
  if (hp.appleTouchIcon !== undefined) add({ id: 'touch_icon', category: 'mobile', title: 'Apple touch icon', severity: 'low', status: hp.appleTouchIcon ? 'pass' : 'info', value: hp.appleTouchIcon ? 'Present' : 'Not found', expected: 'Optional', evidence: 'Used when visitors add the site to their home screen.' });

  // ── Security ─────────────────────────────────────────────────────────
  const sec = data.security;
  const isHttps = home.finalUrl.startsWith('https:');
  add({ id: 'https', category: 'security', title: 'HTTPS', severity: 'critical', status: isHttps ? 'pass' : 'fail', value: isHttps ? 'Served over HTTPS' : 'Served over HTTP', expected: 'HTTPS', evidence: `Final URL: ${home.finalUrl}` });
  if (sec?.cert) {
    const c = sec.cert;
    if (c.available) {
      add({ id: 'ssl_valid', category: 'security', title: 'SSL certificate', severity: 'critical', status: !c.valid ? 'fail' : c.daysRemaining < 14 ? 'warning' : 'pass', value: c.valid ? `Valid · expires in ${c.daysRemaining} days` : `Invalid (${c.error})`, expected: 'Valid, trusted certificate', evidence: `Issuer: ${c.issuer || '—'} · ${c.protocol || ''} · Valid until ${c.validTo.slice(0, 10)}` });
    } else if (isHttps) {
      add({ id: 'ssl_valid', category: 'security', title: 'SSL certificate', severity: 'critical', status: 'unavailable', evidenceType: 'unavailable', value: 'Could not be verified', evidence: c.error });
    }
  }
  if (sec?.httpRedirect) {
    const r = sec.httpRedirect;
    if (r.checked) add({ id: 'http_redirect', category: 'security', title: 'HTTP → HTTPS redirect', severity: 'high', status: r.redirectsToHttps ? (r.permanent ? 'pass' : 'warning') : 'fail', value: r.redirectsToHttps ? `Redirects (${r.firstStatus})` : 'No redirect to HTTPS', expected: '301/308 to https://', evidence: r.chain.length ? r.chain.map((h) => `${h.from} → ${h.status} → ${h.to}`) : `${r.url} → ${r.finalUrl}` });
    else add({ id: 'http_redirect', category: 'security', title: 'HTTP → HTTPS redirect', severity: 'high', status: 'unavailable', evidenceType: 'unavailable', value: 'Could not be verified', evidence: r.error || 'HTTP version not reachable.' });
  }
  if (isHttps) add({ id: 'hsts', category: 'security', title: 'HSTS header', severity: 'low', status: sec?.headers?.['strict-transport-security'] ? 'pass' : 'warning', value: sec?.headers?.['strict-transport-security'] || 'Not set', expected: 'max-age ≥ 6 months', evidence: 'Strict-Transport-Security response header' });
  if (isHttps) {
    const mixed = okPages.flatMap((p) => p.parsed.mixedContent.map((m) => ({ ...m, page: p.finalUrl })));
    add({ id: 'mixed_content', category: 'security', title: 'Mixed content', severity: 'high', status: mixed.length ? 'fail' : 'pass', value: mixed.length ? `${mixed.length} insecure resource(s)` : 'None detected', expected: 'No http:// resources on https pages', evidence: mixed.length ? mixed.slice(0, 10).map((m) => `<${m.tag}> ${m.url}`) : 'No http:// src/href for images, scripts, styles or frames found in HTML.', evidenceType: 'detected' });
  }
  if (sec?.hostAlt) {
    const h = sec.hostAlt;
    if (h.checked) add({ id: 'host_canonicalization', category: 'technical', title: 'www / non-www consolidation', severity: 'medium', status: h.consolidated ? 'pass' : h.duplicate ? 'warning' : 'info', value: h.consolidated ? `${h.altHost} redirects to ${h.primaryHost}` : h.duplicate ? `Both ${h.altHost} and ${h.primaryHost} serve content` : `${h.altHost} not reachable`, expected: 'One host; the other 301-redirects', evidence: `${h.altUrl} → ${h.status ? 'HTTP ' + h.status : 'no response'}${h.finalUrl ? ' → ' + h.finalUrl : ''}` });
  }
  if (home.redirects.length > 1) add({ id: 'redirect_chain', category: 'technical', title: 'Redirect chain on homepage', severity: 'medium', status: 'warning', value: `${home.redirects.length} hops`, expected: '≤ 1 redirect', evidence: home.redirects.map((r) => `${r.url} → ${r.status}`) });

  // ── Social ───────────────────────────────────────────────────────────
  const ogMissing = ['og:title', 'og:description', 'og:image'].filter((k) => !hp.og[k]);
  add({ id: 'og_tags', category: 'social', title: 'Open Graph tags', severity: 'low', status: ogMissing.length === 0 ? 'pass' : ogMissing.length === 3 ? 'fail' : 'warning', value: ogMissing.length ? `Missing: ${ogMissing.join(', ')}` : 'Complete', expected: 'og:title, og:description, og:image', evidence: Object.keys(hp.og).length ? Object.entries(hp.og).slice(0, 6).map(([k, v]) => `${k}: ${v.slice(0, 80)}`) : 'No Open Graph tags found.' });
  add({ id: 'twitter_card', category: 'social', title: 'Twitter / X card', severity: 'low', status: hp.twitter['twitter:card'] ? 'pass' : 'warning', value: hp.twitter['twitter:card'] || 'Not set', expected: 'summary_large_image', evidence: hp.twitter['twitter:card'] ? 'twitter:card present' : 'No twitter:card tag (X will fall back to Open Graph).' });

  // ── Links ────────────────────────────────────────────────────────────
  const homeInternal = hp.links.filter((l) => l.type === 'internal');
  const uniqInternal = new Set(homeInternal.map((l) => l.url));
  add({ id: 'internal_link_count', category: 'links', title: 'Internal links on homepage', severity: 'medium', status: uniqInternal.size >= 5 ? 'pass' : uniqInternal.size >= 2 ? 'warning' : 'fail', value: `${uniqInternal.size} unique internal links`, expected: '5+ links to key pages', evidence: `${homeInternal.length} internal <a> elements in total.` });
  const nofollowInt = homeInternal.filter((l) => l.nofollow);
  if (nofollowInt.length) add({ id: 'nofollow_internal', category: 'links', title: 'Nofollow on internal links', severity: 'low', status: 'warning', value: `${nofollowInt.length} internal nofollow link(s)`, expected: 'Internal links followed', evidence: nofollowInt.slice(0, 8).map((l) => `${l.url} (${l.anchor || 'no text'})`) });
  const empty = hp.links.filter((l) => (l.type === 'internal' || l.type === 'external') && !l.anchor);
  add({ id: 'empty_anchor', category: 'links', title: 'Links without anchor text', severity: 'low', status: empty.length === 0 ? 'pass' : 'warning', value: `${empty.length} link(s)`, expected: 'Descriptive text or aria-label', evidence: empty.length ? empty.slice(0, 8).map((l) => l.url) : 'Every link has text or an accessible label.' });
  if (data.linkChecks) {
    const lc = data.linkChecks;
    const bi = lc.filter((l) => l.type === 'internal' && l.status >= 400);
    const be = lc.filter((l) => l.type === 'external' && l.status >= 400 && ![401, 403, 429, 999].includes(l.status));
    const checkedInt = lc.filter((l) => l.type === 'internal');
    const checkedExt = lc.filter((l) => l.type === 'external');
    if (checkedInt.length && pages.length <= 1) add({ id: 'broken_internal_links', category: 'links', title: 'Broken internal links', severity: 'high', status: bi.length ? 'fail' : 'pass', value: `${bi.length} of ${checkedInt.length} checked`, expected: '0 broken', evidence: bi.length ? bi.map((l) => `${l.url} → ${l.status}`) : `All ${checkedInt.length} checked internal links respond.` });
    else if (bi.length) {
      const existing = checks.find((c) => c.id === 'broken_internal_links');
      if (existing) {
        existing.status = 'fail';
        existing.value = `${bi.length + brokenPages.length} broken`;
        existing.evidence = [...bi.map((l) => `${l.url} → ${l.status}`), ...(Array.isArray(existing.evidence) ? existing.evidence : [])];
      }
    }
    if (checkedExt.length) add({ id: 'broken_external_links', category: 'links', title: 'Broken external links', severity: 'low', status: be.length ? 'warning' : 'pass', value: `${be.length} of ${checkedExt.length} checked`, expected: '0 broken', evidence: be.length ? be.map((l) => `${l.url} → ${l.status}`) : `All ${checkedExt.length} checked external links respond (401/403/429 treated as "blocks bots", not broken).` });
  }

  // ── Multi-page duplicates ────────────────────────────────────────────
  if (okPages.length > 1) {
    const dup = (getter) => {
      const m = new Map();
      for (const p of okPages) { const v = getter(p.parsed); if (v) m.set(v, [...(m.get(v) || []), p.finalUrl]); }
      return [...m.entries()].filter(([, urls]) => urls.length > 1);
    };
    const dt = dup((p) => p.title.text?.toLowerCase());
    add({ id: 'duplicate_titles', category: 'onpage', title: 'Duplicate titles across pages', severity: 'medium', status: dt.length ? 'warning' : 'pass', value: dt.length ? `${dt.length} title(s) shared by ${dt.reduce((s, [, u]) => s + u.length, 0)} pages` : 'All unique', expected: 'Unique per page', evidence: dt.length ? dt.slice(0, 6).map(([t, u]) => `${q(t, 60)} on ${u.length} pages`) : `${okPages.length} pages compared.`, pagesEvaluated: okPages.length });
    const dm = dup((p) => p.metaDescription.text?.toLowerCase());
    add({ id: 'duplicate_meta', category: 'onpage', title: 'Duplicate meta descriptions', severity: 'low', status: dm.length ? 'warning' : 'pass', value: dm.length ? `${dm.length} description(s) reused` : 'All unique', expected: 'Unique per page', evidence: dm.length ? dm.slice(0, 6).map(([t, u]) => `${q(t, 60)} on ${u.length} pages`) : `${okPages.length} pages compared.`, pagesEvaluated: okPages.length });
  }

  // ── URLs ─────────────────────────────────────────────────────────────
  const urlSet = data.urlAnalysis || [];
  if (urlSet.length) {
    const flag = (id, title, test, expected) => {
      const bad = urlSet.filter(test);
      add({ id, category: 'technical', title, severity: 'low', status: bad.length ? 'warning' : 'pass', value: `${bad.length} of ${urlSet.length} URLs`, expected, evidence: bad.length ? bad.slice(0, 8).map((u) => u.url) : 'None found.' });
    };
    flag('url_length', 'Long URLs', (u) => u.length > 100, '≤ 100 characters');
    flag('url_underscore', 'Underscores in URLs', (u) => u.underscores, 'Hyphens, not underscores');
    flag('url_uppercase', 'Uppercase in URLs', (u) => u.uppercase, 'Lowercase paths');
    flag('url_params', 'Query parameters in internal links', (u) => u.params, 'Clean paths');
  }

  // ── Analytics (informational: we never penalise "not detected") ─────
  const an = data.analytics;
  add({ id: 'analytics', category: 'analytics', title: 'Analytics tracking', severity: 'low', status: an.tools.length ? 'pass' : 'info', evidenceType: an.tools.length ? 'detected' : 'unavailable', value: an.tools.length ? an.tools.map((t) => t.name).join(', ') : 'Not detected in page source', expected: 'GA4 or equivalent', evidence: an.note || an.tools.map((t) => `${t.name}: ${t.evidence}`) });

  // ── Local SEO (only when the user told us where the business is) ────
  const city = (input.city || input.location || '').split(',')[0].trim();
  if (city) {
    const inT = new RegExp(`\\b${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const where = { title: inT.test(hp.title.text || ''), h1: inT.test(hp.headings.h1.join(' ')), content: inT.test(hp.text) };
    const hits = Object.values(where).filter(Boolean).length;
    add({ id: 'local_city_mention', category: 'local', title: `Location "${city}" on homepage`, severity: 'medium', status: hits >= 2 ? 'pass' : hits === 1 ? 'warning' : 'fail', value: Object.entries(where).map(([k, v]) => `${k}: ${v ? '✓' : '✗'}`).join(' · '), expected: 'City in title, H1 and content', evidence: `Searched for "${city}" in homepage title, H1 and visible text.` });
    const tel = hp.links.filter((l) => l.type === 'tel');
    add({ id: 'local_phone', category: 'local', title: 'Click-to-call phone link', severity: 'low', status: tel.length ? 'pass' : 'warning', value: tel.length ? tel.slice(0, 3).map((t) => t.href.replace(/^tel:/i, '')).join(', ') : 'No tel: link', expected: 'tel: link on homepage', evidence: tel.length ? `${tel.length} tel: link(s)` : 'No tel: links found on the homepage.' });
    const localTypes = hp.jsonLd.filter((t) => /LocalBusiness|Store|Restaurant|Dentist|Physician|Hospital|LegalService|Attorney|Accounting|RealEstate|AutoDealer|Hotel|School|ProfessionalService|HomeAndConstructionBusiness|MedicalBusiness|HealthAndBeautyBusiness|FoodEstablishment/i.test(t));
    add({ id: 'local_schema', category: 'local', title: 'LocalBusiness structured data', severity: 'medium', status: localTypes.length ? 'pass' : 'warning', value: localTypes.length ? localTypes.join(', ') : 'Not found', expected: 'LocalBusiness JSON-LD', evidence: hp.jsonLd.length ? `Schema types found: ${hp.jsonLd.join(', ')}` : 'No JSON-LD on the homepage.' });
  }

  return checks;
}
