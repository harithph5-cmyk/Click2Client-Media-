// Network layer: URL validation, SSRF protection and a bounded fetch that
// records the redirect chain and timings. Every outbound request made on
// behalf of a user goes through safeFetch().

import dns from 'node:dns/promises';
import net from 'node:net';
import { config } from '../config.js';

export class AuditInputError extends Error {
  constructor(message, code = 'invalid_input') {
    super(message);
    this.code = code;
  }
}

export function normalizeInputUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new AuditInputError('Please enter a website address, for example yourbusiness.in');
  }
  let raw = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = 'https://' + raw;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AuditInputError('That does not look like a valid website address.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AuditInputError('Only http:// and https:// websites can be audited.');
  }
  if (url.username || url.password) {
    throw new AuditInputError('Website addresses containing login credentials are not accepted.');
  }
  const host = url.hostname;
  if (!config.crawler.allowPrivateHosts) {
    if (!host.includes('.') || host.endsWith('.local') || host.endsWith('.internal') || host === 'localhost') {
      throw new AuditInputError('Please enter a public website domain (e.g. example.com).');
    }
    const bare = host.replace(/^\[|\]$/g, '');
    if (net.isIP(bare) && isPrivateIp(bare)) {
      throw new AuditInputError('This address points to a private network and cannot be audited.', 'private_host');
    }
  }
  url.hash = '';
  return url;
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

const hostCache = new Map();

export async function assertPublicHost(hostname) {
  if (config.crawler.allowPrivateHosts) return;
  const h = hostname.replace(/^\[|\]$/g, '');
  if (hostCache.has(h)) {
    if (!hostCache.get(h)) throw new AuditInputError('This address points to a private network and cannot be audited.', 'private_host');
    return;
  }
  let addrs;
  if (net.isIP(h)) addrs = [{ address: h }];
  else {
    try {
      addrs = await dns.lookup(h, { all: true });
    } catch {
      throw new AuditInputError(`The domain "${h}" could not be found. Please check the spelling.`, 'dns');
    }
  }
  const ok = addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  hostCache.set(h, ok);
  if (!ok) throw new AuditInputError('This address points to a private network and cannot be audited.', 'private_host');
}

function describeFetchError(err) {
  const code = err?.cause?.code || err?.code || '';
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return { code: 'timeout', message: 'The server did not respond in time.' };
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { code: 'dns', message: 'The domain could not be resolved.' };
  if (code === 'ECONNREFUSED') return { code: 'refused', message: 'The server refused the connection.' };
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return { code: 'reset', message: 'The connection was closed by the server.' };
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)) return { code: 'tls', message: `SSL certificate problem (${code}).` };
  if (err instanceof AuditInputError) return { code: err.code, message: err.message };
  return { code: code || 'network', message: err?.message || 'Network error.' };
}

/**
 * Fetch with: SSRF checks on every hop, manual redirect tracking, byte cap,
 * timeout, and timing. Never throws — returns { ok:false, error } instead.
 */
export async function safeFetch(inputUrl, opts = {}) {
  const {
    method = 'GET',
    maxBytes = config.crawler.maxHtmlBytes,
    timeoutMs = config.crawler.requestTimeoutMs,
    maxRedirects = 8,
    followRedirects = true,
    readBody = true,
    headers = {},
  } = opts;

  const redirects = [];
  let current = String(inputUrl);
  const started = performance.now();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let res;
    const hopStart = performance.now();
    try {
      const u = new URL(current);
      if (!['http:', 'https:'].includes(u.protocol)) throw new AuditInputError('Redirected to an unsupported protocol.', 'bad_redirect');
      await assertPublicHost(u.hostname);
      res = await fetch(current, {
        method,
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'user-agent': config.crawler.userAgent,
          accept: method === 'GET' ? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' : '*/*',
          'accept-language': 'en-IN,en;q=0.9',
          ...headers,
        },
      });
    } catch (err) {
      return { ok: false, url: current, redirects, error: describeFetchError(err), timing: { totalMs: Math.round(performance.now() - started) } };
    }
    const ttfbMs = Math.round(performance.now() - hopStart);

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const location = new URL(res.headers.get('location'), current).toString();
      redirects.push({ url: current, status: res.status, location });
      try { await res.body?.cancel(); } catch {}
      if (!followRedirects) {
        return { ok: true, status: res.status, url: current, location, redirects, headers: headersToObject(res.headers), timing: { ttfbMs, totalMs: Math.round(performance.now() - started) } };
      }
      if (redirects.some((r) => r.url === location)) {
        return { ok: false, url: current, redirects, error: { code: 'redirect_loop', message: 'The page redirects in a loop.' } };
      }
      current = location;
      continue;
    }

    const hdrs = headersToObject(res.headers);
    let body = '';
    let bytes = 0;
    let truncated = false;
    if (readBody && res.body && method !== 'HEAD') {
      const reader = res.body.getReader();
      const chunks = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > maxBytes) { truncated = true; try { await reader.cancel(); } catch {} break; }
          chunks.push(value);
        }
      } catch (err) {
        return { ok: false, url: current, status: res.status, redirects, headers: hdrs, error: describeFetchError(err), timing: { ttfbMs, totalMs: Math.round(performance.now() - started) } };
      }
      const buf = Buffer.concat(chunks);
      const charset = /charset=([^;]+)/i.exec(hdrs['content-type'] || '')?.[1]?.trim().toLowerCase();
      try { body = new TextDecoder(charset || 'utf-8').decode(buf); } catch { body = buf.toString('utf8'); }
    } else {
      try { await res.body?.cancel(); } catch {}
    }

    return {
      ok: true,
      status: res.status,
      url: current,
      redirects,
      headers: hdrs,
      body,
      bytes,
      truncated,
      timing: { ttfbMs, totalMs: Math.round(performance.now() - started) },
    };
  }
  return { ok: false, url: current, redirects, error: { code: 'too_many_redirects', message: 'Too many redirects.' } };
}

function headersToObject(h) {
  const o = {};
  h.forEach((v, k) => { o[k] = v; });
  const cookies = typeof h.getSetCookie === 'function' ? h.getSetCookie() : [];
  if (cookies.length) o['set-cookie'] = cookies.map((c) => c.split(';')[0].split('=')[0]).join(', ');
  return o;
}

/** HEAD with GET fallback — for link/image status checks. */
export async function checkStatus(url, timeoutMs = 8000) {
  let r = await safeFetch(url, { method: 'HEAD', timeoutMs, readBody: false });
  if (!r.ok || r.status >= 400) {
    const g = await safeFetch(url, { method: 'GET', timeoutMs, maxBytes: 64 * 1024 });
    if (g.ok || !r.ok) r = g;
  }
  return r;
}

/** Simple promise pool for bounded concurrency. */
export async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}
