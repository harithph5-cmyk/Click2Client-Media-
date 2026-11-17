// SQLite storage (node:sqlite, built into Node 22.13+; no extra dependency).
// ponytail: SQLite, not Postgres — single-user tool. Swap to pg if it ever needs multiple writers.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = process.env.STUDIO_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
fs.mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(process.env.STUDIO_DB === ':memory:' ? ':memory:' : path.join(dir, 'studio.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY, topic TEXT DEFAULT '', title TEXT DEFAULT '', slug TEXT DEFAULT '', excerpt TEXT DEFAULT '', body TEXT DEFAULT '',
  author TEXT DEFAULT 'Hari', category TEXT DEFAULT '', image TEXT DEFAULT '', image_alt TEXT DEFAULT '',
  status TEXT DEFAULT 'draft', publish_at TEXT DEFAULT '', published_url TEXT DEFAULT '', remote_slug TEXT DEFAULT '', published_at TEXT DEFAULT '',
  needs_update INTEGER DEFAULT 0, manual_json TEXT DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS article_categories (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS article_tags (article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE, tag TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS article_revisions (id INTEGER PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE, snapshot TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS seo_metadata (article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE, meta_title TEXT DEFAULT '', meta_description TEXT DEFAULT '', canonical TEXT DEFAULT '',
  primary_keyword TEXT DEFAULT '', secondary_keywords TEXT DEFAULT '', search_intent TEXT DEFAULT '', audience TEXT DEFAULT '',
  seo_review TEXT DEFAULT 'not_reviewed', aeo_review TEXT DEFAULT 'not_reviewed', geo_review TEXT DEFAULT 'not_reviewed');
CREATE TABLE IF NOT EXISTS article_faqs (id INTEGER PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE, position INTEGER, question TEXT, answer TEXT);
CREATE TABLE IF NOT EXISTS publishing_history (id INTEGER PRIMARY KEY, article_id TEXT, action TEXT, ok INTEGER, message TEXT, url TEXT DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS content_calendar (id INTEGER PRIMARY KEY, article_id TEXT UNIQUE NOT NULL REFERENCES articles(id) ON DELETE CASCADE, planned_date TEXT NOT NULL, done INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS integration_settings (key TEXT PRIMARY KEY, value TEXT);
`);

const now = () => new Date().toISOString();
const s = (v, n = 20000) => String(v ?? '').slice(0, n);
export const slugify = (t) => s(t, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',')).map((x) => s(x, 80).trim()).filter(Boolean);

const STALE_DAYS = 180;
export function load(id) {
  const a = db.prepare('SELECT * FROM articles a LEFT JOIN seo_metadata m ON m.article_id=a.id WHERE a.id=?').get(id);
  if (!a) return null;
  const tags = db.prepare('SELECT tag FROM article_tags WHERE article_id=?').all(id).map((r) => r.tag);
  const faqs = db.prepare('SELECT question q, answer a FROM article_faqs WHERE article_id=? ORDER BY position').all(id);
  const cal = db.prepare('SELECT planned_date, done FROM content_calendar WHERE article_id=?').get(id);
  const stale = a.status === 'published' && (Date.now() - Date.parse(a.published_at || a.updated_at)) / 864e5 > STALE_DAYS;
  return {
    id, topic: a.topic, title: a.title, slug: a.slug, excerpt: a.excerpt, body: a.body, author: a.author, category: a.category,
    image: a.image, imageAlt: a.image_alt, status: a.status, publishAt: a.publish_at, publishedUrl: a.published_url, remoteSlug: a.remote_slug,
    publishedAt: a.published_at, needsUpdate: Boolean(a.needs_update) || stale, createdAt: a.created_at, updatedAt: a.updated_at,
    manual: JSON.parse(a.manual_json || '{}'), tags, faqs,
    metaTitle: a.meta_title || '', metaDescription: a.meta_description || '', canonical: a.canonical || '',
    keyword: a.primary_keyword || '', secondary: a.secondary_keywords || '', intent: a.search_intent || '', audience: a.audience || '',
    review: { seo: a.seo_review || 'not_reviewed', aeo: a.aeo_review || 'not_reviewed', geo: a.geo_review || 'not_reviewed' },
    plannedDate: cal?.planned_date || '', calendarDone: Boolean(cal?.done),
  };
}

export function create(b = {}) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO articles (id, created_at, updated_at) VALUES (?,?,?)').run(id, now(), now());
  db.prepare('INSERT INTO seo_metadata (article_id) VALUES (?)').run(id);
  return save(id, b);
}

const COLS = { topic: 'topic', title: 'title', slug: 'slug', excerpt: 'excerpt', body: 'body', author: 'author', category: 'category', image: 'image', imageAlt: 'image_alt', status: 'status', publishAt: 'publish_at', publishedUrl: 'published_url', remoteSlug: 'remote_slug', publishedAt: 'published_at' };
const SEO = { metaTitle: 'meta_title', metaDescription: 'meta_description', canonical: 'canonical', keyword: 'primary_keyword', secondary: 'secondary_keywords', intent: 'search_intent', audience: 'audience' };
const STATUSES = ['draft', 'review', 'scheduled', 'published'];

export function save(id, b) {
  const cur = load(id);
  if (!cur) return null;
  const set = (table, map, key, extra = '') => {
    const f = Object.keys(map).filter((k) => k in b);
    if (!f.length) return;
    const vals = f.map((k) => {
      if (k === 'image') return s(b.image, 1_500_000);
      if (k === 'status') return STATUSES.includes(b.status) ? b.status : cur.status;
      if (k === 'slug') return slugify(b.slug);
      return k === 'body' ? s(b[k], 120000) : s(b[k], 2000);
    });
    db.prepare(`UPDATE ${table} SET ${f.map((k) => map[k] + '=?').join(',')}${extra} WHERE ${table === 'articles' ? 'id' : 'article_id'}=?`).run(...vals, id);
  };
  if (b.title !== undefined && !b.slug && !cur.slug && !cur.publishedUrl) b.slug = slugify(b.title); // auto slug until first publish
  set('articles', COLS, null);
  set('seo_metadata', SEO);
  for (const k of ['seo', 'aeo', 'geo']) if (['not_reviewed', 'needs_work', 'approved'].includes(b.review?.[k])) db.prepare(`UPDATE seo_metadata SET ${k}_review=? WHERE article_id=?`).run(b.review[k], id);
  if (b.needsUpdate !== undefined) db.prepare('UPDATE articles SET needs_update=? WHERE id=?').run(b.needsUpdate ? 1 : 0, id);
  if (b.manual && JSON.stringify(b.manual).length < 40000) db.prepare('UPDATE articles SET manual_json=? WHERE id=?').run(JSON.stringify(b.manual), id);
  if (b.category) db.prepare('INSERT OR IGNORE INTO article_categories (name) VALUES (?)').run(s(b.category, 40));
  if (b.tags) {
    db.prepare('DELETE FROM article_tags WHERE article_id=?').run(id);
    for (const t of list(b.tags).slice(0, 12)) db.prepare('INSERT INTO article_tags VALUES (?,?)').run(id, t);
  }
  if (Array.isArray(b.faqs)) {
    db.prepare('DELETE FROM article_faqs WHERE article_id=?').run(id);
    b.faqs.slice(0, 15).forEach((f, i) => db.prepare('INSERT INTO article_faqs (article_id, position, question, answer) VALUES (?,?,?,?)').run(id, i, s(f.q, 300), s(f.a, 1500)));
  }
  if ('plannedDate' in b) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(b.plannedDate)) db.prepare('INSERT INTO content_calendar (article_id, planned_date) VALUES (?,?) ON CONFLICT(article_id) DO UPDATE SET planned_date=excluded.planned_date, done=0').run(id, b.plannedDate);
    else db.prepare('DELETE FROM content_calendar WHERE article_id=?').run(id);
  }
  if (b.calendarDone !== undefined) db.prepare('UPDATE content_calendar SET done=? WHERE article_id=?').run(b.calendarDone ? 1 : 0, id);
  db.prepare('UPDATE articles SET updated_at=? WHERE id=?').run(now(), id);
  revision(id);
  return load(id);
}

// Snapshot at most once a minute so autosave doesn't flood the table; keep the latest 30.
function revision(id) {
  const last = db.prepare('SELECT created_at FROM article_revisions WHERE article_id=? ORDER BY id DESC LIMIT 1').get(id);
  if (last && Date.now() - Date.parse(last.created_at) < 60_000) return;
  const a = load(id);
  if (!a.title && !a.body) return;
  db.prepare('INSERT INTO article_revisions (article_id, snapshot, created_at) VALUES (?,?,?)').run(id, JSON.stringify({ ...a, image: '' }), now());
  db.prepare('DELETE FROM article_revisions WHERE article_id=? AND id NOT IN (SELECT id FROM article_revisions WHERE article_id=? ORDER BY id DESC LIMIT 30)').run(id, id);
}
export const revisions = (id) => db.prepare('SELECT id, created_at, snapshot FROM article_revisions WHERE article_id=? ORDER BY id DESC').all(id).map((r) => ({ id: r.id, createdAt: r.created_at, title: JSON.parse(r.snapshot).title }));
export function restoreRevision(id, rid) {
  const r = db.prepare('SELECT snapshot FROM article_revisions WHERE id=? AND article_id=?').get(rid, id);
  if (!r) return null;
  const { title, body, excerpt, metaTitle, metaDescription, faqs, tags } = JSON.parse(r.snapshot);
  return save(id, { title, body, excerpt, metaTitle, metaDescription, faqs, tags });
}

export const all = () => db.prepare('SELECT id FROM articles ORDER BY updated_at DESC').all().map((r) => load(r.id));
export const remove = (id) => db.prepare('DELETE FROM articles WHERE id=?').run(id);
export const categories = () => db.prepare('SELECT name FROM article_categories ORDER BY name').all().map((r) => r.name);
export const slugTaken = (slug, id) => Boolean(db.prepare('SELECT 1 FROM articles WHERE slug=? AND id<>?').get(slug, id));

export const history = (id, limit = 50) => db.prepare(`SELECT h.*, a.title FROM publishing_history h LEFT JOIN articles a ON a.id=h.article_id ${id ? 'WHERE h.article_id=?' : ''} ORDER BY h.id DESC LIMIT ${limit | 0}`).all(...(id ? [id] : []));
export const logHistory = (id, action, ok, message, url = '') => db.prepare('INSERT INTO publishing_history (article_id, action, ok, message, url, created_at) VALUES (?,?,?,?,?,?)').run(id, action, ok ? 1 : 0, s(message, 500), url, now());

export const getSetting = (k, d = '') => db.prepare('SELECT value FROM integration_settings WHERE key=?').get(k)?.value ?? d;
export const setSetting = (k, v) => db.prepare('INSERT INTO integration_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, s(v, 500));

export const calendar = () => db.prepare('SELECT c.planned_date, c.done, a.id, a.title, a.status FROM content_calendar c JOIN articles a ON a.id=c.article_id ORDER BY c.planned_date').all();
