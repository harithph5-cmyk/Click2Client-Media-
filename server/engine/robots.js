// robots.txt: fetch, parse (RFC 9309 semantics), explain each rule in plain
// language, and answer "may this path be crawled?".

import { safeFetch } from '../lib/net.js';

export function parseRobots(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  let lastWasAgent = false;
  const other = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value);
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      if (current) current.rules.push({ type: key, path: value });
      lastWasAgent = false;
    } else if (key === 'sitemap') {
      sitemaps.push(value);
    } else {
      if (key === 'crawl-delay' && current) current.crawlDelay = value;
      else other.push({ key, value });
      lastWasAgent = false;
    }
  }
  return { groups, sitemaps, other };
}

function patternToRegex(path) {
  const anchored = path.endsWith('$');
  const body = (anchored ? path.slice(0, -1) : path)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

function groupFor(parsed, agent) {
  const a = agent.toLowerCase();
  return (
    parsed.groups.find((g) => g.agents.some((x) => x.toLowerCase() !== '*' && a.includes(x.toLowerCase()))) ||
    parsed.groups.find((g) => g.agents.includes('*')) ||
    null
  );
}

export function isAllowed(parsed, path, agent = '*') {
  if (!parsed) return { allowed: true, rule: null };
  const group = groupFor(parsed, agent);
  if (!group) return { allowed: true, rule: null };
  let best = null;
  for (const r of group.rules) {
    if (r.type === 'disallow' && r.path === '') continue; // empty Disallow = allow all
    if (patternToRegex(r.path).test(path)) {
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.type === 'allow')) best = r;
    }
  }
  return { allowed: !best || best.type === 'allow', rule: best };
}

const KNOWN = [
  [/^\/wp-admin\/?$/, 'Blocks the WordPress admin area. This is the standard WordPress default and is normally correct.'],
  [/^\/wp-admin\/admin-ajax\.php$/, 'Re-opens admin-ajax.php, which some themes need for front-end features. Standard WordPress default.'],
  [/^\/cart|^\/checkout|^\/my-account/, 'Keeps transactional/account pages out of crawling. Usually sensible for e-commerce sites.'],
  [/\?|\*\?/, 'Targets URLs with query parameters — often used to stop crawlers wasting time on filtered or duplicate URLs.'],
  [/^\/search/, 'Blocks internal search result pages, which Google recommends not having crawled.'],
];

export function explainRule(rule, agents) {
  const who = agents.includes('*') ? 'all crawlers' : agents.join(', ');
  if (rule.type === 'disallow' && rule.path === '') {
    return { severity: 'info', text: `Empty Disallow — ${who} may crawl everything.` };
  }
  if (rule.type === 'disallow' && rule.path === '/') {
    const isAll = agents.includes('*') || agents.some((a) => /googlebot|bingbot/i.test(a));
    return {
      severity: isAll ? 'critical' : 'info',
      text: `Blocks ${who} from crawling the entire site.${isAll ? ' If this site should appear in search, this rule prevents it from being crawled.' : ''}`,
    };
  }
  const known = KNOWN.find(([re]) => re.test(rule.path));
  const verb = rule.type === 'allow' ? 'Allows' : 'Prevents';
  return {
    severity: 'info',
    text: `${verb} ${who} ${rule.type === 'allow' ? 'to crawl' : 'from crawling'} URLs whose path starts with "${rule.path}".${known ? ' ' + known[1] : ''}`,
  };
}

export async function fetchRobots(origin) {
  const url = new URL('/robots.txt', origin).toString();
  const res = await safeFetch(url, { maxBytes: 512 * 1024 });
  if (!res.ok) {
    return { url, status: null, available: false, error: res.error, parsed: null };
  }
  const ct = res.headers['content-type'] || '';
  if (res.status !== 200) {
    return { url, status: res.status, available: false, parsed: null, note: res.status === 404 ? 'No robots.txt file (404). Crawlers treat this as "everything allowed".' : `robots.txt returned HTTP ${res.status}.` };
  }
  if (/text\/html/i.test(ct) && /<html/i.test(res.body.slice(0, 500))) {
    return { url, status: res.status, available: false, parsed: null, note: 'The server returned an HTML page instead of a robots.txt file.' };
  }
  const parsed = parseRobots(res.body);
  const explained = parsed.groups.map((g) => ({
    agents: g.agents,
    crawlDelay: g.crawlDelay || null,
    rules: g.rules.map((r) => ({ ...r, explanation: explainRule(r, g.agents) })),
  }));
  return {
    url,
    status: res.status,
    available: true,
    finalUrl: res.url,
    bytes: res.bytes,
    raw: res.body.slice(0, 20000),
    parsed,
    groups: explained,
    sitemaps: parsed.sitemaps,
  };
}
