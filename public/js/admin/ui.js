// Shared admin UI pieces: icons, pills, charts, pager, form modal, CSV export.
// No framework — each helper returns an HTML string or wires a modal.

import { esc, api, modal, toast } from '../common.js';

const P = {
  home: '<path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3-5.5 6.5-5.5s6 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .6 3.3 2.4 3.6 5.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c.6-4 3.8-6 8-6s7.400 2 8 6"/>',
  building: '<path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M3 21h18"/>',
  deal: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2M14 14l2.500 2.500a1.400 1.400 0 0 0 2-2L15 11l-3 .5-2.500-2.500a1.400 1.400 0 0 0-2 0L3 13l4 4 2-1M3 13l-1-1M21 12l1-1-3-3-3.500 1"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.500 12 2.500 2.500 4.500-5"/>',
  card: '<rect x="2.500" y="5" width="19" height="14" rx="2.500"/><path d="M2.500 10h19M6 15h4"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6"/>',
  repeat: '<path d="M17 2l3 3-3 3M3 11V9a4 4 0 0 1 4-4h13M7 22l-3-3 3-3M21 13v2a4 4 0 0 1-4 4H4"/>',
  chart: '<path d="M3 3v18h18M7 15l4-4 3 3 5-6"/>',
  bars: '<path d="M5 21V11M12 21V4M19 21v-7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/>',
  spark: '<path d="M12 3l1.800 5.200L19 10l-5.200 1.800L12 17l-1.800-5.200L5 10l5.200-1.800zM19 16l.8 2.200L22 19l-2.200.8L19 22l-.8-2.200L16 19l2.200-.8z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.500 2.700 3.700 5.700 3.700 9S14.500 18.300 12 21c-2.500-2.700-3.700-5.700-3.700-9S9.500 5.700 12 3z"/>',
  pin: '<path d="M12 21s7-6.200 7-11a7 7 0 0 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.500"/>',
  mega: '<path d="M3 11v2a1 1 0 0 0 1 1h3l9 5V5L7 10H4a1 1 0 0 0-1 1zM19 9a4 4 0 0 1 0 6"/>',
  pen: '<path d="M4 20h4L19 9a2.800 2.800 0 0 0-4-4L4 16zM13.500 6.500l4 4"/>',
  cal: '<rect x="3.500" y="5" width="17" height="15.500" rx="2.500"/><path d="M3.500 10h17M8 3v4M16 3v4"/>',
  layout: '<rect x="3" y="3" width="18" height="18" rx="2.500"/><path d="M3 9h18M9 21V9"/>',
  box: '<path d="m21 8-9-5-9 5 9 5zM3 8v8l9 5 9-5V8M12 13v8"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19a2 2 0 0 1 2-2h13M8 7h7"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.500"/><circle cx="9" cy="10" r="1.800"/><path d="m21 16-5-5-9 9"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8zM7.500 8.500h.01"/>',
  shield: '<path d="M12 3 4 6v6c0 4.500 3.200 7.800 8 9 4.800-1.200 8-4.500 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.400 15a1.700 1.700 0 0 0 .3 1.800l.1.1a2 2 0 1 1-2.800 2.800l-.1-.1a1.700 1.700 0 0 0-1.800-.3 1.700 1.700 0 0 0-1 1.500V21a2 2 0 1 1-4 0v-.1a1.700 1.700 0 0 0-1.100-1.500 1.700 1.700 0 0 0-1.800.3l-.1.1a2 2 0 1 1-2.800-2.800l.1-.1a1.700 1.700 0 0 0 .3-1.800 1.700 1.700 0 0 0-1.500-1H3a2 2 0 1 1 0-4h.1a1.700 1.700 0 0 0 1.500-1.100 1.700 1.700 0 0 0-.3-1.800l-.1-.1a2 2 0 1 1 2.800-2.800l.1.1a1.700 1.700 0 0 0 1.800.3h0a1.700 1.700 0 0 0 1-1.500V3a2 2 0 1 1 4 0v.1a1.700 1.700 0 0 0 1 1.500h0a1.700 1.700 0 0 0 1.800-.3l.1-.1a2 2 0 1 1 2.800 2.800l-.1.1a1.700 1.700 0 0 0-.3 1.800v0a1.700 1.700 0 0 0 1.500 1H21a2 2 0 1 1 0 4h-.1a1.700 1.700 0 0 0-1.500 1z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 21a2 2 0 0 0 4 0"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.500 6h.01M3.500 12h.01M3.500 18h.01"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2zM17 14h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
};
export const icon = (n, s = 18) => `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.list}</svg>`;

// ── Formatting ──
export const inr = (n, d = 0) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d });
export const compact = (n) => (n >= 1e7 ? (n / 1e7).toFixed(1) + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(1) + 'L' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n)));
export const nice = (s) => String(s ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
export const day = (s) => (s ? new Date(String(s).length <= 10 ? s + 'T00:00:00' : s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const shortDay = (s) => new Date(String(s).length <= 7 ? s + '-01T00:00:00' : s + 'T00:00:00').toLocaleDateString('en-IN', String(s).length <= 7 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
export const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

const TONE = { good: 'won paid active live yes done published verified completed complete', warn: 'pending proposal_sent partial medium scheduled unpaid paused planned running', bad: 'lost overdue high no rejected churned cancelled failed', info: 'new contacted qualified negotiation draft low note' };
export const pill = (v) => { const k = String(v ?? '').toLowerCase(); const t = Object.entries(TONE).find(([, w]) => w.split(' ').includes(k))?.[0] || 'na'; return `<span class="pl ${t}">${esc(nice(v))}</span>`; };
export const scoreChip = (label, s) => `<span class="sc ${s >= 75 ? 'good' : s >= 50 ? 'warn' : 'bad'}" title="${label} score">${label} ${s}</span>`;

// ── Charts (inline SVG) ──
const niceMax = (m) => { if (m <= 0) return 1; const p = 10 ** Math.floor(Math.log10(m)); const x = m / p; return (x <= 1 ? 1 : x <= 2 ? 2 : x <= 5 ? 5 : 10) * p; };
export function lineChart(series, { h = 190, money = false } = {}) {
  const pts = series[0]?.points || [];
  if (!pts.length) return '<p class="muted small">No data in this range.</p>';
  const W = 640; const L = 40; const R = 10; const T = 10; const Bt = 24;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.value))));
  const x = (i) => L + (pts.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (pts.length - 1));
  const y = (v) => T + (h - T - Bt) * (1 - v / max);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" class="gl"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end" class="gt">${money ? compact(max * f) : Math.round(max * f)}</text>`).join('');
  const ticks = [0, Math.floor((pts.length - 1) / 2), pts.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => `<text x="${x(i)}" y="${h - 6}" text-anchor="middle" class="gt">${esc(shortDay(pts[i].label))}</text>`).join('');
  const body = series.map((s, si) => {
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join('');
    const area = si === 0 ? `<path d="${d}L${x(pts.length - 1)} ${y(0)}L${x(0)} ${y(0)}Z" fill="${s.color}" opacity=".10"/>` : '';
    const dots = pts.length <= 31 ? s.points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.6" fill="${s.color}"><title>${esc(shortDay(p.label))}: ${money ? inr(p.value) : p.value}</title></circle>`).join('') : '';
    return `${area}<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linejoin="round"/>${dots}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(series.map((s) => s.name).join(' and '))} trend">${grid}${ticks}${body}</svg>
    <div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`;
}
export function barChart(points, { h = 190, color = 'var(--accent)', money = true } = {}) {
  if (!points.length) return '<p class="muted small">No data.</p>';
  const W = 640; const L = 44; const R = 6; const T = 10; const Bt = 24; const max = niceMax(Math.max(1, ...points.map((p) => p.value)));
  const bw = (W - L - R) / points.length; const y = (v) => T + (h - T - Bt) * (1 - v / max);
  const grid = [0, 0.5, 1].map((f) => `<line x1="${L}" x2="${W - R}" y1="${y(max * f)}" y2="${y(max * f)}" class="gl"/><text x="${L - 6}" y="${y(max * f) + 4}" text-anchor="end" class="gt">${money ? compact(max * f) : Math.round(max * f)}</text>`).join('');
  const bars = points.map((p, i) => `<g><rect x="${(L + i * bw + bw * 0.18).toFixed(1)}" y="${y(p.value).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(0, y(0) - y(p.value)).toFixed(1)}" rx="3" fill="${color}"><title>${esc(shortDay(p.label))}: ${money ? inr(p.value) : p.value}</title></rect><text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle" class="gt">${esc(shortDay(p.label).split(' ')[0])}</text></g>`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img" aria-label="Bar chart">${grid}${bars}</svg>`;
}
export function donut(parts, centerTop, centerSub) {
  const total = parts.reduce((s, p) => s + p.value, 0); const C = 2 * Math.PI * 52; let off = 0;
  const arcs = total ? parts.filter((p) => p.value > 0).map((p) => { const len = (p.value / total) * C; const el = `<circle cx="70" cy="70" r="52" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 70 70)"/>`; off += len; return el; }).join('') : '';
  return `<div class="donut-row"><svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="Payments breakdown"><circle cx="70" cy="70" r="52" fill="none" stroke="var(--surface-3)" stroke-width="16"/>${arcs}<text x="70" y="68" text-anchor="middle" class="dn">${esc(centerTop)}</text><text x="70" y="86" text-anchor="middle" class="gt">${esc(centerSub)}</text></svg>
    <div class="dl">${parts.map((p) => `<div><i style="background:${p.color}"></i><span>${esc(p.label)}</span><b>${inr(p.value)}</b></div>`).join('')}</div></div>`;
}
export const hbars = (rows, money = false) => {
  const max = Math.max(1, ...rows.map((r) => r.value ?? r.n));
  return rows.length ? `<div class="hbars">${rows.map((r) => { const v = r.value ?? r.n; return `<div class="r"><span class="break">${esc(nice(r.label))}</span><div class="bar"><span style="width:${(100 * v) / max}%"></span></div><b style="text-align:right">${money ? compact(v) : v}</b></div>`; }).join('')}</div>` : '<p class="muted small">Nothing yet.</p>';
};

// ── Range filter (Today / 7 Days / 30 Days / This Month / Custom) ──
export const RANGES = [['today', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['month', 'This Month'], ['custom', 'Custom']];
export const rangeBar = (st) => `<div class="rangebar"><select class="mini" data-range aria-label="Date range">${RANGES.map(([k, l]) => `<option value="${k}" ${st.range === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <span class="cust" ${st.range === 'custom' ? '' : 'hidden'}><input type="date" class="mini" data-from value="${esc(st.from || '')}" aria-label="From"><input type="date" class="mini" data-to value="${esc(st.to || '')}" aria-label="To"></span></div>`;
export function bindRange(root, st, reload) {
  root.querySelector('[data-range]').onchange = (e) => { st.range = e.target.value; root.querySelector('.cust').hidden = st.range !== 'custom'; if (st.range !== 'custom') reload(); };
  for (const k of ['from', 'to']) root.querySelector(`[data-${k}]`).onchange = (e) => { st[k] = e.target.value; if (st.from && st.to && st.from <= st.to) reload(); };
}
export const rangeQS = (st) => `range=${st.range}${st.range === 'custom' ? `&from=${st.from || ''}&to=${st.to || ''}` : ''}`;

// ── Pager ──
export const pager = (total, page, size) => {
  if (total <= size) return total ? `<div class="pager"><span>${total} record${total > 1 ? 's' : ''}</span></div>` : '';
  const last = Math.ceil(total / size);
  return `<div class="pager"><span>${(page - 1) * size + 1}–${Math.min(total, page * size)} of ${total}</span><span class="spacer"></span><button class="btn sm ghost" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Prev</button><span class="small">Page ${page} / ${last}</span><button class="btn sm ghost" data-page="${page + 1}" ${page >= last ? 'disabled' : ''}>Next →</button></div>`;
};

export const empty = (title, text = '', action = '') => `<div class="empty-state"><div class="es-ic">${icon('list', 26)}</div><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
export const loading = (view) => { view.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>'; };
export const errorBox = (e) => `<div class="empty-state bad"><h3>Could not load this section</h3><p>${esc(e.message)}</p></div>`;
export const head = (eyebrow, title, sub, right = '') => `<div class="page-head"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><span class="spacer"></span><div class="row wrap-row">${right}</div></div>`;

// ── Forms ──
export function fieldHtml(fd, val, refs = {}) {
  const v = val ?? fd.def ?? '';
  const id = 'f-' + fd.name; const req = fd.required ? ' required' : '';
  let ctl;
  if (fd.type === 'textarea') ctl = `<textarea class="input" id="${id}" name="${fd.name}" rows="3"${req}>${esc(v)}</textarea>`;
  else if (fd.type === 'select') ctl = `<select class="input" id="${id}" name="${fd.name}"${req}>${fd.required || fd.def ? '' : '<option value="">—</option>'}${fd.options.map((o) => `<option value="${esc(o)}" ${String(v) === o ? 'selected' : ''}>${esc(nice(o))}</option>`).join('')}</select>`;
  else if (fd.type === 'ref') ctl = `<select class="input" id="${id}" name="${fd.name}"${req}><option value="">—</option>${(refs[fd.entity] || []).map((o) => `<option value="${esc(o.id)}" ${String(v) === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  else if (fd.type === 'bool') return `<label class="field chk"><input type="checkbox" name="${fd.name}" ${v === true || v === 'true' ? 'checked' : ''}> ${esc(fd.label)}</label>`;
  else ctl = `<input class="input" id="${id}" name="${fd.name}" type="${fd.type === 'date' ? 'date' : fd.type === 'number' || fd.type === 'int' ? 'number' : 'text'}" ${fd.type === 'number' ? 'step="any"' : ''} value="${esc(v)}"${req}>`;
  return `<div class="field${fd.type === 'textarea' ? ' wide' : ''}"><label for="${id}">${esc(fd.label)}${fd.required ? ' *' : ''}</label>${ctl}</div>`;
}
export const readForm = (form, fields) => {
  const f = new FormData(form); const out = {};
  for (const fd of fields) out[fd.name] = fd.type === 'bool' ? f.has(fd.name) : (f.get(fd.name) ?? '');
  return out;
};

/** Opens a modal form for a field list. onSave(values) must throw to show an error. */
export function formModal({ title, fields, values = {}, refs = {}, submit = 'Save', onSave, extra = '' }) {
  return modal(`<form class="mform" novalidate><h3 class="mh">${esc(title)}</h3><div class="fgrid">${fields.map((fd) => fieldHtml(fd, values[fd.name], refs)).join('')}</div>${extra}
    <p class="ferr" hidden></p><div class="mf"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn accent" type="submit">${esc(submit)}</button></div></form>`, {
    onMount: (m, close) => {
      m.querySelector('form').onsubmit = async (e) => {
        e.preventDefault();
        const btn = m.querySelector('[type=submit]'); const er = m.querySelector('.ferr');
        btn.disabled = true; er.hidden = true;
        try { await onSave(readForm(e.target, fields), m); close(); } catch (ex) { er.textContent = ex.message; er.hidden = false; btn.disabled = false; }
      };
    },
  });
}

/** Options for ref selects, cached for the session. */
const refCache = {};
export async function refOptions(entity, meta) {
  if (entity === 'users') return (meta.users || []).map((u) => ({ id: u.id, label: u.name }));
  if (!refCache[entity] || Date.now() - refCache[entity].at > 30000) {
    const r = await api(`/admin/crm/e/${entity}?size=100`);
    const title = meta.entities[entity]?.fields?.[0]?.name || 'name';
    refCache[entity] = { at: Date.now(), rows: r.rows.map((x) => ({ id: x.id, label: x[title] || x.name || x.id })) };
  }
  return refCache[entity].rows;
}
export const clearRefCache = () => { for (const k in refCache) delete refCache[k]; };

// ── Exports ──
export function downloadCsv(columns, rows, name) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [columns.map((c) => cell(c.l)).join(','), ...rows.map((r) => columns.map((c) => cell(r[c.k])).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
export function printTable(title, sub, columns, rows) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to print or save as PDF.');
  w.document.write(`<!doctype html><title>${esc(title)}</title><style>body{font:13px system-ui,sans-serif;margin:28px;color:#0b1b2b}h1{font-size:20px;margin:0}p{color:#64748b}table{border-collapse:collapse;width:100%;margin-top:14px}th{background:#f1f5f9;text-align:left}td,th{border:1px solid #e2e8f0;padding:6px 8px}</style><h1>${esc(title)}</h1><p>${esc(sub)}</p><table><thead><tr>${columns.map((c) => `<th>${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(r[c.k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table><script>onload=()=>print()<\/script>`);
  w.document.close();
}
export const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
