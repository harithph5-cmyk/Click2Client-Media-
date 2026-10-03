// Scoring, issue prioritisation and the 30-day roadmap. All deterministic.
//
// Score methodology (shown to users):
//   • Each verified check has a severity weight: critical 10, high 6, medium 3, low 1.
//   • Pass earns 100% of its weight, warning 50%, fail 0%. Multi-page checks
//     earn the share of pages that pass.
//   • Category score = earned / possible weight within the category.
//   • Overall = category scores combined by category weight (out of 100),
//     using only categories that had at least one verified check.
//   • "info" and "unavailable" checks are excluded — we never score what we
//     could not verify.

import { CATEGORIES } from './checks.js';
import { kbFor } from './knowledge.js';

const SEV_W = { critical: 10, high: 6, medium: 3, low: 1 };
const EARN = { pass: 1, warning: 0.5, fail: 0 };

export function computeScore(checks) {
  const cats = {};
  for (const c of checks) {
    if (!(c.status in EARN)) continue;
    const cat = (cats[c.category] ||= { possible: 0, earned: 0, pass: 0, warning: 0, fail: 0 });
    const w = SEV_W[c.severity] || 1;
    cat.possible += w;
    cat.earned += w * (c.earned ?? EARN[c.status]);
    cat[c.status]++;
  }
  let totalW = 0;
  let acc = 0;
  const categories = {};
  for (const [id, meta] of Object.entries(CATEGORIES)) {
    const c = cats[id];
    if (!c || !c.possible) {
      categories[id] = { label: meta.label, score: null, weight: meta.weight, verifiedChecks: 0 };
      continue;
    }
    const score = Math.round((100 * c.earned) / c.possible);
    categories[id] = { label: meta.label, score, weight: meta.weight, verifiedChecks: c.pass + c.warning + c.fail, pass: c.pass, warning: c.warning, fail: c.fail };
    if (meta.weight) {
      totalW += meta.weight;
      acc += meta.weight * (c.earned / c.possible);
    }
  }
  const overall = totalW ? Math.round((100 * acc) / totalW) : null;
  const counted = checks.filter((c) => c.status in EARN);
  return {
    overall,
    grade: overall == null ? null : overall >= 85 ? 'Strong' : overall >= 70 ? 'Good' : overall >= 50 ? 'Needs work' : 'Poor',
    categories,
    verifiedChecks: counted.length,
    excludedChecks: checks.filter((c) => !(c.status in EARN)).length,
    methodology: 'Weighted by issue severity within each category, then by category importance. Unverifiable checks are excluded rather than guessed.',
  };
}

const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const EFFORT_ORDER = { Quick: 0, Moderate: 1, Significant: 2 };

function priorityFor(c) {
  const base = { critical: 0, high: 1, medium: 2, low: 3 }[c.severity] ?? 3;
  let p = base;
  if (c.status === 'warning' && base <= 1) p += 1; // a warning on a critical item is HIGH, not CRITICAL
  if (c.affected && c.affected.total > 1 && c.affected.count / c.affected.total < 0.2 && p < 3) p += 1; // isolated to few pages
  return PRIORITY_ORDER[Math.min(p, 3)];
}

export function buildIssues(checks, platforms) {
  const issues = [];
  for (const c of checks) {
    if (c.status !== 'fail' && c.status !== 'warning') continue;
    const kb = kbFor(c.id, platforms) || {
      whyItMatters: 'This check did not meet the recommended standard.',
      recommendation: 'Review the evidence and correct the configuration.',
      implementation: [{ platform: 'Any website', steps: 'Review the evidence and correct the configuration.' }],
      implementationType: 'Technical', effort: 'Moderate', bucket: 'technical', expectedImpact: 'Improves this aspect of the site.',
    };
    issues.push({
      id: c.instanceKey || c.id,
      checkId: c.id,
      title: c.title,
      category: c.category,
      status: c.status,
      severity: c.severity,
      priority: priorityFor(c),
      evidence: c.evidence,
      value: c.value,
      expected: c.expected,
      affected: c.affected || null,
      ...kb,
    });
  }
  issues.sort((a, b) =>
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
    (EFFORT_ORDER[a.effort] ?? 1) - (EFFORT_ORDER[b.effort] ?? 1) ||
    (b.affected?.count || 0) - (a.affected?.count || 0)
  );
  return issues;
}

export function groupIssues(issues) {
  const groups = { quick_wins: [], high_impact: [], technical: [], content: [], long_term: [] };
  for (const i of issues) {
    // Quick-effort fixes on important items are quick wins regardless of base bucket.
    const b = i.effort === 'Quick' && ['CRITICAL', 'HIGH', 'MEDIUM'].includes(i.priority) ? 'quick_wins'
      : (i.priority === 'CRITICAL' || i.priority === 'HIGH') && i.bucket !== 'quick_wins' ? 'high_impact'
      : i.bucket;
    (groups[b] || groups.technical).push(i.id);
  }
  return groups;
}

export function buildRoadmap(issues) {
  const used = new Set();
  const take = (pred, max = 8) => {
    const out = [];
    for (const i of issues) {
      if (out.length >= max) break;
      if (!used.has(i.id) && pred(i)) { used.add(i.id); out.push(i.id); }
    }
    return out;
  };
  const weeks = [
    { week: 1, theme: 'Fix what blocks visibility', focus: 'Critical and high-priority issues, plus quick wins that take under an hour.', items: take((i) => i.priority === 'CRITICAL' || (i.priority === 'HIGH' && i.effort !== 'Significant') || (i.effort === 'Quick' && i.priority === 'MEDIUM'), 10) },
    { week: 2, theme: 'Technical foundations', focus: 'Crawlability, canonicals, redirects, links and images.', items: take((i) => ['technical', 'links', 'images', 'security'].includes(i.category)) },
    { week: 3, theme: 'Content & speed', focus: 'On-page content, keyword alignment and performance.', items: take((i) => ['onpage', 'content', 'performance', 'mobile'].includes(i.category)) },
    { week: 4, theme: 'Growth & long-term', focus: 'Local SEO, structured data, social presence and remaining items.', items: take(() => true, 12) },
  ];
  return weeks.filter((w) => w.items.length);
}
