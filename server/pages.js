// Admin-editable page content. Every heading, paragraph, button, list item
// and image in the views below is wrapped in <!--@key-->default<!--/@key-->
// markers (added by scripts/mark-editable.js). The admin's edits are stored in
// one settings row ("page_content": { key: value }); rendering swaps them in
// and strips the markers. Deleting an edit brings the original copy back.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './store/db.js';
import { config } from './config.js';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'views');

/** View file → label shown in Admin → Page Content (in this order). */
export const EDITABLE_VIEWS = {
  home: { label: 'Home', url: '/', seo: 'home' },
  _about: { label: 'Who we are (Home & About)', url: '/#about' },
  _tiers: { label: 'Audit plans (Home & SEO Audit)', url: '/seo-audit#plans' },
  'seo-audit': { label: 'SEO Audit', url: '/seo-audit', seo: 'audit' },
  'seo-tools': { label: 'SEO Tools', url: '/seo-tools', seo: 'seoTools' },
  services: { label: 'Services', url: '/services', seo: 'services' },
  products: { label: 'Products', url: '/products', seo: 'products' },
  about: { label: 'About', url: '/about', seo: 'about' },
  _founder: { label: 'Meet the founder (About)', url: '/about' },
  blog: { label: 'Blog', url: '/blog', seo: 'blog' },
  enquire: { label: 'Contact Us', url: '/enquire', seo: 'enquire' },
  privacy: { label: 'Privacy Policy', url: '/privacy-policy', seo: 'privacy' },
  terms: { label: 'Terms & Conditions', url: '/terms', seo: 'terms' },
  cookies: { label: 'Cookie Policy', url: '/cookie-policy', seo: 'cookies' },
};

const MARK = /<!--@([\w.~-]+)-->([\s\S]*?)<!--\/@\1-->/g;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const decode = (s) => String(s).replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]);
const isImg = (k) => /\.img\d+$/.test(k);
const isHtml = (def) => /<[a-z]/i.test(def);
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

// ── Field registry (read from the view files) ───────────────────────────
let registry = null;
export function fields() {
  if (registry && config.isProduction) return registry;
  const out = [];
  for (const [file, meta] of Object.entries(EDITABLE_VIEWS)) {
    const src = fs.readFileSync(path.join(VIEWS, file + '.html'), 'utf8');
    let section = '';
    const items = [];
    for (const m of src.matchAll(MARK)) {
      const [, key, def] = m;
      if (key.includes('~')) continue;
      const before = src.slice(Math.max(0, m.index - 300), m.index);
      const tag = (/<(\w+)[^<>]*>\s*(?:<span class="ic-chip[^"]*">[\s\S]*?<\/span>|<svg[\s\S]*?<\/svg>)?\s*$/.exec(before) || [])[1] || '';
      if (/^h[12]$/.test(tag)) section = decode(def.replace(/<[^>]+>/g, '')).trim();
      if (isImg(key)) {
        const alt = /alt="([^"]*)"/.exec(src.slice(m.index, m.index + m[0].length + 400))?.[1] || '';
        items.push({ key, type: 'image', label: 'Image', section, default: def, alt: decode(alt) });
      } else {
        const html = isHtml(def);
        items.push({ key, type: html ? 'html' : def.length > 90 || tag === 'p' ? 'textarea' : 'text', label: LABEL[tag] || 'Text', section, default: html ? def.trim() : decode(def) });
      }
    }
    out.push({ file, ...meta, fields: items });
  }
  return (registry = out);
}
const LABEL = { h1: 'Main heading', h2: 'Section heading', h3: 'Heading', h4: 'Sub-heading', h5: 'Sub-heading', h6: 'Sub-heading', p: 'Paragraph', li: 'List item', a: 'Button', button: 'Button', figcaption: 'Caption', blockquote: 'Quote', span: 'Label', b: 'Label', strong: 'Label', small: 'Small text', em: 'Label', label: 'Form label', summary: 'Question', dt: 'Term', dd: 'Description', td: 'Table cell', th: 'Table heading' };

// ── Stored edits ─────────────────────────────────────────────────────────
export async function getEdits() {
  try { return (await store.getSetting('page_content', {})) || {}; }
  catch (err) { console.error('[pages] using default copy —', err.message); return {}; }
}

const known = () => {
  const m = new Map();
  for (const g of fields()) for (const f of g.fields) m.set(f.key, f);
  return m;
};

/** Merge a batch of edits. A value equal to the default (or null) removes the edit. */
export async function saveEdits(changes) {
  if (!changes || typeof changes !== 'object') throw bad('Nothing to save.');
  const all = known();
  const seoKeys = new Set(Object.values(EDITABLE_VIEWS).filter((v) => v.seo).flatMap((v) => [`seo.${v.seo}.title`, `seo.${v.seo}.description`]));
  const next = { ...(await getEdits()) };
  for (const [k, raw] of Object.entries(changes)) {
    const base = k.endsWith('~alt') ? k.slice(0, -4) : k;
    const f = all.get(base);
    if (!f && !seoKeys.has(k)) throw bad(`Unknown field “${k}”. Reload the page and try again.`);
    let v = raw == null ? '' : String(raw).replace(/\r\n/g, '\n');
    if (f?.type === 'image' && k === base) {
      v = v.trim();
      if (v && !/^(https:\/\/[^\s<>"]+|\/[^\s<>"]*)$/i.test(v)) throw bad('Image links must start with https:// (or / for an image on this site).');
    } else if (f?.type === 'html') {
      v = v.replace(/<\s*\/?\s*(script|iframe|object|embed|style|link|meta)\b[^>]*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/javascript:/gi, '');
    }
    v = v.slice(0, 20000);
    const def = k === base ? f?.default : f?.alt;
    if (!v.trim() || v === def) delete next[k];
    else next[k] = v;
  }
  await store.setSetting('page_content', next);
  return next;
}

// ── Rendering ────────────────────────────────────────────────────────────
/** Swap the admin's edits into rendered HTML and remove every marker. */
export function applyEdits(html, edits) {
  // Alt text first, while the <img> still carries its src marker.
  if (Object.keys(edits).some((k) => k.endsWith('~alt'))) {
    html = html.replace(/<img\b(?:[^>"]|"[^"]*")*>/g, (tag) => {
      const k = /src="<!--@([\w.-]+)-->/.exec(tag)?.[1];
      return k && edits[`${k}~alt`] != null ? tag.replace(/\salt="[^"]*"/, ` alt="${esc(edits[`${k}~alt`])}"`) : tag;
    });
  }
  return html.replace(MARK, (_, k, def) => {
    if (k.endsWith('~drop')) return edits[k.slice(0, -5)] ? '' : def;
    const v = edits[k];
    if (v == null) return def;
    if (isImg(k)) return esc(v);
    return isHtml(def) ? v : esc(v).replace(/\n/g, '<br>');
  });
}
