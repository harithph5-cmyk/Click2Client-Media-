// Generic module page (list · search · filters · pagination · add/edit/delete),
// driven by the field config the server publishes in /crm/meta.

import { api, esc, toast } from '../common.js';
import { inr, day, pill, nice, pager, empty, errorBox, loading, head, formModal, refOptions, clearRefCache, debounce } from './ui.js';

const MONEY = new Set(['value', 'amount', 'budget', 'spent', 'price', 'cpl']);
const PILL = new Set(['status', 'stage', 'priority', 'visible', 'cycle', 'kind', 'platform']);

function cell(key, row, fd) {
  const v = row[key];
  if (fd?.type === 'ref') return esc(row[key + '__label'] || '—');
  if (MONEY.has(key)) return v == null ? '—' : inr(v, key === 'cpl' ? 2 : 0);
  if (key === 'conv') return v == null ? '—' : v + '%';
  if (key === 'probability') return v + '%';
  if (fd?.type === 'date') return day(v);
  if (fd?.type === 'bool') return v ? '✓' : '—';
  if (fd?.type === 'url') return v ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(String(v).replace(/^https?:\/\/(www\.)?/, '').slice(0, 34))}</a>` : '—';
  if (PILL.has(key) && v) return pill(v);
  if (key === 'position') return v == null ? '—' : `#${v}${row.prev_position != null ? ` <span class="${row.prev_position > v ? 'good' : row.prev_position < v ? 'bad' : ''}" style="font-size:11px">${row.prev_position > v ? '▲' : row.prev_position < v ? '▼' : ''}${Math.abs(row.prev_position - v) || ''}</span>` : ''}`;
  return v == null || v === '' ? '—' : esc(String(v).slice(0, 90));
}
const LABEL = { cpl: 'Cost / lead', conv: 'Conv. %', prev_position: 'Previous rank', client_id: 'Client', company_id: 'Company', project_id: 'Website', assigned_to: 'Assigned to' };

/** Renders a module. opts.embedded skips the page header (used inside other pages). */
export async function entityTab(view, key, { state, meta }, opts = {}) {
  const spec = meta.entities[key];
  if (!spec) { view.innerHTML = errorBox(new Error('You do not have access to this section.')); return; }
  const st = ((state.ent ||= {})[key] ||= { q: state.hq?.get('q') || '', page: 1, filters: {} });
  const fieldOf = (k) => spec.fields.find((f) => f.name === k);
  const isTask = key === 'tasks';

  async function load() {
    const box = view.querySelector('#eb');
    box.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
    const qs = new URLSearchParams({ q: st.q, page: st.page, size: 25, ...Object.fromEntries(Object.entries(st.filters).filter(([, v]) => v)) });
    let r;
    try { r = await api(`/admin/crm/e/${key}?${qs}`); } catch (e) { box.innerHTML = errorBox(e); return; }
    const cols = spec.cols;
    box.innerHTML = r.rows.length ? `<div class="tw"><table class="tbl"><thead><tr>${cols.map((c) => `<th ${MONEY.has(c) ? 'class="num"' : ''}>${esc(fieldOf(c)?.label?.replace(/ \(.*\)/, '') || LABEL[c] || nice(c))}</th>`).join('')}<th></th></tr></thead><tbody>
      ${r.rows.map((row) => `<tr data-id="${esc(row.id)}">${cols.map((c, i) => `<td ${MONEY.has(c) ? 'class="num"' : ''}>${i === 0 ? `<span class="ttl">${cell(c, row, fieldOf(c))}</span>` : cell(c, row, fieldOf(c))}</td>`).join('')}
      <td class="act">${isTask ? `<button class="btn sm ghost" data-toggle="${row.status === 'done' ? 'pending' : 'done'}">${row.status === 'done' ? 'Reopen' : 'Mark done'}</button> ` : ''}<button class="btn sm ghost" data-edit>Edit</button> <button class="btn sm quiet del" data-del>Delete</button></td></tr>`).join('')}
      </tbody></table></div>${pager(r.total, r.page, r.size)}` : empty(st.q || Object.values(st.filters).some(Boolean) ? 'No matches' : `No ${spec.plural.toLowerCase()} yet`, st.q ? 'Try a different search or clear the filters.' : `Use “Add ${spec.label.toLowerCase()}” to create the first one.`);
    box.onclick = async (e) => {
      const pg = e.target.closest('[data-page]'); if (pg) { st.page = +pg.dataset.page; return load(); }
      const tr = e.target.closest('tr[data-id]'); if (!tr) return;
      const row = r.rows.find((x) => x.id === tr.dataset.id);
      try {
        if (e.target.closest('[data-toggle]')) { await api(`/admin/crm/e/${key}/${row.id}`, { method: 'PUT', body: { status: e.target.closest('[data-toggle]').dataset.toggle } }); return load(); }
        if (e.target.closest('[data-edit]')) return openForm(row);
        if (e.target.closest('[data-del]') && confirm(`Delete this ${spec.label.toLowerCase()}? This cannot be undone.`)) { await api(`/admin/crm/e/${key}/${row.id}`, { method: 'DELETE' }); clearRefCache(); toast('Deleted'); load(); }
      } catch (ex) { toast(ex.message); }
    };
  }

  async function openForm(row) {
    const refs = {};
    for (const f of spec.fields.filter((x) => x.type === 'ref')) refs[f.entity] = await refOptions(f.entity, meta);
    formModal({
      title: row ? `Edit ${spec.label.toLowerCase()}` : `Add ${spec.label.toLowerCase()}`, fields: spec.fields, values: row || (state.hq?.get('date') ? { planned_on: state.hq.get('date') } : {}), refs,
      onSave: async (v) => { await api(row ? `/admin/crm/e/${key}/${row.id}` : `/admin/crm/e/${key}`, { method: row ? 'PUT' : 'POST', body: v }); clearRefCache(); toast('Saved'); load(); },
    });
  }

  const filterSel = await Promise.all(spec.filters.map(async (f) => {
    const fd = fieldOf(f); if (!fd) return '';
    const opts = fd.type === 'select' ? fd.options.map((o) => ({ id: o, label: nice(o) })) : fd.type === 'ref' ? await refOptions(fd.entity, meta) : [];
    return `<select class="mini" data-filter="${f}" aria-label="${esc(fd.label)}"><option value="">${esc(fd.label.replace(/ \(.*\)/, ''))}: all</option>${opts.map((o) => `<option value="${esc(o.id)}" ${st.filters[f] === o.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  }));

  view.innerHTML = `${opts.embedded ? '' : head('Module', spec.plural, '', `<button class="btn accent sm" data-add>+ Add ${esc(spec.label.toLowerCase())}</button>`)}
    <div class="pnl" style="padding:0"><div class="toolbar"><input type="search" placeholder="Search ${esc(spec.plural.toLowerCase())}…" value="${esc(st.q)}" aria-label="Search">${filterSel.join('')}${opts.embedded ? `<span class="spacer"></span><button class="btn accent sm" data-add>+ Add ${esc(spec.label.toLowerCase())}</button>` : ''}</div><div id="eb"></div></div>`;
  view.querySelector('input[type=search]').oninput = debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); });
  view.querySelectorAll('[data-filter]').forEach((s) => { s.onchange = () => { st.filters[s.dataset.filter] = s.value; st.page = 1; load(); }; });
  view.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => openForm(null); });
  await load();
  if (state.hq?.get('new') === '1' && !opts.embedded) { state.hq.delete('new'); openForm(null); }
}
