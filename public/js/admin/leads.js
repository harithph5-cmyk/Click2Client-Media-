// Leads & Enquiries: pipeline chips, filters, inline stage / owner / follow-up,
// and a detail drawer with notes, activity history and lead → contact / client.

import { api, esc, toast, modal } from '../common.js';
import { day, ago, pill, nice, pager, empty, errorBox, head, formModal, debounce, icon } from './ui.js';

const FIELDS = [
  { name: 'name', label: 'Name', type: 'text' }, { name: 'company', label: 'Company / business', type: 'text' },
  { name: 'phone', label: 'Phone / WhatsApp', type: 'text' }, { name: 'email', label: 'Email', type: 'email' },
  { name: 'website', label: 'Website', type: 'text' }, { name: 'service', label: 'Service interested in', type: 'text' },
  { name: 'source', label: 'Lead source', type: 'text' }, { name: 'location', label: 'Location', type: 'text' },
  { name: 'budget', label: 'Budget', type: 'text' }, { name: 'next_followup', label: 'Next follow-up', type: 'date' },
  { name: 'requirements', label: 'Requirements', type: 'textarea' },
];
const SRC = { free_audit: 'Free audit', order_p25: '25-page order', order_p50: '50-page order', enquiry_page: 'Enquiry form', home_form: 'Home form', seo_implementation: 'Report request', website: 'Website', manual: 'Manual', whatsapp: 'WhatsApp', meta_ads: 'Meta Ads', webhook: 'Webhook' };
const wa = (p, t = '') => { const d = String(p || '').replace(/\D/g, ''); return d ? `https://wa.me/${d.length === 10 ? '91' + d : d}${t ? '?text=' + encodeURIComponent(t) : ''}` : null; };

export async function leadsTab(view, { state, meta }) {
  const st = (state.leads ||= { q: '', status: '', source: '', assigned_to: '', page: 1 });
  if (state.hq?.get('q')) { st.q = state.hq.get('q'); st.page = 1; state.hq.delete('q'); }
  const users = meta.users;
  const statusOpts = (cur) => meta.leadStatuses.map((s) => `<option value="${s}" ${s === cur ? 'selected' : ''}>${nice(s)}</option>`).join('');
  const userOpts = (cur) => `<option value="">Unassigned</option>${users.map((u) => `<option value="${esc(u.id)}" ${u.id === cur ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}`;

  view.innerHTML = `${head('CRM', 'Leads & Enquiries', 'Website, WhatsApp and Meta Ads enquiries are captured automatically. Add others manually.', '<button class="btn accent sm" data-add>+ Add lead</button>')}
    <div class="pnl" style="padding:0"><div class="chips" id="chips"></div><div class="toolbar"><input type="search" id="lq" placeholder="Search name, phone, email, company…" value="${esc(st.q)}"><select class="mini" id="lsrc"><option value="">Source: all</option></select><select class="mini" id="lown"><option value="">Owner: all</option>${users.map((u) => `<option value="${esc(u.id)}" ${st.assigned_to === u.id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div><div id="lb"></div></div>`;

  async function counts() {
    try {
      const all = await Promise.all(meta.leadStatuses.map((s) => api(`/admin/crm/leads?size=1&status=${s}`).then((r) => [s, r.total])));
      const total = await api('/admin/crm/leads?size=1');
      view.querySelector('#chips').innerHTML = `<button class="chip ${st.status ? '' : 'on'}" data-st="">All<b>${total.total}</b></button>${all.map(([s, n]) => `<button class="chip ${st.status === s ? 'on' : ''}" data-st="${s}">${nice(s)}<b>${n}</b></button>`).join('')}`;
    } catch { /* counts are cosmetic */ }
  }

  async function load() {
    const box = view.querySelector('#lb'); box.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
    let r;
    try { r = await api(`/admin/crm/leads?${new URLSearchParams({ q: st.q, status: st.status, source: st.source, assigned_to: st.assigned_to, page: st.page, size: 25 })}`); } catch (e) { box.innerHTML = errorBox(e); return; }
    view.querySelector('#lsrc').innerHTML = `<option value="">Source: all</option>${r.sources.map((s) => `<option value="${esc(s)}" ${st.source === s ? 'selected' : ''}>${esc(SRC[s] || s)}</option>`).join('')}`;
    box.innerHTML = r.rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Lead</th><th>Service</th><th>Source</th><th>Stage</th><th>Owner</th><th>Next follow-up</th><th>Budget</th><th>Added</th></tr></thead><tbody>
      ${r.rows.map((l) => `<tr data-id="${esc(l.id)}" style="cursor:pointer"><td><div class="ttl">${esc(l.name || l.company || '—')}</div><div class="sub">${esc([l.company && l.name ? l.company : '', l.phone].filter(Boolean).join(' · '))}</div></td>
        <td>${esc(l.service || '—')}</td><td>${esc(SRC[l.source] || l.source || '—')}</td>
        <td><select class="mini" data-f="status">${statusOpts(l.status)}</select></td><td><select class="mini" data-f="assigned_to">${userOpts(l.assigned_to)}</select></td>
        <td><input type="date" class="mini" data-f="next_followup" value="${esc(l.next_followup || '')}"></td><td>${esc(l.budget || '—')}</td><td class="sub">${ago(l.created_at)}</td></tr>`).join('')}</tbody></table></div>${pager(r.total, r.page, r.size)}`
      : empty('No leads found', st.q || st.status || st.source ? 'Clear the filters to see all leads.' : 'New website enquiries will appear here automatically.');
    box.onclick = (e) => {
      const pg = e.target.closest('[data-page]'); if (pg) { st.page = +pg.dataset.page; return load(); }
      const tr = e.target.closest('tr[data-id]');
      if (tr && !e.target.closest('select,input')) openDetail(tr.dataset.id);
    };
    box.onchange = async (e) => {
      const el = e.target.closest('[data-f]'); const tr = e.target.closest('tr[data-id]'); if (!el || !tr) return;
      try { await api(`/admin/crm/leads/${tr.dataset.id}`, { method: 'PUT', body: { [el.dataset.f]: el.value } }); toast('Updated'); if (el.dataset.f === 'status') counts(); } catch (ex) { toast(ex.message); load(); }
    };
  }

  function openForm(lead) {
    formModal({ title: lead ? 'Edit lead' : 'Add lead', fields: FIELDS, values: lead || { source: 'manual' }, submit: lead ? 'Save' : 'Add lead',
      extra: `<div class="field"><label>Assigned to</label><select class="input" name="assigned_to">${userOpts(lead?.assigned_to)}</select></div>`,
      onSave: async (v, m) => {
        const body = { ...v, assigned_to: m.querySelector('[name=assigned_to]').value };
        await api(lead ? `/admin/crm/leads/${lead.id}` : '/admin/crm/leads', { method: lead ? 'PUT' : 'POST', body });
        toast(lead ? 'Lead saved' : 'Lead added'); counts(); load();
      } });
  }

  async function openDetail(id) {
    let d;
    try { d = await api(`/admin/crm/leads/${id}`); } catch (e) { return toast(e.message); }
    const l = d.lead;
    const html = (acts) => `<div class="mform" style="min-width:min(760px,90vw)"><div style="display:flex;gap:12px;align-items:flex-start"><div><h3 class="mh">${esc(l.name || l.company)}</h3><div class="sub small muted">${esc([l.company, l.email, l.phone, l.website].filter(Boolean).join(' · '))}</div></div><span class="spacer" style="flex:1"></span>${pill(l.status)}</div>
      <div class="row wrap-row" style="gap:8px">${wa(l.phone || l.whatsapp, `Hi ${l.name || ''}, this is Click2Client Media regarding your enquiry.`) ? `<a class="btn sm" style="background:#25D366;border-color:#25D366;color:#fff" target="_blank" rel="noopener" href="${wa(l.phone || l.whatsapp, `Hi ${l.name || ''}, this is Click2Client Media regarding your enquiry.`)}">WhatsApp</a>` : ''}${l.phone ? `<a class="btn sm ghost" href="tel:${esc(l.phone)}">Call</a>` : ''}${l.email ? `<a class="btn sm ghost" href="mailto:${esc(l.email)}">Email</a>` : ''}
        <button class="btn sm ghost" data-edit>Edit details</button><button class="btn sm ghost" data-conv="contact">Convert to contact</button>${l.converted_client_id ? '<span class="pl good">Client</span>' : '<button class="btn sm accent" data-conv="client">Convert to client</button>'}<button class="btn sm quiet del" data-del>Delete</button></div>
      <div class="fgrid small"><div><span class="muted">Service</span><br>${esc(l.service || '—')}</div><div><span class="muted">Source</span><br>${esc(SRC[l.source] || l.source || '—')}</div><div><span class="muted">Budget</span><br>${esc(l.budget || '—')}</div><div><span class="muted">Location</span><br>${esc(l.location || '—')}</div><div><span class="muted">Owner</span><br>${esc(l.assigned_label || 'Unassigned')}</div><div><span class="muted">Next follow-up</span><br>${day(l.next_followup)}</div><div class="wide"><span class="muted">Requirements / message</span><br>${esc(l.requirements || l.message || '—')}</div></div>
      <div><h4 style="font:700 14px var(--display)">Notes &amp; activity</h4><form class="row" id="nf" style="gap:8px;margin:8px 0"><select class="mini" name="type"><option value="note">Note</option><option value="call">Call</option><option value="email">Email</option><option value="meeting">Meeting</option><option value="whatsapp">WhatsApp</option></select><input class="input" name="body" placeholder="Add a note…" style="flex:1" required><button class="btn sm accent">Add</button></form>
      <div class="tl">${acts.length ? acts.map((a) => `<div class="e"><b>${esc(nice(a.type))}${a.subject ? ' — ' + esc(a.subject) : ''}</b>${a.body ? `<div>${esc(a.body)}</div>` : ''}<small>${esc(a.actor || '')} · ${ago(a.created_at)}</small></div>`).join('') : '<p class="muted small">No activity yet.</p>'}</div></div></div>`;
    modal(html(d.activities), { onMount: (m, close) => {
      const rerender = async () => { const nd = await api(`/admin/crm/leads/${id}`); m.innerHTML = html(nd.activities); wire(); };
      const wire = () => {
        m.querySelector('#nf').onsubmit = async (e) => { e.preventDefault(); const f = new FormData(e.target); try { await api('/admin/crm/e/activities', { method: 'POST', body: { type: f.get('type'), body: f.get('body'), entity_type: 'lead', entity_id: id } }); await rerender(); } catch (ex) { toast(ex.message); } };
        m.querySelector('[data-edit]').onclick = () => { close(); openForm(l); };
        m.querySelectorAll('[data-conv]').forEach((b) => { b.onclick = async () => { try { await api(`/admin/crm/leads/${id}/convert`, { method: 'POST', body: { to: b.dataset.conv } }); toast(b.dataset.conv === 'client' ? 'Converted to client' : 'Converted to contact'); close(); counts(); load(); } catch (ex) { toast(ex.message); } }; });
        m.querySelector('[data-del]').onclick = async () => { if (!confirm('Delete this lead permanently?')) return; try { await api('/admin/leads/delete', { method: 'POST', body: { ids: [id] } }); toast('Lead deleted'); close(); counts(); load(); } catch (ex) { toast(ex.message); } };
      };
      wire();
    } });
  }

  view.onclick = (e) => {
    if (e.target.closest('[data-add]')) return openForm(null);
    const chip = e.target.closest('[data-st]'); if (chip) { st.status = chip.dataset.st; st.page = 1; counts(); load(); }
  };
  view.querySelector('#lq').oninput = debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); });
  view.querySelector('#lsrc').onchange = (e) => { st.source = e.target.value; st.page = 1; load(); };
  view.querySelector('#lown').onchange = (e) => { st.assigned_to = e.target.value; st.page = 1; load(); };
  counts(); await load();
  if (state.hq?.get('new') === '1') { state.hq.delete('new'); openForm(null); }
}
