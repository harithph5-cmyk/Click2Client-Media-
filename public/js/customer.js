// Customer audit page: live progress while the crawl runs, then the
// dashboard. All tier restrictions are already applied by the server.

import { api, esc, fmtMs, hostOf, ICON } from './common.js';
import { renderDashboard } from './dashboard.js';

const view = document.getElementById('view');
const id = location.pathname.split('/').pop();
let cfg;
let lastRec = null;

async function load() {
  cfg = await api('/public/config');
  const rec = await api(`/public/audits/${encodeURIComponent(id)}`);
  if (rec.status === 'running') return progress(rec);
  if (rec.status === 'failed') return failed(rec);
  show(rec);
}

function failed(rec) {
  view.innerHTML = `<div class="run"><div class="eyebrow">Audit stopped</div><h1 class="break" style="font-size:28px;margin:10px 0 14px">${esc(rec.website)}</h1>
    <div class="banner err"><div><b>We couldn't complete this audit.</b><br>${esc(rec.error?.message || 'Please try again.')}</div></div>
    <div class="row wrap-row" style="margin-top:18px"><a class="btn accent" href="/seo-audit#free-audit">Try again</a><a class="btn ghost" href="https://wa.me/${esc(cfg.whatsapp)}?text=${encodeURIComponent(`Hi Click2Client Media, my SEO audit for ${rec.website} did not complete. Can you help?`)}" target="_blank" rel="noopener">${ICON.whatsapp} Ask us on WhatsApp</a></div></div>`;
}

function progress(rec) {
  const stages = cfg.stages;
  const state = Object.fromEntries(stages.map((s) => [s.id, { status: 'pending', detail: '' }]));
  const started = Date.now();
  let t0 = null;
  let queued = '';
  document.title = `Auditing ${hostOf(rec.website)} | Click2Client Media`;
  const draw = (err) => {
    const done = stages.filter((s) => ['done', 'skipped'].includes(state[s.id].status)).length;
    view.innerHTML = `<div class="run">
      <div class="eyebrow">${esc(rec.planName)}</div>
      <h1 class="break" style="font-size:clamp(24px,3vw,32px);margin:10px 0 6px;letter-spacing:-0.03em">Scanning website…</h1>
      <p class="muted small break">${esc(rec.website)} · ${done} of ${stages.length} steps complete · ${fmtMs(Date.now() - started)}${queued ? ' · ' + esc(queued) : ''}</p>
      <div class="bar" style="margin:18px 0 8px;height:8px"><span style="width:${Math.round((100 * done) / stages.length)}%;background:linear-gradient(90deg,#0066FF,#00A8FF)"></span></div>
      <p class="tiny muted">Progress reflects completed work, not a timer. Larger sites take longer. You can keep this page open — your report appears here automatically${rec.plan !== 'free' ? ' and we will email you the link' : ''}.</p>
      ${err ? `<div class="banner err" style="margin-top:16px"><div>${esc(err.message)}</div></div>` : ''}
      <div class="card card-pad" style="margin-top:18px"><ul class="run-steps">${stages.map((s) => { const st = state[s.id]; return `<li class="${st.status}"><span class="run-ic">${['done', 'skipped'].includes(st.status) ? ICON.check : ''}</span><div><div class="lbl">${esc(s.label)}</div>${st.detail ? `<div class="det">${esc(st.detail)}</div>` : ''}</div><span class="t">${st.status === 'skipped' ? 'skipped' : st.at && t0 ? fmtMs(st.at - t0) : ''}</span></li>`; }).join('')}</ul></div>
    </div>`;
  };
  const apply = (events = []) => {
    for (const e of events) {
      if (!t0 && e.at) t0 = e.at;
      if (e.type === 'stage' && state[e.stage]) state[e.stage] = { status: e.status, detail: e.detail || state[e.stage].detail, at: e.status === 'running' ? null : e.at };
    }
    draw();
  };
  apply(rec.progress);
  // Progress is saved to the database as each step finishes; poll it.
  const poll = async () => {
    try {
      const r = await api(`/public/audits/${encodeURIComponent(id)}`);
      if (r.status === 'complete') return load();
      if (r.status === 'failed') return failed(r);
      apply(r.progress);
    } catch {}
    setTimeout(poll, 2000);
  };
  setTimeout(poll, 1500);
}

function show(rec) {
  lastRec = rec;
  const a = { ...rec.audit, id: rec.id };
  document.title = `${hostOf(a.website)} — ${a.score.overall}/100 | Click2Client Media SEO Audit`;
  const section = location.hash.replace(/^#\/?/, '') || 'overview';
  const branding = { companyName: cfg.company, whatsapp: cfg.whatsapp, phone: cfg.phone };
  const actions = `<a class="btn ghost sm" href="/report/${encodeURIComponent(rec.id)}" target="_blank">${ICON.file} Download PDF report</a>`;
  renderDashboard(view, a, { section, base: '#', branding, actions });

  const upgrade = rec.plan === 'free'
    ? `<span><b style="color:var(--ink)">Free audit</b> shows what is wrong. Want the fixes and a roadmap?</span><span class="spacer"></span><a class="btn sm ghost" href="/seo-audit#plan-p25">25-page audit · ₹${cfg.tiers.find((t) => t.id === 'p25').price}</a><a class="btn sm accent" href="/seo-audit#plan-p50">50-page Growth Audit · ₹${cfg.tiers.find((t) => t.id === 'p50').price}</a>`
    : rec.plan === 'p25'
      ? `<span>Your <b style="color:var(--ink)">25-page audit</b> includes fixes for every issue. Want a week-by-week plan?</span><span class="spacer"></span><a class="btn sm accent" href="/seo-audit#plan-p50">Get the 50-page Growth Audit</a>`
      : `<span>Your <b style="color:var(--ink)">50-Page SEO Growth Audit</b> — full analysis, priorities and roadmap.</span>`;
  view.insertAdjacentHTML('afterbegin', `
    ${new URLSearchParams(location.search).get('existing') ? '<div class="banner info" style="margin-bottom:12px">You already ran a free audit for this website in the last 24 hours, so here is that report.</div>' : ''}
    <div class="tier-bar"><span class="pill plain">${esc(rec.planName)}</span>${upgrade}</div>`);
}

addEventListener('hashchange', () => { if (lastRec && view.querySelector('.dash')) { show(lastRec); scrollTo({ top: 0 }); } });
load().catch((e) => {
  view.innerHTML = `<div class="card empty"><h3>Report unavailable</h3><p>${esc(e.message)}</p><a class="btn sm accent" href="/seo-audit" style="margin-top:14px">Run a free SEO audit</a></div>`;
});
