// Pure Markdown-subset → HTML renderer shared by the website and Blog Studio
// (no imports, so the portal's preview is identical to the live page).
//   ## Heading  ### Sub-heading  - list  1. list  > quote  | table |
//   **bold**  *italic*  [text](https://…)  ![alt](https://…image)
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function inline(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(((?:https:\/\/|\/)[^\s)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith('/') ? '' : ' target="_blank" rel="noopener"'}>${t}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

const cells = (l) => l.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export function formatBody(text) {
  const out = [];
  let list = null;
  let para = [];
  let table = null;
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table.filter((r) => !/^[\s|:-]+$/.test(r.join('|')));
    out.push(`<div class="bl-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    table = null;
  };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    let m;
    if (line.startsWith('|') && line.length > 1) { flushPara(); flushList(); (table ||= []).push(cells(line)); continue; }
    flushTable();
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
  flushPara(); flushList(); flushTable();
  return out.join('\n');
}

export const faqHtml = (faqs) => (faqs?.length
  ? `<section class="bl-faq"><h2>Frequently asked questions</h2>${faqs.map((f) => `<h3>${esc(f.q)}</h3><p>${inline(f.a)}</p>`).join('')}</section>`
  : '');
