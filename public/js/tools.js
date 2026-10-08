// /seo-tools/<tool>: submits the form to /api/tools/<tool> and renders the result.
import { api, esc, track } from './common.js';

const form = document.getElementById('toolForm');
const out = document.getElementById('toolOut');
const box = document.getElementById('toolResult');
const err = document.getElementById('toolErr');
const slug = form.dataset.tool;
const ICON = { pass: '✓', warn: '!', fail: '✕', info: 'i' };

const ring = (n) => `<div class="tl-score s-${n >= 80 ? 'good' : n >= 50 ? 'ok' : 'bad'}" style="--p:${n}"><b>${n}</b><span>/100</span></div>`;
const checks = (list) => `<ul class="tl-checks">${list.map((c) => `<li class="c-${c.status}"><i>${ICON[c.status] || 'i'}</i><div><b>${esc(c.label)}</b>${c.detail ? `<span>${esc(c.detail)}</span>` : ''}</div></li>`).join('')}</ul>`;
const table = (t) => `<div class="tl-table"><h3>${esc(t.title)}</h3><div class="table-scroll"><table><thead><tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((v, i) => (i === t.statusCol ? `<td><span class="tl-dot d-${v}">${v === 'fail' ? 'Missing' : v === 'warn' ? 'Check' : 'OK'}</span></td>` : `<td>${esc(v).replace(/\n/g, '<br>')}</td>`)).join('')}</tr>`).join('') || `<tr><td colspan="${t.cols.length}">Nothing found.</td></tr>`}</tbody></table></div></div>`;
const serp = (s) => {
  const url = String(s?.url ?? '');
  const title = String(s?.title ?? '');
  const desc = String(s?.description ?? '');
  const t = title.length > 60 ? title.slice(0, 58) + '…' : title;
  const d = desc.length > 160 ? desc.slice(0, 157) + '…' : desc;
  return `<div class="tl-serp"><span class="tl-serp-label">Google preview</span><div class="u">${esc(url)}</div><div class="t">${esc(t)}</div><div class="d">${esc(d)}</div></div>`;
};
const og = (o) => `<div class="tl-og"><span class="tl-serp-label">Share preview</span><div class="tl-og-card">${o?.image ? `<img src="${esc(o.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="tl-og-noimg">No share image</div>'}<div><small>${esc(o?.site)}</small><b>${esc(o?.title || '(no title)')}</b><span>${esc(o?.description)}</span></div></div></div>`;
const tree = (t) => `<div class="tl-table"><h3>Heading outline</h3><ol class="tl-tree">${t.map((h) => `<li style="--l:${h.level}"><code>H${h.level}</code>${esc(h.text) || '<em>(empty)</em>'}</li>`).join('') || '<li>No headings found.</li>'}</ol></div>`;

function render(r) {
  out.innerHTML = `<div class="tl-res-head">${r.score != null ? ring(r.score) : ''}<div><span class="eyebrow">Results</span><h2>${esc(r.tool)}</h2>${r.url ? `<p class="tl-res-url">${esc(r.url)}</p>` : ''}${r.summary ? `<p>${esc(r.summary)}</p>` : ''}</div></div>
    <div class="tl-res-grid"><div>${checks(r.checks || [])}${r.note ? `<p class="tl-note">${esc(r.note)}</p>` : ''}</div>
    <div>${r.serp ? serp(r.serp) : ''}${r.og ? og(r.og) : ''}${r.code ? `<div class="tl-code"><div class="tl-code-head"><span>Paste inside &lt;head&gt;</span><button class="btn sm" type="button" id="copyCode">Copy</button></div><pre><code>${esc(r.code)}</code></pre></div>` : ''}</div></div>
    ${r.tree ? tree(r.tree) : ''}${(r.tables || []).map(table).join('')}`;
  box.hidden = false;
  if (r.url) document.getElementById('auditLink').href = `/seo-audit?url=${encodeURIComponent(r.url)}#free-audit`;
  document.getElementById('copyCode')?.addEventListener('click', (e) => { navigator.clipboard?.writeText(r.code); e.target.textContent = 'Copied ✓'; });
  box.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type=submit]');
  const body = Object.fromEntries(new FormData(form));
  err.hidden = true;
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Checking…';
  try {
    render(await api(`/public/tools/${slug}`, { method: 'POST', body }));
    track('seo_tool_used', { tool: slug });
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
  } finally { btn.disabled = false; btn.textContent = label; }
});

// Arriving from the hub ("Check My Website") or a shared link: ?url=…
const pre = new URLSearchParams(location.search).get('url');
if (pre && form.elements.url) { form.elements.url.value = pre; form.requestSubmit(); }
