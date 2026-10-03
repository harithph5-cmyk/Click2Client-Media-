// Re-audit comparison. Only compares stored results of two real audits.

export function compareAudits(prev, curr) {
  const delta = (a, b) => (a == null || b == null ? null : b - a);
  const prevIssues = new Map(prev.issues.map((i) => [i.id, i]));
  const currIssues = new Map(curr.issues.map((i) => [i.id, i]));
  const currChecks = new Map(curr.checks.map((c) => [c.instanceKey || c.id, c]));

  const fixed = [...prevIssues.values()]
    .filter((i) => !currIssues.has(i.id))
    .map((i) => {
      const now = currChecks.get(i.id);
      return { id: i.id, title: i.title, priority: i.priority, before: i.value, after: now ? now.value : 'Check no longer applicable', verified: Boolean(now && now.status === 'pass') };
    });
  const introduced = [...currIssues.values()].filter((i) => !prevIssues.has(i.id)).map((i) => ({ id: i.id, title: i.title, priority: i.priority, value: i.value }));
  const persisting = [...currIssues.values()].filter((i) => prevIssues.has(i.id)).map((i) => ({ id: i.id, title: i.title, priority: i.priority, before: prevIssues.get(i.id).value, after: i.value, priorityChanged: prevIssues.get(i.id).priority !== i.priority }));

  const categories = Object.entries(curr.score.categories)
    .map(([id, c]) => ({ id, label: c.label, before: prev.score.categories[id]?.score ?? null, after: c.score, change: delta(prev.score.categories[id]?.score, c.score) }))
    .filter((c) => curr.score.categories[c.id].weight > 0 && (c.before != null || c.after != null));

  const ps = (a, s) => a.evidence?.performance?.pagespeed?.[s]?.available ? a.evidence.performance.pagespeed[s].score : null;
  const perf = {
    mobile: { before: ps(prev, 'mobile'), after: ps(curr, 'mobile'), change: delta(ps(prev, 'mobile'), ps(curr, 'mobile')) },
    desktop: { before: ps(prev, 'desktop'), after: ps(curr, 'desktop'), change: delta(ps(prev, 'desktop'), ps(curr, 'desktop')) },
    ttfbMs: { before: prev.evidence.performance.measured.ttfbMs, after: curr.evidence.performance.measured.ttfbMs, change: delta(prev.evidence.performance.measured.ttfbMs, curr.evidence.performance.measured.ttfbMs) },
    htmlKb: { before: Math.round(prev.evidence.performance.measured.htmlBytes / 1024), after: Math.round(curr.evidence.performance.measured.htmlBytes / 1024) },
  };

  const caveats = [];
  if (prev.mode !== curr.mode) caveats.push(`The audits used different modes (${prev.mode} vs ${curr.mode}), so page coverage differs.`);
  if (prev.pagesAnalyzed !== curr.pagesAnalyzed) caveats.push(`Pages analysed changed from ${prev.pagesAnalyzed} to ${curr.pagesAnalyzed}.`);
  if (perf.ttfbMs.change != null) caveats.push('Server response time is a single measurement and naturally varies between runs.');

  return {
    previous: { auditDate: prev.auditDate, score: prev.score.overall, issues: prev.issues.length, pages: prev.pagesAnalyzed, mode: prev.mode },
    current: { auditDate: curr.auditDate, score: curr.score.overall, issues: curr.issues.length, pages: curr.pagesAnalyzed, mode: curr.mode },
    scoreChange: delta(prev.score.overall, curr.score.overall),
    categories,
    fixed,
    introduced,
    persisting,
    performance: perf,
    caveats,
  };
}
