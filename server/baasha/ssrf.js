// SSRF-safe page fetching for the Baasha AI agent.
// Only public http(s) pages are allowed. The address is validated at connection time (inside the DNS lookup
// used by the socket), so a hostname that later resolves to a private address cannot be used to reach
// internal services. Redirects are followed manually and every hop is validated again.
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

const blocked = new net.BlockList();
for (const [net4, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) {
  blocked.addSubnet(net4, prefix, 'ipv4');
}
for (const [net6, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['2001:db8::', 32], ['64:ff9b::', 96]]) {
  blocked.addSubnet(net6, prefix, 'ipv6');
}

export class UrlRejected extends Error {}

export function ipIsPublic(ip) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);            // IPv4-mapped IPv6 → check the IPv4 part
  if (mapped) ip = mapped[1];
  const kind = net.isIP(ip);
  if (!kind) return false;
  return !blocked.check(ip, kind === 4 ? 'ipv4' : 'ipv6');
}

// Throws UrlRejected for anything that is not a plain public web address.
export function parsePublicUrl(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new UrlRejected('That is not a valid web address.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UrlRejected('Only http and https addresses can be opened.');
  if (u.username || u.password) throw new UrlRejected('Addresses with a username or password are not allowed.');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
    throw new UrlRejected('Local and private addresses cannot be opened.');
  }
  if (net.isIP(host) && !ipIsPublic(host)) throw new UrlRejected('Local and private addresses cannot be opened.');
  if (u.port && !['80', '443', '8080', '8443'].includes(u.port)) throw new UrlRejected('That port is not allowed.');
  return u;
}

// dns.lookup replacement that refuses non-public results (runs for every new connection)
function safeLookup(hostname, options, cb) {
  dns.lookup(hostname, { ...options, all: true }, (err, addrs) => {
    if (err) return cb(err);
    const ok = addrs.filter((a) => ipIsPublic(a.address));
    if (!ok.length) return cb(new UrlRejected('Local and private addresses cannot be opened.'));
    if (options && options.all) return cb(null, ok);
    cb(null, ok[0].address, ok[0].family);
  });
}

const TEXT_TYPES = /^(text\/|application\/(xhtml\+xml|xml|json|rss\+xml|atom\+xml)|$)/i;

function once(u, { timeoutMs, maxBytes, signal }) {
  return new Promise((resolve, reject) => {
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, {
      method: 'GET', lookup: safeLookup, timeout: timeoutMs, signal,
      headers: { 'user-agent': 'BaashaAI/1.0 (+https://click2clientmedia.com/baasha-ai)', accept: 'text/html,text/plain,application/json;q=0.8,*/*;q=0.1', 'accept-encoding': 'identity' },
    }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u).toString(), status }); }
      const type = String(res.headers['content-type'] || '');
      if (!TEXT_TYPES.test(type)) { res.destroy(); return reject(new UrlRejected('That page is not a text or HTML page.')); }
      const chunks = []; let size = 0;
      res.on('data', (c) => { size += c.length; if (size > maxBytes) { res.destroy(); resolve({ status, type, body: Buffer.concat(chunks).toString('utf8'), truncated: true }); } else chunks.push(c); });
      res.on('end', () => resolve({ status, type, body: Buffer.concat(chunks).toString('utf8'), truncated: false }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('The page took too long to respond.')));
    req.on('error', reject);
    req.end();
  });
}

export async function safeFetch(raw, { timeoutMs = 12000, maxBytes = 1_000_000, maxRedirects = 3, signal } = {}) {
  let u = parsePublicUrl(raw);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const r = await once(u, { timeoutMs, maxBytes, signal });
    if (r.redirect) { u = parsePublicUrl(r.redirect); continue; }       // every redirect target is validated too
    return { url: u.toString(), ...r };
  }
  throw new UrlRejected('That address redirects too many times.');
}
