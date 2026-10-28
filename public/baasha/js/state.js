// Pure helpers with no DOM access, so the same code runs in the browser and in the Node tests.

// Turns the /api/baasha/status answer into what the pill and the Settings panel show.
// s === undefined: still loading. s === null: the request failed. Otherwise the server's status object.
export function statusView(s) {
  if (s === undefined) return { tone: 'wait', label: 'Checking...', lines: ['Checking Baasha AI...'], canRetry: false };
  if (s === null || s.ok === false || !s.state) return { tone: 'off', label: 'Cannot reach Baasha AI', lines: ['Baasha AI cannot be reached right now. Check your connection, then try again.'], canRetry: true };
  const lines = ['Backend: available.'];
  const p = s.provider || {}, r = s.research || {};
  const why = {
    not_configured: 'not configured yet (the site owner must add the AI key on the server)',
    quota_daily: 'its usage quota is used up for now',
    auth: 'a setup problem (the site owner must check the AI key)',
    model: 'a setup problem (the site owner must check the AI model)',
    unreachable: 'cannot be reached right now',
  };
  if (s.state === 'not_configured') {
    lines.push(`AI provider: ${why.not_configured}.`);
    return { tone: 'off', label: 'Not switched on yet', lines, canRetry: true };
  }
  if (s.state === 'down') {
    lines.push(`AI provider: ${why[p.problem] || 'unavailable right now'}.`);
    return { tone: 'off', label: 'Unavailable', lines, canRetry: true };
  }
  lines.push(`AI provider: configured and reachable (model ${s.model}).`);
  if (r.state === 'unavailable') lines.push(`Web research: unavailable${r.reason === 'search_quota' ? ' (the search quota was reached)' : ''}. Chat works, and the Agent will say when it could not search.`);
  else if (r.state === 'working') lines.push('Web research: working.');
  else lines.push('Web research: not tested yet (it is checked the first time you use it).');
  if (s.limits) lines.push(`Limits per visitor each hour: ${s.limits.chat} chat messages, ${s.limits.research} research questions, ${s.limits.agent} agent tasks.`);
  return s.state === 'degraded'
    ? { tone: 'warn', label: `Limited · ${s.model}`, lines, canRetry: true }
    : { tone: 'on', label: `Ready · ${s.model}`, lines, canRetry: false };
}

// Reads the saved chats and reports defensively: damaged or missing data starts fresh instead of breaking the app.
export function loadDb(text) {
  try {
    const raw = JSON.parse(text || 'null');
    if (raw && Array.isArray(raw.chats)) return { chats: raw.chats.filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages)), reports: Array.isArray(raw.reports) ? raw.reports.filter((r) => r && typeof r.markdown === 'string') : [] };
  } catch { /* fall through */ }
  return { chats: [], reports: [] };
}

// Adds a report at the top of the Library unless an identical one (same title and text) is already saved.
export function addReport(reports, rep) {
  const same = reports.find((r) => r.title === rep.title && r.markdown === rep.markdown);
  if (same) return same;
  reports.unshift(rep); return rep;
}

export const RUN_TITLES = { completed: 'Agent finished', partially_completed: 'Agent finished with problems', failed: 'The agent could not finish' };
