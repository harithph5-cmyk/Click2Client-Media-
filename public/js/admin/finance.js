// Invoices (GST, discounts, auto numbering, printable PDF) and Revenue & Expenses (P&L).

import { api, esc, toast, modal } from '../common.js';
import { inr, day, pill, nice, pager, empty, errorBox, head, loading, formModal, refOptions, debounce, barChart, hbars, rangeBar, bindRange, rangeQS, compact } from './ui.js';
import { entityTab } from './entity.js';

const STATUS = [['', 'All'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid']];

export async function invoicesTab(view, ctx) {
  const { state, meta } = ctx;
  const st = (state.inv ||= { q: '', status: '', page: 1 });
  if (state.hq?.get('q')) { st.q = state.hq.get('q'); state.hq.delete('q'); }
  view.innerHTML = `${head('Sales & Payments', 'Invoices', 'GST invoices with automatic numbering. Open one and use “Save as PDF”.', '<button class="btn accent sm" data-new>+ New invoice</button>')}
    <div class="pnl" style="padding:0"><div class="chips">${STATUS.map(([k, l]) => `<button class="chip ${st.status === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('')}</div><div class="toolbar"><input type="search" placeholder="Search client or invoice number…" value="${esc(st.q)}"></div><div id="ib"></div></div>`;

  async function load() {
    const box = view.querySelector('#ib'); box.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
    let r; try { r = await api(`/admin/crm/invoices?${new URLSearchParams({ q: st.q, status: st.status, page: st.page })}`); } catch (e) { box.innerHTML = errorBox(e); return; }
    box.innerHTML = r.rows.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Invoice</th><th>Bill to</th><th>Issued</th><th>Due</th><th class="num">Total</th><th>Status</th><th></th></tr></thead><tbody>
      ${r.rows.map((i) => `<tr data-id="${esc(i.id)}"><td class="ttl">${esc(i.number)}</td><td>${esc(i.bill_to)}</td><td>${day(i.issue_date)}</td><td>${day(i.due_date)}</td><td class="num">${inr(i.total, 2)}</td><td>${pill(i.eff)}</td>
      <td class="act"><a class="btn sm ghost" target="_blank" href="/api/admin/crm/invoices/${esc(i.id)}/print">View / PDF</a> ${i.status === 'paid' ? '<button class="btn sm ghost" data-unpay>Undo paid</button>' : '<button class="btn sm ghost" data-edit>Edit</button> <button class="btn sm accent" data-pay>Mark paid</button>'} <button class="btn sm quiet del" data-del>Delete</button></td></tr>`).join('')}</tbody></table></div>${pager(r.total, r.page, r.size)}` : empty('No invoices', 'Create your first invoice to start tracking dues.');
    box.onclick = async (e) => {
      const pg = e.target.closest('[data-page]'); if (pg) { st.page = +pg.dataset.page; return load(); }
      const tr = e.target.closest('tr[data-id]'); if (!tr) return; const id = tr.dataset.id;
      try {
        if (e.target.closest('[data-edit]')) return editor(id);
        if (e.target.closest('[data-pay]')) return formModal({ title: 'Mark invoice paid', fields: [{ name: 'paid_at', label: 'Paid on', type: 'date', required: true, def: new Date().toISOString().slice(0, 10) }, { name: 'method', label: 'Method (UPI / bank / cash)', type: 'text' }, { name: 'ref', label: 'Transaction reference', type: 'text' }], values: {}, submit: 'Mark paid', onSave: async (v) => { await api(`/admin/crm/invoices/${id}/pay`, { method: 'POST', body: v }); toast('Marked as paid'); load(); } });
        if (e.target.closest('[data-unpay]') && confirm('Mark this invoice as unpaid again?')) { await api(`/admin/crm/invoices/${id}/unpay`, { method: 'POST' }); load(); }
        if (e.target.closest('[data-del]') && confirm('Delete this invoice permanently?')) { await api(`/admin/crm/invoices/${id}`, { method: 'DELETE' }); toast('Deleted'); load(); }
      } catch (ex) { toast(ex.message); }
    };
  }

  async function editor(id) {
    const clients = await refOptions('clients', meta);
    const cur = id ? await api(`/admin/crm/invoices/${id}`) : { invoice: { gst_rate: 18, discount: 0, issue_date: new Date().toISOString().slice(0, 10) }, items: [{ description: '', qty: 1, rate: '' }] };
    const v = cur.invoice;
    const row = (i = {}) => `<div class="ir"><input class="input" data-k="description" placeholder="Service description" value="${esc(i.description || '')}"><input class="input" data-k="qty" type="number" min="0" step="any" value="${esc(i.qty ?? 1)}"><input class="input" data-k="rate" type="number" min="0" step="any" placeholder="Rate" value="${esc(i.rate ?? '')}"><button type="button" class="btn sm quiet del" data-rm aria-label="Remove">×</button></div>`;
    modal(`<form class="mform" style="min-width:min(780px,92vw)"><h3 class="mh">${id ? 'Edit invoice ' + esc(v.number) : 'New invoice'}</h3>
      <div class="fgrid"><div class="field"><label>Client</label><select class="input" name="client_id"><option value="">— none —</option>${clients.map((c) => `<option value="${esc(c.id)}" ${c.id === v.client_id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div>
      <div class="field"><label>Bill to *</label><input class="input" name="bill_to" required value="${esc(v.bill_to || '')}"></div>
      <div class="field"><label>Email</label><input class="input" name="bill_email" value="${esc(v.bill_email || '')}"></div><div class="field"><label>GSTIN (optional)</label><input class="input" name="gstin" value="${esc(v.gstin || '')}"></div>
      <div class="field wide"><label>Address</label><input class="input" name="bill_address" value="${esc(v.bill_address || '')}"></div>
      <div class="field"><label>Issue date</label><input class="input" type="date" name="issue_date" value="${esc(v.issue_date || '')}"></div><div class="field"><label>Due date</label><input class="input" type="date" name="due_date" value="${esc(v.due_date || '')}"></div></div>
      <div><label class="small" style="font-weight:600">Line items</label><div class="items" id="its">${cur.items.map(row).join('')}</div><button type="button" class="btn sm ghost" data-addrow style="margin-top:8px">+ Add line</button></div>
      <div class="fgrid"><div class="field"><label>Discount (₹)</label><input class="input" type="number" min="0" step="any" name="discount" value="${esc(v.discount || 0)}"></div><div class="field"><label>GST</label><select class="input" name="gst_rate">${[0, 5, 12, 18, 28].map((g) => `<option ${+v.gst_rate === g ? 'selected' : ''} value="${g}">${g}%</option>`).join('')}</select></div></div>
      <div class="field"><label>Notes</label><textarea class="input" name="notes" rows="2">${esc(v.notes || '')}</textarea></div>
      <div class="sumbox" id="sum"></div><p class="ferr" hidden></p><div class="mf"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn accent" type="submit">${id ? 'Save invoice' : 'Create invoice'}</button></div></form>`, { onMount: (m, close) => {
      const form = m.querySelector('form'); const items = () => [...m.querySelectorAll('.ir')].map((r) => ({ description: r.querySelector('[data-k=description]').value, qty: r.querySelector('[data-k=qty]').value, rate: r.querySelector('[data-k=rate]').value }));
      const sum = () => { const sub = items().reduce((s, i) => s + (+i.qty || 0) * (+i.rate || 0), 0); const disc = +form.discount.value || 0; const tax = ((sub - disc) * +form.gst_rate.value) / 100; m.querySelector('#sum').innerHTML = `<div><span>Subtotal</span><span>${inr(sub, 2)}</span></div><div><span>Discount</span><span>− ${inr(disc, 2)}</span></div><div><span>GST ${form.gst_rate.value}%</span><span>${inr(tax, 2)}</span></div><div class="g"><span>Total</span><span>${inr(sub - disc + tax, 2)}</span></div>`; };
      form.oninput = sum; sum();
      form.client_id.onchange = () => { const c = clients.find((x) => x.id === form.client_id.value); if (c && !form.bill_to.value) form.bill_to.value = c.label; };
      form.onclick = (e) => { if (e.target.closest('[data-addrow]')) { m.querySelector('#its').insertAdjacentHTML('beforeend', row()); } if (e.target.closest('[data-rm]') && m.querySelectorAll('.ir').length > 1) { e.target.closest('.ir').remove(); sum(); } };
      form.onsubmit = async (e) => {
        e.preventDefault(); const er = m.querySelector('.ferr'); er.hidden = true;
        const f = Object.fromEntries(new FormData(form)); const body = { ...f, items: items() };
        try { const r = await api(id ? `/admin/crm/invoices/${id}` : '/admin/crm/invoices', { method: id ? 'PUT' : 'POST', body }); toast(id ? 'Invoice saved' : `Invoice ${r.number} created`); close(); load(); } catch (ex) { er.textContent = ex.message; er.hidden = false; }
      };
    } });
  }

  view.onclick = (e) => { if (e.target.closest('[data-new]')) editor(null); const c = e.target.closest('[data-s]'); if (c) { st.status = c.dataset.s; st.page = 1; view.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c)); load(); } };
  view.querySelector('input[type=search]').oninput = debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); });
  await load();
  if (state.hq?.get('new') === '1') { state.hq.delete('new'); editor(null); }
}

export async function financeTab(view, ctx) {
  const st = (ctx.state.fin ||= { range: 'month' });
  loading(view);
  let d; try { d = await api(`/admin/crm/finance/pnl?${rangeQS(st)}`); } catch (e) { view.innerHTML = errorBox(e); return; }
  const kt = (n, l, cls = '') => `<div class="kt ${cls}"><div class="n">${inr(n)}</div><div class="l">${l}</div></div>`;
  view.innerHTML = `${head('Sales & Payments', 'Revenue & Expenses', `Profit &amp; loss from verified payments, paid invoices and logged expenses · ${day(d.range.from)} – ${day(d.range.to)}`, rangeBar(st))}
    <div class="kgrid">${kt(d.revenue, 'Total revenue', 'hl')}${kt(d.expenses, 'Business expenses')}${kt(d.profit, d.profit >= 0 ? 'Profit' : 'Loss')}</div>
    <div class="grid2"><div class="pnl"><h3>Revenue by month</h3>${barChart(d.byMonth.map((x) => ({ label: x.label, value: +x.revenue })))}</div><div class="pnl"><h3>Expenses by category</h3>${hbars(d.expensesByCategory.map((x) => ({ label: x.label, value: +x.value })), true)}</div></div>
    <div class="grid2"><div class="pnl"><h3>Client-wise revenue</h3>${hbars(d.byClient.map((x) => ({ label: x.label, value: +x.value })), true)}</div><div class="pnl"><h3>Service-wise revenue</h3>${hbars(d.byService.map((x) => ({ label: x.label, value: +x.value })), true)}</div></div>
    <h3 style="font:700 17px var(--display);margin:26px 0 10px">Expenses</h3><div id="exp"></div>`;
  bindRange(view, st, () => financeTab(view, ctx));
  await entityTab(view.querySelector('#exp'), 'expenses', ctx, { embedded: true });
}
