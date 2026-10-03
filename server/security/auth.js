// Admin authentication: scrypt password hashing, server-side sessions stored
// hashed in the database, HttpOnly SameSite=Strict cookies, a per-session
// CSRF token on every state-changing admin request, and DB-backed login
// throttling (works across serverless instances).

import crypto from 'node:crypto';
import { config } from '../config.js';
import * as store from '../store/db.js';

const COOKIE = 'c2c_admin';
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Format: scrypt$<saltHex>$<hashHex>
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(actual, expected);
}

// An explicit hash wins; otherwise the env password is hashed in memory once.
let ADMIN_HASH = null;
const adminHash = () => (ADMIN_HASH ||= config.admin.passwordHash || hashPassword(config.admin.password));

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieAttrs(req, maxAgeSec) {
  const secure = config.isProduction || req.secure;
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

export async function currentSession(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token) return null;
  return store.getSession(sha256(token));
}

export async function login(req, res) {
  const ip = req.ip || 'unknown';
  if ((await store.recentFailedLogins(ip, 15)) >= 5) {
    return res.status(429).json({ error: { code: 'rate_limited', message: 'Too many attempts. Please wait 15 minutes and try again.' } });
  }
  const ok = typeof req.body?.password === 'string' && req.body.password.length <= 200 && verifyPassword(req.body.password, adminHash());
  if (!ok) {
    await store.recordFailedLogin(ip);
    return res.status(401).json({ error: { code: 'invalid_credentials', message: 'Incorrect password.' } });
  }
  await store.clearFailedLogins(ip);
  const token = crypto.randomBytes(32).toString('base64url');
  const csrf = crypto.randomBytes(24).toString('base64url');
  await store.createSession(sha256(token), csrf, config.admin.sessionHours, ip);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; ${cookieAttrs(req, config.admin.sessionHours * 3600)}`);
  res.json({ ok: true, csrf });
}

export async function logout(req, res) {
  const token = parseCookies(req)[COOKIE];
  if (token) await store.deleteSession(sha256(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieAttrs(req, 0)}`);
  res.json({ ok: true });
}

/** API guard: valid session, plus CSRF header on anything that changes state. */
export async function requireAdmin(req, res, next) {
  const s = await currentSession(req);
  if (!s) return res.status(401).json({ error: { code: 'unauthorized', message: 'Please sign in.' } });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const sent = req.get('x-csrf-token') || '';
    if (sent.length !== s.csrf.length || !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(s.csrf))) {
      return res.status(403).json({ error: { code: 'csrf', message: 'Security check failed. Please refresh the page.' } });
    }
  }
  req.adminSession = s;
  next();
}

/** Page guard for HTML routes (redirects to the login screen). */
export async function requireAdminPage(req, res, next) {
  if (await currentSession(req)) return next();
  res.redirect(302, '/admin');
}
