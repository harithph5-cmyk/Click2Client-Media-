// Dashboard: every number, chart and list below comes from /api/admin/crm/dashboard
// (real database rows, scoped to what the signed-in role may see).

import { api, esc, toast } from '../common.js';
import { icon, inr, nice, day, ago, pill, scoreChip, lineChart, barChart, donut, hbars, rangeBar, bindRange, rangeQS, head, loading, errorBox, empty } from './ui.js';

const KPI = [
  ['revenue', 'Total Revenue', 'bank', (k) => inr(k.value), true],
  ['verifiedPayments', 'Verified Payments', 'check', (k) => k.value],
  ['pendingPayments', 'Pending Payments', 'clock', (k) => k.value, false, (k) => inr(k.amount) + ' awaiting'],
  ['totalLeads', 'Total Leads', 'users', (k) => k.value],
  ['newLeads', 'New Leads', 'spark', (k) => k.value],
  ['qualifiedLeads', 'Qualified Leads', 'check', (k) => k.value],
  ['activeClients', 'Active Clients', 'building', (k) => k.value],
  ['activeDeals', 'Active Deals', 'deal', (k) => k.value, false, (k) => inr(k.amount) + ' in pipeline'],
  ['audits', 'SEO Audits Completed', 'search', (k) => k.value],
  ['posts', 'Blog Posts Published', 'pen', (k) => k.value],
  ['conversion', 'Lead Conversion Rate', 'chart', (k) => k.value + '%', false, (k) => k.won + ' won'],
];
const ICON = { bank: 'wallet' };
const STAGE_ORDER = ['new', 'contacted', 'qualified', 'proposal_sent', 'negotiation', 'won', 'lost'];

const tile = ([key, label, ic, fmt, hl, sub], k) => {
  const d = k.delta;
  const delta = d == null ? '' : `<span class="dl-b ${d < 0 ? 'neg' : ''}">${d < 0 ? '↓' : '↑'} ${Math.abs(d)}%</span>`;
  return `<div class="kt${hl ? ' hl' : ''}"><div class="top-r">${icon(ICON[ic] || ic, 22)}${delta}</div><div class="n">${esc(fmt(k))}</div><div class="l">${label}</div>${sub ? `<div class="s">${esc(sub(k))}</div>` : ''}</div>`;
};

export async function dashboardTab(view, { state, meta }) {
  const st = (state.dash ||= { range: '30d' });
  loading(view);
  let d;
  try { d = await api(`/admin/crm/dashboard?${rangeQS(st)}`); } catch (e) { view.innerHTML = errorBox(e); return; }
  const k = d.kpis; const c = d.charts; const l = d.lists; const can = (m) => meta.me.permissions.includes('*') || meta.me.permissions.includes(m);
  const greet = `${esc(meta.me.name)} · ${d.range.from === d.range.to ? day(d.range.from) : `${day(d.range.from)} – ${day(d.range.to)}`}`;

  const pipeline = c.pipeline ? (() => { const m = Object.fromEntries(c.pipeline.map((x) => [x.label, Number(x.n)])); const max = Math.max(1, ...Object.values(m)); return `<div class="funnel">${STAGE_ORDER.map((s) => `<div class="f"><span>${nice(s)}</span><div><i style="width:${(100 * (m[s] || 0)) / max}%"></i></div><b>${m[s] || 0}</b></div>`).join('')}</div>`; })() : '';
  const total = (arr) => (arr || []).reduce((s, p) => s + p.value, 0);

  const blocks = [];
  blocks.push(`<div class="kgrid">${KPI.filter(([key]) => k[key]).map((row) => tile(row, k[row[0]])).join('')}</div>`);
  const r1 = [];
  if (c.pipeline) r1.push(`<div class="pnl"><h3>Lead Pipeline</h3>${pipeline}</div>`);
  if (c.leads) r1.push(`<div class="pnl"><h3>Leads Trend</h3>${lineChart([{ name: 'Leads', color: '#2F5BFF', points: c.leads }, { name: 'Won', color: '#16A34A', points: c.won }])}</div>`);
  if (c.payments) r1.push(`<div class="pnl"><h3>Revenue &amp; Payments <span class="spacer"></span>${can('payments') ? '<a href="#payments">View →</a>' : ''}</h3>${donut([{ label: 'Paid', value: c.payments.paid, color: '#16A34A' }, { label: 'Pending', value: c.payments.pending, color: '#F59E0B' }, { label: 'Overdue', value: c.payments.overdue, color: '#DC2626' }], inr(c.payments.paid), 'collected')}</div>`);
  if (r1.length) blocks.push(`<div class="grid3">${r1.join('')}</div>`);
  if (c.monthly) blocks.push(`<div class="grid21"><div class="pnl"><h3>Monthly Revenue <small class="muted" style="font:500 12px var(--body)">last 12 months</small></h3>${barChart(c.monthly)}</div><div class="pnl"><h3>Revenue in range</h3>${lineChart([{ name: 'Revenue', color: '#7C3AED', points: c.revenue }], { money: true })}<p class="small muted" style="margin-top:6px">${inr(total(c.revenue))} from verified payments and paid invoices.</p></div></div>`);

  const r3 = [];
  if (l.recentLeads) r3.push(`<div class="pnl"><h3>Recent Leads <span class="spacer"></span><a href="#leads">View all →</a></h3>${l.recentLeads.length ? `<div class="tw"><table class="tbl"><tbody>${l.recentLeads.map((x) => `<tr><td><div class="ttl">${esc(x.name || x.company || '—')}</div><div class="sub">${esc(x.service || x.source || '')}</div></td><td>${pill(x.status)}</td><td class="sub">${ago(x.created_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('No leads yet', 'Website, WhatsApp and Meta enquiries land here automatically.')}</div>`);
  if (l.audits) r3.push(`<div class="pnl"><h3>SEO Audit Overview <span class="spacer"></span><a href="#audits">View all →</a></h3><div class="kgrid" style="grid-template-columns:repeat(3,1fr);gap:8px">${['complete', 'running', 'failed'].map((s) => `<div class="kt" style="padding:10px"><div class="n" style="font-size:22px;margin:0">${Number(l.audits.byStatus.find((x) => x.label === s)?.n || 0)}</div><div class="l" style="margin:2px 0 0">${nice(s === 'complete' ? 'Completed' : s)}</div></div>`).join('')}</div><h4 style="margin:14px 0 4px;font:600 13px var(--body)">Completed by plan${l.audits.avgScore != null ? ` · avg score ${l.audits.avgScore}` : ''}</h4>${hbars(l.audits.byPlan.map((x) => ({ label: x.label, n: Number(x.n) })))}</div>`);
  if (l.blog) r3.push(`<div class="pnl"><h3>Blog Performance <span class="spacer"></span><a href="#blog">Open →</a></h3><p class="small muted" style="margin:-6px 0 10px">${l.blog.published} live · ${l.blog.scheduled} scheduled · ${l.blog.pending} awaiting approval · ${l.blog.drafts} drafts</p>${l.blog.top.length ? l.blog.top.map((p) => `<div class="fu"><div class="it"><span>${esc(p.title)}</span></div><div>${scoreChip('SEO', p.seo)}${scoreChip('AEO', p.aeo)}${scoreChip('GEO', p.geo)}</div></div>`).join('') : '<p class="muted small">No published posts yet.</p>'}</div>`);
  if (r3.length) blocks.push(`<div class="grid3">${r3.join('')}</div>`);

  const r4 = [];
  if (l.followups) r4.push(`<div class="pnl"><h3>Upcoming Follow-ups <span class="spacer"></span><a href="#tasks">Tasks →</a></h3>${l.followups.length ? `<div class="fu">${l.followups.map((x) => `<div class="it">${icon(x.type === 'task' ? 'check' : 'users', 16)}<span>${esc(x.title)}</span><span class="d ${x.overdue ? 'od' : ''}">${x.overdue ? 'Overdue · ' : ''}${day(x.due)}</span></div>`).join('')}</div>` : '<p class="muted small">Nothing due in the next 7 days.</p>'}</div>`);
  if (l.activity) r4.push(`<div class="pnl"><h3>Recent Activity <span class="spacer"></span><a href="#logs">Full log →</a></h3>${l.activity.length ? `<div class="fu">${l.activity.map((x) => `<div class="it"><span><b>${esc(x.actor || '—')}</b> ${esc(nice(x.action))} ${esc(nice(x.entity || ''))}</span><span class="d">${ago(x.at)}</span></div>`).join('')}</div>` : '<p class="muted small">No activity recorded yet.</p>'}</div>`);
  if (r4.length) blocks.push(`<div class="grid2">${r4.join('')}</div>`);

  const qa = [];
  if (can('crm')) qa.push('<button class="btn accent sm" data-qa="lead">+ Add New Lead</button>');
  if (can('seo')) qa.push('<a class="btn ghost sm" href="/app#/new">Run SEO Audit</a>');
  if (can('finance')) qa.push('<a class="btn ghost sm" href="#invoices?new=1">Create Invoice</a>');
  if (can('content')) qa.push('<a class="btn ghost sm" href="#blog?new=1">Write Blog Post</a>');
  if (can('reports')) qa.push('<a class="btn ghost sm" href="#reports">View Reports</a>');
  if (qa.length) blocks.push(`<div class="qa"><b>Quick Actions</b>${qa.join('')}</div>`);

  view.innerHTML = `${head('Dashboard', 'Dashboard', `CRM, leads, payments, SEO audits and content performance in one place. <span class="muted">${greet}</span>`, rangeBar(st))}${blocks.join('')}`;
  bindRange(view, st, () => dashboardTab(view, { state, meta }));
  view.onclick = (e) => { if (e.target.closest('[data-qa=lead]')) location.hash = '#leads?new=1'; };
}
