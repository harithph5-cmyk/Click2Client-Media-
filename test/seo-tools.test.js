import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInputUrl, AuditInputError, checkStatus } from '../server/lib/net.js';
import { parsePage } from '../server/engine/parse.js';
import { analyzeKeywords } from '../server/engine/keywords.js';
import { parseRobots, isAllowed, explainRule } from '../server/engine/robots.js';
import { runTool, liveTool } from '../server/tools.js';
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
