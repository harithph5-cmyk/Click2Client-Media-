// AEO/GEO on the public site: FAQ schema must match the visible FAQ, and /llms.txt
// must be built from the real page list. Renders run without a database (the
// renderer falls back to default settings), so this needs no environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPage, llmsTxt } from '../server/site/render.js';

const req = { protocol: 'https', get: () => 'click2clientmedia.com' };
const schemaOf = (html) => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1])['@graph'];

for (const id of ['services', 'audit']) {
  test(`${id}: visible FAQ and FAQPage schema list the same questions`, async () => {
    const html = await renderPage(id, req);
    const visible = [...html.matchAll(/<details><summary>(.*?)<\/summary>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'"));
    const faq = schemaOf(html).find((g) => g['@type'] === 'FAQPage');
    assert.ok(visible.length >= 6, 'has visible FAQs');
    assert.deepEqual(faq.mainEntity.map((q) => q.name), visible);
    assert.ok(!/\{p25\}|\{p50\}|\{\{/.test(html), 'no unfilled placeholders');
  });
}

test('services page declares its five service areas as Service schema', async () => {
  const graph = schemaOf(await renderPage('services', req));
  assert.equal(graph.filter((g) => g['@type'] === 'Service').length, 5);
});

test('the audit FAQ shows the live prices', async () => {
  assert.match(await renderPage('audit', req), /25-page audit \(₹\d+\)/);
});

test('llms.txt is Markdown with the brand, key pages and contact, and makes no ranking promises', async () => {
  const t = await llmsTxt(req);
  assert.match(t, /^# Click2Client Media/);
  assert.match(t, /\[SEO Services|\]\(https:\/\/click2clientmedia\.com\/services\)/);
  assert.match(t, /\(https:\/\/click2clientmedia\.com\/seo-audit\)/);
  assert.match(t, /does not guarantee search rankings/);
  assert.ok(!/\n\n\n/.test(t), 'no blank-line runs');
});
