// /seo-tools/<tool>: submits the form to /api/tools/<tool> and renders the result.
import { api, esc, track, fmtNum } from './common.js';

let publicConfigPromise;
const getPublicConfig = () => (publicConfigPromise ||= api('/public/config').catch(() => null));

const form = document.getElementById('toolForm');
const out = document.getElementById('toolOut');
const box = document.getElementById('toolResult');
const err = document.getElementById('toolErr');
const slug = form.dataset.tool;

const ICON = { pass: '✓', warn: '!', fail: '✕', info: 'i' };

const ring = (n) => {
  const grade = n >= 80 ? 'good' : n >= 50 ? 'ok' : 'bad';
  return `<div class="tl-score s-${grade}" style="--p:${n}" aria-label="Score: ${n} out of 100"><b>${n}</b><span>/100</span></div>`;
};

function renderHeader(r) {
  const hasScore = r.scoreAvailable && r.score != null;
  const statusKey = r.status || (r.counts ? (r.counts.critical > 0 ? 'fail' : r.counts.warning > 0 ? 'warn' : 'pass') : 'info');
  const statusBadge = {
    pass: '<span class="tl-status-badge b-pass">PASSED</span>',
    warn: '<span class="tl-status-badge b-warn">NEEDS ATTENTION</span>',
    fail: '<span class="tl-status-badge b-fail">CRITICAL ISSUES</span>',
    info: '<span class="tl-status-badge b-info">COMPLETED</span>',
  }[statusKey] || '';

  const scoreBlock = hasScore
    ? ring(r.score)
    : `<div class="tl-diag-badge" aria-label="Diagnostic Analysis Complete">
         <span class="tl-diag-icon" aria-hidden="true">⚡</span>
         <small>Analysis Mode</small>
         <b>Diagnostic</b>
       </div>`;

  return `
    <header class="tl-res-head">
      ${scoreBlock}
      <div class="tl-res-head-body">
        <div class="tl-res-eyebrow-row">
          <span class="eyebrow">Audit Results</span>
          ${statusBadge}
        </div>
        <h2>${esc(r.tool || 'SEO Analysis')}</h2>
        ${r.url ? `
          <div class="tl-res-url-wrap">
            <span class="tl-res-url-label">Analyzed URL:</span>
            <a href="${esc(r.url)}" class="tl-res-url" target="_blank" rel="noopener noreferrer" title="Open target website in new tab">${esc(r.url)} <span class="tl-ext-icon" aria-hidden="true">↗</span></a>
          </div>
        ` : ''}
        ${r.summary ? `<p class="tl-res-summary">${esc(r.summary)}</p>` : ''}
      </div>
    </header>
  `;
}

function renderMetrics(r) {
  const c = r.counts || { critical: 0, warning: 0, pass: 0, info: 0 };
  const cards = [];

  cards.push(`
    <div class="tl-metric-card m-crit">
      <div class="tl-metric-icon">✕</div>
      <div>
        <b class="tl-metric-num">${c.critical}</b>
        <span class="tl-metric-lbl">Critical Issues</span>
      </div>
    </div>
    <div class="tl-metric-card m-warn">
      <div class="tl-metric-icon">!</div>
      <div>
        <b class="tl-metric-num">${c.warning}</b>
        <span class="tl-metric-lbl">Warnings</span>
      </div>
    </div>
    <div class="tl-metric-card m-pass">
      <div class="tl-metric-icon">✓</div>
      <div>
        <b class="tl-metric-num">${c.pass}</b>
        <span class="tl-metric-lbl">Passed Checks</span>
      </div>
    </div>
    <div class="tl-metric-card m-info">
      <div class="tl-metric-icon">i</div>
      <div>
        <b class="tl-metric-num">${c.info}</b>
        <span class="tl-metric-lbl">Informational</span>
      </div>
    </div>
  `);

  if (r.totalDiscovered != null) {
    cards.push(`
      <div class="tl-metric-card m-tool">
        <div class="tl-metric-icon">🔗</div>
        <div>
          <b class="tl-metric-num">${fmtNum(r.totalDiscovered)}</b>
          <span class="tl-metric-lbl">Links Found</span>
        </div>
      </div>
    `);
  }
  if (r.checked != null) {
    cards.push(`
      <div class="tl-metric-card m-tool">
        <div class="tl-metric-icon">🔎</div>
        <div>
          <b class="tl-metric-num">${fmtNum(r.checked)}</b>
          <span class="tl-metric-lbl">Links Audited</span>
        </div>
      </div>
    `);
  }
  if (r.engine?.counts?.totalWords != null) {
    cards.push(`
      <div class="tl-metric-card m-tool">
        <div class="tl-metric-icon">📝</div>
        <div>
          <b class="tl-metric-num">${fmtNum(r.engine.counts.totalWords)}</b>
          <span class="tl-metric-lbl">Total Words</span>
        </div>
      </div>
    `);
  }

  return `<div class="tl-metrics-grid" role="region" aria-label="Summary Metrics">${cards.join('')}</div>`;
}

function renderSummaryBar(counts) {
  const c = counts || { critical: 0, warning: 0, pass: 0, info: 0 };
  const total = (c.critical || 0) + (c.warning || 0) + (c.pass || 0) + (c.info || 0);
  if (total === 0) return '';

  const pctCrit = ((c.critical || 0) / total * 100).toFixed(1);
  const pctWarn = ((c.warning || 0) / total * 100).toFixed(1);
  const pctPass = ((c.pass || 0) / total * 100).toFixed(1);
  const pctInfo = ((c.info || 0) / total * 100).toFixed(1);

  return `
    <div class="tl-summary-bar-wrap">
      <div class="tl-summary-bar" role="progressbar" aria-label="Issue Breakdown: ${c.critical} critical, ${c.warning} warnings, ${c.pass} passed, ${c.info} info" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${c.pass}">
        ${c.critical > 0 ? `<div class="tl-seg seg-crit" style="width:${pctCrit}%" title="${c.critical} Critical"></div>` : ''}
        ${c.warning > 0 ? `<div class="tl-seg seg-warn" style="width:${pctWarn}%" title="${c.warning} Warnings"></div>` : ''}
        ${c.pass > 0 ? `<div class="tl-seg seg-pass" style="width:${pctPass}%" title="${c.pass} Passed"></div>` : ''}
        ${c.info > 0 ? `<div class="tl-seg seg-info" style="width:${pctInfo}%" title="${c.info} Info"></div>` : ''}
      </div>
      <div class="tl-summary-chips" aria-hidden="true">
        <span class="tl-chip chip-crit"><i class="tl-dot-crit"></i> <b>${c.critical}</b> Critical</span>
        <span class="tl-chip chip-warn"><i class="tl-dot-warn"></i> <b>${c.warning}</b> Warnings</span>
        <span class="tl-chip chip-pass"><i class="tl-dot-pass"></i> <b>${c.pass}</b> Passed</span>
        <span class="tl-chip chip-info"><i class="tl-dot-info"></i> <b>${c.info}</b> Info</span>
      </div>
    </div>
  `;
}

// ── Tool-Specific Renderers ────────────────────────────────────────────────

function toolWebsiteSeoChecker(r) {
  const issues = (r.checks || []).filter((c) => c.status === 'fail' || c.status === 'warn');
  if (issues.length === 0) return '';
  return `
    <div class="tl-priority-panel" role="region" aria-label="Priority Fixes">
      <div class="tl-priority-head">
        <h3 class="tl-priority-title"><span>⚠️</span> Priority Action Items</h3>
        <span class="tl-priority-badge">${issues.length} items to address</span>
      </div>
      <ul class="tl-priority-list">
        ${issues.slice(0, 5).map((c) => `
          <li class="tl-priority-item">
            <b>${c.status === 'fail' ? '🔴' : '🟡'} ${esc(c.label)}</b>
            <p>${esc(c.recommendation || c.detail)}</p>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function toolSeoScoreChecker(r) {
  const sc = r.score != null ? r.score : 0;
  return `
    <div class="tl-score-panel" role="region" aria-label="Health Score Breakdown">
      <h3>Technical &amp; On-Page SEO Health Score</h3>
      <p>This score evaluates technical compliance across essential metadata, heading hierarchy, asset accessibility, and crawlability rules. It reflects technical website quality rather than search engine rank position.</p>
      <div class="tl-score-scale">
        <div class="tl-scale-item scale-good ${sc >= 80 ? 'active' : ''}">
          <b>80 – 100</b>
          <span>Healthy (Optimal)</span>
        </div>
        <div class="tl-scale-item scale-ok ${sc >= 50 && sc < 80 ? 'active' : ''}">
          <b>50 – 79</b>
          <span>Needs Attention</span>
        </div>
        <div class="tl-scale-item scale-bad ${sc < 50 ? 'active' : ''}">
          <b>0 – 49</b>
          <span>Critical Deficiencies</span>
        </div>
      </div>
    </div>
  `;
}

function toolMetaAnalyzer(r) {
  const title = String(r.serp?.title || '');
  const desc = String(r.serp?.description || '');
  const tLen = title.length;
  const dLen = desc.length;
  return `
    <div class="tl-meta-panel" role="region" aria-label="Meta Tags Inspector">
      <div class="tl-meta-card">
        <div class="tl-meta-card-head">
          <span class="tl-meta-card-title">&lt;title&gt; Tag</span>
          <span class="tl-meta-count">${tLen} chars</span>
        </div>
        <div class="tl-meta-content">${esc(title || '(No title tag found)')}</div>
        <div class="tl-meta-ideal">Recommended length: 50–60 characters</div>
      </div>
      <div class="tl-meta-card">
        <div class="tl-meta-card-head">
          <span class="tl-meta-card-title">&lt;meta description&gt;</span>
          <span class="tl-meta-count">${dLen} chars</span>
        </div>
        <div class="tl-meta-content">${esc(desc || '(No meta description tag found)')}</div>
        <div class="tl-meta-ideal">Recommended length: 120–160 characters</div>
      </div>
    </div>
  `;
}

function toolMetaGenerator() {
  return `
    <div class="tl-guide-box" role="region" aria-label="Implementation Guide">
      <b>How to use these generated tags:</b>
      <ol>
        <li>Click <strong>Copy Code</strong> in the snippet box below.</li>
        <li>Open your HTML template or CMS header settings.</li>
        <li>Paste the tags directly inside the <code>&lt;head&gt;</code> section of your page.</li>
      </ol>
    </div>
  `;
}

function toolHeadingChecker(r) {
  const tree = r.tree || [];
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  tree.forEach((h) => { if (counts[h.level] != null) counts[h.level]++; });
  const h1Alert = counts[1] === 0 ? 'alert' : counts[1] > 1 ? 'alert' : '';
  const h1Text = counts[1] === 0 ? 'H1: 0 (Missing)' : counts[1] > 1 ? `H1: ${counts[1]} (Multiple)` : 'H1: 1 (Optimal)';
  return `
    <div class="tl-heading-bar" role="region" aria-label="Heading Hierarchy Breakdown">
      <span class="tl-heading-chip ${h1Alert}"><b>${h1Text}</b></span>
      <span class="tl-heading-chip">H2: <b>${counts[2]}</b></span>
      <span class="tl-heading-chip">H3: <b>${counts[3]}</b></span>
      <span class="tl-heading-chip">H4+: <b>${counts[4] + counts[5] + counts[6]}</b></span>
      <span class="tl-heading-chip">Total Headings: <b>${tree.length}</b></span>
    </div>
  `;
}

function toolKeywordDensity(r) {
  const e = r.engine || {};
  const total = e.totalWords || 0;
  const unique = e.uniqueWords || 0;
  const richness = total > 0 ? ((unique / total) * 100).toFixed(1) + '%' : '—';
  return `
    <div class="tl-vocab-grid" role="region" aria-label="Vocabulary Breakdown">
      <div class="tl-vocab-card">
        <b>${fmtNum(total)}</b>
        <span>Total Word Count</span>
      </div>
      <div class="tl-vocab-card">
        <b>${fmtNum(unique)}</b>
        <span>Unique Words</span>
      </div>
      <div class="tl-vocab-card">
        <b>${richness}</b>
        <span>Lexical Diversity</span>
      </div>
      ${e.possibleStuffingCount > 0 ? `
        <div class="tl-vocab-card" style="border-left: 3px solid var(--fail);">
          <b style="color: var(--fail);">${e.possibleStuffingCount}</b>
          <span>Phrases &gt; 4% Density</span>
        </div>
      ` : ''}
    </div>
  `;
}

function toolImageAltChecker(r) {
  const rows = r.tables?.[0]?.rows || [];
  const missing = rows.filter((r) => r[2] === 'fail').length;
  const good = rows.filter((r) => r[2] === 'pass').length;
  return `
    <div class="tl-heading-bar" role="region" aria-label="Image ALT Breakdown">
      <span class="tl-heading-chip">Total Images: <b>${rows.length}</b></span>
      <span class="tl-heading-chip" style="color: var(--pass);">Descriptive ALT: <b>${good}</b></span>
      ${missing > 0 ? `<span class="tl-heading-chip alert">Missing ALT: <b>${missing}</b></span>` : `<span class="tl-heading-chip" style="color: var(--pass);">All ALT Present ✓</span>`}
      ${missing > 0 ? `<button type="button" class="tl-btn-filter" id="btnFilterMissingAlt">Show Missing ALT Only</button>` : ''}
    </div>
  `;
}

function toolCanonicalChecker(r) {
  const canonCheck = (r.checks || []).find((c) => c.label === 'Canonical URL' || c.label === 'Canonical target');
  const canonVal = canonCheck?.detail || '—';
  const isMatch = canonCheck?.status === 'pass';
  return `
    <div class="tl-canon-card" role="region" aria-label="Canonical URL Inspection">
      <div class="tl-canon-row">
        <span class="tl-canon-lbl">Analyzed URL:</span>
        <span class="tl-canon-val">${esc(r.url || '—')}</span>
      </div>
      <div class="tl-canon-row">
        <span class="tl-canon-lbl">Canonical Tag:</span>
        <span class="tl-canon-val">${esc(canonVal)}</span>
      </div>
      <div class="tl-canon-row">
        <span class="tl-canon-lbl">Resolution:</span>
        <span class="tl-canon-val">${isMatch ? '✓ Canonical tag correctly targets this page' : 'ℹ Alternate or cross-domain canonical specified'}</span>
      </div>
    </div>
  `;
}

function toolRobotsChecker(r) {
  const checks = r.checks || [];
  const g = checks.find((c) => c.label && c.label.includes('Googlebot'));
  const b = checks.find((c) => c.label && c.label.includes('Bingbot'));
  const a = checks.find((c) => c.label && c.label.includes('All crawlers'));
  return `
    <div class="tl-agents-grid" role="region" aria-label="Crawler Access Permissions">
      <div class="tl-agent-card ${g?.status === 'fail' ? 'blocked' : 'allowed'}">
        <b>Googlebot</b>
        <span>${g?.status === 'fail' ? 'Blocked' : 'Allowed'}</span>
      </div>
      <div class="tl-agent-card ${b?.status === 'fail' ? 'blocked' : 'allowed'}">
        <b>Bingbot</b>
        <span>${b?.status === 'fail' ? 'Blocked' : 'Allowed'}</span>
      </div>
      <div class="tl-agent-card ${a?.status === 'fail' ? 'blocked' : 'allowed'}">
        <b>All Crawlers (*)</b>
        <span>${a?.status === 'fail' ? 'Blocked' : 'Allowed'}</span>
      </div>
    </div>
  `;
}

function toolSitemapChecker(r) {
  const smCheck = (r.checks || []).find((c) => c.label === 'XML sitemap');
  const found = smCheck?.status === 'pass';
  const smUrl = smCheck?.detail || 'No sitemap found';
  return `
    <div class="tl-sitemap-banner" role="region" aria-label="Sitemap Discovery Status">
      <div class="tl-sitemap-icon">${found ? '🗺️' : '⚠️'}</div>
      <div>
        <b>${found ? 'XML Sitemap Successfully Detected' : 'XML Sitemap Missing'}</b>
        <p style="margin:2px 0 0;font-size:13.5px;color:var(--ink-3);">${esc(smUrl)}</p>
      </div>
    </div>
  `;
}

function toolSchemaValidator(r) {
  const jsonLdCheck = (r.checks || []).find((c) => c.label && c.label.includes('JSON-LD'));
  const typesText = jsonLdCheck?.detail || '';
  const types = typesText.includes('type(s):') ? typesText.split('type(s):')[1].split(',').map((s) => s.trim()) : [];
  return `
    <div class="tl-score-panel" role="region" aria-label="Schema Markup Analysis">
      <h3>Schema Markup Analysis &amp; Validation</h3>
      <p>Validates syntactic correctness and lists schema types recognized on this page. Note: Google Rich Results preview requires testing via Google's official Rich Results Test.</p>
      ${types.length > 0 ? `
        <div class="tl-schema-tags">
          ${types.map((t) => `<span class="tl-schema-tag">@type: ${esc(t)}</span>`).join('')}
        </div>
      ` : '<p style="margin:0;font-size:13px;color:var(--ink-4);">No JSON-LD schema objects detected.</p>'}
    </div>
  `;
}

function toolOpenGraphChecker(r) {
  const og = r.og || {};
  return `
    <div class="tl-heading-bar" role="region" aria-label="Open Graph Summary">
      <span class="tl-heading-chip">Title: <b>${og.title ? 'Set ✓' : 'Missing ✕'}</b></span>
      <span class="tl-heading-chip">Image: <b>${og.image ? 'Set ✓' : 'Missing ✕'}</b></span>
      <span class="tl-heading-chip">Description: <b>${og.description ? 'Set ✓' : 'Missing ✕'}</b></span>
    </div>
  `;
}

function toolInternalLinkChecker(r) {
  const rows = r.tables?.[0]?.rows || [];
  const uniqueUrls = new Set(rows.map((r) => r[1])).size;
  return `
    <div class="tl-heading-bar" role="region" aria-label="Internal Link Statistics">
      <span class="tl-heading-chip">Total Internal Links: <b>${rows.length}</b></span>
      <span class="tl-heading-chip">Unique Destinations: <b>${uniqueUrls}</b></span>
    </div>
  `;
}

function toolBrokenLinkChecker(r) {
  const rows = r.tables?.[0]?.rows || [];
  const brokenRows = rows.filter((r) => r[1] === 'Error' || Number(r[1]) >= 400);
  const isLimited = Boolean(r.limited);
  return `
    <div class="tl-score-panel" role="region" aria-label="Scan Coverage">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <h3 style="margin:0 0 4px;">Link Verification Results</h3>
          <p style="margin:0;">Checked <strong>${r.checked || rows.length}</strong> links on this page. ${isLimited ? `(Found ${r.totalDiscovered} total — scan limited to 30 for performance)` : ''}</p>
        </div>
        ${brokenRows.length > 0 ? `<button type="button" class="tl-btn-filter" id="btnFilterBroken">Show Broken Only (${brokenRows.length})</button>` : `<span class="tl-status-badge b-pass">All Checked Links Working ✓</span>`}
      </div>
    </div>
  `;
}

function toolRedirectChecker(r) {
  const rows = r.tables?.[0]?.rows || [];
  if (rows.length <= 1) return '';
  return `
    <div class="tl-hops-timeline" role="region" aria-label="Redirection Path Chain">
      <h3 style="font:700 16px var(--display);color:var(--ink);margin:0 0 12px;">Redirection Chain (${rows.length - 1} hop${rows.length > 2 ? 's' : ''})</h3>
      ${rows.map((row, i) => {
        const u = row[0];
        const st = row[1];
        const next = row[2];
        const isFinal = i === rows.length - 1;
        const badgeCls = st === '200' ? 'b-200' : st === '301' || st === '302' ? 'b-301' : 'b-err';
        return `
          <div class="tl-hop-step">
            <span class="tl-hop-badge ${badgeCls}">HTTP ${esc(st)}</span>
            <div style="flex:1;min-width:0;">
              <span style="font-family:var(--mono);word-break:break-all;">${esc(u)}</span>
              ${!isFinal && next ? `<div style="font-size:12px;color:var(--ink-4);margin-top:2px;">↳ Redirects to ${esc(next)}</div>` : ''}
            </div>
          </div>
          ${!isFinal ? '<div class="tl-hop-arrow">↓</div>' : ''}
        `;
      }).join('')}
    </div>
  `;
}

function renderToolSpecific(toolSlug, r) {
  switch (toolSlug) {
    case 'website-seo-checker': return toolWebsiteSeoChecker(r);
    case 'seo-score-checker': return toolSeoScoreChecker(r);
    case 'meta-analyzer': return toolMetaAnalyzer(r);
    case 'meta-generator': return toolMetaGenerator(r);
    case 'heading-checker': return toolHeadingChecker(r);
    case 'keyword-density': return toolKeywordDensity(r);
    case 'image-alt-checker': return toolImageAltChecker(r);
    case 'canonical-checker': return toolCanonicalChecker(r);
    case 'robots-checker': return toolRobotsChecker(r);
    case 'sitemap-checker': return toolSitemapChecker(r);
    case 'schema-validator': return toolSchemaValidator(r);
    case 'open-graph-checker': return toolOpenGraphChecker(r);
    case 'internal-link-checker': return toolInternalLinkChecker(r);
    case 'broken-link-checker': return toolBrokenLinkChecker(r);
    case 'redirect-checker': return toolRedirectChecker(r);
    default: return '';
  }
}

// ── Stage 4: Conversion & Lead Generation CTA ─────────────────────────────

function getCtaCopy(toolSlug, r) {
  const counts = r.counts || { critical: 0, warning: 0, pass: 0, info: 0 };
  const hasCrit = counts.critical > 0;
  const hasWarn = counts.warning > 0;
  const lowScore = r.score != null && r.score < 60;

  const toolContexts = {
    'website-seo-checker': {
      title: 'Want to check your entire website?',
      desc: 'This tool evaluated your current page. A full SEO audit crawls up to 50 pages to uncover site-wide technical bottlenecks, broken links, and metadata gaps.',
    },
    'seo-score-checker': {
      title: 'Want to benchmark your entire website?',
      desc: 'Your on-page health score represents this single URL. Run a comprehensive website audit to calculate an overall health score across all key pages.',
    },
    'meta-analyzer': {
      title: 'Metadata is just the beginning of your SEO.',
      desc: 'Proper titles and descriptions help searchers click. A full multi-page audit ensures every page on your site has unique, non-duplicate meta tags.',
    },
    'meta-generator': {
      title: 'Implemented your tags? Audit your complete site.',
      desc: 'Now that you have optimized tags, verify how search engines see the rest of your website with a comprehensive multi-page audit.',
    },
    'heading-checker': {
      title: 'Audit content structure across your whole site.',
      desc: 'Heading hierarchy is essential for search engines and accessibility. Discover heading issues, missing H1s, and structure flaws across all pages.',
    },
    'keyword-density': {
      title: 'Turn keyword analysis into a complete ranking strategy.',
      desc: 'Keyword placement is one piece of the puzzle. A full SEO audit evaluates content depth, internal linking, and technical architecture together.',
    },
    'image-alt-checker': {
      title: 'Improve image SEO and accessibility sitewide.',
      desc: 'Missing ALT text hurts accessibility and image search rankings. Audit every image asset across your entire website with a full scan.',
    },
    'canonical-checker': {
      title: 'Prevent duplicate content penalties across all pages.',
      desc: 'Canonical tag inconsistencies across multiple URLs confuse search engines. Audit all pages to ensure canonicals resolve correctly.',
    },
    'robots-checker': {
      title: 'Ensure search engines crawl what matters most.',
      desc: 'Your robots.txt rules dictate crawler access. A full SEO audit tests crawl paths, indexability, and blocked resources across your website.',
    },
    'sitemap-checker': {
      title: 'Verify indexation for every page in your sitemap.',
      desc: 'Having a sitemap is only step one. A full audit verifies that every URL in your sitemap is indexable, canonical, and returning 200 OK.',
    },
    'schema-validator': {
      title: 'Scale rich structured data across your website.',
      desc: 'Structured data boosts search visibility and click-through rates. Audit schema markup implementation and rich result opportunities across all pages.',
    },
    'open-graph-checker': {
      title: 'Maximize social engagement for every page you share.',
      desc: 'Social preview cards drive referral traffic from Facebook, LinkedIn, and X. Check metadata and social share cards across your entire site.',
    },
    'internal-link-checker': {
      title: 'Strengthen internal linking and PageRank distribution.',
      desc: 'Strategic internal links guide crawlers and visitors to your high-value pages. Audit site architecture and find orphan pages.',
    },
    'broken-link-checker': {
      title: 'Eliminate dead links and 404 errors across your site.',
      desc: 'Broken links frustrate users and waste crawl budget. A full SEO audit crawls your entire site to identify every broken link and redirect chain.',
    },
    'redirect-checker': {
      title: 'Optimize redirect paths and preserve link equity.',
      desc: 'Chained redirects slow page loads and bleed link equity. Run a complete audit to streamline redirects across your domain.',
    },
  };

  const specific = toolContexts[toolSlug] || {
    title: 'Ready for a complete website SEO audit?',
    desc: 'Go beyond this single-page check with a complete multi-page audit from Click2Client Media.',
  };

  let eyebrow = 'NEXT STEP FOR YOUR WEBSITE';
  if (hasCrit) {
    eyebrow = `ATTENTION: ${counts.critical} CRITICAL ISSUE${counts.critical > 1 ? 'S' : ''} DETECTED`;
  } else if (hasWarn) {
    eyebrow = `OPPORTUNITY: ${counts.warning} AREA${counts.warning > 1 ? 'S' : ''} TO OPTIMIZE`;
  } else if (lowScore) {
    eyebrow = 'HEALTH SCORE INDICATES IMPROVEMENT NEEDED';
  } else {
    eyebrow = 'EXPAND YOUR ANALYSIS SITEWIDE';
  }

  return {
    eyebrow,
    title: specific.title,
    desc: specific.desc,
  };
}

function renderConversionCta(toolSlug, r, waHref) {
  const copy = getCtaCopy(toolSlug, r);
  const auditHref = r.url
    ? `/seo-audit?url=${encodeURIComponent(r.url)}#free-audit`
    : '/seo-audit#free-audit';

  return `
    <section class="tl-conversion-card" role="region" aria-label="Next Steps and Audit CTA">
      <div class="tl-cta-content">
        <span class="tl-cta-eyebrow">${esc(copy.eyebrow)}</span>
        <h3 class="tl-cta-title">${esc(copy.title)}</h3>
        <p class="tl-cta-desc">${esc(copy.desc)}</p>
        <div class="tl-cta-tiers-hint">
          <span>Free 10-page audit</span> · <span>25 &amp; 50-page deep audits from ₹125</span> · <span>Actionable fix roadmap</span>
        </div>
      </div>
      <div class="tl-cta-actions">
        <a href="${esc(auditHref)}" class="btn primary lg" id="seo-tools-audit-cta">
          Get Full SEO Audit →
        </a>
        ${waHref ? `
          <a href="${esc(waHref)}" target="_blank" rel="noopener noreferrer" class="btn outline lg wa-cta-btn" id="seo-tools-whatsapp-cta">
            Talk to an SEO Expert
          </a>
        ` : ''}
      </div>
    </section>
  `;
}

// ── Check Results ──────────────────────────────────────────────────────────

function renderChecks(list) {
  if (!Array.isArray(list) || list.length === 0) {
    return `<div class="tl-empty-state"><p>No specific checks reported for this analysis.</p></div>`;
  }

  const actionable = list.filter((c) => c.status === 'fail' || c.status === 'warn');
  const passing = list.filter((c) => c.status === 'pass' || c.status === 'info');

  const renderItem = (c, defaultOpen = false) => {
    const hasFix = Boolean(c.recommendation);
    return `
      <details class="tl-check-item c-${esc(c.status)}" ${defaultOpen ? 'open' : ''}>
        <summary class="tl-check-summary" aria-label="${esc(c.label)}: ${esc(c.status)}">
          <i>${ICON[c.status] || 'i'}</i>
          <div class="tl-check-title">
            <b>${esc(c.label)}</b>
            ${c.detail ? `<span>${esc(c.detail)}</span>` : ''}
          </div>
          <span class="tl-chevron" aria-hidden="true">▾</span>
        </summary>
        <div class="tl-check-body">
          ${hasFix ? `
            <div class="tl-check-fix">
              <div class="tl-fix-header">
                <span class="tl-fix-pill">How to fix</span>
                <span class="tl-fix-tip">Recommended remediation</span>
              </div>
              <p class="tl-fix-text">${esc(c.recommendation)}</p>
            </div>
          ` : ''}
        </div>
      </details>
    `;
  };

  let html = '';
  if (actionable.length > 0) {
    html += `
      <div class="tl-checks-group">
        <div class="tl-group-head">
          <h3>Issues Requiring Attention (${actionable.length})</h3>
        </div>
        <div class="tl-checks">
          ${actionable.map((c) => renderItem(c, true)).join('')}
        </div>
      </div>
    `;
  }

  if (passing.length > 0) {
    html += `
      <div class="tl-checks-group">
        <div class="tl-group-head">
          <h3>Passed &amp; Informational Checks (${passing.length})</h3>
        </div>
        <div class="tl-checks">
          ${passing.map((c) => renderItem(c, false)).join('')}
        </div>
      </div>
    `;
  }

  return html;
}

// ── Tables ─────────────────────────────────────────────────────────────────

function renderTable(t, idx, toolSlug) {
  if (!t || !t.cols || !t.rows) return '';
  const rows = t.rows || [];
  const hasFilter = rows.length > 5;
  const isImageTable = toolSlug === 'image-alt-checker';

  return `
    <div class="tl-table">
      <div class="tl-table-toolbar">
        <h3>${esc(t.title)}</h3>
        ${hasFilter ? `
          <div class="tl-table-filter-wrap">
            <span class="tl-table-count" id="count-tbl-${idx}">${rows.length} rows</span>
            <input type="search" class="tl-table-search" placeholder="Filter rows…" data-target="tbl-${idx}" data-count="count-tbl-${idx}" aria-label="Filter ${esc(t.title)}">
          </div>
        ` : `<span class="tl-table-count">${rows.length} rows</span>`}
      </div>
      <div class="table-scroll">
        <table id="tbl-${idx}" class="tl-data-table">
          <thead>
            <tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows.map((r) => `
              <tr>
                ${r.map((v, i) => {
                  if (i === t.statusCol) {
                    return `<td><span class="tl-dot d-${esc(v)}">${v === 'fail' ? 'Missing' : v === 'warn' ? 'Check' : 'OK'}</span></td>`;
                  }
                  if (isImageTable && i === 0 && /^https?:\/\//i.test(String(v))) {
                    return `<td><div class="tl-img-cell"><img src="${esc(v)}" alt="" class="tl-img-thumb" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'"><span style="word-break:break-all;">${esc(v)}</span></div></td>`;
                  }
                  return `<td>${esc(v).replace(/\n/g, '<br>')}</td>`;
                }).join('')}
              </tr>
            `).join('') || `<tr><td colspan="${t.cols.length}" class="tl-table-empty">Nothing found.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderKeywordMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return '';
  const rowsHtml = matrix.map((m) => {
    const term = esc(m.term || '');
    const inTitle = m.title ? '<span class="tl-pill-yes">✓ Found</span>' : '<span class="tl-pill-no">—</span>';
    const inH1 = m.h1 ? '<span class="tl-pill-yes">✓ Found</span>' : '<span class="tl-pill-no">—</span>';
    const inDesc = m.meta ? '<span class="tl-pill-yes">✓ Found</span>' : '<span class="tl-pill-no">—</span>';
    const inBody = m.content ? '<span class="tl-pill-yes">✓ Found</span>' : '<span class="tl-pill-no">—</span>';
    const count = m.occurrences != null ? String(m.occurrences) : '—';
    const dens = m.density != null ? `${m.density}%` : '—';
    return `
      <tr>
        <td><b>${term}</b></td>
        <td>${inTitle}</td>
        <td>${inH1}</td>
        <td>${inDesc}</td>
        <td>${inBody}</td>
        <td>${esc(count)}</td>
        <td>${esc(dens)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="tl-table">
      <div class="tl-table-toolbar">
        <div>
          <h3>Keyword Placement Matrix</h3>
          <span class="tl-table-count">Target and prominent keywords across critical HTML elements</span>
        </div>
      </div>
      <div class="table-scroll">
        <table class="tl-data-table">
          <thead>
            <tr>
              <th>Keyword / Phrase</th>
              <th>In Title</th>
              <th>In H1</th>
              <th>In Meta Desc</th>
              <th>In Body</th>
              <th>Count</th>
              <th>Density</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Visual Previews ────────────────────────────────────────────────────────

const serp = (s) => {
  const url = String(s?.url ?? '');
  const title = String(s?.title ?? '');
  const desc = String(s?.description ?? '');
  const t = title.length > 60 ? title.slice(0, 58) + '…' : title;
  const d = desc.length > 160 ? desc.slice(0, 157) + '…' : desc;
  return `
    <div class="tl-serp">
      <div class="tl-preview-header">
        <span class="tl-serp-label">Search Preview · Google format</span>
        <span class="tl-preview-sub">Simulated appearance in search results</span>
      </div>
      <div class="tl-serp-cite">
        <span class="tl-serp-fav" aria-hidden="true">🌐</span>
        <span class="u">${esc(url || 'https://example.com')}</span>
      </div>
      <div class="t">${esc(t || '(Untitled Page)')}</div>
      <div class="d">${esc(d || 'No meta description provided for this page.')}</div>
    </div>
  `;
};

const og = (o) => `
  <div class="tl-og">
    <div class="tl-preview-header">
      <span class="tl-serp-label">Share preview · Open Graph</span>
      <span class="tl-preview-sub">Facebook, LinkedIn &amp; Twitter cards</span>
    </div>
    <div class="tl-og-card">
      ${o?.image ? `
        <div class="tl-og-img-wrap">
          <img src="${esc(o.image)}" alt="Social Preview" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <div class="tl-og-noimg" style="display:none"><span>🖼️</span>Image could not be loaded</div>
        </div>
      ` : `
        <div class="tl-og-noimg"><span>🖼️</span>No share image specified</div>
      `}
      <div class="tl-og-body">
        <small>${esc(o?.site || 'Website')}</small>
        <b>${esc(o?.title || '(No Open Graph title found)')}</b>
        <span>${esc(o?.description || '(No Open Graph description found)')}</span>
      </div>
    </div>
  </div>
`;

const tree = (t) => {
  if (!Array.isArray(t) || t.length === 0) {
    return `
      <div class="tl-table">
        <h3>Heading Outline Hierarchy</h3>
        <div class="tl-empty-state"><p>No heading elements (H1–H6) were found on this page.</p></div>
      </div>
    `;
  }
  return `
    <div class="tl-table">
      <h3>Heading Outline Hierarchy</h3>
      <ol class="tl-tree">
        ${t.map((h) => `<li style="--l:${h.level}"><code>H${h.level}</code><span>${esc(h.text) || '<em>(empty heading tag)</em>'}</span></li>`).join('')}
      </ol>
    </div>
  `;
};

function renderLoading() {
  out.innerHTML = `
    <div class="tl-loading-shell" role="status" aria-live="polite">
      <div class="tl-loading-head">
        <div class="tl-spinner" aria-hidden="true"></div>
        <div>
          <h3>Analyzing your website…</h3>
          <p>Running SEO diagnostics, auditing page elements and evaluating rules.</p>
        </div>
      </div>
      <div class="tl-skel-grid">
        <div class="tl-skel-card"></div>
        <div class="tl-skel-card"></div>
        <div class="tl-skel-card"></div>
        <div class="tl-skel-card"></div>
      </div>
      <div class="tl-skel-list">
        <div class="tl-skel-line"></div>
        <div class="tl-skel-line"></div>
        <div class="tl-skel-line short"></div>
      </div>
    </div>
  `;
}

function renderError(message) {
  err.innerHTML = `
    <div class="tl-err-card">
      <div class="tl-err-icon" aria-hidden="true">⚠️</div>
      <div class="tl-err-content">
        <b>Analysis Could Not Be Completed</b>
        <p>${esc(message)}</p>
        <span class="tl-err-tip">Please ensure the website address is public, online, and entered with http:// or https://.</span>
      </div>
    </div>
  `;
  err.hidden = false;
}

// ── Main Render Pipeline ───────────────────────────────────────────────────

async function render(r) {
  const codeBlock = r.code ? `
    <div class="tl-code">
      <div class="tl-code-head">
        <span>Paste inside <code>&lt;head&gt;</code></span>
        <button class="btn sm outline" type="button" id="copyCode">Copy Code</button>
      </div>
      <pre><code>${esc(r.code)}</code></pre>
    </div>
  ` : '';

  const matrixHtml = r.engine?.matrix ? renderKeywordMatrix(r.engine.matrix) : '';
  const toolSpecificHtml = renderToolSpecific(slug, r);

  // Retrieve configured WhatsApp contact details safely
  let waHref = '';
  try {
    const waFloatEl = document.querySelector('a.wa-float');
    const waFromFloat = waFloatEl ? waFloatEl.href : '';
    const cfg = await getPublicConfig();
    const waNumber = cfg?.whatsapp ? String(cfg.whatsapp).replace(/\D/g, '') : (waFromFloat.match(/wa\.me\/(\d+)/)?.[1] || '');
    if (waNumber) {
      const msg = r.url
        ? `Hi Click2Client Media, I ran the free ${r.tool || 'SEO'} tool for ${r.url} and would like to talk to an SEO expert about fixing these issues.`
        : `Hi Click2Client Media, I used the free ${r.tool || 'SEO'} tool and would like to talk to an SEO expert.`;
      waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(msg)}`;
    }
  } catch {}

  const ctaHtml = renderConversionCta(slug, r, waHref);

  out.innerHTML = `
    ${renderHeader(r)}
    ${renderMetrics(r)}
    ${renderSummaryBar(r.counts)}
    ${toolSpecificHtml}
    <div class="tl-res-grid">
      <div>
        ${renderChecks(r.checks || [])}
        ${r.note ? `<p class="tl-note">${esc(r.note)}</p>` : ''}
      </div>
      <div>
        ${r.serp ? serp(r.serp) : ''}
        ${r.og ? og(r.og) : ''}
        ${codeBlock}
      </div>
    </div>
    ${r.tree ? tree(r.tree) : ''}
    ${matrixHtml}
    ${(r.tables || []).map((t, i) => renderTable(t, i, slug)).join('')}
    ${ctaHtml}
  `;

  box.hidden = false;

  // Conversion CTA Click Event Tracking
  document.getElementById('seo-tools-audit-cta')?.addEventListener('click', () => {
    track('seo_tool_audit_cta_clicked', { tool: slug, target_url: r.url || '' });
  });

  document.getElementById('seo-tools-whatsapp-cta')?.addEventListener('click', () => {
    track('seo_tool_whatsapp_cta_clicked', { tool: slug, target_url: r.url || '' });
  });

  // Copy code handler
  document.getElementById('copyCode')?.addEventListener('click', (e) => {
    if (r.code) navigator.clipboard?.writeText(r.code);
    e.target.textContent = 'Copied ✓';
    setTimeout(() => { e.target.textContent = 'Copy Code'; }, 2200);
  });

  // Broken Links Filter Button Handler
  document.getElementById('btnFilterBroken')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const active = btn.classList.toggle('active');
    btn.textContent = active ? 'Show All Links' : 'Show Broken Only';
    const table = out.querySelector('#tbl-0');
    if (!table) return;
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const statusText = tr.children[1]?.textContent?.trim() || '';
      const isBroken = statusText === 'Error' || Number(statusText) >= 400;
      tr.hidden = active && !isBroken;
    });
  });

  // Missing ALT Filter Button Handler
  document.getElementById('btnFilterMissingAlt')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    const active = btn.classList.toggle('active');
    btn.textContent = active ? 'Show All Images' : 'Show Missing ALT Only';
    const table = out.querySelector('#tbl-0');
    if (!table) return;
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const isMissing = tr.querySelector('.d-fail') != null || tr.children[1]?.textContent?.includes('Missing');
      tr.hidden = active && !isMissing;
    });
  });

  // Table live search filter handler
  out.querySelectorAll('.tl-table-search').forEach((input) => {
    const targetId = input.dataset.target;
    const countId = input.dataset.count;
    const tableEl = document.getElementById(targetId);
    const countEl = document.getElementById(countId);
    if (!tableEl) return;
    const rows = Array.from(tableEl.querySelectorAll('tbody tr'));
    const total = rows.length;

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      let visible = 0;
      rows.forEach((tr) => {
        const match = !q || tr.textContent.toLowerCase().includes(q);
        tr.hidden = !match;
        if (match) visible++;
      });
      if (countEl) {
        countEl.textContent = q ? `${visible} of ${total} rows` : `${total} rows`;
      }
    });
  });

  box.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button[type=submit]');
  const body = Object.fromEntries(new FormData(form));
  err.hidden = true;
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Analyzing…';

  box.hidden = false;
  renderLoading();
  box.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });

  try {
    const res = await api(`/public/tools/${slug}`, { method: 'POST', body });
    await render(res);
    track('seo_tool_used', { tool: slug });
  } catch (ex) {
    box.hidden = true;
    renderError(ex.message || 'Request failed. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

// Arriving from the hub ("Check My Website") or a shared link: ?url=…
const pre = new URLSearchParams(location.search).get('url');
if (pre && form.elements.url) {
  form.elements.url.value = pre;
  form.requestSubmit();
}
