// Token-secured publishing API for Click2Client Blog Studio (a separate app).
// Mounted at /api/blog-api. Auth: "Authorization: Bearer <BLOG_API_TOKEN>".
// Disabled (503) until BLOG_API_TOKEN is set (≥ 24 chars) in the environment.
// The sitemap, /blog index and post pages already read from the same store,
// so a successful write here is live (or scheduled) immediately.

import express from 'express';
import crypto from 'node:crypto';
import * as blog from './blog.js';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const fail = (res, status, message) => res.status(status).json({ error: { message } });

export function blogApi(siteUrl) {
  const r = express.Router();
  r.use((req, res, next) => {
    const token = process.env.BLOG_API_TOKEN || '';
    if (token.length < 24) return fail(res, 503, 'Blog publishing API is not configured: set BLOG_API_TOKEN (24+ characters) on the website.');
    const given = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!crypto.timingSafeEqual(sha(given), sha(token))) return fail(res, 401, 'Invalid API token.');
    res.set('cache-control', 'no-store');
    next();
  });
  const h = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => fail(res, e.status || 500, e.status ? e.message : 'Unexpected server error.'));
  const view = (req, p) => ({ ...p, status: blog.statusOf(p), url: `${siteUrl(req)}/blog/${p.id}`, coverUrl: blog.coverUrl(p) ? siteUrl(req) + blog.coverUrl(p) : null });

  r.get('/ping', h(async (req, res) => res.json({ ok: true, site: siteUrl(req), posts: (await blog.getBlog()).posts.length, features: ['draft', 'publish', 'schedule', 'update', 'delete', 'cover', 'faq', 'seo-meta', 'canonical', 'json-ld', 'sitemap'] })));
  r.get('/posts', h(async (req, res) => res.json({ posts: (await blog.getBlog()).posts.map((p) => { const { body, ...rest } = p; return view(req, rest); }) })));
  r.get('/posts/:id', h(async (req, res) => {
    const p = (await blog.getBlog()).posts.find((x) => x.id === req.params.id);
    if (!p) return fail(res, 404, 'Post not found.');
    res.json(view(req, p));
  }));
  r.post('/posts', h(async (req, res) => res.status(201).json(view(req, await blog.upsertRich(null, req.body || {})))));
  r.put('/posts/:id', h(async (req, res) => res.json(view(req, await blog.upsertRich(req.params.id, req.body || {})))));
  r.delete('/posts/:id', h(async (req, res) => { await blog.deletePost(req.params.id); res.json({ ok: true }); }));
  r.post('/images', h(async (req, res) => { const id = await blog.saveMedia(req.body?.dataUrl); res.status(201).json({ id, url: `${siteUrl(req)}/blog-img/${id}` }); }));
  r.put('/posts/:id/cover', h(async (req, res) => { await blog.setCover(req.params.id, req.body?.dataUrl ?? null); res.json({ ok: true }); }));
  return r;
}
