// Blog: posts stored in the settings table (metadata under "blog", each cover
// image under "bimg:<id>"). Written from Admin → Blog, rendered server-side on
// /blog and /blog/<slug> so search engines index the full article.

import * as store from './store/db.js';

const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, n);
const slugify = (s) => clean(s, 90).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const getBlog = async () => (await store.getSetting('blog', null)) || { posts: [] };
const save = (b) => store.setSetting('blog', b);
const byDate = (a, b) => String(b.date).localeCompare(String(a.date));

export async function publishedPosts() {
  return (await getBlog()).posts.filter((p) => p.published).sort(byDate);
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
function inline(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(((?:https:\/\/|\/)[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith('/') ? '' : ' target="_blank" rel="noopener"'}>${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

export function formatBody(text) {
  const out = [];
  let list = null;
  let para = [];
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) { flushPara(); flushList(); continue; }
    if ((m = /^(#{2,3})\s+(.+)$/.exec(line))) { flushPara(); flushList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = /^([-*]|\d+[.)])\s+(.+)$/.exec(line))) {
      flushPara();
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list && list.tag !== tag) flushList();
      (list ||= { tag, items: [] }).items.push(m[2]);
      continue;
    }
    if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    flushList();
    para.push(line);
  }
  flushPara(); flushList();
  return out.join('\n');
}

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
    'post.body': formatBody(p.body),
    'post.related': others.length ? `<section class="section tint" aria-labelledby="rel-h"><div class="wrap"><div class="sec-head reveal"><span class="eyebrow">Keep reading</span><h2 id="rel-h">More from the blog</h2></div><div class="bl-grid">${others.map((o) => `<article class="bl-card reveal"><a class="bl-cover" href="/blog/${esc(o.id)}" tabindex="-1" aria-hidden="true">${cover(o)}</a><div class="bl-body">${meta(o)}<h3><a href="/blog/${esc(o.id)}">${esc(o.title)}</a></h3></div></article>`).join('')}</div></div></section>` : '',
    'ogImage': esc(img ? base + img : `${base}/img/click2client-media-logo.webp`),
    'ogType': 'article',
  };
}

// Self-check: node server/blog.js
if (process.argv[1]?.endsWith('blog.js')) {
  const assert = (await import('node:assert')).default;
  const h = formatBody('## Why SEO\nIntro **bold** and *it* [x](https://a.com) [bad](javascript:alert(1))\n\n- one\n- two\n1. a\n> q <script>');
  assert.match(h, /<h2>Why SEO<\/h2>/);
  assert.match(h, /<strong>bold<\/strong> and <em>it<\/em>/);
  assert.match(h, /<a href="https:\/\/a.com" target="_blank"/);
  assert.ok(!h.includes('href="javascript'));
  assert.match(h, /<ul><li>one<\/li><li>two<\/li><\/ul>\n<ol><li>a<\/li><\/ol>/);
  assert.match(h, /<blockquote>q &lt;script&gt;<\/blockquote>/);
  console.log('blog format ok');
  process.exit(0);
}
