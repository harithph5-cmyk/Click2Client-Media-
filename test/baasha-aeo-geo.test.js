// AEO and GEO analysis: findings against fixture pages with known defects, the score arithmetic, the honesty rules
// (nothing is measured that was not collected), and the agent tools on a local fixture site. No network, no model.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

process.env.GEMINI_API_KEY = 'test-key-not-real-123456';
const { analyseAeo, analyseGeo, scoreChecks, METHOD, CRAWLERS, extract } = await import('../server/engine/aeo-geo.js');
const { parseRobots } = await import('../server/engine/robots.js');
const at = await import('../server/baasha/agenttools.js');
const { config } = await import('../server/config.js');

const NOW = new Date('2026-10-28T00:00:00Z');
const GOOD = `<!doctype html><html lang="en"><head><title>What is a canonical tag? | Acme SEO</title><meta name="author" content="Priya Nair">
<meta property="og:site_name" content="Acme SEO"><meta property="article:modified_time" content="2026-09-01T10:00:00Z">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Acme SEO","url":"https://acme.test/","sameAs":["https://www.linkedin.com/company/acme","https://x.com/acme"]},
{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Does a canonical tag guarantee indexing?","acceptedAnswer":{"@type":"Answer","text":"No."}}]}]}</script></head>
<body><header><a href="/about">About</a> <a href="/contact">Contact</a></header><main><article>
<h1>What is a canonical tag?</h1>
<p>A canonical tag is a link element that tells search engines which URL is the preferred version of a page when several URLs show similar content.</p>
<h2>How does a canonical tag work?</h2><p>It is a strong signal, not a command. Search engines may choose a different URL.</p>
<h2>Does a canonical tag guarantee indexing?</h2><p>No. Indexing is never guaranteed. In a 2025 review of 40 sites, 12 had conflicting signals. See <a href="https://developers.example.org/canonical">the official guide</a> and <a href="https://standards.example.net/rfc">the standard</a>.</p>
<ul><li>Use absolute URLs</li><li>Keep one tag per page</li></ul>
</article></main></body></html>`;
const POOR = `<html><head><title>Home</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":"Is our service the cheapest in the whole city for everyone?","acceptedAnswer":{"@type":"Answer","text":"Yes."}}]}</script></head>
<body><h1>Welcome</h1><p>Hi.</p><p>${'We offer many wonderful services for all customers who value excellence and care. '.repeat(30)}</p></body></html>`;

test('a well-structured page passes the AEO checks it should, with evidence', () => {
  const r = analyseAeo(GOOD, 'https://acme.test/canonical', NOW);
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by['aeo.direct_answer'].status, 'pass'); assert.match(by['aeo.direct_answer'].evidence, /canonical tag is a link element/);
  assert.equal(by['aeo.question_headings'].status, 'pass'); assert.equal(by['aeo.faq_consistency'].status, 'pass');
  assert.equal(by['aeo.author_attribution'].status, 'pass'); assert.equal(by['aeo.sources'].status, 'pass'); assert.equal(by['aeo.date'].status, 'pass');
  assert.ok(r.score >= 85, `score ${r.score}`); assert.equal(r.kind, 'aeo');
});

test('a poor page is flagged, and markup that is not visible is a failure, not a style note', () => {
  const r = analyseAeo(POOR, 'https://shop.test/', NOW);
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by['aeo.faq_consistency'].status, 'fail'); assert.match(by['aeo.faq_consistency'].evidence, /do not appear in the visible text/);
  assert.equal(by['aeo.author_attribution'].status, 'warn'); assert.equal(by['aeo.sources'].status, 'warn');
  assert.equal(by['aeo.direct_answer'].status, 'warn'); assert.ok(r.score < 50, `score ${r.score}`);
  assert.ok(analyseAeo(GOOD, 'https://acme.test/', NOW).score > r.score);
});

test('no FAQ and a short page are not penalised', () => {
  const r = analyseAeo('<html><head><title>Hi</title></head><body><h1>Hello</h1><p>Short page here with five words.</p></body></html>', 'https://x.test/', NOW);
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by['aeo.faq_consistency'].status, 'info'); assert.equal(by['aeo.question_headings'].status, 'info'); assert.equal(by['aeo.sources'].status, 'info');
});

test('GEO: entity markup, profile links and brand consistency are read from the page', () => {
  const r = analyseGeo(GOOD, 'https://acme.test/canonical', { robotsAvailable: false, now: NOW });
  const by = Object.fromEntries(r.checks.map((c) => [c.id, c]));
  assert.equal(by['geo.entity_schema'].status, 'pass'); assert.equal(by['geo.sameas'].status, 'pass'); assert.equal(by['geo.brand_consistency'].status, 'pass');
  assert.equal(by['geo.contact_identity'].status, 'pass'); assert.equal(by['geo.freshness'].status, 'pass'); assert.equal(by['geo.machine_readable'].status, 'pass');
  assert.equal(by['geo.crawler_access'].status, 'unavailable', 'robots.txt was not supplied, so it is not checked');
  const p = analyseGeo(POOR, 'https://shop.test/', { now: NOW });
  const bp = Object.fromEntries(p.checks.map((c) => [c.id, c]));
  assert.equal(bp['geo.entity_schema'].status, 'fail'); assert.equal(bp['geo.contact_identity'].status, 'fail'); assert.ok(p.score < r.score);
});

test('GEO crawler access: AI crawler blocks are information, search crawler blocks are failures', () => {
  const html = GOOD;
  const ai = analyseGeo(html, 'https://acme.test/p', { robotsParsed: parseRobots('User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n'), robotsAvailable: true, now: NOW });
  const a = ai.checks.find((c) => c.id === 'geo.crawler_access'); assert.equal(a.status, 'info'); assert.match(a.evidence, /GPTBot/); assert.match(a.evidence, /business decision/);
  const g = analyseGeo(html, 'https://acme.test/p', { robotsParsed: parseRobots('User-agent: Googlebot\nDisallow: /\n'), robotsAvailable: true, now: NOW });
  assert.equal(g.checks.find((c) => c.id === 'geo.crawler_access').status, 'fail');
  const open = analyseGeo(html, 'https://acme.test/p', { robotsParsed: parseRobots('User-agent: *\nAllow: /\n'), robotsAvailable: true, now: NOW });
  assert.equal(open.checks.find((c) => c.id === 'geo.crawler_access').status, 'pass');
  assert.ok(CRAWLERS.includes('Googlebot') && CRAWLERS.includes('GPTBot'));
});

test('honesty: results state the method and what was not measured, and never contain citations or mentions', () => {
  for (const r of [analyseAeo(GOOD, 'https://acme.test/', NOW), analyseGeo(GOOD, 'https://acme.test/', { now: NOW })]) {
    assert.equal(r.method.version, METHOD.version); assert.match(r.method.disclaimer, /not an official or industry-standard/);
    assert.ok(r.notMeasured.some((n) => /cites or mentions/.test(n)) && r.notMeasured.some((n) => /Rankings, traffic/.test(n)));
    assert.ok(!('citations' in r) && !('mentions' in r) && !('rank' in r));
  }
  const geo = analyseGeo(GOOD, 'https://acme.test/', { now: NOW }); const third = geo.checks.find((c) => c.id === 'geo.third_party');
  assert.equal(third.status, 'unavailable'); assert.match(third.evidence, /Not measured/);
  assert.equal(geo.checks.find((c) => c.id === 'geo.llms_txt').weight, 0, 'the experimental check is never scored');
});

test('score arithmetic follows the documented formula', () => {
  assert.deepEqual(scoreChecks([{ status: 'pass', weight: 2 }, { status: 'warn', weight: 2 }, { status: 'fail', weight: 1 }, { status: 'info', weight: 5 }, { status: 'unavailable', weight: 5 }]), { score: 60, graded: 3, excluded: 2 });
  assert.equal(scoreChecks([{ status: 'info', weight: 3 }]).score, null);
  assert.equal(scoreChecks([]).score, null);
});

test('extraction tolerates broken JSON-LD and empty HTML', () => {
  const x = extract('<html><head><script type="application/ld+json">{not json</script></head><body></body></html>', 'https://x.test/');
  assert.equal(x.ld.errors, 1); assert.equal(x.wordCount, 0);
  assert.equal(analyseAeo('', 'https://x.test/', NOW).checks.find((c) => c.id === 'aeo.structured_data').status, 'info');
  assert.equal(analyseAeo('<script type="application/ld+json">{x</script>', 'https://x.test/', NOW).checks.find((c) => c.id === 'aeo.structured_data').status, 'warn');
});

/* ---------- the agent tools, on a local fixture site ---------- */
async function withFixture(fn) {
  const srv = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/robots.txt') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('User-agent: GPTBot\nDisallow: /\nUser-agent: *\nAllow: /\n'); }
    if (p === '/good' || p === '/poor') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(p === '/good' ? GOOD : POOR); }
    if (p === '/data.json') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html><head><title>nf</title></head><body>nf</body></html>');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const keep = config.crawler.allowPrivateHosts; config.crawler.allowPrivateHosts = true;
  try { await fn(`http://127.0.0.1:${srv.address().port}`); } finally { config.crawler.allowPrivateHosts = keep; srv.close(); }
}

test('aeo_analyze and geo_analyze run through the gateway, are untrusted-flagged and refuse private targets', async () => {
  await withFixture(async (base) => {
    const ctx = { mode: 'assisted', sources: new Map() };
    const a = await at.runAgentTool('aeo_analyze', { url: base + '/good' }, ctx);
    assert.ok(a.ok, JSON.stringify(a).slice(0, 300)); assert.equal(a.untrusted, true); assert.ok(a.result.score >= 80); assert.ok(ctx.sources.has(base + '/good'));
    const g = await at.runAgentTool('geo_analyze', { url: base + '/good' }, ctx);
    assert.ok(g.ok, JSON.stringify(g).slice(0, 300));
    const access = g.result.checks.find((c) => c.id === 'geo.crawler_access'); assert.equal(access.status, 'info'); assert.match(access.evidence, /GPTBot/);
    assert.equal(g.result.checks.find((c) => c.id === 'geo.llms_txt').status, 'info');
    assert.ok(JSON.stringify(g).length < 14000);
    const notHtml = await at.runAgentTool('aeo_analyze', { url: base + '/data.json' }, { mode: 'assisted' }); assert.equal(notHtml.ok, false); assert.equal(notHtml.category, 'page_error');
    const cap = { mode: 'assisted' }; await at.runAgentTool('aeo_analyze', { url: base + '/poor' }, cap); await at.runAgentTool('aeo_analyze', { url: base + '/poor' }, cap);
    assert.equal((await at.runAgentTool('aeo_analyze', { url: base + '/poor' }, cap)).category, 'limit', 'two per task');
  });
  const keep = config.crawler.allowPrivateHosts; config.crawler.allowPrivateHosts = false;
  try {
    for (const url of ['http://127.0.0.1/', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.1/', 'http://localhost/']) {
      for (const tool of ['aeo_analyze', 'geo_analyze']) { const r = await at.runAgentTool(tool, { url }, { mode: 'assisted' }); assert.equal(r.ok, false, `${tool} ${url}`); assert.equal(r.category, 'bad_input'); }
    }
  } finally { config.crawler.allowPrivateHosts = keep; }
});

test('the new tools are registered as read-only and listed in the catalogue', () => {
  const cat = Object.fromEntries(at.toolCatalogue().map((t) => [t.name, t]));
  assert.equal(cat.aeo_analyze.risk, 'low'); assert.equal(cat.geo_analyze.risk, 'low');
  assert.ok(at.declarations().some((d) => d.name === 'aeo_analyze') && at.declarations().some((d) => d.name === 'geo_analyze'));
});
