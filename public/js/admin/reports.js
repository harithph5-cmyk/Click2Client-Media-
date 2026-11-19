// Reports & analytics (CSV export; "PDF" = print dialog → Save as PDF) and the Team module.

import { api, esc, toast, modal } from '../common.js';
import { inr, day, ago, pill, nice, pager, empty, errorBox, head, loading, formModal, rangeBar, bindRange, rangeQS, downloadCsv, printTable } from './ui.js';

const fmt = (c, v) => (v == null || v === '' ? '—' : c.t === 'money' ? inr(v, 2) : c.t === 'num' ? Number(v).toLocaleString('en-IN') : /status|plan|source/.test(c.k) ? pill(v) : esc(String(v)));

export async function reportsTab(view, { state, meta }) {
  const st = (state.rep ||= { key: meta.reports[0]?.key, range: '30d' });
  if (!meta.reports.length) { view.innerHTML = empty('No reports available for your role'); return; }
  if (!meta.reports.some((r) => r.key === st.key)) st.key = meta.reports[0].key;
  view.innerHTML = `${head('Management', 'Reports & Analytics', 'Pick a report and a date range, then export to CSV or print / save as PDF.', rangeBar(st))}
    <div class="pnl" style="padding:0"><div class="chips">${meta.reports.map((r) => `<button class="chip ${r.key === st.key ? 'on' : ''}" data-k="${r.key}">${esc(r.title)}</button>`).join('')}</div><div id="rb"></div></div>`;
  async function run() {
    const box = view.querySelector('#rb'); box.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
    let d; try { d = await api(`/admin/crm/reports/${st.key}?${rangeQS(st)}`); } catch (e) { box.innerHTML = errorBox(e); return; }
    const sums = d.columns.filter((c) => c.t === 'money').map((c) => `${esc(c.l)}: <b>${inr(d.rows.reduce((s, r) => s + (Number(r[c.k]) || 0), 0), 2)}</b>`);
    box.innerHTML = `<div class="toolbar"><span class="small muted">${d.rows.length} row${d.rows.length === 1 ? '' : 's'} · ${day(d.range.from)} – ${day(d.range.to)}${sums.length ? ' · ' + sums.join(' · ') : ''}</span><span class="spacer" style="flex:1"></span><button class="btn sm ghost" data-csv ${d.rows.length ? '' : 'disabled'}>Export CSV</button><button class="btn sm ghost" data-pdf ${d.rows.length ? '' : 'disabled'}>Print / PDF</button></div>
      ${d.rows.length ? `<div class="tw"><table class="tbl"><thead><tr>${d.columns.map((c) => `<th ${c.t !== 'text' ? 'class="num"' : ''}>${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${d.rows.map((r) => `<tr>${d.columns.map((c) => `<td ${c.t !== 'text' ? 'class="num"' : ''}>${fmt(c, r[c.k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : empty('No data in this range', 'Try a wider date range.')}`;
    box.querySelector('[data-csv]').onclick = () => downloadCsv(d.columns, d.rows, `${st.key}-${d.range.from}-to-${d.range.to}.csv`);
    box.querySelector('[data-pdf]').onclick = () => printTable(`Click2Client Media — ${d.title}`, `${d.range.from} to ${d.range.to}`, d.columns, d.rows);
  }
  view.onclick = (e) => { const c = e.target.closest('[data-k]'); if (c) { st.key = c.dataset.k; view.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); run(); } };
  bindRange(view, st, run);
  await run();
}

export async function teamTab(view, ctx) {
  const { state, meta } = ctx; const st = (state.team ||= { tab: 'members' });
  loading(view);
  let d; try { d = await api('/admin/crm/team/users'); } catch (e) { view.innerHTML = errorBox(e); return; }
  const roleName = (k) => d.roles.find((r) => r.key === k)?.name || k;
  const members = () => `<div class="pnl" style="padding:0"><div class="tw"><table class="tbl"><thead><tr><th>Member</th><th>Role</th><th class="num">Leads</th><th class="num">Open tasks</th><th>Last sign-in</th><th>Status</th><th></th></tr></thead><tbody>
    <tr><td><div class="ttl">Founder</div><div class="sub">Shared admin password</div></td><td>${pill('founder')}</td><td class="num">—</td><td class="num">—</td><td class="sub">—</td><td>${pill('active')}</td><td></td></tr>
    ${d.users.map((u) => `<tr data-id="${esc(u.id)}"><td><div class="ttl">${esc(u.name)}</div><div class="sub">${esc(u.email)}</div></td><td>${esc(roleName(u.role))}</td><td class="num">${u.leads}</td><td class="num">${u.open_tasks}</td><td class="sub">${u.last_login ? ago(u.last_login) : 'never'}</td><td>${pill(u.active ? 'active' : 'paused')}</td><td class="act"><button class="btn sm ghost" data-edit>Edit</button></td></tr>`).join('')}</tbody></table></div></div>
    <p class="small muted" style="margin-top:10px">Team members sign in at this page with their email and password. Leads are auto-assigned to the Sales Executive with the lightest workload.</p>`;
  const roles = () => `<div class="pnl"><div class="tw"><table class="mx"><thead><tr><th>Permission</th>${d.roles.map((r) => `<th>${esc(r.name)}</th>`).join('')}</tr></thead><tbody>${Object.entries(d.modules).map(([m, l]) => `<tr><td>${esc(l)}</td>${d.roles.map((r) => `<td><input type="checkbox" data-role="${r.key}" data-perm="${m}" ${r.permissions.includes('*') || r.permissions.includes(m) ? 'checked' : ''} ${r.key === 'founder' ? 'disabled' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="small muted" style="margin-top:10px">Changes save instantly and apply on the member's next request. Writers can draft but only roles with “Approve &amp; publish” can publish.</p></div>`;
  view.innerHTML = `${head('Management', 'Team Management', 'Members, roles and what each role can access.', '<button class="btn accent sm" data-add>+ Add member</button>')}<div class="chips" style="padding:0 0 12px;border:0"><button class="chip ${st.tab === 'members' ? 'on' : ''}" data-t="members">Members</button><button class="chip ${st.tab === 'roles' ? 'on' : ''}" data-t="roles">Roles &amp; permissions</button></div>${st.tab === 'members' ? members() : roles()}`;
  const fields = (edit) => [{ name: 'name', label: 'Full name', type: 'text', required: true }, { name: 'email', label: 'Email (sign-in)', type: 'email', required: true }, { name: 'role', label: 'Role', type: 'select', options: d.roles.filter((r) => r.key !== 'founder').map((r) => r.key), required: true }, { name: 'password', label: edit ? 'New password (leave blank to keep)' : 'Password (min 8 characters)', type: 'text', required: !edit }];
  view.onclick = (e) => {
    const t = e.target.closest('[data-t]'); if (t) { st.tab = t.dataset.t; return teamTab(view, ctx); }
    if (e.target.closest('[data-add]')) return formModal({ title: 'Add team member', fields: fields(false), values: { role: 'sales' }, submit: 'Add member', onSave: async (v) => { await api('/admin/crm/team/users', { method: 'POST', body: v }); toast('Member added'); teamTab(view, ctx); } });
    const tr = e.target.closest('tr[data-id]'); if (!tr || !e.target.closest('[data-edit]')) return; const u = d.users.find((x) => x.id === tr.dataset.id);
    formModal({ title: `Edit ${u.name}`, fields: fields(true).filter((f) => f.name !== 'email'), values: u, submit: 'Save', extra: `<label class="field chk"><input type="checkbox" name="active_cb" ${u.active ? 'checked' : ''}> Account active (untick to block sign-in)</label>`,
      onSave: async (v, m) => { const body = { name: v.name, role: v.role, active: m.querySelector('[name=active_cb]').checked }; if (v.password) body.password = v.password; await api(`/admin/crm/team/users/${u.id}`, { method: 'PATCH', body }); toast('Saved'); teamTab(view, ctx); } });
  };
  view.onchange = async (e) => {
    const cb = e.target.closest('[data-perm]'); if (!cb) return; const role = d.roles.find((r) => r.key === cb.dataset.role);
    const next = new Set(role.permissions); cb.checked ? next.add(cb.dataset.perm) : next.delete(cb.dataset.perm); role.permissions = [...next];
    try { await api(`/admin/crm/team/roles/${role.key}`, { method: 'PUT', body: { permissions: role.permissions } }); toast('Permissions saved'); } catch (ex) { toast(ex.message); cb.checked = !cb.checked; }
  };
}

export async function logsTab(view, { state }) {
  const st = (state.logs ||= { page: 1 });
  loading(view);
  let d; try { d = await api(`/admin/crm/team/logs?page=${st.page}`); } catch (e) { view.innerHTML = errorBox(e); return; }
  view.innerHTML = `${head('Management', 'Activity Log', 'Every sign-in and every change made in the admin, with who did it.')}<div class="pnl" style="padding:0">${d.rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Area</th><th>Detail</th><th>IP</th></tr></thead><tbody>${d.rows.map((r) => `<tr><td class="sub" title="${esc(r.at)}">${new Date(r.at).toLocaleString('en-IN')}</td><td><b>${esc(r.actor || '—')}</b> <span class="sub">${esc(r.actor_role || '')}</span></td><td>${pill(r.action)}</td><td>${esc(nice(r.entity || ''))}</td><td class="sub">${esc(r.detail || r.entity_id || '')}</td><td class="sub">${esc(r.ip || '')}</td></tr>`).join('')}</tbody></table></div><div id="pg"></div>` : empty('No activity yet')}</div>`;
  const pg = view.querySelector('#pg'); if (pg) { pg.innerHTML = pager(d.total, d.page, d.size); pg.onclick = (e) => { const b = e.target.closest('[data-page]'); if (b) { st.page = +b.dataset.page; logsTab(view, { state }); } }; }
}
