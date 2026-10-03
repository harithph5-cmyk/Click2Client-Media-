// Printable / PDF SEO audit report. Content follows the tier the server
// returns: free reports list problems, paid reports add fixes, the 50-page
// Growth Audit adds the roadmap.

import { api, esc, fmtDate, fmtMs, fmtKb, hostOf, pathOf, gauge, scoreColor, whatsappLink, telLink, ICON, toast, openLeadForm, STATUS_LABEL } from './common.js';

const doc = document.getElementById('doc');
const id = location.pathname.split('/').pop();
const firstEv = (e) => (Array.isArray(e) ? e[0] : e) || '';

function issueBlock(i, notes) {
  const n = notes.get(i.id);
  const fixes = (i.implementation || []).filter((s) => s.platform !== 'Any website');
  return `<div class="iss">
    <h3>${esc(i.title)}</h3>
    <div class="meta"><span class="pill ${i.priority} plain">${i.priority}</span>${i.implementationType ? `<span class="tag">${esc(i.implementationType)}</span>` : ''}${i.effort ? `<span class="tag">Difficulty: ${esc(i.effort)}</span>` : ''}${i.affected && i.affected.total > 1 ? `<span class="tag">${i.affected.count} of ${i.affected.total} pages</span>` : ''}</div>
    <p><b>Issue:</b> ${esc(i.value ?? '')}${i.expected ? ` <span class="muted">(recommended: ${esc(i.expected)})</span>` : ''}</p>
    <div class="ev">${esc(String(firstEv(i.evidence)).slice(0, 220))}</div>
    <p><b>Why it matters:</b> ${esc(n?.consultantNote || i.whyItMatters)}</p>
    ${i.recommendation ? `<p><b>Impact:</b> ${esc(i.expectedImpact)}</p>
    <div class="fix"><b>Recommendation:</b> ${esc(n?.suggestedFix || i.recommendation)}${fixes.map((s) => `<div style="margin-top:6px"><b>${esc(s.platform)}:</b> ${esc(s.steps)}</div>`).join('')}</div>` : ''}
  </div>`;
}

function render(a, b) {
  const ai = a.interpretation?.ai?.available ? a.interpretation.ai : null;
  const notes = new Map((ai?.issueNotes || []).map((x) => [x.issueId, x]));
  const byId = new Map(a.issues.map((i) => [i.id, i]));
  const critical = a.issues.filter((i) => i.priority === 'CRITICAL' || i.priority === 'HIGH');
  const warnings = a.issues.filter((i) => !critical.includes(i));
  const passed = a.checks.filter((c) => c.status === 'pass');
  const cats = Object.entries(a.score.categories).filter(([, c]) => c.weight > 0 && c.score != null);
  const ps = a.evidence.performance.pagespeed;
  const m = a.evidence.performance.measured;
  const tier = a.tier || 'internal';
  const planName = a.tierName || 'SEO Audit';
  const wa = whatsappLink(b, `Hi Click2Client Media, I've read the SEO audit report for ${hostOf(a.website)} (score ${a.score.overall}/100). I'd like help implementing the recommendations.`);
  const tel = telLink(b);
  let n = 0;
  const sec = (title) => `<div class="sec-no">${String(++n).padStart(2, '0')}</div><h2 class="sec">${title}</h2>`;
  const lockNote = (msg) => `<div class="iss"><p>${msg} <a href="/seo-audit#plans">Upgrade your audit →</a></p></div>`;

  const summary = ai?.executiveSummary || [
    `We audited ${a.pagesAnalyzed} page${a.pagesAnalyzed > 1 ? 's' : ''} of ${hostOf(a.website)} and ran ${a.score.verifiedChecks} verified checks.`,
    `The site scores ${a.score.overall} out of 100 (${a.score.grade.toLowerCase()}).`,
    critical.length ? `${critical.length} critical or high-priority issue${critical.length > 1 ? 's' : ''} should be addressed first: ${critical.slice(0, 3).map((i) => i.title.toLowerCase()).join('; ')}.` : 'No critical or high-priority problems were found.',
    `${passed.length} checks passed.`,
  ].join(' ');

  const pages = (a.evidence.pages || []).map((p) => {
    const cnt = a.issues.filter((i) => i.affected?.pages?.some((x) => x.url === p.url)).length;
    return { ...p, issueCount: cnt };
  });

  doc.innerHTML = `
    <div class="pg cover">
      <div class="row">${'<span class="logo-box"><span class="logo-crop" style="width:220px"><img src="/img/click2client-media-logo.webp" alt="Click2Client Media" width="2000" height="774"></span></span>'}<span class="spacer"></span><span class="small muted">Your Digital Growth Partner</span></div>
      <div style="margin-top:110px"><div class="eyebrow">Click2Client Media · SEO Audit Report</div>
        <h1>What is holding <span class="serif grad">this website</span> back.</h1>
        <dl class="cover-meta">
          <div><dt>Website</dt><dd>${esc(a.website)}</dd></div>
          <div><dt>Audit date</dt><dd>${fmtDate(a.auditDate, true)}</dd></div>
          <div><dt>Plan</dt><dd>${esc(planName)}</dd></div>
          <div><dt>Pages analysed</dt><dd>${a.pagesAnalyzed}</dd></div>
        </dl>
      </div>
      <div class="scorebox">
        ${gauge(a.score.overall, a.score.grade, 240)}
        <div style="display:grid;grid-template-columns:repeat(3,auto);gap:4px 28px;padding-bottom:16px">
          <div class="cn" style="color:var(--fail)">${critical.length}</div><div class="cn" style="color:var(--warn)">${warnings.length}</div><div class="cn" style="color:var(--pass)">${passed.length}</div>
          <div class="small muted">Critical &amp; high</div><div class="small muted">Warnings</div><div class="small muted">Passed checks</div>
        </div>
      </div>
      <p class="tiny muted" style="margin-top:28px">Prepared by Click2Client Media · ${esc(b.phone || '')}${b.email ? ` · ${esc(b.email)}` : ''}</p>
    </div>

    <div class="pg">${sec('Executive summary')}<p class="lead">${esc(summary)}</p>${ai?.sitePositioning ? `<p class="small muted" style="margin-top:14px">${esc(ai.sitePositioning)}</p>` : ''}
      ${ai?.keyFindings?.length ? `<ul style="margin:18px 0 0;padding-left:20px;display:grid;gap:8px">${ai.keyFindings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}</div>

    <div class="pg">${sec('Overall SEO score &amp; category scores')}
      <p class="muted">Weighted by issue severity within each area, then by the importance of each area. ${a.score.excludedChecks} check(s) could not be verified and were excluded rather than guessed.</p>
      <div style="margin-top:18px">${cats.map(([, c]) => `<div class="cat-row"><span>${esc(c.label)}</span><div class="bar"><span style="width:${c.score}%;background:${scoreColor(c.score)}"></span></div><b style="text-align:right;color:${scoreColor(c.score)}">${c.score}</b></div>`).join('')}</div>
      <div class="rgrid" style="margin-top:18px">
        <div class="ritem"><span class="pill info plain">Measured</span><div><div class="t">Server response</div><div class="v">${fmtMs(m.ttfbMs)} · HTML ${fmtKb(m.htmlBytes)}</div></div></div>
        <div class="ritem"><span class="pill ${ps?.mobile?.available ? 'info' : 'unavailable'} plain">${ps?.mobile?.available ? 'Google' : 'N/A'}</span><div><div class="t">PageSpeed mobile / desktop</div><div class="v">${ps?.mobile?.available ? `${ps.mobile.score} / ${ps.desktop?.score ?? '—'}` : 'Could not be verified'}</div></div></div>
      </div>
    </div>

    <div class="pg page-break">${sec('Critical issues')}${critical.length ? critical.map((i) => issueBlock(i, notes)).join('') : '<p class="lead">No critical or high-priority issues were found.</p>'}</div>
    <div class="pg">${sec('Warnings')}${warnings.length ? warnings.map((i) => issueBlock(i, notes)).join('') : '<p class="lead">No further warnings.</p>'}</div>

    <div class="pg">${sec('Passed checks')}<div class="rgrid">${passed.map((x) => `<div class="ritem"><span class="pill pass plain">Passed</span><div><div class="t">${esc(x.title)}</div><div class="v">${esc(String(x.value ?? '').slice(0, 120))}</div></div></div>`).join('')}</div></div>

    <div class="pg page-break">${sec('Page-level findings')}
      <table class="ptable"><thead><tr><th>Page</th><th>Status</th><th>Title</th><th>Words</th><th>Issues</th></tr></thead><tbody>
      ${pages.map((p) => `<tr><td>${esc(pathOf(p.url || p.requestedUrl))}</td><td>${p.status ?? 'Error'}</td><td>${esc((p.title || '—').slice(0, 70))}</td><td>${p.wordCount ?? '—'}</td><td>${p.issueCount}</td></tr>`).join('')}
      </tbody></table></div>

    <div class="pg">${sec('Recommendations')}
      ${a.locked?.recommendations ? lockNote('<b>Step-by-step recommendations</b> are included in the 25-page and 50-page audits.') : `<ul class="checklist">${a.issues.slice(0, 25).map((i) => `<li><span class="box"></span><span><b>${esc(i.title)}</b> — ${esc((i.recommendation || '').split(/\.(?:\s|$)/)[0])}.</span><span class="pill ${i.priority} plain">${i.priority}</span></li>`).join('')}</ul>`}
    </div>

    <div class="pg">${sec('SEO roadmap')}
      ${a.roadmap ? a.roadmap.map((w) => `<div class="wk"><div class="n"><small>Week</small>${w.week}</div><div><b>${esc(w.theme)}</b><div class="small muted">${esc(w.focus)}</div><ul>${w.items.map((iid) => byId.get(iid)).filter(Boolean).map((i) => `<li>${esc(i.title)}</li>`).join('')}</ul></div></div>`).join('') : lockNote('<b>A personalised week-by-week SEO roadmap</b> is part of the 50-Page SEO Growth Audit.')}
    </div>

    <div class="pg cta">
      <div class="eyebrow" style="color:#BFE3FF">Next step</div>
      <h2 style="font-size:30px;letter-spacing:-0.02em;margin-top:10px">Need help implementing these recommendations?</h2>
      <p style="margin-top:10px;color:#D4E6FF">Your SEO audit identifies the problems. Our SEO team can help you implement the solutions.</p>
      <div class="row wrap-row no-print" style="margin-top:20px"><button class="btn white" id="leadPlan">Get SEO Implementation Support</button>${wa ? `<a class="btn ghost" href="${wa}" target="_blank" rel="noopener">${ICON.whatsapp} Talk to Click2Client Media</a>` : ''}${tel ? `<a class="btn ghost" href="${tel}">${ICON.phone} ${esc(b.phone)}</a>` : ''}</div>
      <p class="print-contact" style="display:none;margin-top:12px;font-weight:650">Talk to Click2Client Media · ${esc(b.phone || '')}${b.email ? ' · ' + esc(b.email) : ''}</p>
    </div>
    <div class="foot"><span>${esc(b.reportFooter || 'Search rankings depend on many factors; no ranking outcome is guaranteed.')}</span><span>Report reference: ${esc(id)} · ${esc(planName)}</span></div>`;

  document.title = `SEO Audit Report — ${hostOf(a.website)} | Click2Client Media`;
  document.getElementById('tbTitle').textContent = `${hostOf(a.website)} · ${a.score.overall}/100 · ${planName}`;
  document.getElementById('leadPlan').onclick = () => openLeadForm({ branding: b, auditId: id, website: a.website, score: a.score.overall, intent: 'seo_implementation' });
}

(async () => {
  let b = { companyName: 'Click2Client Media' };
  try {
    const c = await api('/public/config');
    b = { companyName: c.company, phone: c.phone, whatsapp: c.whatsapp, email: c.email };
  } catch {}
  try {
    let a;
    try {
      const rec = await api(`/public/audits/${encodeURIComponent(id)}`);
      if (rec.status !== 'complete') throw new Error(rec.status === 'running' ? 'This audit is still running. Please refresh in a minute.' : 'This audit did not complete.');
      a = rec.audit;
    } catch (e) {
      if (e.status !== 404) throw e;
      const rec = await api(`/audits/${encodeURIComponent(id)}`); // internal audits: admin session only
      a = { ...rec.audit, tier: 'internal', tierName: 'Internal audit' };
    }
    render(a, b);
    if (new URLSearchParams(location.search).get('print')) setTimeout(() => print(), 700);
  } catch (e) {
    doc.innerHTML = `<div class="pg"><h2 class="sec">Report unavailable</h2><p class="muted" style="margin-top:8px">${esc(e.status === 401 ? 'This report does not exist or the link is incorrect.' : e.message)}</p></div>`;
  }
  document.getElementById('pdf').onclick = () => print();
  document.getElementById('copy').onclick = async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('Link copied'); } catch { toast(location.href); } };
})();
