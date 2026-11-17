// Optional Google integrations via a service account (no OAuth screen):
//   Search Console (performance + URL Inspection) and GA4 Data API.
// Setup: create a service account, enable "Search Console API" and "Google
// Analytics Data API", and add the service-account email as a user on the
// Search Console property and the GA4 property. Put the JSON key in
// GOOGLE_SERVICE_ACCOUNT_JSON (raw JSON) or GOOGLE_SERVICE_ACCOUNT_FILE (path).
// Requesting indexing is NOT offered: Google's Indexing API is only for job
// postings/livestreams, and no request guarantees indexing anyway.

import crypto from 'node:crypto';
import fs from 'node:fs';

function key() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SERVICE_ACCOUNT_FILE && fs.existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE) ? fs.readFileSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE, 'utf8') : '');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
export const configured = () => Boolean(key());

let tok = { v: '', exp: 0 };
async function token() {
  if (tok.v && Date.now() < tok.exp) return tok.v;
  const k = key();
  if (!k) throw Object.assign(new Error('Google service account is not configured.'), { status: 409 });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const t = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly', aud: 'https://oauth2.googleapis.com/token', iat: t, exp: t + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(k.private_key, 'base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }) });
  const j = await r.json();
  if (!r.ok) throw Object.assign(new Error(j.error_description || 'Google authentication failed.'), { status: 502 });
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return tok.v;
}

async function g(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || `Google API returned ${r.status}`), { status: 502 });
  return j;
}
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/** Search Console performance for a property, optionally for a single page. */
export async function searchPerformance(site, { page, days = 28 } = {}) {
  const body = { startDate: day(days), endDate: day(2), dimensions: page ? ['query'] : ['page'], rowLimit: 100, ...(page ? { dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: page }] }] } : {}) };
  const j = await g(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
  return (j.rows || []).map((r) => ({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
}

export async function inspectUrl(site, url) {
  const j = await g('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', { inspectionUrl: url, siteUrl: site });
  const i = j.inspectionResult?.indexStatusResult || {};
  return { verdict: i.verdict, coverage: i.coverageState, lastCrawl: i.lastCrawlTime, googleCanonical: i.googleCanonical, userCanonical: i.userCanonical, robots: i.robotsTxtState, indexing: i.indexingState, link: j.inspectionResult?.inspectionResultLink };
}

/** Organic-search landing-page sessions from GA4. */
export async function organicLandingPages(property, { pagePath, days = 28 } = {}) {
  const j = await g(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(property)}:runReport`, {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }], dimensions: [{ name: 'landingPagePlusQueryString' }], metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
    dimensionFilter: { andGroup: { expressions: [
      { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { value: 'Organic Search' } } },
      ...(pagePath ? [{ filter: { fieldName: 'landingPagePlusQueryString', stringFilter: { matchType: 'BEGINS_WITH', value: pagePath } } }] : []),
    ] } }, limit: 100, orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
  });
  return (j.rows || []).map((r) => ({ page: r.dimensionValues[0].value, sessions: Number(r.metricValues[0].value), users: Number(r.metricValues[1].value) }));
}
