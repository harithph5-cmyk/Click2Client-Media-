// Non-intrusive security configuration checks relevant to SEO and trust:
// TLS certificate, HTTP→HTTPS behaviour, response security headers.
// This is not a penetration test — it only reads what any browser sees.

import tls from 'node:tls';
import { safeFetch, assertPublicHost } from '../lib/net.js';

export function inspectCertificate(hostname, port = 443) {
  return new Promise(async (resolve) => {
    try {
      await assertPublicHost(hostname);
    } catch (e) {
      return resolve({ available: false, error: e.message });
    }
    const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate();
      const authorized = socket.authorized;
      const authError = socket.authorizationError ? String(socket.authorizationError) : null;
      const protocol = socket.getProtocol();
      socket.end();
      if (!cert || !cert.valid_to) return resolve({ available: false, error: 'No certificate presented.' });
      const validTo = new Date(cert.valid_to);
      const daysRemaining = Math.floor((validTo - Date.now()) / 86400000);
      resolve({
        available: true,
        valid: authorized,
        error: authError,
        subject: cert.subject?.CN || null,
        issuer: cert.issuer?.O || cert.issuer?.CN || null,
        validFrom: new Date(cert.valid_from).toISOString(),
        validTo: validTo.toISOString(),
        daysRemaining,
        protocol,
        altNames: (cert.subjectaltname || '').split(',').map((s) => s.trim().replace(/^DNS:/, '')).slice(0, 10),
      });
    });
    socket.on('timeout', () => { socket.destroy(); resolve({ available: false, error: 'TLS connection timed out.' }); });
    socket.on('error', (e) => resolve({ available: false, error: e.code === 'ECONNREFUSED' ? 'Port 443 refused the connection — HTTPS does not appear to be enabled.' : e.message }));
  });
}

export async function checkHttpRedirect(hostname) {
  const url = `http://${hostname}/`;
  const res = await safeFetch(url, { maxRedirects: 6, maxBytes: 256 * 1024, timeoutMs: 10000 });
  if (!res.ok) return { checked: false, url, error: res.error?.message };
  const firstHop = res.redirects[0];
  return {
    checked: true,
    url,
    redirectsToHttps: res.url.startsWith('https:'),
    finalUrl: res.url,
    firstStatus: firstHop ? firstHop.status : res.status,
    permanent: firstHop ? [301, 308].includes(firstHop.status) : false,
    chain: res.redirects.map((r) => ({ from: r.url, status: r.status, to: r.location })),
  };
}

export function securityHeaders(headers) {
  const pick = (k) => headers[k] || null;
  return {
    'strict-transport-security': pick('strict-transport-security'),
    'content-security-policy': pick('content-security-policy') ? 'present' : null,
    'x-content-type-options': pick('x-content-type-options'),
    'x-frame-options': pick('x-frame-options'),
    'referrer-policy': pick('referrer-policy'),
    'permissions-policy': pick('permissions-policy') ? 'present' : null,
  };
}
