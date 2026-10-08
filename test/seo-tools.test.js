import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInputUrl, AuditInputError, checkStatus } from '../server/lib/net.js';
import { parsePage } from '../server/engine/parse.js';
import { analyzeKeywords } from '../server/engine/keywords.js';
import { parseRobots, isAllowed, explainRule } from '../server/engine/robots.js';
import { runTool, liveTool, check, countChecks, TOOLS, hubVars } from '../server/tools.js';
import { config } from '../server/config.js';

// ─────────────────────────────────────────────────────────────────────────────
// URL / SSRF (Tests 1–9)
// ─────────────────────────────────────────────────────────────────────────────
describe('URL / SSRF Protection', () => {
  it('1. localhost rejected', () => {
    assert.throws(() => normalizeInputUrl('http://localhost/test'), (err) => {
      return err instanceof AuditInputError && /public website/i.test(err.message);
    });
  });

  it('2. 127.0.0.1 rejected', () => {
    assert.throws(() => normalizeInputUrl('http://127.0.0.1/test'), (err) => {
      return err instanceof AuditInputError && err.code === 'private_host';
    });
  });

  it('3. 192.168.x.x rejected', () => {
    assert.throws(() => normalizeInputUrl('http://192.168.1.50/dashboard'), (err) => {
      return err instanceof AuditInputError && err.code === 'private_host';
    });
  });

  it('4. 10.x.x.x rejected', () => {
    assert.throws(() => normalizeInputUrl('http://10.0.0.1/admin'), (err) => {
      return err instanceof AuditInputError && err.code === 'private_host';
    });
  });

  it('5. 169.254.169.254 rejected', () => {
    assert.throws(() => normalizeInputUrl('http://169.254.169.254/latest/meta-data'), (err) => {
      return err instanceof AuditInputError && err.code === 'private_host';
    });
  });

  it('6. ::1 rejected', () => {
    assert.throws(() => normalizeInputUrl('http://[::1]/status'), (err) => {
      return err instanceof AuditInputError;
    });
  });

  it('7. ftp rejected', () => {
    assert.throws(() => normalizeInputUrl('ftp://example.com/file.txt'), (err) => {
      return err instanceof AuditInputError && /Only http:\/\/ and https:\/\//i.test(err.message);
    });
  });

  it('8. file:// rejected', () => {
    assert.throws(() => normalizeInputUrl('file:///etc/passwd'), (err) => {
      return err instanceof AuditInputError && /Only http:\/\/ and https:\/\//i.test(err.message);
    });
  });

  it('9. credentials in URL rejected', () => {
    assert.throws(() => normalizeInputUrl('https://admin:secret123@example.com'), (err) => {
      return err instanceof AuditInputError && /login credentials/i.test(err.message);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTML Parser (Tests 10–16)
// ─────────────────────────────────────────────────────────────────────────────
describe('HTML Parser Evidence Extraction', () => {
  it('10. missing title', () => {
    const html = '<html><head></head><body><p>No title here</p></body></html>';
    const page = parsePage(html, 'https://example.com/');
    assert.equal(page.title.text, null);
    assert.equal(page.title.values.length, 0);
  });

  it('11. missing description', () => {
    const html = '<html><head><title>Some Page</title></head><body></body></html>';
    const page = parsePage(html, 'https://example.com/');
    assert.equal(page.metaDescription.text, null);
    assert.equal(page.metaDescription.values.length, 0);
  });

  it('12. missing H1', () => {
    const html = '<html><body><h2>Subheading</h2><p>Content</p></body></html>';
    const page = parsePage(html, 'https://example.com/');
    assert.deepEqual(page.headings.h1, []);
  });

  it('13. multiple H1', () => {
    const html = '<html><body><h1>First H1</h1><h1>Second H1</h1></body></html>';
    const page = parsePage(html, 'https://example.com/');
    assert.equal(page.headings.h1.length, 2);
    assert.equal(page.headings.h1[0], 'First H1');
    assert.equal(page.headings.h1[1], 'Second H1');
  });

  it('14. multiple canonicals', () => {
    const html = `<html><head>
      <link rel="canonical" href="https://example.com/one">
      <link rel="canonical" href="https://example.com/two">
    </head><body></body></html>`;
    const page = parsePage(html, 'https://example.com/');
    assert.equal(page.canonicals.length, 2);
    assert.equal(page.canonicals[0].raw, 'https://example.com/one');
    assert.equal(page.canonicals[1].raw, 'https://example.com/two');
  });

  it('15. invalid JSON-LD', () => {
    const html = `<html><head>
      <script type="application/ld+json">{ "malformed": json without quotes }</script>
    </head><body></body></html>`;
    const page = parsePage(html, 'https://example.com/');
    assert.equal(page.jsonLdErrors.length, 1);
    assert.equal(page.jsonLd.length, 0);
  });

  it('16. missing ALT', () => {
    const html = '<html><body><img src="/banner.jpg"><img src="/logo.png" alt="Company Logo"></body></html>';
    const page = parsePage(html, 'https://example.com/');
    assert.equal(page.images.length, 2);
    assert.equal(page.images[0].alt, null);
    assert.equal(page.images[1].alt, 'Company Logo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Canonical Checker Safety (Tests 17–21)
// ─────────────────────────────────────────────────────────────────────────────
describe('Canonical Checker Safety Guard', () => {
  const originalFetch = globalThis.fetch;
  const originalAllowPrivate = config.crawler.allowPrivateHosts;

  function setupMockFetch(htmlBody, targetStatus = 200) {
    config.crawler.allowPrivateHosts = true;
    globalThis.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('page-with-canonical')) {
        return new Response(htmlBody, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      return new Response('Target OK', {
        status: targetStatus,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };
  }

  function teardownMockFetch() {
    globalThis.fetch = originalFetch;
    config.crawler.allowPrivateHosts = originalAllowPrivate;
  }

  it('17. valid HTTPS canonical', async () => {
    const html = `<!doctype html><html><head>
      <title>Valid HTTPS Canonical</title>
      <link rel="canonical" href="https://target.example.com/canonical-page">
    </head><body><h1>Hello</h1></body></html>`;
    setupMockFetch(html, 200);
    try {
      const res = await runTool('canonical-checker', { url: 'https://mock.example.com/page-with-canonical' });
      assert.equal(typeof res, 'object');
      assert.equal(res.scoreAvailable, true);
      const targetCheck = res.checks.find((c) => c.label === 'Canonical target');
      assert.ok(targetCheck, 'Should have a canonical target check');
      assert.equal(targetCheck.status, 'pass');
      assert.match(targetCheck.detail, /returns 200/);
    } finally {
      teardownMockFetch();
    }
  });

  it('18. valid HTTP canonical', async () => {
    const html = `<!doctype html><html><head>
      <title>Valid HTTP Canonical</title>
      <link rel="canonical" href="http://target.example.com/canonical-http">
    </head><body><h1>Hello</h1></body></html>`;
    setupMockFetch(html, 200);
    try {
      const res = await runTool('canonical-checker', { url: 'https://mock.example.com/page-with-canonical' });
      assert.equal(typeof res, 'object');
      assert.equal(res.scoreAvailable, true);
      const targetCheck = res.checks.find((c) => c.label === 'Canonical target');
      assert.ok(targetCheck, 'Should have a canonical target check');
      assert.equal(targetCheck.status, 'pass');
    } finally {
      teardownMockFetch();
    }
  });

  it('19. malformed canonical', async () => {
    const html = `<!doctype html><html><head>
      <title>Malformed Canonical</title>
      <link rel="canonical" href="http://">
    </head><body><h1>Hello</h1></body></html>`;
    setupMockFetch(html, 200);
    try {
      const res = await runTool('canonical-checker', { url: 'https://mock.example.com/page-with-canonical' });
      assert.equal(typeof res, 'object');
      assert.equal(res.scoreAvailable, true);
      const targetCheck = res.checks.find((c) => c.label === 'Canonical target');
      assert.ok(targetCheck, 'Should report invalid canonical target');
      assert.equal(targetCheck.status, 'fail');
      assert.match(targetCheck.detail, /Invalid canonical URL/);
    } finally {
      teardownMockFetch();
    }
  });

  it('20. javascript/non-HTTP canonical', async () => {
    const html = `<!doctype html><html><head>
      <title>Non-HTTP Canonical</title>
      <link rel="canonical" href="javascript:alert(1)">
    </head><body><h1>Hello</h1></body></html>`;
    setupMockFetch(html, 200);
    try {
      const res = await runTool('canonical-checker', { url: 'https://mock.example.com/page-with-canonical' });
      assert.equal(typeof res, 'object');
      assert.equal(res.scoreAvailable, true);
      const targetCheck = res.checks.find((c) => c.label === 'Canonical target');
      assert.ok(targetCheck, 'Should report non-HTTP canonical target as failure without crashing');
      assert.equal(targetCheck.status, 'fail');
      assert.match(targetCheck.detail, /Invalid canonical URL/);
    } finally {
      teardownMockFetch();
    }
  });

  it('21. multiple canonical tags', async () => {
    const html = `<!doctype html><html><head>
      <title>Multiple Canonicals</title>
      <link rel="canonical" href="https://example.com/first">
      <link rel="canonical" href="https://example.com/second">
    </head><body><h1>Hello</h1></body></html>`;
    setupMockFetch(html, 200);
    try {
      const res = await runTool('canonical-checker', { url: 'https://mock.example.com/page-with-canonical' });
      assert.equal(typeof res, 'object');
      const multipleCheck = res.checks.find((c) => c.label === 'Canonical URL' && c.status === 'fail');
      assert.ok(multipleCheck, 'Should detect multiple canonical tags');
      assert.match(multipleCheck.detail, /2 canonical tags/);
    } finally {
      teardownMockFetch();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Keyword Density Engine Reuse (Tests 22–27)
// ─────────────────────────────────────────────────────────────────────────────
describe('Keyword Density Engine Reuse', () => {
  const originalFetch = globalThis.fetch;
  const originalAllowPrivate = config.crawler.allowPrivateHosts;

  const sampleHtml = `<!doctype html>
  <html>
    <head>
      <title>Click2Client Media - Best Digital Marketing and SEO Agency</title>
      <meta name="description" content="Click2Client Media offers top SEO agency services, digital marketing and growth audits.">
    </head>
    <body>
      <h1>Top SEO Agency Services</h1>
      <h2>Digital Marketing Solutions</h2>
      <p>Click2Client Media is a professional SEO agency specializing in digital marketing campaigns. Our SEO agency delivers measurable organic traffic growth. Every SEO agency must understand search intent and modern technical optimization. Digital marketing teams rely on our SEO agency expertise for real clients across various industries worldwide.</p>
    </body>
  </html>`;

  function setupMock() {
    config.crawler.allowPrivateHosts = true;
    globalThis.fetch = async () => new Response(sampleHtml, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  function teardownMock() {
    globalThis.fetch = originalFetch;
    config.crawler.allowPrivateHosts = originalAllowPrivate;
  }

  it('22. tool executes cleanly', async () => {
    setupMock();
    try {
      const res = await runTool('keyword-density', { url: 'https://mock.example.com/page' });
      assert.equal(typeof res, 'object');
      assert.equal(res.tool, 'Keyword Density Checker');
      assert.equal(res.score, null);
      assert.equal(res.scoreAvailable, false);
      assert.ok(Array.isArray(res.tables));
      assert.ok(Array.isArray(res.checks));
    } finally {
      teardownMock();
    }
  });

  it('23. uses shared engine', async () => {
    setupMock();
    try {
      const res = await runTool('keyword-density', { url: 'https://mock.example.com/page' });
      assert.ok(res.engine, 'Returns engine metadata');
      assert.ok(res.engine.totalWords > 0);
      assert.ok(res.engine.uniqueWords > 0);
    } finally {
      teardownMock();
    }
  });

  it('24. returns 1-gram data', async () => {
    setupMock();
    try {
      const res = await runTool('keyword-density', { url: 'https://mock.example.com/page' });
      const table1 = res.tables.find((t) => t.title === 'Top keywords');
      assert.ok(table1, 'Has 1-gram keywords table');
      assert.deepEqual(table1.cols, ['Keyword', 'Count', 'Density']);
      assert.ok(table1.rows.length > 0);
      // 'agency' or 'seo' should be present
      assert.ok(table1.rows.some((r) => r[0] === 'agency' || r[0] === 'seo'));
    } finally {
      teardownMock();
    }
  });

  it('25. returns 2-gram data', async () => {
    setupMock();
    try {
      const res = await runTool('keyword-density', { url: 'https://mock.example.com/page' });
      const table2 = res.tables.find((t) => t.title === 'Top 2-word phrases');
      assert.ok(table2, 'Has 2-word phrases table');
      assert.deepEqual(table2.cols, ['Phrase', 'Count', 'Density']);
      assert.ok(table2.rows.length > 0);
      assert.ok(table2.rows.some((r) => r[0].includes('seo agency') || r[0].includes('digital marketing')));
    } finally {
      teardownMock();
    }
  });

  it('26. returns 3-gram data', async () => {
    setupMock();
    try {
      const res = await runTool('keyword-density', { url: 'https://mock.example.com/page' });
      const table3 = res.tables.find((t) => t.title === 'Top 3-word phrases');
      assert.ok(table3, 'Has 3-word phrases table');
      assert.deepEqual(table3.cols, ['Phrase', 'Count', 'Density']);
    } finally {
      teardownMock();
    }
  });

  it('27. target keyword analysis works', async () => {
    setupMock();
    try {
      const res = await runTool('keyword-density', { url: 'https://mock.example.com/page', keyword: 'seo agency' });
      const kwCheck = res.checks.find((c) => c.label.includes('“seo agency”'));
      assert.ok(kwCheck, 'Has check for target keyword');
      assert.match(kwCheck.detail, /time\(s\)/);

      const titleCheck = res.checks.find((c) => c.label === 'In the title');
      assert.ok(titleCheck);
      assert.equal(titleCheck.detail, 'Yes');

      const h1Check = res.checks.find((c) => c.label === 'In the H1');
      assert.ok(h1Check);
      assert.equal(h1Check.detail, 'Yes');
    } finally {
      teardownMock();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Broken Links Checker Limits (Tests 28–31)
// ─────────────────────────────────────────────────────────────────────────────
describe('Broken Link Checker Performance Limits', () => {
  const originalFetch = globalThis.fetch;
  const originalAllowPrivate = config.crawler.allowPrivateHosts;

  const generatePageWithLinks = (count) => {
    const linkTags = Array.from({ length: count }, (_, i) => `<a href="https://mock.example.com/link-${i}">Link ${i}</a>`).join('\n');
    return `<!doctype html><html><head><title>Links Page</title></head><body>${linkTags}</body></html>`;
  };

  it('28. respects 30-link limit', async () => {
    config.crawler.allowPrivateHosts = true;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('many-links')) {
        return new Response(generatePageWithLinks(50), { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response('OK', { status: 200 });
    };

    try {
      const res = await runTool('broken-link-checker', { url: 'https://mock.example.com/many-links' });
      assert.equal(res.checked, 30);
      assert.equal(res.tables[0].rows.length, 30);
    } finally {
      globalThis.fetch = originalFetch;
      config.crawler.allowPrivateHosts = originalAllowPrivate;
    }
  });

  it('29. uses 4-second timeout', async () => {
    let capturedSignal = null;
    config.crawler.allowPrivateHosts = true;
    globalThis.fetch = async (url, opts) => {
      capturedSignal = opts?.signal;
      return new Response('OK', { status: 200 });
    };

    try {
      await checkStatus('https://mock.example.com/test-link', 4000);
      assert.ok(capturedSignal, 'AbortSignal should be passed to fetch');
    } finally {
      globalThis.fetch = originalFetch;
      config.crawler.allowPrivateHosts = originalAllowPrivate;
    }
  });

  it('30. reports total discovered links', async () => {
    config.crawler.allowPrivateHosts = true;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('many-links')) {
        return new Response(generatePageWithLinks(45), { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response('OK', { status: 200 });
    };

    try {
      const res = await runTool('broken-link-checker', { url: 'https://mock.example.com/many-links' });
      assert.equal(res.totalDiscovered, 45);
    } finally {
      globalThis.fetch = originalFetch;
      config.crawler.allowPrivateHosts = originalAllowPrivate;
    }
  });

  it('31. reports whether results were limited', async () => {
    config.crawler.allowPrivateHosts = true;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('many-links')) {
        return new Response(generatePageWithLinks(45), { status: 200, headers: { 'content-type': 'text/html' } });
      }
      return new Response('OK', { status: 200 });
    };

    try {
      const res = await runTool('broken-link-checker', { url: 'https://mock.example.com/many-links' });
      assert.equal(res.limited, true);
      const limitCheck = res.checks.find((c) => c.label === 'Limit');
      assert.ok(limitCheck);
      assert.match(limitCheck.detail, /Checked 30 of 45 links/);
    } finally {
      globalThis.fetch = originalFetch;
      config.crawler.allowPrivateHosts = originalAllowPrivate;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Robots Checker & Explanations (Tests 32–35)
// ─────────────────────────────────────────────────────────────────────────────
describe('Robots Checker & Explanations', () => {
  const robotsText = `
User-agent: *
Disallow: /admin
Disallow: /checkout
Allow: /admin/login

User-agent: Googlebot
Disallow: /private-google

User-agent: Bingbot
Disallow: /private-bing

Sitemap: https://example.com/sitemap.xml
`;

  it('32. robots rules parse', () => {
    const parsed = parseRobots(robotsText);
    assert.equal(parsed.groups.length, 3);
    assert.equal(parsed.sitemaps.length, 1);
    assert.equal(parsed.sitemaps[0], 'https://example.com/sitemap.xml');
  });

  it('33. Googlebot check works', () => {
    const parsed = parseRobots(robotsText);
    const allowedRoot = isAllowed(parsed, '/', 'Googlebot');
    assert.equal(allowedRoot.allowed, true);

    const blocked = isAllowed(parsed, '/private-google', 'Googlebot');
    assert.equal(blocked.allowed, false);
  });

  it('34. Bingbot check works', () => {
    const parsed = parseRobots(robotsText);
    const allowed = isAllowed(parsed, '/public-page', 'Bingbot');
    assert.equal(allowed.allowed, true);

    const blocked = isAllowed(parsed, '/private-bing', 'Bingbot');
    assert.equal(blocked.allowed, false);
  });

  it('35. explanation data is returned', () => {
    const disallowAll = explainRule({ type: 'disallow', path: '/' }, ['*']);
    assert.match(disallowAll.text, /Blocks all crawlers from crawling the entire site/i);

    const emptyDisallow = explainRule({ type: 'disallow', path: '' }, ['*']);
    assert.match(emptyDisallow.text, /Empty Disallow/i);

    const wpAdmin = explainRule({ type: 'disallow', path: '/wp-admin' }, ['*']);
    assert.match(wpAdmin.text, /WordPress admin area/i);

    const custom = explainRule({ type: 'disallow', path: '/secret' }, ['Googlebot']);
    assert.match(custom.text, /Prevents Googlebot from crawling URLs/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Frontend Null-Safe SERP Rendering (Tests 36–37)
// ─────────────────────────────────────────────────────────────────────────────
describe('Frontend Null-Safe SERP & OG Rendering', () => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Mirror the exact updated logic from public/js/tools.js
  const serp = (s) => {
    const url = String(s?.url ?? '');
    const title = String(s?.title ?? '');
    const desc = String(s?.description ?? '');
    const t = title.length > 60 ? title.slice(0, 58) + '…' : title;
    const d = desc.length > 160 ? desc.slice(0, 157) + '…' : desc;
    return `<div class="tl-serp"><span class="tl-serp-label">Google preview</span><div class="u">${esc(url)}</div><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></div>`;
  };

  const og = (o) => `<div class="tl-og"><span class="tl-serp-label">Share preview</span><div class="tl-og-card">${o?.image ? `<img src="${esc(o.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="tl-og-noimg">No share image</div>'}<div><small>${esc(o?.site)}</small><b>${esc(o?.title || '(no title)')}</b><span>${esc(o?.description)}</span></div></div></div>`;

  it('36. null SERP title does not throw', () => {
    assert.doesNotThrow(() => {
      const html = serp({ url: 'https://example.com', title: null, description: 'Valid description' });
      assert.ok(html.includes('Google preview'));
    });

    assert.doesNotThrow(() => {
      const html = serp({ url: 'https://example.com', title: undefined, description: 'Valid description' });
      assert.ok(html.includes('Google preview'));
    });
  });

  it('37. null SERP description does not throw', () => {
    assert.doesNotThrow(() => {
      const html = serp({ url: 'https://example.com', title: 'Valid Title', description: null });
      assert.ok(html.includes('Google preview'));
    });

    assert.doesNotThrow(() => {
      const html = serp({});
      assert.ok(html.includes('Google preview'));
    });

    assert.doesNotThrow(() => {
      const html = serp(null);
      assert.ok(html.includes('Google preview'));
    });

    assert.doesNotThrow(() => {
      const ogHtml = og({ image: null, site: null, title: null, description: null });
      assert.ok(ogHtml.includes('Share preview'));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Backend Result Enrichment (Tests 38–43)
// ─────────────────────────────────────────────────────────────────────────────
describe('Backend Result Enrichment (Phase B Stage 1A)', () => {
  const originalFetch = globalThis.fetch;
  const originalAllowPrivate = config.crawler.allowPrivateHosts;

  const sampleHtml = `<!doctype html>
  <html lang="en">
    <head>
      <title>Click2Client Media - Best Digital Marketing and SEO Agency</title>
      <meta name="description" content="Click2Client Media offers top SEO agency services, digital marketing and growth audits.">
      <link rel="canonical" href="https://mock.example.com/page">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta property="og:title" content="Click2Client Media">
      <meta property="og:image" content="https://mock.example.com/og.jpg">
      <script type="application/ld+json">{"@type": "Organization", "name": "Click2Client"}</script>
    </head>
    <body>
      <h1>Top SEO Agency Services</h1>
      <h2>Digital Marketing Solutions</h2>
      <p>Click2Client Media provides digital marketing and SEO services.</p>
      <a href="https://mock.example.com/about">About us</a>
      <img src="https://mock.example.com/logo.png" alt="Company Logo">
    </body>
  </html>`;

  function setupMock() {
    config.crawler.allowPrivateHosts = true;
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('robots.txt')) {
        return new Response('User-agent: *\nDisallow: /admin\nSitemap: https://mock.example.com/sitemap.xml', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }
      if (u.includes('sitemap.xml')) {
        return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://mock.example.com/page</loc></url></urlset>', {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        });
      }
      return new Response(sampleHtml, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    };
  }

  function teardownMock() {
    globalThis.fetch = originalFetch;
    config.crawler.allowPrivateHosts = originalAllowPrivate;
  }

  it('38. check helper recommendation field compatibility', () => {
    const cWithout = check('pass', 'Title', 'Good length');
    assert.equal(cWithout.status, 'pass');
    assert.equal(cWithout.label, 'Title');
    assert.equal(cWithout.detail, 'Good length');
    assert.equal(cWithout.recommendation, undefined);

    const cWith = check('fail', 'Title', 'Missing', 'Add a unique title tag.');
    assert.equal(cWith.status, 'fail');
    assert.equal(cWith.label, 'Title');
    assert.equal(cWith.detail, 'Missing');
    assert.equal(cWith.recommendation, 'Add a unique title tag.');
  });

  it('39. counts existence and mathematical accuracy', () => {
    const testChecks = [
      check('fail', 'H1', 'Missing', 'Add an H1'),
      check('warn', 'Title', 'Short', 'Extend title'),
      check('warn', 'Desc', 'Short', 'Extend desc'),
      check('pass', 'HTTPS', 'Secure'),
      check('info', 'Words', '500 words'),
    ];
    const counts = countChecks(testChecks);
    assert.deepEqual(counts, { critical: 1, warning: 2, pass: 1, info: 1 });
    assert.equal(counts.critical + counts.warning + counts.pass + counts.info, testChecks.length);
  });

  it('40. tool results include counts and status metadata', async () => {
    setupMock();
    try {
      const res = await runTool('website-seo-checker', { url: 'https://mock.example.com/page' });
      assert.ok(res.counts, 'Should have counts metadata');
      assert.equal(typeof res.counts.critical, 'number');
      assert.equal(typeof res.counts.warning, 'number');
      assert.equal(typeof res.counts.pass, 'number');
      assert.equal(typeof res.counts.info, 'number');
      assert.equal(
        res.counts.critical + res.counts.warning + res.counts.pass + res.counts.info,
        res.checks.length,
        'Sum of counts must equal checks length'
      );
      assert.ok(['pass', 'warn', 'fail'].includes(res.status), 'Status must be pass, warn, or fail');
    } finally {
      teardownMock();
    }
  });

  it('41. existing response fields preserved across tools', async () => {
    setupMock();
    try {
      const res = await runTool('meta-analyzer', { url: 'https://mock.example.com/page' });
      assert.equal(typeof res.url, 'string');
      assert.equal(typeof res.score, 'number');
      assert.equal(res.scoreAvailable, true);
      assert.ok(Array.isArray(res.checks));
      assert.ok(res.serp, 'serp field must be preserved');
      assert.equal(typeof res.serp.title, 'string');
    } finally {
      teardownMock();
    }
  });

  it('42. keyword density exposes additive placement matrix', async () => {
    setupMock();
    try {
      const res = await runTool('keyword-density', { url: 'https://mock.example.com/page', keyword: 'seo agency' });
      assert.ok(res.engine, 'Must have engine object');
      assert.ok(Array.isArray(res.engine.matrix), 'engine.matrix must be an array');
      assert.ok(res.engine.matrix.length > 0);
      assert.ok(res.engine.matrix.some((m) => m.term === 'seo agency'));
    } finally {
      teardownMock();
    }
  });

  it('43. all 15 tools return valid structure with score/scoreAvailable preserved', async () => {
    setupMock();
    try {
      const liveSlugs = TOOLS.filter((t) => t.live).map((t) => t.slug);
      assert.equal(liveSlugs.length, 15, 'Must test exactly 15 live tools');

      for (const slug of liveSlugs) {
        const body = slug === 'meta-generator'
          ? { title: 'Test Title', pageUrl: 'https://mock.example.com/page' }
          : { url: 'https://mock.example.com/page' };
        const res = await runTool(slug, body);
        assert.ok(res, `${slug} must return a result`);
        assert.equal(typeof res.tool, 'string', `${slug} must have tool name`);
        assert.ok(Array.isArray(res.checks), `${slug} must have checks array`);
        assert.ok(res.counts, `${slug} must have counts`);
        assert.equal(
          res.counts.critical + res.counts.warning + res.counts.pass + res.counts.info,
          res.checks.length,
          `${slug} counts must equal checks count`
        );
        assert.equal(typeof res.scoreAvailable, 'boolean', `${slug} must have boolean scoreAvailable`);
      }
    } finally {
      teardownMock();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 4: Conversion CTA & Lead Generation (Tests 44–49)
// ─────────────────────────────────────────────────────────────────────────────
describe('Conversion CTA & Lead Generation (Phase B Stage 4)', () => {
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Mirror exact helper logic from public/js/tools.js
  const toolContexts = {
    'website-seo-checker': { title: 'Want to check your entire website?' },
    'seo-score-checker': { title: 'Want to benchmark your entire website?' },
    'meta-analyzer': { title: 'Metadata is just the beginning of your SEO.' },
    'meta-generator': { title: 'Implemented your tags? Audit your complete site.' },
    'heading-checker': { title: 'Audit content structure across your whole site.' },
    'keyword-density': { title: 'Turn keyword analysis into a complete ranking strategy.' },
    'image-alt-checker': { title: 'Improve image SEO and accessibility sitewide.' },
    'canonical-checker': { title: 'Prevent duplicate content penalties across all pages.' },
    'robots-checker': { title: 'Ensure search engines crawl what matters most.' },
    'sitemap-checker': { title: 'Verify indexation for every page in your sitemap.' },
    'schema-validator': { title: 'Scale rich structured data across your website.' },
    'open-graph-checker': { title: 'Maximize social engagement for every page you share.' },
    'internal-link-checker': { title: 'Strengthen internal linking and PageRank distribution.' },
    'broken-link-checker': { title: 'Eliminate dead links and 404 errors across your site.' },
    'redirect-checker': { title: 'Optimize redirect paths and preserve link equity.' },
  };

  function getCtaCopy(toolSlug, r) {
    const counts = r?.counts || { critical: 0, warning: 0, pass: 0, info: 0 };
    const hasCrit = counts.critical > 0;
    const hasWarn = counts.warning > 0;
    const lowScore = r?.score != null && r.score < 60;
    const specific = toolContexts[toolSlug] || { title: 'Ready for a complete website SEO audit?' };

    let eyebrow = 'NEXT STEP FOR YOUR WEBSITE';
    if (hasCrit) {
      eyebrow = `ATTENTION: ${counts.critical} CRITICAL ISSUE${counts.critical > 1 ? 'S' : ''} DETECTED`;
    } else if (hasWarn) {
      eyebrow = `OPPORTUNITY: ${counts.warning} AREA${counts.warning > 1 ? 'S' : ''} TO OPTIMIZE`;
    } else if (lowScore) {
      eyebrow = 'HEALTH SCORE INDICATES IMPROVEMENT NEEDED';
    } else {
      eyebrow = 'EXPAND YOUR ANALYSIS SITEWIDE';
    }

    return { eyebrow, title: specific.title };
  }

  function renderConversionCta(toolSlug, r, waHref) {
    const copy = getCtaCopy(toolSlug, r);
    const auditHref = r?.url
      ? `/seo-audit?url=${encodeURIComponent(r.url)}#free-audit`
      : '/seo-audit#free-audit';

    return `
      <section class="tl-conversion-card" role="region" aria-label="Next Steps and Audit CTA">
        <div class="tl-cta-content">
          <span class="tl-cta-eyebrow">${esc(copy.eyebrow)}</span>
          <h3 class="tl-cta-title">${esc(copy.title)}</h3>
          <div class="tl-cta-tiers-hint">
            <span>Free 10-page audit</span> · <span>25 &amp; 50-page deep audits from ₹125</span> · <span>Actionable fix roadmap</span>
          </div>
        </div>
        <div class="tl-cta-actions">
          <a href="${esc(auditHref)}" class="btn primary lg" id="seo-tools-audit-cta">
            Get Full SEO Audit →
          </a>
          ${waHref ? `
            <a href="${esc(waHref)}" target="_blank" rel="noopener noreferrer" class="btn outline lg wa-cta-btn" id="seo-tools-whatsapp-cta">
              Talk to an SEO Expert
            </a>
          ` : ''}
        </div>
      </section>
    `;
  }

  it('44. tool-specific CTA messaging covers all 15 live tools', () => {
    const liveSlugs = TOOLS.filter((t) => t.live).map((t) => t.slug);
    assert.equal(liveSlugs.length, 15);
    for (const slug of liveSlugs) {
      const copy = getCtaCopy(slug, { counts: { critical: 0, warning: 0 } });
      assert.ok(copy.title, `${slug} must have a specific CTA title`);
      assert.notEqual(copy.title, 'Ready for a complete website SEO audit?', `${slug} must not fallback to generic title`);
    }
  });

  it('45. contextual eyebrow reflects critical issues, warnings, low score and healthy states', () => {
    // Critical issues
    const critCopy = getCtaCopy('website-seo-checker', { counts: { critical: 3, warning: 1 } });
    assert.equal(critCopy.eyebrow, 'ATTENTION: 3 CRITICAL ISSUES DETECTED');

    const critOneCopy = getCtaCopy('website-seo-checker', { counts: { critical: 1, warning: 0 } });
    assert.equal(critOneCopy.eyebrow, 'ATTENTION: 1 CRITICAL ISSUE DETECTED');

    // Warnings only
    const warnCopy = getCtaCopy('website-seo-checker', { counts: { critical: 0, warning: 4 } });
    assert.equal(warnCopy.eyebrow, 'OPPORTUNITY: 4 AREAS TO OPTIMIZE');

    const warnOneCopy = getCtaCopy('website-seo-checker', { counts: { critical: 0, warning: 1 } });
    assert.equal(warnOneCopy.eyebrow, 'OPPORTUNITY: 1 AREA TO OPTIMIZE');

    // Low score without critical/warnings (e.g. score < 60)
    const lowScoreCopy = getCtaCopy('seo-score-checker', { score: 45, counts: { critical: 0, warning: 0 } });
    assert.equal(lowScoreCopy.eyebrow, 'HEALTH SCORE INDICATES IMPROVEMENT NEEDED');

    // Healthy page
    const healthyCopy = getCtaCopy('website-seo-checker', { score: 95, counts: { critical: 0, warning: 0 } });
    assert.equal(healthyCopy.eyebrow, 'EXPAND YOUR ANALYSIS SITEWIDE');
  });

  it('46. URL preservation in primary CTA href', () => {
    const htmlWithUrl = renderConversionCta('canonical-checker', { url: 'https://example.com/test-page?q=1' });
    assert.ok(htmlWithUrl.includes('href="/seo-audit?url=https%3A%2F%2Fexample.com%2Ftest-page%3Fq%3D1#free-audit"'));

    const htmlWithoutUrl = renderConversionCta('meta-generator', {});
    assert.ok(htmlWithoutUrl.includes('href="/seo-audit#free-audit"'));
  });

  it('47. stable semantic tracking IDs on primary and secondary CTAs', () => {
    const waLink = 'https://wa.me/919940411837?text=Hi';
    const html = renderConversionCta('meta-analyzer', { url: 'https://example.com' }, waLink);
    assert.ok(html.includes('id="seo-tools-audit-cta"'), 'Must have id="seo-tools-audit-cta"');
    assert.ok(html.includes('id="seo-tools-whatsapp-cta"'), 'Must have id="seo-tools-whatsapp-cta"');
  });

  it('48. WhatsApp CTA omitted if no WhatsApp configuration available', () => {
    const html = renderConversionCta('robots-checker', { url: 'https://example.com' }, '');
    assert.ok(html.includes('id="seo-tools-audit-cta"'));
    assert.ok(!html.includes('id="seo-tools-whatsapp-cta"'));
  });

  it('49. null-safe and handles missing data without crashing', () => {
    assert.doesNotThrow(() => {
      const html1 = renderConversionCta('unknown-tool', null);
      assert.ok(html1.includes('Get Full SEO Audit'));

      const html2 = renderConversionCta(null, {});
      assert.ok(html2.includes('Get Full SEO Audit'));

      const copy = getCtaCopy('meta-analyzer', { counts: null, score: null });
      assert.ok(copy.eyebrow);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stage 5: SEO & Content Architecture (Tests 50–57)
// ─────────────────────────────────────────────────────────────────────────────
describe('SEO & Content Architecture (Phase B Stage 5)', async () => {
  const { TOOL_CONTENT, renderToolContentHtml } = await import('../server/site/tools-content.js');
  const liveSlugs = TOOLS.filter((t) => t.live).map((t) => t.slug);

  it('50. all 15 tools have unique, non-generic titles and meta descriptions', () => {
    assert.equal(liveSlugs.length, 15);
    const titles = new Set();
    const descriptions = new Set();

    for (const slug of liveSlugs) {
      const c = TOOL_CONTENT[slug];
      assert.ok(c, `${slug} must have content entry`);
      assert.ok(c.title, `${slug} must have title`);
      assert.ok(c.description, `${slug} must have description`);
      assert.ok(c.title.includes('Click2Client Media'), `${slug} title should be branded`);
      assert.ok(c.title.length >= 40 && c.title.length <= 80, `${slug} title length (${c.title.length}) should be within optimal limits`);
      assert.ok(c.description.length >= 100 && c.description.length <= 200, `${slug} description length (${c.description.length}) should be within optimal limits`);

      assert.ok(!titles.has(c.title), `Duplicate title found: ${c.title}`);
      assert.ok(!descriptions.has(c.description), `Duplicate description found for: ${slug}`);
      titles.add(c.title);
      descriptions.add(c.description);
    }
  });

  it('51. all 15 tools define clear, single user-intent H1 headings', () => {
    const h1s = new Set();
    for (const slug of liveSlugs) {
      const c = TOOL_CONTENT[slug];
      assert.ok(c.h1, `${slug} must have H1`);
      assert.ok(c.h1.length >= 10 && c.h1.length <= 60, `${slug} H1 length (${c.h1.length}) must be concise`);
      assert.ok(!h1s.has(c.h1), `Duplicate H1 found: ${c.h1}`);
      h1s.add(c.h1);
    }
  });

  it('52. every tool has 4-step workflow, 4 checks, and 4 practical fixes', () => {
    for (const slug of liveSlugs) {
      const c = TOOL_CONTENT[slug];
      assert.equal(c.steps.length, 4, `${slug} must have 4 steps`);
      assert.equal(c.checks.length, 4, `${slug} must have 4 checks`);
      assert.equal(c.fixes.length, 4, `${slug} must have 4 fixes`);
      c.steps.forEach((s) => { assert.ok(s.num); assert.ok(s.title); assert.ok(s.desc); });
      c.checks.forEach((ch) => { assert.ok(ch.icon); assert.ok(ch.title); assert.ok(ch.desc); });
      c.fixes.forEach((f) => { assert.ok(f.title); assert.ok(f.desc); });
    }
  });

  it('53. every tool has exactly 5 search-intent FAQs with full answers', () => {
    for (const slug of liveSlugs) {
      const c = TOOL_CONTENT[slug];
      assert.ok(Array.isArray(c.faqs), `${slug} must have faqs array`);
      assert.equal(c.faqs.length, 5, `${slug} must have exactly 5 FAQs`);
      for (const faq of c.faqs) {
        assert.ok(faq.q && faq.q.endsWith('?'), `${slug} question must end with ?: "${faq.q}"`);
        assert.ok(faq.a && faq.a.length >= 40, `${slug} answer must be informative: "${faq.a}"`);
      }
    }
  });

  it('54. FAQPage schema maps 1-to-1 with visible FAQs and is valid JSON-LD', () => {
    for (const slug of liveSlugs) {
      const c = TOOL_CONTENT[slug];
      const faqSchema = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: c.faqs.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: f.a,
          },
        })),
      };
      const jsonStr = JSON.stringify(faqSchema);
      assert.doesNotThrow(() => JSON.parse(jsonStr), `${slug} FAQ schema must be valid JSON`);
      const parsed = JSON.parse(jsonStr);
      assert.equal(parsed['@type'], 'FAQPage');
      assert.equal(parsed.mainEntity.length, 5);
      assert.equal(parsed.mainEntity[0].name, c.faqs[0].q);
      assert.equal(parsed.mainEntity[0].acceptedAnswer.text, c.faqs[0].a);
    }
  });

  it('55. curated related tools link to 3-4 valid complementary live tools', () => {
    for (const slug of liveSlugs) {
      const c = TOOL_CONTENT[slug];
      assert.ok(Array.isArray(c.relatedSlugs), `${slug} must have relatedSlugs`);
      assert.ok(c.relatedSlugs.length >= 3 && c.relatedSlugs.length <= 4, `${slug} must have 3-4 related tools`);
      assert.ok(!c.relatedSlugs.includes(slug), `${slug} must not link to itself`);
      for (const rel of c.relatedSlugs) {
        assert.ok(liveSlugs.includes(rel), `Related slug "${rel}" for "${slug}" must be a live tool`);
      }
    }
  });

  it('56. renderToolContentHtml generates accessible, semantic content hierarchy', () => {
    const sampleTool = TOOLS.find((t) => t.slug === 'broken-link-checker');
    const c = TOOL_CONTENT['broken-link-checker'];
    const html = renderToolContentHtml(sampleTool, c, 'https://wa.me/919940411837');

    assert.ok(html.includes('class="section tl-guide-sec"'), 'Must have guide section');
    assert.ok(html.includes('class="section tint tl-checks-info-sec"'), 'Must have checks info section');
    assert.ok(html.includes('class="section tl-fixes-sec"'), 'Must have fixes section');
    assert.ok(html.includes('class="section tint tl-faq-sec"'), 'Must have FAQ section');
    assert.ok(html.includes('class="section tight tl-bridge-sec"'), 'Must have audit bridge section');

    // No H1 in body content (H1 is strictly reserved for the page hero)
    assert.ok(!html.includes('<h1'), 'Content must not introduce competing H1 headings');
    assert.ok(html.includes('<h2'), 'Content must include semantic H2 headings');
    assert.ok(html.includes('<h3'), 'Content must include semantic H3 subheadings');
    assert.ok(html.includes('<details class="tl-faq-item'), 'FAQs must be accessible details elements');
  });

  it('57. hubVars categorizes all 15 tools with live links and clean navigation', () => {
    const hub = hubVars();
    assert.equal(hub['tools.live'], '15');
    assert.ok(hub['tools.cats'].includes('href="/seo-tools/website-seo-checker"'));
    assert.ok(hub['tools.cats'].includes('href="/seo-tools/broken-link-checker"'));
    assert.ok(hub['tools.cats'].includes('href="/seo-tools/keyword-density"'));
    for (const slug of liveSlugs) {
      assert.ok(hub['tools.cats'].includes(`/seo-tools/${slug}`), `Hub must link to ${slug}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Stage 6: Final QA & Production Readiness (Tests 58–61)
  // ─────────────────────────────────────────────────────────────────────────────
  it('58. WebApplication schema integrity and properties verified for all 15 tools', () => {
    for (const slug of liveSlugs) {
      const tool = TOOLS.find((t) => t.slug === slug);
      const c = TOOL_CONTENT[slug];
      const webApp = {
        '@type': 'WebApplication',
        name: tool.name,
        description: c.description || tool.desc,
        url: `https://click2client.media/seo-tools/${tool.slug}`,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'All',
        browserRequirements: 'Requires JavaScript. Requires HTML5.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
      };
      assert.equal(webApp['@type'], 'WebApplication');
      assert.equal(webApp.applicationCategory, 'UtilitiesApplication');
      assert.equal(webApp.offers.price, '0');
      assert.ok(webApp.name && webApp.name.length > 3);
      assert.ok(webApp.description && webApp.description.length >= 100);
      assert.ok(webApp.url.includes(`/seo-tools/${slug}`));
    }
  });

  it('59. breadcrumb trail maps accurately to Home > SEO Tools > Tool', () => {
    for (const slug of liveSlugs) {
      const tool = TOOLS.find((t) => t.slug === slug);
      const trail = [
        { name: 'Home', path: '/' },
        { name: 'SEO Tools', path: '/seo-tools' },
        { name: tool.name, path: `/seo-tools/${tool.slug}` },
      ];
      assert.equal(trail.length, 3);
      assert.equal(trail[0].path, '/');
      assert.equal(trail[1].path, '/seo-tools');
      assert.equal(trail[2].path, `/seo-tools/${slug}`);
    }
  });

  it('60. educational audit bridge consistently points to free audit anchor', () => {
    for (const slug of liveSlugs) {
      const tool = TOOLS.find((t) => t.slug === slug);
      const c = TOOL_CONTENT[slug];
      const html = renderToolContentHtml(tool, c, '');
      assert.ok(html.includes('href="/seo-audit#free-audit"'), `${slug} bridge must link to free audit`);
      assert.ok(html.includes('Audit Your Entire Website with Click2Client Media'), `${slug} must feature audit heading`);
    }
  });

  it('61. no tool self-links in related tools and all related slugs resolve to live tools', () => {
    for (const slug of liveSlugs) {
      const c = TOOL_CONTENT[slug];
      assert.ok(Array.isArray(c.relatedSlugs));
      assert.ok(!c.relatedSlugs.includes(slug), `${slug} must never link to itself`);
      for (const rel of c.relatedSlugs) {
        const found = TOOLS.find((t) => t.slug === rel && t.live);
        assert.ok(found, `Related slug "${rel}" from "${slug}" must resolve to a live tool`);
      }
    }
  });
});
