// Sitemap discovery and validation. Checks sitemaps declared in robots.txt
// first, then common locations. Counts URLs by actually parsing the XML.

import * as cheerio from 'cheerio';
import zlib from 'node:zlib';
import { safeFetch } from '../lib/net.js';

const COMMON = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml', '/wp-sitemap.xml', '/sitemap/sitemap.xml'];

async function inspect(url) {
  const res = await safeFetch(url, { maxBytes: 10 * 1024 * 1024, timeoutMs: 15000 });
  const entry = { url, status: res.status ?? null, finalUrl: res.url };
  if (!res.ok) return { ...entry, accessible: false, error: res.error?.message };
  if (res.status !== 200) return { ...entry, accessible: false };

  let body = res.body;
  if (/\.gz$/i.test(url) && body && !body.trimStart().startsWith('<')) {
    try { body = zlib.gunzipSync(Buffer.from(body, 'binary')).toString('utf8'); } catch {}
  }
  const head = body.slice(0, 800);
  if (/<html[\s>]/i.test(head) && !/<urlset|<sitemapindex/i.test(head)) {
    return { ...entry, accessible: true, valid: false, note: 'The URL returns an HTML page, not an XML sitemap.' };
  }
  let $;
  try {
    $ = cheerio.load(body, { xml: true });
  } catch {
    return { ...entry, accessible: true, valid: false, note: 'The file could not be parsed as XML.' };
  }
  const isIndex = $('sitemapindex').length > 0;
  const isUrlset = $('urlset').length > 0;
  if (!isIndex && !isUrlset) {
    return { ...entry, accessible: true, valid: false, note: 'No <urlset> or <sitemapindex> root element found.' };
  }
  const locs = (sel) => $(sel).map((_, el) => $(el).text().trim()).get().filter(Boolean);
  const lastmods = $('lastmod').map((_, el) => $(el).text().trim()).get();
  return {
    ...entry,
    accessible: true,
    valid: true,
    type: isIndex ? 'index' : 'urlset',
    childSitemaps: isIndex ? locs('sitemap > loc') : [],
    urls: isUrlset ? locs('url > loc') : [],
    lastmodLatest: lastmods.sort().at(-1) || null,
    truncated: res.truncated,
  };
}

export async function analyzeSitemaps(origin, robotsSitemaps = []) {
  const checked = [];
  const candidates = [...new Set([...robotsSitemaps, ...COMMON.map((p) => new URL(p, origin).toString())])];
  let primary = null;

  for (const url of candidates) {
    const r = await inspect(url);
    r.source = robotsSitemaps.includes(url) ? 'robots.txt' : 'common location';
    checked.push(r);
    if (r.valid && !primary) {
      primary = r;
      // Stop probing common locations once we've found a valid one, but
      // still check every sitemap robots.txt declares.
      if (!robotsSitemaps.slice(robotsSitemaps.indexOf(url) + 1).length) break;
    }
  }

  // Expand up to 5 child sitemaps of an index to count URLs.
  let discoveredUrls = [];
  const children = [];
  if (primary?.type === 'index') {
    for (const child of primary.childSitemaps.slice(0, 5)) {
      const c = await inspect(child);
      children.push({ url: child, status: c.status, valid: c.valid, urlCount: c.urls?.length ?? null });
      if (c.urls) discoveredUrls.push(...c.urls);
    }
  } else if (primary) {
    discoveredUrls = primary.urls;
  }

  const strip = ({ urls, ...rest }) => ({ ...rest, urlCount: urls ? urls.length : undefined });
  return {
    found: Boolean(primary),
    referencedInRobots: robotsSitemaps.length > 0,
    robotsSitemaps,
    primary: primary ? strip(primary) : null,
    checked: checked.map(strip),
    children,
    childrenTotal: primary?.type === 'index' ? primary.childSitemaps.length : 0,
    urlCount: discoveredUrls.length,
    urlCountIsPartial: primary?.type === 'index' && primary.childSitemaps.length > 5,
    sampleUrls: discoveredUrls.slice(0, 200),
  };
}
