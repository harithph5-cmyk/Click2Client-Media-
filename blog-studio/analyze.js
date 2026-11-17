// Deterministic SEO / AEO / GEO checks. These are readiness checks, not ranking
// predictions: no keyword-density or word-count targets, and nothing here
// promises rankings or citations from any search or AI system.

import assert from 'node:assert';

const SITE_HOST = (process.env.SITE_URL || 'https://click2clientmedia.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
const words = (t) => String(t || '').match(/[\p{L}\p{N}'’-]+/gu) || [];
const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set('a an the and or of to in on for with is are was be by as at it this that from your you we our how what why when which can do does'.split(' '));

export function parse(body) {
  const lines = String(body || '').replace(/\r/g, '').split('\n');
  const headings = [];
  const paras = [];
  let cur = [];
  const flush = () => { if (cur.length) paras.push({ text: cur.join(' '), under: headings.length }); cur = []; };
  for (const l of lines) {
    const m = /^(#{1,3})\s+(.+)$/.exec(l.trim());
    if (m) { flush(); headings.push({ level: m[1].length, text: m[2].trim(), at: paras.length }); } else if (!l.trim()) flush();
    else if (!/^([-*]|\d+[.)])\s|^[>|]/.test(l.trim())) cur.push(l.trim()); else { flush(); paras.push({ text: l.replace(/^([-*]|\d+[.)]|>)\s*/, ''), list: true, under: headings.length }); }
  }
  flush();
  const links = [...String(body).matchAll(/(?<!!)\[[^\]]+\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  const internal = links.filter((u) => u.startsWith('/') || u.includes(SITE_HOST));
  const external = links.filter((u) => /^https?:\/\//.test(u) && !u.includes(SITE_HOST));
  return { headings, paras, internal, external };
}

const syll = (w) => Math.max(1, (w.toLowerCase().replace(/e$/, '').match(/[aeiouy]+/g) || []).length);
export function readability(text) {
  const sentences = String(text).split(/(?<=[.!?])\s+/).filter((s) => words(s).length > 2);
  const w = words(text);
  if (!sentences.length || !w.length) return { avg: 0, flesch: 0 };
  const avg = w.length / sentences.length;
  const flesch = 206.835 - 1.015 * avg - 84.6 * (w.reduce((n, x) => n + syll(x), 0) / w.length);
  return { avg: Math.round(avg * 10) / 10, flesch: Math.round(flesch) };
}

const has = (hay, kw) => { const k = norm(kw); return Boolean(k) && norm(hay).includes(k); };
const chk = (id, label, pass, tip, weight = 1, manual = false) => ({ id, label, pass: Boolean(pass), tip: pass ? '' : tip, weight, manual });
const score = (checks) => { const auto = checks.filter((c) => !c.manual); const t = auto.reduce((n, c) => n + c.weight, 0); return t ? Math.round((auto.reduce((n, c) => n + (c.pass ? c.weight : 0), 0) / t) * 100) : 0; };

export function schemaPreview(a, base) {
  const url = a.canonical || `${base}/blog/${a.slug || 'your-slug'}`;
  const graph = [{
    '@type': 'BlogPosting', headline: a.title, description: a.metaDescription || a.excerpt, datePublished: (a.publishedAt || a.publishAt || new Date().toISOString()).slice(0, 10),
    dateModified: (a.updatedAt || new Date().toISOString()).slice(0, 10), author: { '@type': 'Person', name: a.author || 'Hari' },
    publisher: { '@type': 'Organization', name: 'Click2Client Media' }, mainEntityOfPage: url, ...(a.tags?.length ? { keywords: a.tags.join(', ') } : {}),
  }];
  const faqs = (a.faqs || []).filter((f) => f.q && f.a);
  if (faqs.length) graph.push({ '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) });
  return { '@context': 'https://schema.org', '@graph': graph };
}

export function analyze(a, base = 'https://click2clientmedia.com') {
  const P = parse(a.body);
  const intro = P.paras.filter((p) => !p.list).slice(0, 2).map((p) => p.text).join(' ').split(/\s+/).slice(0, 150).join(' ');
  const kw = a.keyword;
  const text = [a.body, ...(a.faqs || []).map((f) => f.a)].join(' ');
  const rd = readability(P.paras.map((p) => p.text).join(' '));
  const h2 = P.headings.filter((h) => h.level === 2);
  const badOrder = P.headings.some((h, i) => h.level === 3 && !P.headings.slice(0, i).some((x) => x.level === 2));
  const slugWords = norm(a.slug.replace(/-/g, ' '));
  const kwSlug = norm(kw).split(' ').filter((w) => !STOP.has(w)).every((w) => slugWords.includes(w));
  const faqs = (a.faqs || []).filter((f) => f.q && f.a);
  const bodyNorm = norm(a.body + ' ' + a.title);
  const supported = (f) => { const ws = [...new Set(norm(f.a).split(' ').filter((w) => w.length > 4 && !STOP.has(w)))]; return !ws.length || ws.filter((w) => bodyNorm.includes(w)).length / ws.length >= 0.5; };
  const generic = new Set(['introduction', 'overview', 'conclusion', 'summary', 'more', 'tips', 'other', 'final thoughts']);
  const statLines = P.paras.filter((p) => /\d+(\.\d+)?\s?%|\b\d{1,3}(,\d{3})+\b|\b(million|billion)\b/i.test(p.text));
  const unsourced = statLines.filter((p) => !/\]\(https?:/.test(p.text) && !/according to|source:|per /i.test(p.text));
  const m = a.manual || {};

  const seo = [
    chk('kw-title', 'Primary keyword in the article title (H1)', has(a.title, kw), 'Work the primary keyword into the title naturally.', 2),
    chk('h1', 'One H1 (the title) — no extra H1 in the body', !P.headings.some((h) => h.level === 1) && a.title, 'Remove "# " headings from the body; the title is the H1 on the website.', 1),
    chk('kw-intro', 'Primary keyword appears naturally in the introduction', has(intro, kw), 'Mention the topic in the first paragraph, where it reads naturally.', 1),
    chk('kw-slug', 'URL slug contains the keyword words', kw && kwSlug, 'Use a short slug built from the primary keyword.', 1),
    chk('meta-title', 'Meta title 30–60 characters and includes the keyword', a.metaTitle.length >= 30 && a.metaTitle.length <= 60 && has(a.metaTitle, kw), 'Write a 30–60 character meta title that names the topic.', 2),
    chk('meta-desc', 'Meta description 70–160 characters', a.metaDescription.length >= 70 && a.metaDescription.length <= 160, 'Summarise the page in 70–160 characters; make it worth clicking.', 2),
    chk('headings', 'Clear heading structure (2+ H2s, H3s only under an H2)', h2.length >= 2 && !badOrder, 'Break the article into at least two H2 sections; use H3 only beneath an H2.', 1),
    chk('internal', 'At least 2 internal links', P.internal.length >= 2, 'Link to relevant Click2Client pages or earlier articles (see AI suggestions).', 1),
    chk('external', 'At least 1 external reference', P.external.length >= 1, 'Cite a reputable external source with a link.', 1),
    chk('alt', 'Featured image has ALT text', !a.image || a.imageAlt, 'Describe the featured image in the ALT field.', 1),
    chk('readability', `Readable sentences (avg ${rd.avg} words; Flesch ${rd.flesch})`, rd.avg > 0 && rd.avg <= 24, 'Shorten long sentences; aim for an average under ~24 words.', 1),
    chk('canonical', 'Canonical URL set to the live article URL', /^https:\/\/\S+$/.test(a.canonical), 'Click "Use default" in the SEO metadata to set the canonical URL.', 1),
    chk('schema', 'BlogPosting schema is complete (title, description, author)', a.title && (a.metaDescription || a.excerpt) && a.author, 'Add title, meta description and author so the schema is complete.', 1),
  ];
  const aeo = [
    chk('faq-count', 'At least 3 FAQs (question + answer)', faqs.length >= 3, 'Add FAQs people actually ask about this topic.', 2),
    chk('faq-short', 'FAQ answers are short and direct (≤ 60 words)', faqs.length && faqs.every((f) => words(f.a).length <= 60), 'Tighten each FAQ answer to one or two clear sentences.', 1),
    chk('faq-supported', 'FAQ answers are supported by the article (heuristic)', faqs.length && faqs.every(supported), 'Some FAQ answers use terms the article never explains — cover them in the body or reword.', 2),
    chk('q-headings', 'At least one question-style heading', P.headings.some((h) => /\?$/.test(h.text) || /^(what|why|how|when|which|who|can|should|is|are|does)\b/i.test(h.text)), 'Phrase a heading as the question a searcher would ask.', 1),
    chk('direct', 'A direct answer (≤ 60 words) opens the first section', (() => { const p = P.paras.find((x) => x.under >= 1 && !x.list); return Boolean(p) && words(p.text).length <= 60; })(), 'Start the first H2 section with a short, self-contained answer, then explain.', 2),
    chk('faq-schema', 'FAQPage schema can be generated', faqs.length >= 1, 'Add at least one FAQ to produce FAQPage schema.', 1),
    chk('conv', 'Conversational queries covered (3+ question headings/FAQs)', P.headings.filter((h) => /\?$/.test(h.text)).length + faqs.filter((f) => /\?$/.test(f.q)).length >= 3, 'Use full-question phrasing like "How long does it take to…?".', 1),
  ];
  const geo = [
    chk('definition', 'Clear definition of the main concept', /\b(is a|is an|is the|refers to|means|are the)\b/i.test(P.paras.slice(0, 6).map((p) => p.text).join(' ')), 'Define the core term in one plain sentence near the top.', 2),
    chk('author', 'Author named', a.author, 'Add an author name.', 1),
    chk('brand', 'Click2Client Media referenced in context', /click2client/i.test(a.body), 'Mention the brand where relevant (e.g., in the CTA or an example).', 1),
    chk('citations', '2+ external source citations', P.external.length >= 2, 'Link at least two reputable sources that support your claims.', 2),
    chk('stats', `Statistics have a source${unsourced.length ? ` (${unsourced.length} unsourced)` : ''}`, unsourced.length === 0, 'Every statistic needs a cited source — remove or source: ' + unsourced.slice(0, 2).map((p) => `"${p.text.slice(0, 50)}…"`).join(', '), 2),
    chk('headings', 'Descriptive headings (no bare "Introduction"/"Conclusion")', P.headings.length > 0 && !P.headings.some((h) => generic.has(norm(h.text))), 'Rename generic headings to say what the section answers.', 1),
    chk('entities', 'Named entities and context (tools, places, organisations)', (text.match(/\b[A-Z][\w&]+(?:\s[A-Z][\w&]+)+/g) || []).length >= 3 || (text.match(/\b(Google|Meta|Bing|Instagram|Madurai|India|GA4|Search Console)\b/g) || []).length >= 3, 'Name the specific tools, platforms and places involved.', 1),
    chk('refs', 'Both internal and external references', P.internal.length >= 1 && P.external.length >= 1, 'Include at least one internal and one external link.', 1),
    chk('dates', 'Publication and modification dates tracked', true, '', 1),
    chk('insight', 'Contains original insight or first-hand experience (your review)', m.insight, 'Add a real example, result or lesson from your own work, then tick this box.', 0, true),
    chk('verified', 'All facts and figures verified against sources (your review)', m.verified, 'Open every cited source, confirm the claim, then tick this box.', 0, true),
  ];
  return { seo: { score: score(seo), checks: seo }, aeo: { score: score(aeo), checks: aeo }, geo: { score: score(geo), checks: geo }, readability: rd, schema: schemaPreview(a, base), stats: { words: words(a.body).length, internal: P.internal.length, external: P.external.length, headings: P.headings.length } };
}

// Self-check: node blog-studio/analyze.js
if (process.argv[1]?.endsWith('analyze.js')) {
  const a = { title: 'What is local SEO? A Madurai guide', slug: 'what-is-local-seo', keyword: 'local seo', metaTitle: 'What Is Local SEO? A Practical Madurai Guide', metaDescription: 'Local SEO helps nearby customers find your business on Google. Learn the steps, with examples from Madurai.', author: 'Hari', canonical: 'https://click2clientmedia.com/blog/what-is-local-seo', imageAlt: '', image: '', tags: [], faqs: [{ q: 'What is local SEO?', a: 'Local SEO is optimising for nearby searches.' }], manual: {},
    body: 'Local SEO is the practice of ranking in nearby searches. It matters for shops.\n\n## What is local SEO?\nLocal SEO means optimising your Google Business Profile.\n\n## Steps\n[Audit](/seo-audit) and [services](/services) and [Google docs](https://developers.google.com/search).\n\nGrowth was 40% last year.' };
  const r = analyze(a);
  const by = (k, id) => r[k].checks.find((c) => c.id === id);
  assert.ok(by('seo', 'kw-title').pass && by('seo', 'kw-slug').pass && by('seo', 'internal').pass && by('seo', 'meta-title').pass);
  assert.ok(!by('geo', 'stats').pass, 'unsourced stat flagged');
  assert.ok(by('aeo', 'direct').pass && by('aeo', 'faq-schema').pass);
  console.log('analyze ok', r.seo.score, r.aeo.score, r.geo.score);
}
