// Baasha AI accounts: "Sign in with Google" (OpenID Connect, authorization code flow with PKCE), server-side sessions,
// CSRF protection, and the workspace API (memory and task history). Nothing is simulated: if the Google client is not
// configured, sign-in answers "not configured" and the rest of Baasha AI works exactly as before.
// Secrets stay on the server. Sessions are random tokens stored hashed. The workspace id always comes from the session.
import crypto from 'node:crypto';
import express from 'express';
import { config } from '../config.js';
import { getWsStore } from './wsstore.js';
import { rateLimited } from './limits.js';
import * as mem from './memory.js';
import { listTasks, deleteWorkspaceTasks } from './taskstore.js';

export const SESSION_COOKIE = 'bs_session', OAUTH_COOKIE = 'bs_oauth';
const SESSION_DAYS = 14, OAUTH_TTL_MS = 10 * 60_000;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth', GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token', GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

/* ---------- configuration (names of missing settings are shown, never values) ---------- */
export function accountsConfig(env = process.env, publicUrl = config.publicUrl) {
  const clientId = (env.GOOGLE_CLIENT_ID || '').trim(), clientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();
  const missing = [];
  if (!clientId) missing.push('GOOGLE_CLIENT_ID'); if (!clientSecret) missing.push('GOOGLE_CLIENT_SECRET'); if (!publicUrl) missing.push('PUBLIC_URL');
  return { configured: !missing.length, missing, clientId, clientSecret, redirectUri: publicUrl ? `${publicUrl.replace(/\/$/, '')}/api/baasha/auth/google/callback` : '' };
}

/* ---------- small helpers ---------- */
const b64u = (b) => Buffer.from(b).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const timingEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
const cut = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const safeDecode = (v) => { try { return decodeURIComponent(v); } catch { return ''; } };
export const parseCookies = (h) => Object.fromEntries(String(h || '').split(';').map((p) => { const i = p.indexOf('='); return i < 0 ? null : [p.slice(0, i).trim(), safeDecode(p.slice(i + 1).trim())]; }).filter(Boolean));
const cookieStr = (name, value, { maxAge, secure }) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}${maxAge != null ? `; Max-Age=${maxAge}` : ''}`;
const isSecure = (req) => config.isProduction || req.secure || req.get?.('x-forwarded-proto') === 'https';
const oauthKey = (cfg) => sha256(`bs-oauth-v1:${cfg.clientSecret}`);
const sign = (obj, cfg) => { const p = b64u(JSON.stringify(obj)); return `${p}.${b64u(crypto.createHmac('sha256', oauthKey(cfg)).update(p).digest())}`; };
function unsign(v, cfg) {
  const [p, sig] = String(v || '').split('.'); if (!p || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', oauthKey(cfg)).update(p).digest()); if (!timingEq(sig, want)) return null;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); } catch { return null; }
}

/* ---------- Google ID token verification (RS256 only, keys from Google's published JWKS) ---------- */
export function verifyIdToken(token, { clientId, nonce, keys, now = Date.now() }) {
  const parts = String(token || '').split('.'); if (parts.length !== 3) throw new Error('malformed');
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { throw new Error('malformed'); }
  if (header.alg !== 'RS256') throw new Error('alg');                                  // rejects "none" and HMAC downgrade tricks
  const jwk = (keys || []).find((k) => k.kid === header.kid && k.kty === 'RSA'); if (!header.kid || !jwk) throw new Error('kid');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('signature');
  const aud = [].concat(claims.aud || []);
  if (!ISSUERS.has(claims.iss)) throw new Error('iss'); if (!aud.includes(clientId)) throw new Error('aud');
  const sec = Math.floor(now / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp < sec - 60) throw new Error('expired'); if (Number.isFinite(claims.iat) && claims.iat > sec + 300) throw new Error('iat');
  if (!claims.nonce || !timingEq(claims.nonce, nonce)) throw new Error('nonce');
  if (!claims.sub || !claims.email || claims.email_verified !== true) throw new Error('email');
  return claims;
}

let certCache = { at: 0, keys: [] };
async function defaultGetKeys(force = false) {
  if (!force && certCache.keys.length && Date.now() - certCache.at < 3600_000) return certCache.keys;
  const r = await fetch(GOOGLE_CERTS, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error('jwks_http');
  certCache = { at: Date.now(), keys: (await r.json()).keys || [] }; return certCache.keys;
}
async function defaultExchange({ code, verifier, cfg }) {
  const r = await fetch(GOOGLE_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code', code_verifier: verifier }) });
  const j = await r.json().catch(() => ({})); if (!r.ok || typeof j.id_token !== 'string') throw new Error('exchange_failed'); return j;
}

/* ---------- sessions ---------- */
export async function sessionFromRequest(req, store) {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]; if (!token || token.length > 200) return null;
  try { return await (store || await getWsStore()).getSession(sha256(token).toString('hex')); } catch (e) { console.error('[baasha] session lookup:', e?.code || e?.message); return null; }
}

/* ---------- the router ---------- */
export function accountRouter({ getStore = getWsStore, getConfig = () => accountsConfig(), deps = {} } = {}) {
  const r = express.Router();
  const getKeys = deps.getKeys || defaultGetKeys, exchange = deps.exchangeCode || defaultExchange, nowMs = deps.now || (() => Date.now());
  const err = (res, status, code, message) => res.status(status).json({ error: { code, message } });
  const fail = (res, req, kind) => { console.error('[baasha] sign-in failed:', kind); res.append('set-cookie', cookieStr(OAUTH_COOKIE, '', { maxAge: 0, secure: isSecure(req) })); res.redirect(302, '/baasha-ai?signin=failed'); };

  r.get('/auth/google/start', (req, res) => {
    const cfg = getConfig();
    if (!cfg.configured) return err(res, 503, 'not_configured', 'Sign-in is not switched on yet.');
    if (rateLimited(`signin:${req.ip}`, 30)) return err(res, 429, 'rate_limited', 'Too many sign-in attempts. Please try again later.');
    const state = b64u(crypto.randomBytes(16)), nonce = b64u(crypto.randomBytes(16)), verifier = b64u(crypto.randomBytes(32));
    const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: 'openid email profile', state, nonce, code_challenge: b64u(sha256(verifier)), code_challenge_method: 'S256', prompt: 'select_account' });
    res.append('set-cookie', cookieStr(OAUTH_COOKIE, sign({ s: state, n: nonce, v: verifier, t: nowMs() }, cfg), { maxAge: OAUTH_TTL_MS / 1000, secure: isSecure(req) }));
    res.set('cache-control', 'no-store').redirect(302, `${GOOGLE_AUTH}?${q}`);
  });

  r.get('/auth/google/callback', async (req, res) => {
    const cfg = getConfig(); if (!cfg.configured) return fail(res, req, 'not_configured');
    try {
      const c = unsign(parseCookies(req.headers.cookie)[OAUTH_COOKIE], cfg);
      if (!c || nowMs() - c.t > OAUTH_TTL_MS) throw new Error('no_oauth_cookie');
      if (req.query.error) throw new Error('provider_error');
      const code = String(req.query.code || '');
      if (!code || code.length > 2048 || !timingEq(String(req.query.state || ''), c.s)) throw new Error('state_mismatch');
      const tokens = await exchange({ code, verifier: c.v, cfg });
      let claims;
      try { claims = verifyIdToken(tokens.id_token, { clientId: cfg.clientId, nonce: c.n, keys: await getKeys(false), now: nowMs() }); }
      catch (e) { if (e.message !== 'kid') throw e; claims = verifyIdToken(tokens.id_token, { clientId: cfg.clientId, nonce: c.n, keys: await getKeys(true), now: nowMs() }); }
      const store = await getStore();
      const name = cut(claims.name || String(claims.email).split('@')[0], 80);
      const user = await store.upsertUser({ sub: String(claims.sub), email: String(claims.email).toLowerCase().slice(0, 200), name });
      const ws = await store.ensureWorkspace(user.id, `${name.split(' ')[0] || 'My'} workspace`);
      const token = b64u(crypto.randomBytes(32)), csrf = b64u(crypto.randomBytes(24));
      await store.createSession({ tokenHash: sha256(token).toString('hex'), userId: user.id, workspaceId: ws.id, csrf, createdAt: new Date(nowMs()).toISOString(), expiresAt: new Date(nowMs() + SESSION_DAYS * 86400_000).toISOString(), ipHash: sha256(`ip:${req.ip}`).toString('hex').slice(0, 16) });
      res.append('set-cookie', cookieStr(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86400, secure: isSecure(req) }));
      res.append('set-cookie', cookieStr(OAUTH_COOKIE, '', { maxAge: 0, secure: isSecure(req) }));
      res.set('cache-control', 'no-store').redirect(302, '/baasha-ai#/');
    } catch (e) { fail(res, req, e?.message || 'error'); }
  });

  // Reads the session for the routes below. Writes also need the CSRF header.
  async function need(req, res, { write = false } = {}) {
    const s = await sessionFromRequest(req, await getStore());
    if (!s) { err(res, 401, 'unauthenticated', 'Sign in to use your workspace.'); return null; }
    if (write) {
      if (!timingEq(req.get('x-csrf-token') || '', s.csrf)) { err(res, 403, 'csrf', 'The request could not be verified. Reload the page and try again.'); return null; }
      if (rateLimited(`wsw:${s.workspaceId}`, 200)) { err(res, 429, 'rate_limited', 'Too many changes. Please try again later.'); return null; }
    }
    return s;
  }
  const idOk = (id) => /^[A-Za-z0-9_-]{8,40}$/.test(String(id || ''));
  const out = (res, result, okStatus = 200) => (result.ok ? res.json(result) : res.status(result.category === 'not_found' ? 404 : result.category === 'limit' ? 429 : 400).json({ error: { code: result.category || 'invalid', message: result.error } }));
  const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error('[baasha] workspace:', e?.code || e?.message); if (!res.headersSent) err(res, 503, 'unavailable', 'Your workspace is unavailable right now.'); } };

  r.get('/me', h(async (req, res) => {
    const cfg = getConfig(); res.set('cache-control', 'no-store');
    const s = await sessionFromRequest(req, await getStore());
    res.json({ accounts: { configured: cfg.configured }, authenticated: Boolean(s), ...(s ? { user: { email: s.email, name: s.name }, csrf: s.csrf, memory: mem.LIMITS } : {}) });
  }));
  r.post('/auth/logout', h(async (req, res) => {
    const s = await need(req, res, { write: true }); if (!s) return;
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]; await (await getStore()).deleteSession(sha256(token).toString('hex'));
    res.append('set-cookie', cookieStr(SESSION_COOKIE, '', { maxAge: 0, secure: isSecure(req) })); res.json({ ok: true });
  }));

  r.get('/workspace/memory', h(async (req, res) => {
    const s = await need(req, res); if (!s) return;
    const rows = await (await getStore()).listMemories(s.workspaceId); res.set('cache-control', 'no-store');
    res.json({ ok: true, memories: rows.map(mem.publicRow), limits: mem.LIMITS, kinds: mem.KINDS });
  }));
  r.post('/workspace/memory', h(async (req, res) => { const s = await need(req, res, { write: true }); if (!s) return; out(res, await mem.createApproved(await getStore(), s.workspaceId, { kind: req.body?.kind, subject: req.body?.subject, content: req.body?.content })); }));
  r.patch('/workspace/memory/:id', h(async (req, res) => { const s = await need(req, res, { write: true }); if (!s) return; if (!idOk(req.params.id)) return err(res, 404, 'not_found', 'That memory does not exist.'); out(res, await mem.edit(await getStore(), s.workspaceId, req.params.id, { subject: req.body?.subject, content: req.body?.content })); }));
  r.post('/workspace/memory/:id/approve', h(async (req, res) => { const s = await need(req, res, { write: true }); if (!s) return; if (!idOk(req.params.id)) return err(res, 404, 'not_found', 'That memory does not exist.'); out(res, await mem.approve(await getStore(), s.workspaceId, req.params.id)); }));
  r.delete('/workspace/memory/:id', h(async (req, res) => { const s = await need(req, res, { write: true }); if (!s) return; if (!idOk(req.params.id)) return err(res, 404, 'not_found', 'That memory does not exist.'); out(res, await mem.remove(await getStore(), s.workspaceId, req.params.id)); }));
  r.get('/workspace/memory/:id/history', h(async (req, res) => { const s = await need(req, res); if (!s) return; if (!idOk(req.params.id)) return err(res, 404, 'not_found', 'That memory does not exist.'); out(res, await mem.history(await getStore(), s.workspaceId, req.params.id)); }));
  r.post('/workspace/memory/:id/revert', h(async (req, res) => { const s = await need(req, res, { write: true }); if (!s) return; if (!idOk(req.params.id)) return err(res, 404, 'not_found', 'That memory does not exist.'); out(res, await mem.revert(await getStore(), s.workspaceId, req.params.id, req.body?.version)); }));

  r.get('/workspace/tasks', h(async (req, res) => {
    const s = await need(req, res); if (!s) return;
    const rows = await listTasks(s.workspaceId, 50); res.set('cache-control', 'no-store');
    res.json({ ok: true, tasks: rows.map((t) => ({ id: t.id, status: t.status, goal: cut(t.goal, 200), createdAt: t.created_at, completedAt: t.completed_at || null, summary: t.summary || null })) });
  }));

  // Deletes the account and everything in the workspace: memory, history, tasks, sessions.
  r.post('/workspace/delete', h(async (req, res) => {
    const s = await need(req, res, { write: true }); if (!s) return;
    if (req.body?.confirm !== 'DELETE') return err(res, 400, 'confirm', 'Type DELETE to confirm.');
    const ws = await (await getStore()).deleteWorkspaceAccount(s.userId); if (ws) await deleteWorkspaceTasks(ws);
    res.append('set-cookie', cookieStr(SESSION_COOKIE, '', { maxAge: 0, secure: isSecure(req) })); res.json({ ok: true });
  }));
  return r;
}
