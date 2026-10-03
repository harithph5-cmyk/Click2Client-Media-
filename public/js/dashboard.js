// Audit dashboard: section navigation + one renderer per audit category.
// Every value shown here comes from the stored audit object.

import { esc, fmtDate, fmtNum, fmtMs, fmtKb, hostOf, pathOf, gauge, scoreColor, STATUS_LABEL, ICON, modal, whatsappLink, openLeadForm } from './common.js';

export const SECTIONS = [
  { grp: 'Summary' },
  { id: 'overview', k: 'A', label: 'SEO overview' },
  { id: 'issues', label: 'Issues & fixes', count: (a) => a.issues.length },
  { id: 'plan', label: '30-day action plan' },
  { grp: 'Content' },
  { id: 'onpage', k: 'B', label: 'On-page SEO', cats: ['onpage'] },
  { id: 'headings', k: 'C', label: 'Headings', ids: ['h1_present', 'h1_single', 'heading_hierarchy'] },
  { id: 'keywords', k: 'D', label: 'Keyword analysis', ids: ['keyword_stuffing', 'kw_in_title', 'kw_in_h1', 'kw_in_meta', 'kw_in_content', 'content_length', 'text_html_ratio'] },
  { id: 'images', k: 'E', label: 'Image SEO', cats: ['images'] },
  { id: 'urls', k: 'F', label: 'URL analysis', ids: ['url_length', 'url_underscore', 'url_uppercase', 'url_params'] },
  { id: 'pages', label: 'Crawled pages', when: (a) => a.evidence.pages.length > 1 },
  { grp: 'Crawling & indexing' },
  { id: 'sitemap', k: 'G', label: 'Sitemap', ids: ['sitemap'] },
  { id: 'robots', k: 'H', label: 'Robots.txt', ids: ['robots_txt', 'robots_sitemap_ref', 'robots_blocks_site'] },
  { id: 'canonical', k: 'I', label: 'Canonicalisation', ids: ['canonical_present', 'canonical_multiple', 'canonical_match', 'host_canonicalization'] },
  { id: 'technical', k: 'J', label: 'Technical SEO', cats: ['technical'] },
  { id: 'server', k: 'K', label: 'Server information', ids: ['compression', 'response_time', 'html_size'] },
  { grp: 'Experience' },
  { id: 'performance', k: 'L', label: 'Performance', cats: ['performance'] },
  { id: 'mobile', k: 'M', label: 'Mobile SEO', cats: ['mobile'] },
  { id: 'security', k: 'N', label: 'Security', cats: ['security'] },
  { grp: 'Signals' },
  { id: 'analytics', k: 'O', label: 'Analytics', ids: ['analytics'] },
  { id: 'social', k: 'P', label: 'Social', cats: ['social'] },
  { id: 'traffic', k: 'Q', label: 'Traffic' },
  { id: 'internal', k: 'R', label: 'Internal links', ids: ['internal_link_count', 'broken_internal_links', 'nofollow_internal', 'empty_anchor'] },
  { id: 'external', k: 'S', label: 'External links', ids: ['broken_external_links'] },
  { id: 'backlinks', k: 'T', label: 'Backlinks' },
  { id: 'tech', k: 'U', label: 'Technology', ids: [] },
  { id: 'local', label: 'Local SEO', cats: ['local'], when: (a) => a.checks.some((c) => c.category === 'local') },
];

const worst = (checks) => (checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warning') ? 'warning' : checks.some((c) => c.status === 'pass') ? 'pass' : null);
const checksFor = (a, s) => a.checks.filter((c) => (s.cats && s.cats.includes(c.category)) || (s.ids && s.ids.includes(c.id)));

export function evTag(type, source) {
  const map = { verified: ['verified', 'Verified'], detected: ['detected', 'Detected'], unavailable: ['unavailable', 'Unavailable'] };
  if (source) return `<span class="tag estimated" title="${esc(source)}">${esc(source.replace('Google ', ''))}</span>`;
  const [cls, lbl] = map[type] || map.verified;
  return `<span class="tag ${cls}">${lbl}</span>`;
}

const evList = (ev) => (Array.isArray(ev) ? `<ul class="evidence">${ev.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : `<ul class="evidence"><li>${esc(ev)}</li></ul>`);

function fixBlock(issue) {
  return (issue.implementation || []).map((s) => `<div class="howto"><b>${esc(s.platform)}:</b> ${esc(s.steps)}</div>`).join('');
}

const UPGRADE = '/seo-audit#plans';
function lockedFix(what = 'Recommendations and step-by-step fixes') {
  return `<div class="locked"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg><div><b>${what} are included in the paid audits.</b><br><a href="${UPGRADE}">Upgrade to the 25-page or 50-page audit →</a></div></div>`;
}

export function checkRow(c, ctx, open = false) {
  const issue = ctx.issueById.get(c.instanceKey || c.id);
  const note = issue && ctx.aiNotes.get(issue.id);
  return `<details class="crow" ${open ? 'open' : ''}>
    <summary>
      <span class="pill ${c.status}">${STATUS_LABEL[c.status]}</span>
      <div style="min-width:0"><div class="ttl">${esc(c.title)}</div><div class="val">${esc(c.value ?? '')}</div></div>
      <span class="row" style="gap:8px">${issue ? `<span class="pill ${issue.priority} plain">${issue.priority}</span>` : ''}<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg></span>
    </summary>
    <div class="body">
      <dl class="kv">
        <dt>Detected</dt><dd>${esc(c.value ?? '—')} ${evTag(c.evidenceType, c.source)}</dd>
        ${c.expected ? `<dt>Expected</dt><dd>${esc(c.expected)}</dd>` : ''}
        <dt>Evidence</dt><dd>${evList(c.evidence)}</dd>
        ${c.affected && c.affected.total > 1 ? `<dt>Pages affected</dt><dd>${c.affected.count} of ${c.affected.total}${c.affected.pages.length ? evList(c.affected.pages.slice(0, 12).map((p) => `${pathOf(p.url)} — ${p.value}`)) : ''}</dd>` : ''}
        ${issue ? `<dt>Why it matters</dt><dd>${esc(issue.whyItMatters)}</dd>` : ''}
        ${issue && issue.recommendation ? `<dt>Recommendation</dt><dd>${esc(issue.recommendation)}</dd>
        <dt>How to fix</dt><dd style="display:grid;gap:8px">${fixBlock(issue)}</dd>
        <dt>Impact</dt><dd>${esc(issue.expectedImpact)}</dd>
        ${issue.effort ? `<dt>Difficulty</dt><dd>${esc(issue.implementationType)} · ${esc(issue.effort)}</dd>` : ''}` : ''}
      </dl>
      ${issue && !issue.recommendation ? lockedFix() : ''}
      ${note ? `<div class="consult"><span class="tag ai">Consultant note</span><p style="margin-top:8px">${esc(note.consultantNote)}</p>${note.suggestedFix ? `<p style="margin-top:8px"><b>Suggested fix:</b> ${esc(note.suggestedFix)}</p>` : ''}</div>` : ''}
    </div>
  </details>`;
}

export function issueCard(i, ctx, expanded = false) {
  const note = ctx.aiNotes.get(i.id);
  return `<article class="issue" data-id="${esc(i.id)}">
    <div class="issue-head">
      <div style="min-width:0">
        <h3>${esc(i.title)}</h3>
        <div class="val">Detected: ${esc(i.value ?? '—')}${i.expected ? ` · Expected: ${esc(i.expected)}` : ''}</div>
        <div class="issue-meta">
          <span class="pill ${i.priority} plain">${i.priority}</span>
          <span class="pill ${i.status}">${STATUS_LABEL[i.status]}</span>
          ${i.implementationType ? `<span class="tag">${esc(i.implementationType)}</span>` : ''}
          ${i.effort ? `<span class="tag">Difficulty: ${esc(i.effort)}</span>` : ''}
          ${i.affected && i.affected.total > 1 ? `<span class="tag">${i.affected.count}/${i.affected.total} pages</span>` : ''}
        </div>
      </div>
    </div>
    <div class="issue-body">
      <p class="why"><b>Why it matters.</b> ${esc(i.whyItMatters)}</p>
      <div class="${expanded ? '' : 'hidden'} issue-more" style="display:grid;gap:14px">
        <dl class="kv">
          <dt>Evidence</dt><dd>${evList(i.evidence)}</dd>
          <dt>Severity</dt><dd>${esc(i.severity[0].toUpperCase() + i.severity.slice(1))}</dd>
          ${i.affected && i.affected.total > 1 ? `<dt>Affected pages</dt><dd>${evList(i.affected.pages.slice(0, 10).map((p) => `${pathOf(p.url)} — ${p.value}`))}</dd>` : ''}
          ${i.recommendation ? `<dt>Impact</dt><dd>${esc(i.expectedImpact)}</dd>
          <dt>Recommendation</dt><dd>${esc(i.recommendation)}</dd>
          <dt>How to fix</dt><dd style="display:grid;gap:8px">${fixBlock(i)}</dd>` : ''}
        </dl>
        ${i.recommendation ? '' : lockedFix()}
        ${note ? `<div class="consult"><span class="tag ai">Consultant note</span><p style="margin-top:8px">${esc(note.consultantNote)}</p>${note.suggestedFix ? `<p style="margin-top:8px"><b>Suggested fix:</b> ${esc(note.suggestedFix)}</p>` : ''}</div>` : ''}
      </div>
      <button class="more-btn" data-toggle-issue>${expanded ? 'Hide details' : i.recommendation ? 'Evidence & how to fix →' : 'Evidence & affected pages →'}</button>
    </div>
  </article>`;
}

const secHead = (s, sub) => `<div class="sec-title">${s.k ? `<span class="k">${s.k}</span>` : ''}<h2>${esc(s.label)}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;
const stat = (n, l, s) => `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
const unavailable = (title, text, hint) => `<div class="card unavail"><div class="ic">?</div><div><h3>${esc(title)}</h3><p class="muted small" style="margin-top:4px">${esc(text)}</p>${hint ? `<p class="tiny muted" style="margin-top:8px">${hint}</p>` : ''}</div></div>`;
const rows = (list, ctx) => (list.length ? list.map((c) => checkRow(c, ctx)).join('') : '');
const tbl = (head, body, cls = '') => `<div class="card table-wrap"><table class="t ${cls}"><thead><tr>${head.map((h) => `<th${h.startsWith('#') ? ' class="num"' : ''}>${esc(h.replace(/^#/, ''))}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;

function summaryText(a) {
  const c = a.counts;
  const parts = [`We analysed ${a.pagesAnalyzed} page${a.pagesAnalyzed > 1 ? 's' : ''} of ${hostOf(a.website)} and ran ${a.score.verifiedChecks} verified checks.`];
  if (c.critical) parts.push(`${c.critical} critical issue${c.critical > 1 ? 's need' : ' needs'} attention first.`);
  const top = a.issues.slice(0, 3).map((i) => i.title.toLowerCase());
  if (top.length) parts.push(`The most important items are: ${top.join('; ')}.`);
  if (a.score.excludedChecks) parts.push(`${a.score.excludedChecks} check${a.score.excludedChecks > 1 ? 's' : ''} could not be verified and ${a.score.excludedChecks > 1 ? 'were' : 'was'} excluded from the score.`);
  return parts.join(' ');
}

const R = {
  overview(a, ctx, s) {
    const ai = a.interpretation?.ai;
    const cats = Object.entries(a.score.categories).filter(([, c]) => c.weight > 0 && c.score != null);
    return `
      <div class="card summary">
        <div class="sc">${gauge(a.score.overall, a.score.grade)}<div class="tiny muted" style="margin-top:12px;text-align:center;max-width:220px">Based on ${a.score.verifiedChecks} verified checks${a.score.excludedChecks ? ` · ${a.score.excludedChecks} excluded as unverifiable` : ''}</div></div>
        <div class="meta">
          <div><div class="eyebrow">Website</div><div class="site-title" style="margin-top:6px">${esc(a.website)}</div></div>
          <div class="facts">
            <div class="fact"><div class="l">Audit date</div><div class="v">${fmtDate(a.auditDate, true)}</div></div>
            <div class="fact"><div class="l">Pages analysed</div><div class="v">${a.pagesAnalyzed}</div></div>
            <div class="fact"><div class="l">Audit type</div><div class="v">${esc({ homepage: 'Homepage', quick: 'Quick', full: 'Full site' }[a.mode] || a.mode)}</div></div>
            <div class="fact"><div class="l">Duration</div><div class="v">${fmtMs(a.durationMs)}</div></div>
          </div>
          <div class="counts">
            <div><div class="n" style="color:var(--fail)">${a.counts.critical}</div><div class="l"><span class="dot fail"></span>Critical</div></div>
            <div><div class="n">${a.counts.high}</div><div class="l"><span class="dot fail" style="opacity:.55"></span>High</div></div>
            <div><div class="n">${a.counts.medium + a.counts.low}</div><div class="l"><span class="dot warning"></span>Warnings</div></div>
            <div><div class="n" style="color:var(--pass)">${a.counts.passed}</div><div class="l"><span class="dot pass"></span>Passed</div></div>
            <div><div class="n" style="color:var(--na)">${a.counts.unavailable}</div><div class="l"><span class="dot"></span>Unverified</div></div>
          </div>
        </div>
      </div>
      ${a.warnings?.length ? a.warnings.map((w) => `<div class="banner warn">${esc(w)}</div>`).join('') : ''}
      <div class="two">
        <div class="card card-pad">
          <div class="row"><h3>${ai?.available ? 'Consultant summary' : 'Summary'}</h3><span class="spacer"></span>${ai?.available ? '<span class="tag ai">Consultant note</span>' : '<span class="tag verified">From audit data</span>'}</div>
          <p style="margin-top:12px;font-size:15px;line-height:1.65">${esc(ai?.available ? ai.executiveSummary : summaryText(a))}</p>
          ${ai?.available && ai.sitePositioning ? `<p class="small muted" style="margin-top:12px"><b style="color:var(--ink-2)">What the site communicates:</b> ${esc(ai.sitePositioning)}</p>` : ''}
          ${!ai?.available && ai?.reason ? `<p class="tiny muted" style="margin-top:12px">${esc(ai.reason)}</p>` : ''}
        </div>
        <div class="card card-pad">
          <h3>Score by category</h3>
          <div class="cats" style="margin-top:8px">${cats.map(([, c]) => `<div class="cat"><div class="row"><span>${esc(c.label)}</span><span class="s" style="color:${scoreColor(c.score)}">${c.score}</span></div><div class="bar"><span style="width:${c.score}%;background:${scoreColor(c.score)}"></span></div></div>`).join('')}</div>
        </div>
      </div>
      ${ai?.available && (ai.keyFindings?.length || ai.strengths?.length) ? `<div class="two">
        <div class="card card-pad"><h3>Key findings</h3><ul style="margin:12px 0 0;padding-left:18px;display:grid;gap:8px;font-size:14px">${ai.keyFindings.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>
        <div class="card card-pad"><h3>What's working</h3><ul style="margin:12px 0 0;padding-left:18px;display:grid;gap:8px;font-size:14px">${ai.strengths.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>
      </div>` : ''}
      <div>
        <div class="row" style="margin:8px 0 12px"><h3>Fix these first</h3><span class="spacer"></span><a class="btn quiet sm" href="${ctx.base}/issues">All ${a.issues.length} issues →</a></div>
        ${a.issues.length ? a.issues.slice(0, 5).map((i) => issueCard(i, ctx)).join('') : `<div class="card empty"><h3>No issues found</h3><p>Every verified check passed.</p></div>`}
      </div>
      <div class="card card-pad">
        <h3>How to read this audit</h3>
        <div class="row wrap-row small" style="margin-top:12px;gap:18px">
          <span>${evTag('verified')} measured directly from the site</span>
          <span>${evTag('detected')} inferred from fingerprints</span>
          <span><span class="tag estimated">PageSpeed</span> third-party source</span>
          <span>${evTag('unavailable')} not verifiable — excluded from score</span>
          <span><span class="tag ai">Consultant note</span> interpretation</span>
        </div>
        <p class="tiny muted" style="margin-top:12px">${esc(a.score.methodology)}</p>
      </div>`;
  },

  issues(a, ctx, s) {
    const f = ctx.state.issueFilter || 'ALL';
    const counts = { ALL: a.issues.length };
    for (const p of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) counts[p] = a.issues.filter((i) => i.priority === p).length;
    const list = f === 'ALL' ? a.issues : a.issues.filter((i) => i.priority === f);
    return `${secHead(s, 'Every failed or warning check, prioritised by severity, reach and effort. Expand any issue for evidence and platform-specific steps.')}
      <div class="filters">${Object.entries(counts).map(([k, n]) => `<button class="chip ${f === k ? 'on' : ''}" data-filter-issues="${k}">${k === 'ALL' ? 'All' : k[0] + k.slice(1).toLowerCase()}<span class="n">${n}</span></button>`).join('')}</div>
      ${list.length ? list.map((i) => issueCard(i, ctx)).join('') : '<div class="card empty"><h3>Nothing here</h3><p>No issues at this priority.</p></div>'}`;
  },

  plan(a, ctx, s) {
    if (!a.roadmap) {
      return `${secHead(s, 'A week-by-week roadmap generated from your own audit findings.')}
        <div class="card card-pad" style="text-align:center;padding:44px 24px">
          <div class="ic-lock">${'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'}</div>
          <h3 style="font-size:22px;margin-top:14px">Your personalised SEO Growth Roadmap</h3>
          <p class="muted" style="max-width:520px;margin:10px auto 0">The 50-Page SEO Growth Audit turns these ${a.issues.length} findings into a prioritised four-week plan — quick wins, technical fixes, content improvements and long-term growth — with difficulty and impact for every task.</p>
          <a class="btn accent" style="margin-top:20px" href="/seo-audit#plan-p50">Get the 50-Page Growth Audit</a>
        </div>`;
    }
    const G = [['quick_wins', 'Quick wins'], ['high_impact', 'High impact'], ['technical', 'Technical fixes'], ['content', 'Content improvements'], ['long_term', 'Long-term SEO']];
    const g = ctx.state.planGroup || G.find(([k]) => a.issueGroups[k]?.length)?.[0] || 'quick_wins';
    const byId = ctx.issueById;
    const done = ctx.doneSet;
    return `${secHead(s, 'A practical roadmap built only from the issues found in this audit.')}
      <div class="roadmap">
        ${a.roadmap.length ? a.roadmap.map((w) => `<div class="card card-pad week">
          <div class="wk"><small>Week</small>${w.week}</div>
          <div><div class="theme">${esc(w.theme)}</div><p class="small muted" style="margin-top:3px">${esc(w.focus)}</p>
            <ul>${w.items.map((id) => { const i = byId.get(id); return i ? `<li><input type="checkbox" data-done="${esc(id)}" ${done.has(id) ? 'checked' : ''} aria-label="Mark done"><span>${esc(i.title)} <span class="muted small">— ${esc(i.recommendation.split(/\.(?:\s|$)/)[0])}.</span></span><span class="pill ${i.priority} plain">${i.priority}</span></li>` : ''; }).join('')}</ul>
          </div></div>`).join('') : '<div class="card empty"><h3>No actions needed</h3><p>This audit found no issues to schedule.</p></div>'}
      </div>
      <div style="margin-top:28px">
        <h3 style="margin-bottom:12px">Issues by type of work</h3>
        <div class="filters">${G.map(([k, l]) => `<button class="chip ${g === k ? 'on' : ''}" data-plan-group="${k}">${l}<span class="n">${a.issueGroups[k]?.length || 0}</span></button>`).join('')}</div>
        ${(a.issueGroups[g] || []).map((id) => byId.get(id)).filter(Boolean).map((i) => issueCard(i, ctx)).join('') || '<div class="card empty"><p>No issues in this group.</p></div>'}
      </div>
      <p class="tiny muted" style="margin-top:14px">Checklist progress is saved in this browser only.</p>`;
  },

  onpage(a, ctx, s) {
    const h = a.evidence.pages[0];
    return `${secHead(s, 'Title, meta description, URL and content signals of the homepage, with results across all crawled pages.')}
      <div class="card card-pad"><dl class="kv">
        <dt>Title</dt><dd>${h.title ? `“${esc(h.title)}” <span class="muted small">· ${[...h.title].length} chars</span>` : '<span style="color:var(--fail)">Missing</span>'}</dd>
        <dt>Meta description</dt><dd>${h.metaDescription ? `“${esc(h.metaDescription)}” <span class="muted small">· ${[...h.metaDescription].length} chars</span>` : '<span style="color:var(--fail)">Missing</span>'}</dd>
        <dt>Meta keywords</dt><dd>${h.metaKeywords ? esc(h.metaKeywords) + ' <span class="muted small">(ignored by Google; harmless)</span>' : '<span class="muted">Not present (not needed)</span>'}</dd>
        <dt>URL</dt><dd class="mono">${esc(h.url)}</dd>
        <dt>Words</dt><dd>${fmtNum(h.wordCount)}</dd>
        <dt>Text / HTML</dt><dd>${h.textRatio ?? '—'}%</dd>
      </dl>
      <div style="margin-top:16px"><div class="eyebrow" style="margin-bottom:8px">Search preview (approximate)</div>
        <div style="font-family:Arial,sans-serif;max-width:600px"><div style="font-size:12px;color:#4d5156">${esc(hostOf(h.url))} › ${esc(pathOf(h.url))}</div><div style="font-size:19px;color:#1a0dab;line-height:1.3;margin:3px 0">${esc((h.title || hostOf(h.url)).slice(0, 62))}${(h.title || '').length > 62 ? '…' : ''}</div><div style="font-size:13.5px;color:#4d5156;line-height:1.5">${esc((h.metaDescription || 'No meta description — the search engine will choose text from the page.').slice(0, 158))}${(h.metaDescription || '').length > 158 ? '…' : ''}</div></div></div></div>
      <div>${rows(checksFor(a, s), ctx)}</div>`;
  },

  headings(a, ctx, s) {
    const h = a.evidence.pages[0];
    const sel = ctx.state.hLevel || 'h1';
    return `${secHead(s, 'All headings on the homepage. Select a level to see its text.')}
      <div class="hcounts">${['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((l) => `<button class="hcount ${sel === l ? 'on' : ''}" data-hlevel="${l}"><div class="n">${h.headings[l].length}</div><div class="l">${l.toUpperCase()}</div></button>`).join('')}</div>
      <div class="card card-pad"><h3>${sel.toUpperCase()} headings <span class="muted small">(${h.headings[sel].length})</span></h3>
        ${h.headings[sel].length ? `<ol style="margin:12px 0 0;padding-left:22px;display:grid;gap:6px;font-size:14px">${h.headings[sel].map((t) => `<li>${t ? esc(t) : '<span class="muted">(empty heading)</span>'}</li>`).join('')}</ol>` : `<p class="muted small" style="margin-top:8px">No ${sel.toUpperCase()} headings on this page.</p>`}</div>
      <div>${rows(checksFor(a, s), ctx)}</div>
      <details class="card card-pad"><summary style="cursor:pointer;font-weight:650">Document outline (${h.headingOrder.length} headings in order)</summary>
        <div class="htree" style="margin-top:12px">${h.headingOrder.map((x) => `<div class="h" style="padding-left:${(x.level - 1) * 16}px"><b>H${x.level}</b><span>${esc(x.text || '(empty)')}</span></div>`).join('')}</div></details>`;
  },

  keywords(a, ctx, s) {
    const k = a.evidence.keywords;
    const ai = a.interpretation?.ai;
    const yes = '<span class="tick">✓</span>', no = '<span class="cross">–</span>';
    return `${secHead(s, `Terms and phrases extracted from ${fmtNum(k.totalWords)} words of homepage text, and where they appear.`)}
      ${ai?.available && ai.keywordAssessment ? `<div class="consult"><span class="tag ai">Consultant note</span><p style="margin-top:8px">${esc(ai.keywordAssessment)}</p></div>` : ''}
      <div>
        <h3 style="margin-bottom:10px">Keyword placement matrix</h3>
        ${k.matrix.length ? tbl(['Keyword', 'URL', 'Title', 'Meta', 'H1', 'H2', 'Content', '#Count', '#Density'],
          k.matrix.map((m) => `<tr><td><b>${esc(m.term)}</b> ${m.source === 'target' ? '<span class="tag ai">Target</span>' : ''}</td>${['url', 'title', 'meta', 'h1', 'h2', 'content'].map((x) => `<td class="c">${m[x] ? yes : no}</td>`).join('')}<td class="num">${m.occurrences}</td><td class="num">${m.density}%</td></tr>`).join(''), 'matrix')
          : '<div class="card empty"><p>Not enough text to analyse keywords.</p></div>'}
        <p class="tiny muted" style="margin-top:8px">Natural usage matters more than repetition. We flag single terms above ~4% of words as possible over-use; there is no "ideal density".</p>
      </div>
      <div class="two">
        <div><h3 style="margin-bottom:10px">Common keywords</h3>${tbl(['Keyword', '#Count', '#Share'], k.keywords.slice(0, 15).map((x) => `<tr><td>${esc(x.term)}</td><td class="num">${x.count}</td><td class="num">${x.density}%</td></tr>`).join('') || '<tr><td colspan="3" class="muted">None</td></tr>')}</div>
        <div><h3 style="margin-bottom:10px">Common phrases</h3>${tbl(['Phrase', '#Count'], [...k.phrases2.slice(0, 10), ...k.phrases3.slice(0, 5)].map((x) => `<tr><td>${esc(x.term)}</td><td class="num">${x.count}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">No repeated phrases</td></tr>')}</div>
      </div>
      <div>${rows(checksFor(a, s), ctx)}</div>`;
  },

  images(a, ctx, s) {
    const imgs = a.evidence.pages[0].images || [];
    const real = imgs.filter((i) => i.src !== '(inline data URI)');
    const missing = real.filter((i) => i.alt === null), empty = real.filter((i) => i.alt === ''), withAlt = real.filter((i) => i.alt);
    const f = ctx.state.imgFilter || 'all';
    const list = f === 'missing' ? missing : f === 'empty' ? empty : f === 'alt' ? withAlt : real;
    return `${secHead(s, 'Images found in the homepage HTML. Click a row for details.')}
      <div class="stat-row">${stat(real.length, 'Images')}${stat(withAlt.length, 'ALT present')}${stat(missing.length, 'ALT missing', 'No alt attribute')}${stat(empty.length, 'Empty ALT', 'alt="" — fine if decorative')}</div>
      <div>${rows(checksFor(a, s), ctx)}</div>
      <div class="filters">${[['all', 'All', real.length], ['missing', 'Missing ALT', missing.length], ['empty', 'Empty ALT', empty.length], ['alt', 'With ALT', withAlt.length]].map(([k, l, n]) => `<button class="chip ${f === k ? 'on' : ''}" data-img-filter="${k}">${l}<span class="n">${n}</span></button>`).join('')}</div>
      ${list.length ? tbl(['', 'Filename', 'ALT text', 'Size attrs'], list.slice(0, 200).map((i) => `<tr class="clickable" data-img="${esc(imgs.indexOf(i))}"><td><img class="thumb" src="${esc(i.src)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.style.visibility='hidden'"></td><td class="break"><div style="font-weight:600">${esc(i.filename || '—')}</div><div class="tiny muted break">${esc(i.src)}</div></td><td>${i.alt === null ? '<span class="pill fail">Missing</span>' : i.alt === '' ? '<span class="pill info">Empty</span>' : esc(i.alt)}</td><td class="nowrap small">${i.width && i.height ? `${esc(i.width)}×${esc(i.height)}` : '<span class="muted">—</span>'}</td></tr>`).join('')) : '<div class="card empty"><p>No images in this view.</p></div>'}`;
  },

  urls(a, ctx, s) {
    const classify = (u) => (u.length > 100 || u.uppercase ? 'issue' : u.underscores || u.params || u.depth > 4 ? 'warning' : 'good');
    const urls = (a.evidence.urls || []).map((u) => ({ ...u, cls: classify(u) }));
    const f = ctx.state.urlFilter || 'all';
    const list = f === 'all' ? urls : urls.filter((u) => u.cls === f);
    const n = (c) => urls.filter((u) => u.cls === c).length;
    return `${secHead(s, `${urls.length} unique internal URLs discovered in links on the crawled pages.`)}
      <div>${rows(checksFor(a, s), ctx)}</div>
      <div class="filters">${[['all', 'All', urls.length], ['good', 'Good', n('good')], ['warning', 'Warnings', n('warning')], ['issue', 'Issues', n('issue')]].map(([k, l, c]) => `<button class="chip ${f === k ? 'on' : ''}" data-url-filter="${k}">${l}<span class="n">${c}</span></button>`).join('')}</div>
      ${list.length ? tbl(['URL', '#Length', '#Depth', 'Notes'], list.slice(0, 300).map((u) => `<tr><td class="break mono">${esc(u.url)}</td><td class="num">${u.length}</td><td class="num">${u.depth}</td><td class="small">${[u.cls === 'good' ? '<span class="pill pass">Good</span>' : '', u.length > 100 ? 'Long' : '', u.uppercase ? 'Uppercase' : '', u.underscores ? 'Underscores' : '', u.params ? 'Parameters' : '', u.depth > 4 ? 'Deep' : ''].filter(Boolean).join(' · ')}</td></tr>`).join('')) : '<div class="card empty"><p>No URLs in this view.</p></div>'}
      ${list.length > 300 ? `<p class="tiny muted">Showing first 300 of ${list.length}.</p>` : ''}`;
  },

  pages(a, ctx, s) {
    return `${secHead(s, 'Every page fetched in this audit.')}
      ${tbl(['Page', 'Status', 'Title', '#Words', '#H1', 'Meta'], a.evidence.pages.map((p) => `<tr><td class="break mono small">${esc(pathOf(p.url || p.requestedUrl))}</td><td>${p.status ? `<span class="pill ${p.status === 200 ? 'pass' : p.status < 400 ? 'warning' : 'fail'} plain">${p.status}</span>` : `<span class="pill unavailable plain" title="${esc(p.error?.message)}">Error</span>`}</td><td class="small">${esc(p.title || '—')}</td><td class="num">${fmtNum(p.wordCount)}</td><td class="num">${p.headings ? p.headings.h1.length : '—'}</td><td>${p.metaDescription ? '<span class="tick">✓</span>' : p.title !== undefined ? '<span class="pill fail plain">None</span>' : '—'}</td></tr>`).join(''))}
      ${a.evidence.crawlSkipped?.length ? `<p class="small muted">${a.evidence.crawlSkipped.length} URL(s) were not crawled because robots.txt disallows them.</p>` : ''}`;
  },

  sitemap(a, ctx, s) {
    const sm = a.evidence.sitemap;
    return `${secHead(s, 'Sitemaps declared in robots.txt and common locations were requested and parsed.')}
      <div>${rows(checksFor(a, s), ctx)}</div>
      ${sm ? `<div class="stat-row">${stat(sm.found ? 'Found' : 'Not found', 'Sitemap')}${stat(sm.found ? fmtNum(sm.urlCount) + (sm.urlCountIsPartial ? '+' : '') : '—', 'URLs discovered', sm.urlCountIsPartial ? 'First 5 child sitemaps counted' : '')}${stat(sm.referencedInRobots ? 'Yes' : 'No', 'Listed in robots.txt')}${stat(sm.primary?.lastmodLatest ? fmtDate(sm.primary.lastmodLatest) : '—', 'Latest lastmod')}</div>
      ${tbl(['Sitemap URL', 'Source', 'HTTP', 'Status'], sm.checked.map((c) => `<tr><td class="break mono small">${esc(c.url)}</td><td class="small">${esc(c.source)}</td><td>${c.status ?? '—'}</td><td class="small">${c.valid ? `<span class="pill pass">Valid ${esc(c.type)}</span> ${c.urlCount != null ? c.urlCount + ' URLs' : ''}` : c.accessible ? `<span class="pill fail">Invalid</span> ${esc(c.note || '')}` : `<span class="pill unavailable">Not available</span> ${esc(c.error || '')}`}</td></tr>`).join(''))}
      ${sm.children?.length ? `<h3>Child sitemaps</h3>${tbl(['Sitemap', 'HTTP', '#URLs'], sm.children.map((c) => `<tr><td class="break mono small">${esc(c.url)}</td><td>${c.status ?? '—'}</td><td class="num">${c.urlCount ?? '—'}</td></tr>`).join(''))}<p class="tiny muted">${sm.childrenTotal} child sitemap(s) listed in the index.</p>` : ''}` : unavailable('Sitemap', 'Sitemap data could not be collected.')}`;
  },

  robots(a, ctx, s) {
    const r = a.evidence.robots;
    return `${secHead(s, 'Each rule is explained in plain language. A Disallow rule is not automatically a problem.')}
      <div>${rows(checksFor(a, s), ctx)}</div>
      ${r?.available ? `${r.groups.map((g) => `<div class="card"><div class="card-head"><h3>User-agent: ${esc(g.agents.join(', '))}</h3>${g.crawlDelay ? `<span class="tag">Crawl-delay ${esc(g.crawlDelay)}</span>` : ''}</div>
        ${g.rules.length ? `<div class="table-wrap"><table class="t"><tbody>${g.rules.map((rule) => `<tr><td class="mono nowrap" style="width:1%">${esc(rule.type === 'allow' ? 'Allow' : 'Disallow')}: ${esc(rule.path || '(empty)')}</td><td class="small">${rule.explanation.severity === 'critical' ? '<span class="pill fail">Blocks site</span> ' : ''}${esc(rule.explanation.text)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="card-pad muted small">No rules in this group.</p>'}</div>`).join('')}
        ${r.sitemaps.length ? `<div class="card card-pad"><h3>Sitemap declarations</h3><ul class="evidence" style="margin-top:10px">${r.sitemaps.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        <details class="card card-pad"><summary style="cursor:pointer;font-weight:650">Raw robots.txt</summary><pre class="raw" style="margin-top:12px">${esc(r.raw)}</pre></details>`
      : unavailable('robots.txt not available', r?.note || r?.error?.message || 'No robots.txt was found.', 'Without a robots.txt, search engines assume they may crawl everything. That is not harmful by itself.')}`;
  },

  canonical(a, ctx, s) {
    return `${secHead(s, 'Canonical tags on each crawled page, compared with the URL actually served.')}
      <div>${rows(checksFor(a, s), ctx)}</div>
      ${tbl(['Page', 'Canonical'], a.evidence.pages.filter((p) => p.canonicals).map((p) => `<tr><td class="break mono small">${esc(p.url)}</td><td class="break mono small">${p.canonicals.length ? p.canonicals.map((c) => esc(c.resolved || c.raw)).join('<br>') : '<span class="pill warning">Missing</span>'}</td></tr>`).join(''))}`;
  },

  technical(a, ctx, s) {
    const list = checksFor(a, s);
    const groups = [['Verified', list.filter((c) => c.evidenceType === 'verified' && c.status !== 'unavailable')], ['Detected', list.filter((c) => c.evidenceType === 'detected')], ['Unavailable', list.filter((c) => c.status === 'unavailable')]];
    const h = a.evidence.pages[0];
    return `${secHead(s, 'Crawlability, indexability and HTML fundamentals.')}
      <div class="stat-row">${stat(h.status ?? '—', 'HTTP status')}${stat(h.redirects?.length ?? 0, 'Redirects')}${stat(fmtKb(h.htmlBytes), 'HTML size')}${stat(h.lang || '—', 'Language')}${stat((h.jsonLd || []).length, 'Schema types')}</div>
      ${groups.filter(([, l]) => l.length).map(([g, l]) => `<div><div class="row" style="margin:6px 0 10px"><h3>${g}</h3>${evTag(g.toLowerCase())}</div>${rows(l, ctx)}</div>`).join('')}
      ${h.redirects?.length ? `<div class="card card-pad"><h3>Redirect chain</h3>${evList(h.redirects.map((r) => `${r.url} → ${r.status} → ${r.location}`))}</div>` : ''}
      ${(h.hreflang || []).length ? `<div class="card card-pad"><h3>hreflang</h3>${evList(h.hreflang.map((x) => `${x.lang}: ${x.href}`))}</div>` : ''}`;
  },

  server(a, ctx, s) {
    const sv = a.evidence.server;
    const m = a.evidence.performance.measured;
    return `${secHead(s, 'Response headers returned by the server for the homepage.')}
      <div class="stat-row">${stat(esc(sv.server || '—'), 'Server')}${stat(esc(m.compression || 'None'), 'Compression')}${stat(fmtMs(m.ttfbMs), 'Time to first byte', 'Single measurement')}${stat(fmtKb(m.transferBytes), 'Transferred')}</div>
      <div>${rows(checksFor(a, s), ctx)}</div>
      ${tbl(['Header', 'Value'], Object.entries(sv.headers || {}).map(([k, v]) => `<tr><td class="mono small nowrap">${esc(k)}</td><td class="mono small break">${esc(v)}</td></tr>`).join(''))}`;
  },

  performance(a, ctx, s) {
    const m = a.evidence.performance.measured;
    const ps = a.evidence.performance.pagespeed;
    const card = (r, label) => {
      if (!r) return unavailable(`${label} performance`, ps?.note || 'Not requested for this audit.');
      if (!r.available) return unavailable(`${label} performance`, r.error, 'Set PAGESPEED_API_KEY on the server to enable Google PageSpeed Insights reliably.');
      const lab = r.lab;
      return `<div class="card card-pad"><div class="row"><h3>${label}</h3><span class="spacer"></span><span class="tag estimated">Google PageSpeed</span></div>
        <div class="row" style="margin-top:12px;align-items:flex-end;gap:16px"><div class="big-delta" style="color:${scoreColor(r.score)}">${r.score}</div><div class="small muted" style="padding-bottom:6px">Lighthouse performance score (lab)</div></div>
        <dl class="kv" style="margin-top:14px">${[['LCP', lab.lcp], ['FCP', lab.fcp], ['TBT', lab.tbt], ['CLS', lab.cls], ['Speed Index', lab.si]].map(([k, v]) => `<dt>${k}</dt><dd>${v?.display ?? '—'} ${v?.score != null ? `<span class="dot ${v.score >= 0.9 ? 'pass' : v.score >= 0.5 ? 'warning' : 'fail'}"></span>` : ''}</dd>`).join('')}
        <dt>Page weight</dt><dd>${fmtKb(r.totalByteWeight)}${r.requestCount ? ` · ${r.requestCount} requests` : ''}</dd></dl>
        ${r.field ? `<div style="margin-top:14px"><div class="eyebrow">Core Web Vitals · real users (${r.field.scope === 'url' ? 'this page' : 'whole origin'})</div><dl class="kv" style="margin-top:8px"><dt>Assessment</dt><dd><b>${esc(r.field.overall || '—')}</b></dd>${[['LCP', r.field.lcp, (v) => v + ' ms'], ['INP', r.field.inp, (v) => v + ' ms'], ['CLS', r.field.cls, (v) => (v / 100).toFixed(2)]].map(([k, v, f]) => `<dt>${k} (p75)</dt><dd>${v ? `${f(v.percentile)} · ${esc(v.category)}` : '—'}</dd>`).join('')}</dl></div>` : '<p class="small muted" style="margin-top:12px">Core Web Vitals could not be verified from the available data — Google has no real-user data for this URL or origin.</p>'}
        ${r.opportunities?.length ? `<div style="margin-top:14px"><div class="eyebrow">Biggest opportunities</div><ul class="evidence" style="margin-top:8px">${r.opportunities.map((o) => `<li>${esc(o.title)} — est. ${fmtMs(o.savingsMs)}</li>`).join('')}</ul></div>` : ''}
      </div>`;
    };
    return `${secHead(s, 'Server-side measurements from the audit, plus Google PageSpeed Insights when available.')}
      <div class="card card-pad"><div class="row"><h3>Measured by the audit</h3><span class="spacer"></span>${evTag('verified')}</div>
        <div class="stat-row" style="margin-top:14px">${stat(fmtMs(m.ttfbMs), 'Time to first byte')}${stat(fmtMs(m.totalMs), 'HTML download')}${stat(fmtKb(m.htmlBytes), 'HTML size')}${stat(m.resources.scripts + m.resources.inlineScripts, 'Scripts', `${m.resources.scripts} external`)}${stat(m.resources.stylesheets, 'Stylesheets')}${stat(m.resources.images, 'Images')}</div>
        <p class="tiny muted" style="margin-top:12px">${esc(m.source)}. Network distance between our server and yours affects timing.</p></div>
      <div class="two">${card(ps?.mobile, 'Mobile')}${card(ps?.desktop, 'Desktop')}</div>
      <div>${rows(checksFor(a, s), ctx)}</div>`;
  },

  mobile(a, ctx, s) {
    const h = a.evidence.pages[0];
    const vp = h.viewport;
    const ps = a.evidence.performance.pagespeed?.mobile;
    const ready = vp && /width\s*=\s*device-width/i.test(vp);
    return `${secHead(s, 'Mobile readiness from the HTML, plus Lighthouse mobile audits when PageSpeed data is available.')}
      <div class="stat-row">${stat(ready ? 'Ready' : vp ? 'Partial' : 'Not ready', 'Mobile readiness', 'From viewport configuration')}${stat(ps?.available ? ps.score : '—', 'Mobile PageSpeed', ps?.available ? 'Google Lighthouse' : 'Unavailable')}</div>
      <div class="card card-pad"><dl class="kv"><dt>Viewport</dt><dd class="mono">${esc(vp || 'Not set')}</dd><dt>Responsive</dt><dd>${ready ? 'Viewport is configured for device width. Visual responsiveness cannot be fully verified without rendering the page.' : 'Without width=device-width, mobile browsers render the desktop layout.'}</dd></dl></div>
      <div>${rows(checksFor(a, s), ctx)}</div>`;
  },

  security(a, ctx, s) {
    const sec = a.evidence.security;
    const c = sec.cert;
    return `${secHead(s, 'HTTPS and certificate configuration. This is a configuration check, not a penetration test.')}
      <div>${rows(checksFor(a, s), ctx)}</div>
      <div class="two">
        <div class="card card-pad"><h3>Certificate</h3>${c?.available ? `<dl class="kv" style="margin-top:12px"><dt>Status</dt><dd>${c.valid ? '<span class="pill pass">Trusted</span>' : `<span class="pill fail">Not trusted</span> ${esc(c.error || '')}`}</dd><dt>Issuer</dt><dd>${esc(c.issuer || '—')}</dd><dt>Subject</dt><dd>${esc(c.subject || '—')}</dd><dt>Valid until</dt><dd>${fmtDate(c.validTo)} · ${c.daysRemaining} days</dd><dt>Protocol</dt><dd>${esc(c.protocol || '—')}</dd><dt>Covers</dt><dd class="small">${esc((c.altNames || []).join(', '))}</dd></dl>` : `<p class="muted small" style="margin-top:8px">${esc(c?.error || 'Not checked.')}</p>`}</div>
        <div class="card card-pad"><h3>Security headers</h3><dl class="kv" style="margin-top:12px">${Object.entries(sec.headers || {}).map(([k, v]) => `<dt style="text-transform:none;letter-spacing:0" class="mono">${esc(k)}</dt><dd>${v ? `<span class="tick">✓</span> <span class="small mono">${esc(v)}</span>` : '<span class="muted small">Not set</span>'}</dd>`).join('')}</dl><p class="tiny muted" style="margin-top:10px">Headers other than HSTS are listed for information and are not scored.</p></div>
      </div>`;
  },

  analytics(a, ctx, s) {
    const an = a.evidence.analytics;
    return `${secHead(s, 'Tracking tags visible in the page source.')}
      <div class="stat-row">${stat(an.tools.length ? 'Detected' : 'Not detected', 'Analytics', an.tools.length ? '' : 'Unable to verify absence')}${stat(an.consentManager ? esc(an.consentManager) : '—', 'Consent manager')}</div>
      ${an.tools.length ? tbl(['Tool', 'Status', 'IDs', 'Evidence'], an.tools.map((t) => `<tr><td><b>${esc(t.name)}</b></td><td><span class="pill pass">Detected</span></td><td class="mono small">${esc((t.ids || []).join(', ') || '—')}</td><td class="mono small break">${esc(t.evidence)}</td></tr>`).join('')) : ''}
      ${an.note ? `<div class="banner info">${esc(an.note)}</div>` : ''}
      <div>${rows(checksFor(a, s), ctx)}</div>`;
  },

  social(a, ctx, s) {
    const h = a.evidence.pages[0];
    const profiles = (h.links || []).filter((l) => /(facebook\.com|instagram\.com|linkedin\.com|twitter\.com|x\.com|youtube\.com|pinterest\.|threads\.net|wa\.me|api\.whatsapp\.com)/i.test(l.url || ''));
    const uniq = [...new Map(profiles.map((p) => [p.url, p])).values()];
    return `${secHead(s, 'Open Graph and X metadata control how links look when shared on WhatsApp, LinkedIn, Facebook and X.')}
      <div>${rows(checksFor(a, s), ctx)}</div>
      <div class="two">
        <div class="card card-pad"><h3>Open Graph</h3>${Object.keys(h.og || {}).length ? `<dl class="kv" style="margin-top:12px">${Object.entries(h.og).map(([k, v]) => `<dt style="text-transform:none;letter-spacing:0" class="mono">${esc(k)}</dt><dd class="small">${esc(v)}</dd>`).join('')}</dl>` : '<p class="muted small" style="margin-top:8px">No Open Graph tags found.</p>'}
          ${h.og?.['og:image'] ? `<img src="${esc(h.og['og:image'])}" alt="og:image preview" referrerpolicy="no-referrer" loading="lazy" style="margin-top:12px;border-radius:8px;border:1px solid var(--line);max-height:180px;object-fit:cover;width:100%" onerror="this.remove()">` : ''}</div>
        <div class="card card-pad"><h3>X / Twitter</h3>${Object.keys(h.twitter || {}).length ? `<dl class="kv" style="margin-top:12px">${Object.entries(h.twitter).map(([k, v]) => `<dt style="text-transform:none;letter-spacing:0" class="mono">${esc(k)}</dt><dd class="small">${esc(v)}</dd>`).join('')}</dl>` : '<p class="muted small" style="margin-top:8px">No twitter: tags found.</p>'}</div>
      </div>
      <div class="card card-pad"><h3>Social profiles linked from the homepage</h3>${uniq.length ? `<ul class="evidence" style="margin-top:10px">${uniq.map((p) => `<li>${esc(p.url)}</li>`).join('')}</ul>` : '<p class="muted small" style="margin-top:8px">No links to social profiles detected on the homepage.</p>'}</div>`;
  },

  traffic(a, ctx, s) {
    const t = a.evidence.traffic;
    return `${secHead(s)}${t?.available ? `<div class="card card-pad"><pre class="raw">${esc(JSON.stringify(t.data, null, 2))}</pre><p class="tiny muted">Source: ${esc(t.source)}</p></div>` : unavailable('Traffic data unavailable.', t?.reason || 'No traffic data provider is connected.', 'We never estimate traffic. For first-party numbers, connect Google Search Console or GA4; for third-party estimates, an administrator can connect a provider in Settings.')}`;
  },

  backlinks(a, ctx, s) {
    const b = a.evidence.backlinks;
    if (!b?.available) return `${secHead(s)}${unavailable('Backlink data requires a connected backlink data provider.', b?.reason || '', 'Backlinks are never estimated. Configure BACKLINK_PROVIDER (e.g. DataForSEO) on the server to enable this section.')}`;
    const d = b.data;
    return `${secHead(s, `Source: ${esc(b.source)} · retrieved ${fmtDate(b.fetchedAt, true)}`)}
      <div class="stat-row">${stat(fmtNum(d.backlinks), 'Backlinks')}${stat(fmtNum(d.referringDomains), 'Referring domains')}${stat(fmtNum(d.referringMainDomains), 'Referring main domains')}${stat(fmtNum(d.brokenBacklinks), 'Broken backlinks')}${stat(fmtNum(d.rank), 'Provider rank', d.rankNote)}</div>`;
  },

  internal(a, ctx, s) {
    const h = a.evidence.pages[0];
    const links = (h.links || []).filter((l) => l.type === 'internal');
    const status = new Map((a.evidence.links.checked || []).map((l) => [l.url, l]));
    const inlinks = new Map();
    for (const p of a.evidence.pages) for (const l of p.links || []) if (l.type === 'internal') inlinks.set(l.url, (inlinks.get(l.url) || 0) + 1);
    const top = [...inlinks.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12);
    return `${secHead(s, 'Links from the homepage to other pages on the same site.')}
      <div class="stat-row">${stat(links.length, 'Internal links')}${stat(new Set(links.map((l) => l.url)).size, 'Unique targets')}${stat(links.filter((l) => l.nofollow).length, 'Nofollow')}${stat((h.links || []).filter((l) => l.type === 'in-page').length, 'In-page anchors')}</div>
      <div>${rows(checksFor(a, s), ctx)}</div>
      ${a.evidence.pages.length > 1 ? `<div><h3 style="margin-bottom:10px">Most linked pages <span class="muted small">(across ${a.evidence.pages.length} crawled pages)</span></h3>${tbl(['Page', '#Links in'], top.map(([u, n]) => `<tr><td class="mono small break">${esc(pathOf(u))}</td><td class="num">${n}</td></tr>`).join(''))}</div>` : ''}
      <div><h3 style="margin-bottom:10px">Homepage internal links</h3>${tbl(['URL', 'Anchor text', 'Status', 'Rel'], links.slice(0, 250).map((l) => { const st = status.get(l.url); return `<tr><td class="mono small break">${esc(pathOf(l.url))}</td><td class="small">${l.anchor ? esc(l.anchor) : '<span class="pill warning">No text</span>'}</td><td>${st?.status ? `<span class="pill ${st.status < 400 ? 'pass' : 'fail'} plain">${st.status}</span>` : '<span class="muted small">Not checked</span>'}</td><td class="small">${l.nofollow ? 'nofollow' : ''}</td></tr>`; }).join(''))}</div>`;
  },

  external(a, ctx, s) {
    const h = a.evidence.pages[0];
    const links = (h.links || []).filter((l) => l.type === 'external');
    const status = new Map((a.evidence.links.checked || []).map((l) => [l.url, l]));
    return `${secHead(s, 'Outbound links from the homepage, with status where checked.')}
      <div class="stat-row">${stat(links.length, 'External links')}${stat(new Set(links.map((l) => hostOf(l.url))).size, 'Domains')}${stat(links.filter((l) => l.nofollow).length, 'Nofollow / sponsored / UGC')}${stat(links.filter((l) => l.newTab).length, 'Open in new tab')}</div>
      <div>${rows(checksFor(a, s), ctx)}</div>
      ${links.length ? tbl(['URL', 'Anchor text', 'Status', 'Rel'], links.slice(0, 250).map((l) => { const st = status.get(l.url); return `<tr><td class="mono small break">${esc(l.url)}</td><td class="small">${esc(l.anchor || '—')}</td><td>${st?.status ? `<span class="pill ${st.status < 400 ? 'pass' : [401, 403, 429, 999].includes(st.status) ? 'info' : 'fail'} plain">${st.status}</span>` : st?.error ? `<span class="pill unavailable plain" title="${esc(st.error)}">No response</span>` : '<span class="muted small">Not checked</span>'}</td><td class="small">${esc(l.rel || '')}</td></tr>`; }).join('')) : '<div class="card empty"><p>No external links on the homepage.</p></div>'}`;
  },

  tech(a, ctx, s) {
    const t = a.evidence.technologies;
    return `${secHead(s, esc(t.note))}
      ${t.detected.length ? tbl(['Technology', 'Category', 'Confidence', 'Evidence'], t.detected.map((x) => `<tr><td><b>${esc(x.name)}</b>${x.version ? ` <span class="muted small">${esc(x.version)}</span>` : ''}</td><td class="small">${esc(x.category)}</td><td>${evTag(x.confidence)}</td><td class="mono small break">${esc(x.evidence)}</td></tr>`).join('')) : '<div class="card empty"><h3>Nothing detected</h3><p>None of our signatures matched. The technology stack is unknown, not absent.</p></div>'}
      <p class="tiny muted">${t.checkedSignatures} technology signatures checked. Anything not listed is <b>unknown</b> rather than confirmed absent.</p>`;
  },

  local(a, ctx, s) {
    return `${secHead(s, `Local signals for ${esc(a.input.city || a.input.location)}.`)}<div>${rows(checksFor(a, s), ctx)}</div>`;
  },
};

export function renderDashboard(el, a, opts) {
  const { section = 'overview', base, branding, isSample = false, actions = '' } = opts;
  const visible = SECTIONS.filter((s) => s.grp || !s.when || s.when(a));
  const sec = visible.find((s) => s.id === section) || visible[1];
  const doneKey = `c2c-done-${a.id}`;
  let doneSet;
  try { doneSet = new Set(JSON.parse(localStorage.getItem(doneKey) || '[]')); } catch { doneSet = new Set(); }
  const ctx = {
    base,
    state: (el._state ||= {}),
    issueById: new Map(a.issues.map((i) => [i.id, i])),
    aiNotes: new Map((a.interpretation?.ai?.issueNotes || []).map((n) => [n.issueId, n])),
    doneSet,
  };
  const navStatus = (s) => {
    if (s.count) return `<span class="n">${s.count(a)}</span>`;
    const st = (s.cats || s.ids) && worst(checksFor(a, s));
    return st ? `<span class="dot ${st}"></span>` : '';
  };

  const draw = () => {
    const wa = whatsappLink(branding, `Hi, I ran an SEO audit for ${hostOf(a.website)} (score ${a.score.overall}/100). I'd like help fixing the issues.`);
    el.innerHTML = `
      <div class="page-head">
        <div style="min-width:0"><div class="eyebrow">Audit report</div><h1 class="break">${esc(hostOf(a.website))}</h1></div>
        <span class="spacer"></span>
        <div class="row wrap-row">${actions}</div>
      </div>
      <div class="dash">
        <aside class="side">${visible.map((s) => (s.grp ? `<div class="grp">${s.grp}</div>` : `<a href="${base}/${s.id}" class="${s.id === sec.id ? 'on' : ''}">${s.k ? `<span class="k">${s.k}</span>` : '<span class="k"></span>'}${esc(s.label)}${navStatus(s)}</a>`)).join('')}</aside>
        <div style="min-width:0">
          <select class="input side-select" aria-label="Section">${visible.filter((s) => !s.grp).map((s) => `<option value="${s.id}" ${s.id === sec.id ? 'selected' : ''}>${s.k ? s.k + ' · ' : ''}${esc(s.label)}</option>`).join('')}</select>
          <div class="blocks">${R[sec.id](a, ctx, sec)}
            <div class="lead-band no-print" style="margin-top:12px">
              <div><h3>Want Us to Fix These Issues for You?</h3><p>Your SEO audit identifies the problems. Our SEO team can help you implement the solutions.</p></div>
              <div class="row wrap-row"><button class="btn accent" data-lead="seo_implementation">Get SEO Implementation Support</button>${wa ? `<a class="btn ghost" href="${wa}" target="_blank" rel="noopener">${ICON.whatsapp} Talk to Click2Client Media</a>` : ''}</div>
            </div>
          </div>
        </div>
      </div>`;
  };
  draw();

  el.onclick = (e) => {
    const t = e.target.closest('button, [data-img], input[data-done]');
    if (!t) return;
    const st = ctx.state;
    if (t.dataset.toggleIssue !== undefined) {
      const card = t.closest('.issue');
      const more = card.querySelector('.issue-more');
      more.classList.toggle('hidden');
      t.textContent = more.classList.contains('hidden') ? 'Show details →' : 'Hide details';
      return;
    }
    if (t.dataset.done) {
      t.checked ? doneSet.add(t.dataset.done) : doneSet.delete(t.dataset.done);
      try { localStorage.setItem(doneKey, JSON.stringify([...doneSet])); } catch {}
      return;
    }
    if (t.dataset.lead) return openLeadForm({ branding, auditId: isSample ? '' : a.id, website: a.website, intent: t.dataset.lead, score: a.score.overall });
    if (t.dataset.img) {
      const i = a.evidence.pages[0].images[Number(t.dataset.img)];
      modal(`<div class="modal-head"><h3 class="break">${esc(i.filename || 'Image')}</h3><span class="spacer"></span><button class="btn quiet sm" data-close>✕</button></div>
        <div class="modal-body"><img src="${esc(i.src)}" alt="" referrerpolicy="no-referrer" style="max-height:220px;border-radius:8px;border:1px solid var(--line);margin-bottom:14px" onerror="this.remove()">
        <dl class="kv"><dt>Image URL</dt><dd class="mono small">${esc(i.src)}</dd><dt>ALT</dt><dd>${i.alt === null ? '<span class="pill fail">Missing</span>' : i.alt === '' ? '<span class="pill info">Empty (decorative)</span>' : esc(i.alt)}</dd><dt>Filename</dt><dd>${esc(i.filename)}</dd><dt>Dimensions</dt><dd>${i.width && i.height ? `${esc(i.width)} × ${esc(i.height)}` : 'Not declared'}</dd><dt>Loading</dt><dd>${esc(i.loading || 'eager (default)')}</dd><dt>Context</dt><dd class="small">${esc(i.context || '—')}${i.inLink ? `<br>Linked to ${esc(i.inLink)}` : ''}</dd>
        <dt>Recommendation</dt><dd class="small">${i.alt === null ? 'Add ALT text that describes what the image shows and why it is there. If purely decorative, add alt="".' : /^(img|dsc|image|photo|screenshot|whatsapp)/i.test(i.filename || '') ? 'Consider a descriptive filename for future uploads.' : 'No change needed.'}</dd></dl></div>`);
      return;
    }
    const map = { filterIssues: 'issueFilter', planGroup: 'planGroup', hlevel: 'hLevel', imgFilter: 'imgFilter', urlFilter: 'urlFilter' };
    for (const [k, v] of Object.entries(map)) if (t.dataset[k]) { st[v] = t.dataset[k]; draw(); return; }
  };
  el.onchange = (e) => {
    if (e.target.classList.contains('side-select')) location.hash = `${base}/${e.target.value}`.replace(/^#?/, '#');
  };
}
