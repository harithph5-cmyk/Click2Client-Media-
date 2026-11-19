// SEO / AEO / GEO content scores. Pure functions, shared by the admin editor
// (live feedback while writing) and the server (reports). Each score is the
// weighted share of passed checks; failed checks come back as plain tips.

const words = (t) => String(t || '').match(/\S+/g) || [];
const lc = (t) => String(t || '').toLowerCase();

function run(checks) {
  const total = checks.reduce((a, c) => a + c[0], 0);
  const got = checks.reduce((a, c) => a + (c[1] ? c[0] : 0), 0);
  return { score: Math.round((100 * got) / total), tips: checks.filter((c) => !c[1]).map((c) => c[2]) };
}

export function scorePost(p = {}) {
  const body = String(p.body || '');
  const kw = lc(p.keyword).trim();
  const title = String(p.metaTitle || p.title || '');
  const desc = String(p.metaDescription || p.excerpt || '');
  const n = words(body).length;
  const h2 = (body.match(/^##\s+\S/gm) || []).length;
  const first100 = lc(words(body).slice(0, 100).join(' '));
  const links = [...body.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const internal = links.filter((u) => u.startsWith('/') || /click2clientmedia\.com/i.test(u)).length;
  const external = links.filter((u) => /^https?:\/\//i.test(u) && !/click2clientmedia\.com/i.test(u)).length;
  const faqs = (p.faqs || []).filter((f) => f.q && f.a).length;
  const paras = body.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean);
  const afterH2 = paras.filter((_, i) => /^##\s/.test(paras[i - 1] || ''));
  const questionHeads = (body.match(/^##+\s+.*\?\s*$/gm) || []).length;
  const numbers = (body.match(/\b\d[\d,.]*%?/g) || []).length;

  const seo = run([
    [12, title.length >= 30 && title.length <= 65, 'SEO title should be 30–65 characters.'],
    [12, desc.length >= 120 && desc.length <= 160, 'Meta description should be 120–160 characters.'],
    [14, Boolean(kw), 'Set a focus keyword.'],
    [10, Boolean(kw) && lc(title).includes(kw), 'Put the focus keyword in the SEO title.'],
    [10, Boolean(kw) && first100.includes(kw), 'Use the focus keyword in the first 100 words.'],
    [8, Boolean(kw) && lc(p.id).includes(kw.replace(/\s+/g, '-')), 'Include the keyword in the URL slug.'],
    [12, n >= 800, 'Aim for 800+ words (currently ' + n + ').'],
    [8, h2 >= 3, 'Use at least 3 "##" section headings.'],
    [6, Boolean(p.cover) && Boolean(p.imageAlt), 'Add a cover image with ALT text.'],
    [8, internal >= 2, 'Add at least 2 internal links.'],
  ]);

  const aeo = run([
    [30, faqs >= 3, 'Add an FAQ section with at least 3 questions.'],
    [20, questionHeads >= 2, 'Use question-style headings ("What is…?", "How does…?").'],
    [20, afterH2.length > 0 && afterH2.filter((s) => words(s).length <= 60).length / afterH2.length >= 0.5, 'Open each section with a direct answer under 60 words.'],
    [15, /^\s*([-*]|\d+\.)\s/m.test(body) || /^\|.+\|/m.test(body), 'Add a list or table — answer engines lift structured content.'],
    [15, lc(p.excerpt).length >= 60, 'Write a clear summary (excerpt) that answers the topic in 1–2 sentences.'],
  ]);

  const geo = run([
    [25, external >= 2, 'Cite at least 2 authoritative external sources.'],
    [20, numbers >= 5, 'Include concrete facts, numbers or statistics.'],
    [15, Boolean(String(p.author || '').trim()), 'Show a named author (entity / E-E-A-T signal).'],
    [15, /click2client/i.test(body), 'Mention the brand by name in the article body.'],
    [10, /\b(is a|are a|refers to|means)\b/i.test(body), 'Include a clear definition sentence ("X is …").'],
    [15, (p.tags || []).length >= 2 && faqs >= 1, 'Add tags and at least one FAQ so the topic and entities are explicit.'],
  ]);

  return { seo: seo.score, aeo: aeo.score, geo: geo.score, tips: { seo: seo.tips, aeo: aeo.tips, geo: geo.tips } };
}

// Self-check: node public/js/scores.js
if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('scores.js')) {
  const empty = scorePost({});
  if (empty.seo > 20 || empty.aeo > 20) throw new Error('empty post should score low');
  const good = scorePost({ id: 'seo-guide', keyword: 'seo guide', title: 'The Complete SEO Guide for Small Businesses in India', metaDescription: 'x'.repeat(140), excerpt: 'x'.repeat(80), cover: 1, imageAlt: 'alt', author: 'A', tags: ['a', 'b'], faqs: [{ q: 'a', a: 'b' }, { q: 'a', a: 'b' }, { q: 'a', a: 'b' }], body: '## What is an seo guide?\nAn seo guide is a plan.\n\n- one\n\n## How?\nShort answer 10 20 30 40 50 [x](/a) [y](/b) [z](https://a.com) [w](https://b.com) Click2Client\n\n## Third\n' + 'word '.repeat(800) });
  if (good.seo < 80 || good.aeo < 80 || good.geo < 80) throw new Error('good post should score high: ' + JSON.stringify(good));
  console.log('scores ok');
}
