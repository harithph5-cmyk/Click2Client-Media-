// Knowledge base for the Baasha AI agent: Markdown documents are read from a folder, split into sections, and
// searched with BM25 keyword scoring. Nothing is hard-coded: drop a new .md file into the folder and it is
// searchable after a restart. Results carry their source path and heading so answers can cite them.
// Retrieved text is reference DATA. It is returned with a notice and can never change the agent's rules.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DIR = process.env.BAASHA_KNOWLEDGE_DIR || path.resolve(HERE, '../../knowledge');

const STOP = new Set('a an and are as at be but by for from how if in into is it its of on or such that the their then there these this to was what when which who will with you your can do does not no than so also may should must'.split(' '));
const MAX_CHUNK = 1800;

export const tokenize = (s) => String(s || '').toLowerCase().match(/[a-z0-9][a-z0-9.\-_/]*[a-z0-9]|[a-z0-9]/g)?.map((t) => t.replace(/[.\-_/]+$/, '')).filter((t) => t.length > 1 && !STOP.has(t)) || [];

// Tiny front-matter reader: `key: value` lines and `key: [a, b]` lists. No YAML dependency.
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const v = kv[2].trim();
    meta[kv[1]] = v.startsWith('[') && v.endsWith(']') ? v.slice(1, -1).split(',').map((x) => x.trim()).filter(Boolean) : v.replace(/^["']|["']$/g, '');
  }
  return { meta, body: text.slice(m[0].length) };
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p);
  }
  return out.sort();
}

// Sections are split on Markdown headings (levels 1 to 3); long sections are split again on paragraph breaks.
export function splitSections(body) {
  const lines = body.split(/\r?\n/);
  const sections = []; let heading = '', buf = [];
  const flush = () => { const text = buf.join('\n').trim(); if (text) sections.push({ heading, text }); buf = []; };
  for (const line of lines) {
    const h = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (h) { flush(); heading = h[2]; buf.push(line); } else buf.push(line);
  }
  flush();
  const out = [];
  for (const s of sections) {
    if (s.text.length <= MAX_CHUNK) { out.push(s); continue; }
    let cur = '';
    for (const para of s.text.split(/\n\s*\n/)) {
      if (cur && cur.length + para.length > MAX_CHUNK) { out.push({ heading: s.heading, text: cur.trim() }); cur = ''; }
      cur += (cur ? '\n\n' : '') + para;
    }
    if (cur.trim()) out.push({ heading: s.heading, text: cur.trim().slice(0, MAX_CHUNK * 2) });
  }
  return out;
}

const trustFor = (area) => (area === 'reference' ? 'reference' : 'reviewed');

export function createKnowledgeBase({ dir = DEFAULT_DIR } = {}) {
  const docs = [], chunks = [], skills = new Map();
  if (fs.existsSync(dir)) {
    for (const file of walk(dir)) {
      const rel = path.relative(dir, file).split(path.sep).join('/');
      const raw = fs.readFileSync(file, 'utf8');
      const { meta, body } = parseFrontMatter(raw);
      const parts = rel.split('/'); const area = parts.length > 1 ? parts[0] : 'root'; const topic = parts.length > 2 ? parts[1] : '';
      const title = (/^#\s+(.+)$/m.exec(body)?.[1] || meta.name || rel).trim();
      const doc = { id: rel, path: rel, title, area, trust: trustFor(area), meta, bytes: raw.length };
      docs.push(doc);
      if (area === 'skills' && /\/SKILL\.md$/i.test(rel)) {
        const id = String(meta.id || rel.split('/')[1] || '').trim();
        if (id) skills.set(id, { id, name: meta.name || id, description: meta.description || '', triggers: meta.triggers || [], tools: meta.tools || [], risk: meta.risk || 'low', version: meta.version || '', reviewed: meta.reviewed || '', path: rel, body });
      }
      for (const s of splitSections(body)) {
        const tokens = tokenize(`${title} ${s.heading} ${s.text}`);
        if (!tokens.length) continue;
        const tf = new Map(); for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
        chunks.push({ docId: doc.id, path: rel, area, topic, trust: doc.trust, title, heading: s.heading, text: s.text, tf, len: tokens.length, headTokens: new Set(tokenize(`${title} ${s.heading}`)) });
      }
    }
  }
  const N = chunks.length || 1, avg = chunks.reduce((a, c) => a + c.len, 0) / N || 1;
  const df = new Map();
  for (const c of chunks) for (const t of c.tf.keys()) df.set(t, (df.get(t) || 0) + 1);

  function search(query, { k = 5, area = null, maxChars = 1200 } = {}) {
    const areaKey = area ? String(area).toLowerCase() : null;
    const q = [...new Set(tokenize(query))];
    if (!q.length) return [];
    const scored = [];
    for (const c of chunks) {
      if (areaKey && c.area.toLowerCase() !== areaKey && (c.topic || '').toLowerCase() !== areaKey) continue;     // matches the top folder (library) or the topic folder (TECHNICAL_SEO)
      let score = 0;
      for (const t of q) {
        const f = c.tf.get(t); if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
        score += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (c.len / avg))));
        if (c.headTokens.has(t)) score += idf * 0.6;     // a match in the title or heading counts extra
      }
      if (score > 0) scored.push({ c, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, Math.min(k, 8))).map(({ c, score }) => ({
      score: Math.round(score * 100) / 100, source: { path: c.path, title: c.title, heading: c.heading, area: c.area, trust: c.trust },
      text: c.text.length > maxChars ? c.text.slice(0, maxChars) + '...' : c.text,
    }));
  }

  return {
    dir, search,
    listSkills: () => [...skills.values()].map(({ body, ...s }) => s),
    getSkill: (id) => skills.get(String(id)) || null,
    areas: () => [...new Set(docs.map((d) => d.area))].sort(),
    stats: () => ({ documents: docs.length, sections: chunks.length, skills: skills.size, areas: [...new Set(docs.map((d) => d.area))].sort() }),
  };
}

let shared = null;
export const getKnowledgeBase = () => (shared ||= createKnowledgeBase());
export const resetKnowledgeBase = () => { shared = null; };
