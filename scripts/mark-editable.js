// Marks the editable text and images in views/*.html so Admin → Page Content
// can override them. Each editable piece is wrapped in a pair of comments:
//
//   <h2><!--@home.4-->See What Your Website Is Missing<!--/@home.4--></h2>
//   <img src="<!--@home.img2-->/img/x.webp<!--/@home.img2-->" alt="…">
//
// The text between the markers is the default; server/pages.js swaps in the
// admin's version at render time and strips the markers. Safe to re-run after
// adding new copy to a view: existing markers are kept, new pieces get the
// next free number.   Usage: node scripts/mark-editable.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'htmlparser2';
import { EDITABLE_VIEWS } from '../server/pages.js';

const VIEWS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'views');

const TEXT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'figcaption', 'blockquote', 'dt', 'dd', 'td', 'th', 'label', 'summary']);
const SPAN_TAGS = new Set(['span', 'b', 'strong', 'small', 'em']);
const BLOCK = new Set([...TEXT_TAGS, 'ul', 'ol', 'div', 'section', 'article', 'figure', 'form', 'input', 'select', 'textarea', 'button', 'img', 'picture', 'table', 'nav', 'iframe', 'script', 'style', 'video', 'header', 'footer', 'aside', 'main']);
const SIMPLE_TOKENS = /^(phone|email|city|company|year|base|phoneHref|whatsappHref|price\.p25|price\.p50|tools\.live|tools\.count)$/;

const isEl = (n) => n.type === 'tag' || n.type === 'script' || n.type === 'style';
const cls = (n) => ` ${n.attribs?.class || ''} `;
const hasDesc = (n, test) => (n.children || []).some((c) => (isEl(c) && test(c)) || hasDesc(c, test));
const textOf = (n) => (n.type === 'text' ? n.data : (n.children || []).map(textOf).join(''));
const inHidden = (n) => { for (let p = n.parent; p; p = p.parent) if (p.attribs?.['aria-hidden'] === 'true' || cls(p).includes(' crumbs ') || ['select', 'script', 'style'].includes(p.name)) return true; return false; };
const isIcon = (n) => isEl(n) && (n.name === 'svg' || (hasDesc(n, (c) => c.name === 'svg') && !textOf(n).trim()));
const blank = (n) => n.type === 'text' && !n.data.trim();
const isCandidate = (n) => {
  if (!isEl(n)) return false;
  if (TEXT_TAGS.has(n.name)) return true;
  if (n.name === 'a' && cls(n).includes(' btn ')) return true;
  if (n.name === 'button') return true;
  return SPAN_TAGS.has(n.name) && n.parent && !TEXT_TAGS.has(n.parent.name) && !SPAN_TAGS.has(n.parent.name) && n.parent.name !== 'a' && n.parent.name !== 'label';
};

function plan(src) {
  const doc = parseDocument(src, { withStartIndices: true, withEndIndices: true, recognizeSelfClosing: true });
  const edits = []; // { at, insert } or { from, to, wrap }
  const walk = (n) => {
    for (const c of n.children || []) {
      if (!isEl(c)) continue;
      if (c.name === 'img' && !inHidden(c)) {
        const tag = src.slice(c.startIndex, c.endIndex + 1);
        const m = /\ssrc="([^"{}<]+)"/.exec(tag);
        if (m) {
          const at = c.startIndex + m.index + m[0].indexOf('"') + 1;
          edits.push({ kind: 'img', from: at, to: at + m[1].length });
          for (const s of (c.parent?.name === 'picture' ? c.parent.children : []).filter((x) => x.name === 'source')) edits.push({ kind: 'drop', from: s.startIndex, to: s.endIndex + 1, img: at });
        }
        continue;
      }
      if (isCandidate(c) && !inHidden(c) && !hasDesc(c, (d) => BLOCK.has(d.name) || isCandidate(d))) {
        const kids = [...(c.children || [])];
        while (kids.length && (blank(kids[0]) || isIcon(kids[0]))) kids.shift();
        while (kids.length && (blank(kids.at(-1)) || isIcon(kids.at(-1)))) kids.pop();
        const from = kids[0]?.startIndex, to = kids.at(-1)?.endIndex + 1;
        const inner = kids.length ? src.slice(from, to) : '';
        const tokens = [...inner.matchAll(/\{\{([\w.]+)\}\}/g)].map((x) => x[1]);
        const marked = kids.some((k) => k.type === 'comment' && k.data.startsWith('@'));
        if (inner.trim() && textOf(c).trim() && !marked && !inner.includes('<!--') && tokens.every((t) => SIMPLE_TOKENS.test(t)) && !kids.some(isIcon)) {
          edits.push({ kind: 'text', from, to });
          continue;
        }
      }
      walk(c);
    }
  };
  walk(doc);
  return edits;
}

let total = 0;
for (const file of Object.keys(EDITABLE_VIEWS)) {
  const fp = path.join(VIEWS, file + '.html');
  let src = fs.readFileSync(fp, 'utf8');
  let n = Math.max(0, ...[...src.matchAll(/<!--@[\w-]+\.(?:img)?(\d+)-->/g)].map((m) => Number(m[1])));
  const edits = plan(src).sort((a, b) => a.from - b.from);
  const keyAt = new Map();
  for (const e of edits) if (e.kind !== 'drop') keyAt.set(e.from, `${file}.${e.kind === 'img' ? 'img' : ''}${++n}`);
  for (const e of edits.sort((a, b) => b.from - a.from)) {
    const k = e.kind === 'drop' ? keyAt.get(e.img) + '~drop' : keyAt.get(e.from);
    src = `${src.slice(0, e.from)}<!--@${k}-->${src.slice(e.from, e.to)}<!--/@${k}-->${src.slice(e.to)}`;
  }
  fs.writeFileSync(fp, src);
  total += keyAt.size;
  console.log(`${file}: ${keyAt.size} new editable pieces`);
}
console.log(`Done — ${total} marked.`);
