// Blog: posts stored in the settings table (metadata under "blog", each cover
// image under "bimg:<id>"). Written from Admin → Blog, rendered server-side on
// /blog and /blog/<slug> so search engines index the full article.

import assert from 'node:assert';
import * as store from './store/db.js';
import { formatBody, faqHtml } from './md.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);
const slugify = (s) => clean(s, 90).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const getBlog = async () => (await store.getSetting('blog', null)) || { posts: [] };
const save = (b) => store.setSetting('blog', b);
const byDate = (a, b) => String(b.date).localeCompare(String(a.date));

// A post is live when published and its (optional) scheduled time has passed —
// so scheduled posts go live on their own, with no cron job.
export const isLive = (p, now = Date.now()) => Boolean(p.published) && (!p.publishAt || Date.parse(p.publishAt) <= now);
export const statusOf = (p) => (!p.published ? 'draft' : isLive(p) ? 'published' : 'scheduled');

export async function publishedPosts() {
  return (await getBlog()).posts.filter((p) => isLive(p)).sort(byDate);
}

// Full-fidelity upsert used by the token-secured Blog Studio API. Unlike the
// admin form it also carries SEO metadata, FAQs, tags and a schedule.
export async function upsertRich(id, b) {
  const blog = await getBlog();
  const title = clean(b.title, 140);
  if (!title) throw Object.assign(new Error('Title is required.'), { status: 400 });
  const slug = slugify(id || b.slug || title) || 'post';
  const i = blog.posts.findIndex((p) => p.id === slug);
  const prev = i >= 0 ? blog.posts[i] : {};
  const status = ['draft', 'published', 'scheduled'].includes(b.status) ? b.status : 'draft';
  const publishAt = status === 'scheduled' ? new Date(b.publishAt).toISOString() : '';
  if (status === 'scheduled' && !(Date.parse(b.publishAt) > Date.now())) throw Object.assign(new Error('Schedule time must be in the future.'), { status: 400 });
  const date = status === 'scheduled' ? publishAt.slice(0, 10) : prev.published && prev.date ? prev.date : new Date().toISOString().slice(0, 10);
  const canonical = /^https:\/\/[^\s]+$/.test(b.canonical || '') ? b.canonical : '';
  const rec = {
    ...prev, id: slug, title,
    excerpt: clean(b.excerpt, 300), category: clean(b.category, 40), author: clean(b.author, 60) || 'Hari',
    body: String(b.body ?? '').slice(0, 60000),
    published: status !== 'draft', publishAt, date, updated: new Date().toISOString(),
    metaTitle: clean(b.metaTitle, 120), metaDescription: clean(b.metaDescription, 320), canonical,
    imageAlt: clean(b.imageAlt, 200), keyword: clean(b.keyword, 80),
    tags: (Array.isArray(b.tags) ? b.tags : []).map((t) => clean(t, 40)).filter(Boolean).slice(0, 12),
    faqs: (Array.isArray(b.faqs) ? b.faqs : []).map((f) => ({ q: clean(f.q, 200), a: clean(f.a, 1200) })).filter((f) => f.q && f.a).slice(0, 15),
  };
  if (i >= 0) blog.posts[i] = rec; else blog.posts.push(rec);
  await save(blog);
  return rec;
}

export async function upsertPost(id, body) {
  const b = await getBlog();
  const i = id ? b.posts.findIndex((p) => p.id === id) : -1;
  if (id && i < 0) throw Object.assign(new Error('Post not found.'), { status: 404 });
  const title = clean(body.title, 140);
  if (!title) throw new Error('Title is required.');
  const slug = slugify(body.slug || title) || 'post';
  if (b.posts.some((p, j) => j !== i && p.id === slug)) throw new Error('Another post already uses this URL slug.');
  const prev = i >= 0 ? b.posts[i] : {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : prev.date || new Date().toISOString().slice(0, 10);
  const rec = {
    ...prev,
    id: slug,
    title,
    excerpt: clean(body.excerpt, 300),
    category: clean(body.category, 40),
    author: clean(body.author, 60) || 'Hari',
    body: String(body.body ?? '').slice(0, 60000),
    published: Boolean(body.published),
    date,
    updated: new Date().toISOString(),
  };
  if (i >= 0) b.posts[i] = rec; else b.posts.push(rec);
  await save(b);
  if (prev.id && prev.id !== slug && prev.cover) { // slug changed: move the cover image
    await store.setSetting(`bimg:${slug}`, await store.getSetting(`bimg:${prev.id}`, null));
    await store.setSetting(`bimg:${prev.id}`, null);
  }
  return rec;
}

export async function deletePost(id) {
  const b = await getBlog();
  b.posts = b.posts.filter((p) => p.id !== id);
  await save(b);
  await store.setSetting(`bimg:${id}`, null);
}

export async function setCover(id, dataUrl) {
  const b = await getBlog();
  const post = b.posts.find((p) => p.id === id);
  if (!post) throw Object.assign(new Error('Post not found.'), { status: 404 });
  if (dataUrl === null) {
    await store.setSetting(`bimg:${id}`, null);
    delete post.cover;
  } else {
    const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
    if (!m) throw new Error('Upload a PNG, JPG or WebP image.');
    if (m[3].length > 1_400_000) throw new Error('Image is too large — please use one under 1 MB.');
    await store.setSetting(`bimg:${id}`, { mime: m[1], data: m[3] });
    post.cover = Date.now();
  }
  await save(b);
}

export const getCover = (id) => store.getSetting(`bimg:${id}`, null);
export const coverUrl = (p) => (p.cover ? `/blog-img/${encodeURIComponent(p.id)}?v=${p.cover}` : null);

// ── Article formatting ───────────────────────────────────────────────────
// A small, safe subset of Markdown: everything is escaped first, links only
// allow http(s) or site-relative URLs.
//   ## Heading   ### Sub-heading   - list   1. list   > quote
//   **bold**   *italic*   [text](https://…)   ![alt](https://…image)
export { formatBody };

const words = (t) => (String(t || '').match(/\S+/g) || []).length;
export const readMins = (t) => Math.max(1, Math.round(words(t) / 200));
export const fmtDate = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ── Server-side HTML ─────────────────────────────────────────────────────
function cover(p, eager = false) {
  const u = coverUrl(p);
  if (u) return `<img src="${u}" alt="${esc(p.title)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  return `<div class="bl-ph" aria-hidden="true"><span>${esc(p.category || 'Click2Client Media')}</span></div>`;
}
const meta = (p) => `<div class="bl-meta">${p.category ? `<span class="bl-cat">${esc(p.category)}</span>` : ''}<time datetime="${esc(p.date)}">${fmtDate(p.date)}</time><span>${readMins(p.body)} min read</span></div>`;

export async function blogListVars() {
  const posts = await publishedPosts().catch(() => []);
  if (!posts.length) return { 'blog.list': '<div class="bl-empty card"><h2>Articles are on the way</h2><p>We’re writing practical guides on SEO, ads and websites. Meanwhile, see how your website is doing with a free audit.</p><a class="btn primary" href="/seo-audit#free-audit">Run a free SEO audit →</a></div>' };
  const [first, ...rest] = posts;
  const card = (p) => `<article class="bl-card reveal"><a class="bl-cover" href="/blog/${esc(p.id)}" tabindex="-1" aria-hidden="true">${cover(p)}</a><div class="bl-body">${meta(p)}<h3><a href="/blog/${esc(p.id)}">${esc(p.title)}</a></h3>${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}<a class="bl-more" href="/blog/${esc(p.id)}" aria-label="Read: ${esc(p.title)}">Read article →</a></div></article>`;
  return {
    'blog.list': `<article class="bl-lead reveal"><a class="bl-cover" href="/blog/${esc(first.id)}" tabindex="-1" aria-hidden="true">${cover(first, true)}</a><div class="bl-body">${meta(first)}<h2><a href="/blog/${esc(first.id)}">${esc(first.title)}</a></h2>${first.excerpt ? `<p>${esc(first.excerpt)}</p>` : ''}<a class="btn primary" href="/blog/${esc(first.id)}">Read article →</a></div></article>
      ${rest.length ? `<div class="bl-grid">${rest.map(card).join('')}</div>` : ''}`,
  };
}

export async function postVars(p, base) {
  const others = (await publishedPosts()).filter((x) => x.id !== p.id).slice(0, 3);
  const img = coverUrl(p);
  return {
    'post.title': esc(p.title),
    'post.meta': meta(p) + `<span class="bl-author">By ${esc(p.author || 'Hari')}</span>`,
    'post.cover': img ? `<figure class="bl-hero-img"><img src="${img}" alt="${esc(p.title)}" fetchpriority="high"></figure>` : '',
    'post.body': formatBody(p.body) + faqHtml(p.faqs),
    'post.related': others.length ? `<section class="section tint" aria-labelledby="rel-h"><div class="wrap"><div class="sec-head reveal"><span class="eyebrow">Keep reading</span><h2 id="rel-h">More from the blog</h2></div><div class="bl-grid">${others.map((o) => `<article class="bl-card reveal"><a class="bl-cover" href="/blog/${esc(o.id)}" tabindex="-1" aria-hidden="true">${cover(o)}</a><div class="bl-body">${meta(o)}<h3><a href="/blog/${esc(o.id)}">${esc(o.title)}</a></h3></div></article>`).join('')}</div></div></section>` : '',
    'ogImage': esc(img ? base + img : `${base}/img/click2client-media-logo.webp`),
    'ogType': 'article',
  };
}

// Self-check: node server/blog.js
// No top-level await anywhere in server code: Hostinger loads the app with
// require(), which rejects async modules (ERR_REQUIRE_ASYNC_MODULE).
if (process.argv[1]?.endsWith('blog.js')) {
  const h = formatBody('## Why SEO\nIntro **bold** and *it* [x](https://a.com) [bad](javascript:alert(1))\n\n- one\n- two\n1. a\n> q <script>');
  assert.match(h, /<h2>Why SEO<\/h2>/);
  assert.match(h, /<strong>bold<\/strong> and <em>it<\/em>/);
  assert.match(h, /<a href="https:\/\/a.com" target="_blank"/);
  assert.ok(!h.includes('href="javascript'));
  assert.match(h, /<ul><li>one<\/li><li>two<\/li><\/ul>\n<ol><li>a<\/li><\/ol>/);
  assert.match(h, /<blockquote>q &lt;script&gt;<\/blockquote>/);
  assert.match(formatBody('| A | B |\n|---|---|\n| 1 | **2** |'), /<th>A<\/th><th>B<\/th>.*<td>1<\/td><td><strong>2<\/strong><\/td>/);
  assert.ok(isLive({ published: true }) && !isLive({ published: true, publishAt: '2999-01-01T00:00:00Z' }) && !isLive({ published: false }));
  console.log('blog format ok');
  process.exit(0);
}
