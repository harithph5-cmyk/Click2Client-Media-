// Third-party data providers (backlinks, traffic). Each adapter returns
// { available: true, source, data } from a real API, or
// { available: false, reason } — never estimated or placeholder numbers.
//
// To add a provider: implement fetch(domain) and register it below.

import { config } from '../config.js';

const backlinkAdapters = {
  // DataForSEO Backlinks API — https://docs.dataforseo.com/v3/backlinks/summary/live/
  async dataforseo(domain) {
    const { dataforseoLogin: login, dataforseoPassword: pass } = config.backlinks;
    if (!login || !pass) return { available: false, reason: 'DataForSEO credentials are not configured.' };
    let res;
    try {
      res = await fetch('https://api.dataforseo.com/v3/backlinks/summary/live', {
        method: 'POST',
        headers: { authorization: 'Basic ' + Buffer.from(`${login}:${pass}`).toString('base64'), 'content-type': 'application/json' },
        body: JSON.stringify([{ target: domain, internal_list_limit: 0, include_subdomains: true }]),
        signal: AbortSignal.timeout(30000),
      });
    } catch {
      return { available: false, reason: 'The backlink provider could not be reached.' };
    }
    const json = await res.json().catch(() => null);
    const task = json?.tasks?.[0];
    const r = task?.result?.[0];
    if (!res.ok || !r || (task.status_code && task.status_code >= 40000)) {
      return { available: false, reason: `Backlink provider error: ${task?.status_message || json?.status_message || 'HTTP ' + res.status}` };
    }
    return {
      available: true,
      source: 'DataForSEO',
      fetchedAt: new Date().toISOString(),
      data: {
        backlinks: r.backlinks ?? null,
        referringDomains: r.referring_domains ?? null,
        referringMainDomains: r.referring_main_domains ?? null,
        referringIps: r.referring_ips ?? null,
        brokenBacklinks: r.broken_backlinks ?? null,
        rank: r.rank ?? null,
        rankNote: 'DataForSEO rank (0–1000), the provider\'s own authority metric.',
        firstSeen: r.first_seen ?? null,
      },
    };
  },
};

export async function getBacklinks(domain) {
  const adapter = backlinkAdapters[config.backlinks.provider];
  if (!adapter) return { available: false, reason: 'Backlink data requires a connected backlink data provider.' };
  return adapter(domain);
}

const trafficAdapters = {
  // Register adapters here (e.g. Similarweb, Semrush) when credentials are available.
};

export async function getTraffic(domain) {
  const adapter = trafficAdapters[config.traffic.provider];
  if (!adapter) return { available: false, reason: 'Traffic data unavailable. Connect a traffic data provider, or link Google Search Console / GA4 for first-party data.' };
  return adapter(domain);
}
