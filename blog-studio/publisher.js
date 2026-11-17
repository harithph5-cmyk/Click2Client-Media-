// Connector to the Click2Client website's /api/blog-api (see server/blog-api.js).
// The token lives only in this server's environment. A publish is reported as
// successful only when the website confirms it, and a live publish is then
// re-fetched from its public URL to verify.

const base = () => (process.env.SITE_URL || 'https://click2clientmedia.com').replace(/\/$/, '');
export const configured = () => (process.env.BLOG_API_TOKEN || '').length >= 24;

async function call(method, path, body) {
  if (!configured()) throw Object.assign(new Error('BLOG_API_TOKEN is not set. Use Export instead, or set the same token on the website and in blog-studio/.env.'), { status: 409, code: 'not_configured' });
  let r;
  try {
    r = await fetch(`${base()}/api/blog-api${path}`, { method, headers: { authorization: `Bearer ${process.env.BLOG_API_TOKEN}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30_000) });
  } catch (e) { throw Object.assign(new Error(`Could not reach ${base()}: ${e.message}`), { status: 502 }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || `Website API returned ${r.status}`), { status: r.status === 401 ? 502 : r.status >= 500 ? 502 : r.status, code: r.status === 404 ? 'api_missing' : undefined });
  return j;
}

export const ping = () => call('GET', '/ping');

export async function push(a, mode, publishAt) {
  const status = mode === 'draft' ? 'draft' : mode === 'schedule' ? 'scheduled' : 'published';
  const slug = a.slug;
  const post = await call('PUT', `/posts/${encodeURIComponent(slug)}`, {
    title: a.title, excerpt: a.excerpt || a.metaDescription, category: a.category, author: a.author, body: a.body, status, publishAt,
    metaTitle: a.metaTitle, metaDescription: a.metaDescription, canonical: a.canonical, imageAlt: a.imageAlt, keyword: a.keyword, tags: a.tags, faqs: a.faqs,
  });
  if (a.image) await call('PUT', `/posts/${encodeURIComponent(slug)}/cover`, { dataUrl: a.image });
  // Slug changed since the last publish → remove the old URL so it isn't left orphaned.
  if (a.remoteSlug && a.remoteSlug !== slug) await call('DELETE', `/posts/${encodeURIComponent(a.remoteSlug)}`).catch(() => {});
  let verified = null;
  if (status === 'published') {
    const live = await fetch(post.url, { redirect: 'follow', signal: AbortSignal.timeout(20_000) }).catch(() => null);
    verified = Boolean(live?.ok);
  }
  return { url: post.url, status: post.status, verified };
}

export const uploadImage = (dataUrl) => call('POST', '/images', { dataUrl });
export const list = () => call('GET', '/posts');
export const remove = (slug) => call('DELETE', `/posts/${encodeURIComponent(slug)}`);
export const siteBase = base;
