// Printable / PDF SEO audit report. Each plan gets a visibly different report
// (the server has already removed anything the plan doesn't include):
//   Free 10-page   → score + errors
//   25-page        → score + errors + how to fix each one
//   50-page Growth → score + errors + fixes + roadmap + implementation plan + 1:1 consultation

import { api, esc, fmtDate, fmtMs, fmtKb, hostOf, pathOf, gauge, scoreColor, whatsappLink, telLink, ICON, toast, openLeadForm } from './common.js';

const doc = document.getElementById('doc');
const id = location.pathname.split('/').pop();
const firstEv = (e) => (Array.isArray(e) ? e[0] : e) || '';

// What each plan includes — drives the cover checklist and the locked boxes.
const FEATURES = [
  { k: 'score', label: 'SEO score & category scores', tiers: ['free', 'p25', 'p50', 'internal'] },
  { k: 'errors', label: 'Errors found, with evidence', tiers: ['free', 'p25', 'p50', 'internal'] },
  { k: 'fixes', label: 'How to fix every error', tiers: ['p25', 'p50', 'internal'] },
  { k: 'roadmap', label: '4-week SEO roadmap', tiers: ['p50', 'internal'] },
  { k: 'plan', label: 'Implementation plan', tiers: ['p50', 'internal'] },
  { k: 'consult', label: '1:1 SEO consultation', tiers: ['p50', 'internal'] },
];
const has = (tier, k) => FEATURES.find((f) => f.k === k).tiers.includes(tier);

const GROUPS = {
  quick_wins: { title: 'Quick wins', when: 'Days 1–3', who: 'Website admin', note: 'Small changes, usually under an hour each — do these first.' },
  high_impact: { title: 'High-impact fixes', when: 'Week 1–2', who: 'Developer + SEO', note: 'The issues holding your visibility back the most.' },
  technical: { title: 'Technical fixes', when: 'Week 2', who: 'Developer', note: 'Crawling, indexing, redirects, links and images.' },
  content: { title: 'Content work', when: 'Week 3', who: 'Content writer', note: 'Titles, descriptions, headings and page content.' },
  long_term: { title: 'Long-term growth', when: 'Week 4 onwards', who: 'SEO team', note: 'Structured data, local SEO, social and ongoing improvements.' },
};

function issueBlock(i, notes, tier) {
  const n = notes.get(i.id);
  const fixes = (i.implementation || []).filter((s) => s.platform !== 'Any website');
  const showFix = has(tier, 'fixes') && i.recommendation;
  return `<div class="iss">
    <h3>${esc(i.title)}</h3>
    <div class="meta"><span class="pill ${i.priority} plain">${i.priority}</span>${i.affected && i.affected.total > 1 ? `<span class="tag">${i.affected.count} of ${i.affected.total} pages</span>` : ''}${tier !== 'free' && i.implementationType ? `<span class="tag">${esc(i.implementationType)}</span>` : ''}${i.effort ? `<span class="tag">Effort: ${esc(i.effort)}</span>` : ''}</div>
    <p><b>Error:</b> ${esc(i.value ?? '')}${i.expected ? ` <span class="muted">(recommended: ${esc(i.expected)})</span>` : ''}</p>
    <div class="ev">${esc(String(firstEv(i.evidence)).slice(0, 220))}</div>
    <p><b>Why it matters:</b> ${esc(n?.consultantNote || i.whyItMatters)}</p>
    ${showFix ? `<div class="fix"><div class="fix-h">How to fix</div>${esc(n?.suggestedFix || i.recommendation)}${fixes.map((s) => `<div style="margin-top:6px"><b>${esc(s.platform)}:</b> ${esc(s.steps)}</div>`).join('')}${i.expectedImpact ? `<div class="fix-impact"><b>Expected impact:</b> ${esc(i.expectedImpact)}</div>` : ''}</div>` : ''}
  </div>`;
}

function render(a, b, cfg) {
  const tier = a.tier || 'internal';
  const planName = a.tierName || 'SEO Audit';
  const ai = a.interpretation?.ai?.available ? a.interpretation.ai : null;
  const notes = new Map((ai?.issueNotes || []).map((x) => [x.issueId, x]));
  const byId = new Map(a.issues.map((i) => [i.id, i]));
  const critical = a.issues.filter((i) => i.priority === 'CRITICAL' || i.priority === 'HIGH');
  const warnings = a.issues.filter((i) => !critical.includes(i));
  const passed = a.checks.filter((c) => c.status === 'pass');
  const cats = Object.entries(a.score.categories).filter(([, c]) => c.weight > 0 && c.score != null);
  const ps = a.evidence.performance.pagespeed;
  const m = a.evidence.performance.measured;
  const price = (t) => cfg?.tiers?.find((x) => x.id === t)?.price;
  const phone = b.phone || '+91 99404 11837';
  const wa = whatsappLink(b, `Hi Click2Client Media, I have the ${planName} for ${hostOf(a.website)} (score ${a.score.overall}/100). I'd like to book my 1:1 SEO consultation.`);
  const waHelp = whatsappLink(b, `Hi Click2Client Media, I've read the SEO audit report for ${hostOf(a.website)} (score ${a.score.overall}/100). I'd like help fixing the issues.`);
  const tel = telLink({ phone });
  const planned = { free: 10, p25: 25, p50: 50 }[tier];
  let n = 0;
  const sec = (title, sub = '') => `<div class="sec-no">${String(++n).padStart(2, '0')}</div><h2 class="sec">${title}</h2>${sub ? `<p class="muted sec-sub">${sub}</p>` : ''}`;
  const locked = (title, body, upTo) => `<div class="locked"><div class="lock-ic">🔒</div><div><b>${title}</b><p>${body}</p><a href="/seo-audit#plan-${upTo}">Upgrade to the ${upTo === 'p50' ? '50-Page SEO Growth Audit' : '25-Page SEO Audit'}${price(upTo) ? ` · ₹${price(upTo)}` : ''} →</a></div></div>`;

  const summary = ai?.executiveSummary || [
    `We audited ${a.pagesAnalyzed} page${a.pagesAnalyzed > 1 ? 's' : ''} of ${hostOf(a.website)} and ran ${a.score.verifiedChecks} verified checks.`,
    `The site scores ${a.score.overall} out of 100 (${a.score.grade.toLowerCase()}).`,
    critical.length ? `${critical.length} critical or high-priority error${critical.length > 1 ? 's' : ''} should be addressed first: ${critical.slice(0, 3).map((i) => i.title.toLowerCase()).join('; ')}.` : 'No critical or high-priority errors were found.',
    `${a.issues.length} error${a.issues.length === 1 ? '' : 's'} found in total.`,
  ].join(' ');

  // Fewer pages than the plan covers: say why instead of leaving people guessing.
  const fewPages = planned && a.pagesAnalyzed < Math.min(planned, 3)
    ? `<div class="note-box"><b>Why only ${a.pagesAnalyzed} page${a.pagesAnalyzed === 1 ? '' : 's'} ${a.pagesAnalyzed === 1 ? 'was' : 'were'} analysed:</b> your plan covers up to ${planned} pages, but our crawler could only find ${a.pagesAnalyzed}. ${a.checks.some((c) => /JavaScript/i.test(c.title) && c.status !== 'pass') || a.issues.some((i) => /JavaScript/i.test(i.title)) ? 'This website builds its pages with JavaScript, so the links to other pages are not in the HTML search engines and crawlers receive first' : 'The pages we could reach did not link to further pages, and no XML sitemap listed them'} — which is itself one of the issues below. Fixing it lets Google (and a re-run of this audit) discover the rest of your site.</div>` : '';

  const pages = (a.evidence.pages || []).map((p) => ({ ...p, issueCount: a.issues.filter((i) => i.affected?.pages?.some((x) => x.url === p.url)).length }));
  const included = FEATURES.map((f) => `<li class="${has(tier, f.k) ? 'yes' : 'no'}"><span>${has(tier, f.k) ? '✓' : '🔒'}</span>${esc(f.label)}</li>`).join('');

  // ── Sections per plan ──────────────────────────────────────────────────
  const scoreSec = `<div class="pg">${sec('SEO score &amp; category scores')}
      <p class="muted">Weighted by issue severity within each area, then by the importance of each area. ${a.score.excludedChecks} check(s) could not be verified and were excluded rather than guessed.</p>
      <div style="margin-top:18px">${cats.map(([, c]) => `<div class="cat-row"><span>${esc(c.label)}</span><div class="bar"><span style="width:${c.score}%;background:${scoreColor(c.score)}"></span></div><b style="text-align:right;color:${scoreColor(c.score)}">${c.score}</b></div>`).join('')}</div>
      <div class="rgrid" style="margin-top:18px">
        <div class="ritem"><span class="pill info plain">Measured</span><div><div class="t">Server response</div><div class="v">${fmtMs(m.ttfbMs)} · HTML ${fmtKb(m.htmlBytes)}</div></div></div>
        <div class="ritem"><span class="pill ${ps?.mobile?.available ? 'info' : 'unavailable'} plain">${ps?.mobile?.available ? 'Google' : 'N/A'}</span><div><div class="t">PageSpeed mobile / desktop</div><div class="v">${ps?.mobile?.available ? `${ps.mobile.score} / ${ps.desktop?.score ?? '—'}` : 'Could not be verified'}</div></div></div>
      </div></div>`;
  const errorsSec = `<div class="pg page-break">${sec(has(tier, 'fixes') ? 'Errors &amp; how to fix them' : 'Errors found', has(tier, 'fixes') ? 'Every error with its evidence, why it matters and the exact fix.' : 'Every error with its evidence and why it matters.')}
      <h3 class="grp">Critical &amp; high priority (${critical.length})</h3>${critical.length ? critical.map((i) => issueBlock(i, notes, tier)).join('') : '<p class="lead">No critical or high-priority errors were found.</p>'}
      <h3 class="grp">Warnings (${warnings.length})</h3>${warnings.length ? warnings.map((i) => issueBlock(i, notes, tier)).join('') : '<p class="lead">No further warnings.</p>'}</div>`;
  const checklistSec = has(tier, 'fixes') ? `<div class="pg">${sec('Fix checklist', 'Tick these off as you go — highest priority first.')}
      <ul class="checklist">${a.issues.map((i) => `<li><span class="box"></span><span><b>${esc(i.title)}</b> — ${esc((i.recommendation || '').split(/\.(?:\s|$)/)[0])}.</span><span class="pill ${i.priority} plain">${i.priority}</span></li>`).join('')}</ul></div>` : '';
  const pagesSec = tier !== 'free' ? `<div class="pg page-break">${sec('Page-level findings')}
      <table class="ptable"><thead><tr><th>Page</th><th>Status</th><th>Title</th><th>Words</th><th>Errors</th></tr></thead><tbody>
      ${pages.map((p) => `<tr><td>${esc(pathOf(p.url || p.requestedUrl))}</td><td>${p.status ?? 'Error'}</td><td>${esc((p.title || '—').slice(0, 70))}</td><td>${p.wordCount ?? '—'}</td><td>${p.issueCount}</td></tr>`).join('')}
      </tbody></table>
      <h3 class="grp" style="margin-top:26px">Passed checks (${passed.length})</h3><div class="rgrid">${passed.map((x) => `<div class="ritem"><span class="pill pass plain">Passed</span><div><div class="t">${esc(x.title)}</div><div class="v">${esc(String(x.value ?? '').slice(0, 120))}</div></div></div>`).join('')}</div></div>` : '';
  const roadmapSec = has(tier, 'roadmap') && a.roadmap?.length ? `<div class="pg page-break">${sec('Your 4-week SEO roadmap', 'Built from this website’s actual findings — in the order that moves the needle fastest.')}
      ${a.roadmap.map((w) => `<div class="wk"><div class="n"><small>Week</small>${w.week}</div><div><b>${esc(w.theme)}</b><div class="small muted">${esc(w.focus)}</div><ul>${w.items.map((iid) => byId.get(iid)).filter(Boolean).map((i) => `<li>${esc(i.title)} <span class="pill ${i.priority} plain">${i.priority}</span></li>`).join('')}</ul></div></div>`).join('')}</div>` : '';
  const groups = a.issueGroups || {};
  const planSec = has(tier, 'plan') ? `<div class="pg">${sec('Implementation plan', 'Who does what, how much effort it takes, and when.')}
      ${Object.entries(GROUPS).filter(([k]) => groups[k]?.length).map(([k, g]) => `<div class="impl">
        <div class="impl-h"><b>${g.title}</b><span>${g.when} · ${g.who}</span></div><p class="small muted">${g.note}</p>
        <table class="ptable"><thead><tr><th>Task</th><th>Type</th><th>Effort</th><th>Priority</th></tr></thead><tbody>
        ${groups[k].map((iid) => byId.get(iid)).filter(Boolean).map((i) => `<tr><td>${esc(i.title)}</td><td>${esc(i.implementationType || '—')}</td><td>${esc(i.effort || '—')}</td><td><span class="pill ${i.priority} plain">${i.priority}</span></td></tr>`).join('')}
        </tbody></table></div>`).join('') || '<p class="lead">Nothing to implement — great work.</p>'}</div>` : '';
  const consultSec = has(tier, 'consult') ? `<div class="pg consult">${sec('Your 1:1 SEO consultation')}
      <p class="lead">Your Growth Audit includes a one-to-one consultation with Click2Client Media to walk through this report.</p>
      <div class="consult-grid"><ul class="checklist plain">
        <li><span class="tick">✓</span><span>Go through your errors and roadmap together</span></li>
        <li><span class="tick">✓</span><span>Decide what to fix first for your business and budget</span></li>
        <li><span class="tick">✓</span><span>Answer your questions on SEO, content and your website</span></li>
        <li><span class="tick">✓</span><span>Optional: a quote if you'd like our team to implement it</span></li></ul>
        <div class="consult-card"><span>Book your consultation</span><b>${esc(phone)}</b><small>Call or WhatsApp · mention report ${esc(id)}</small>
          <div class="row wrap-row no-print" style="margin-top:12px">${wa ? `<a class="btn primary sm" href="${wa}" target="_blank" rel="noopener">${ICON.whatsapp} Book on WhatsApp</a>` : ''}${tel ? `<a class="btn ghost sm" href="${tel}">${ICON.phone} Call</a>` : ''}</div></div></div></div>` : '';

  const upsells = tier === 'free' ? `<div class="pg">${sec('Want the fixes and a plan?')}
      ${locked('How to fix every error', 'Step-by-step fixes for each error above, with platform-specific steps (WordPress, Shopify, Wix) and the expected impact — across 25 pages.', 'p25')}
      ${locked('Roadmap, implementation plan &amp; 1:1 consultation', 'A personalised 4-week roadmap, an implementation plan showing who does what and when, and a one-to-one consultation with our team — across 50 pages.', 'p50')}</div>`
    : tier === 'p25' ? `<div class="pg">${sec('Go further with the Growth Audit')}
      ${locked('4-week roadmap, implementation plan &amp; 1:1 consultation', 'Turn these fixes into a week-by-week plan with effort and ownership for every task, plus a one-to-one consultation with Click2Client Media — across 50 pages.', 'p50')}</div>` : '';

  doc.innerHTML = `
    <div class="pg cover">
      <div class="row"><span class="logo-box"><span class="logo-crop" style="width:220px"><img src="/img/click2client-media-logo.webp" alt="Click2Client Media" width="2000" height="774"></span></span><span class="spacer"></span><span class="plan-badge t-${tier}">${esc(planName)}</span></div>
      <div style="margin-top:80px"><div class="eyebrow">Click2Client Media · SEO Audit Report</div>
        <h1>What is holding <span class="serif grad">this website</span> back.</h1>
        <dl class="cover-meta">
          <div><dt>Website</dt><dd>${esc(a.website)}</dd></div>
          <div><dt>Audit date</dt><dd>${fmtDate(a.auditDate, true)}</dd></div>
          <div><dt>Plan</dt><dd>${esc(planName)}</dd></div>
          <div><dt>Pages analysed</dt><dd>${a.pagesAnalyzed}${planned ? ` <span class="muted" style="font-weight:500">of up to ${planned}</span>` : ''}</dd></div>
        </dl>
      </div>
      <div class="scorebox">
        ${gauge(a.score.overall, a.score.grade, 220)}
        <div class="counts">
          <div><b style="color:var(--fail)">${critical.length}</b><span>Critical &amp; high</span></div>
          <div><b style="color:var(--warn)">${warnings.length}</b><span>Warnings</span></div>
          <div><b style="color:var(--pass)">${passed.length}</b><span>Passed checks</span></div>
        </div>
      </div>
      <div class="included"><span>In this report</span><ul>${included}</ul></div>
      <p class="tiny muted" style="margin-top:18px">Prepared by Click2Client Media · ${esc(phone)}${b.email ? ` · ${esc(b.email)}` : ''}</p>
    </div>

    <div class="pg">${sec('Executive summary')}<p class="lead">${esc(summary)}</p>${ai?.sitePositioning ? `<p class="small muted" style="margin-top:14px">${esc(ai.sitePositioning)}</p>` : ''}
      ${ai?.keyFindings?.length ? `<ul style="margin:18px 0 0;padding-left:20px;display:grid;gap:8px">${ai.keyFindings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}${fewPages}</div>
    ${scoreSec}${errorsSec}${checklistSec}${roadmapSec}${planSec}${pagesSec}${consultSec}${upsells}

    <div class="pg cta">
      <div class="eyebrow" style="color:#BFE3FF">Next step</div>
      <h2 style="font-size:30px;letter-spacing:-0.02em;margin-top:10px">${tier === 'free' ? 'Want these errors fixed?' : 'Want our team to implement this for you?'}</h2>
      <p style="margin-top:10px;color:#D4E6FF">Your SEO audit identifies the problems. Our SEO team can implement the solutions.</p>
      <div class="row wrap-row no-print" style="margin-top:20px"><button class="btn white" id="leadPlan">Get SEO Implementation Support</button>${waHelp ? `<a class="btn ghost" href="${waHelp}" target="_blank" rel="noopener">${ICON.whatsapp} Talk to Click2Client Media</a>` : ''}${tel ? `<a class="btn ghost" href="${tel}">${ICON.phone} ${esc(phone)}</a>` : ''}</div>
      <p class="print-contact" style="display:none;margin-top:12px;font-weight:650">Talk to Click2Client Media · ${esc(phone)}${b.email ? ' · ' + esc(b.email) : ''}</p>
    </div>
    <div class="foot"><span>${esc(b.reportFooter || 'Search rankings depend on many factors; no ranking outcome is guaranteed.')}</span><span>Report reference: ${esc(id)} · ${esc(planName)}</span></div>`;

  document.title = `SEO Audit Report — ${hostOf(a.website)} | Click2Client Media`;
  document.getElementById('tbTitle').textContent = `${hostOf(a.website)} · ${a.score.overall}/100 · ${planName}`;
  document.getElementById('leadPlan').onclick = () => openLeadForm({ branding: b, auditId: id, website: a.website, score: a.score.overall, intent: 'seo_implementation' });
}

(async () => {
  let b = { companyName: 'Click2Client Media' };
  let cfg = null;
  try {
    cfg = await api('/public/config');
    b = { companyName: cfg.company, phone: cfg.phone, whatsapp: cfg.whatsapp, email: cfg.email };
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
    render(a, b, cfg);
    if (new URLSearchParams(location.search).get('print')) setTimeout(() => print(), 700);
  } catch (e) {
    doc.innerHTML = `<div class="pg"><h2 class="sec">Report unavailable</h2><p class="muted" style="margin-top:8px">${esc(e.status === 401 ? 'This report does not exist or the link is incorrect.' : e.message)}</p></div>`;
  }
  document.getElementById('pdf').onclick = () => print();
  document.getElementById('copy').onclick = async () => { try { await navigator.clipboard.writeText(location.origin + location.pathname); toast('Link copied'); } catch { toast(location.href); } };
})();
