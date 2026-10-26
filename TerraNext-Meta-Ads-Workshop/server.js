'use strict';
// Master Meta Ads workshop: registration + manual UPI payment verification.
// Single-file backend: Express + node:sqlite (Node >= 22.13). Swap to Postgres by replacing the `db` helpers.
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const { z } = require('zod');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PROD = process.env.NODE_ENV === 'production';
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PRIV = path.join(DATA, 'private');
const PUB = path.join(__dirname, 'public');
fs.mkdirSync(PRIV, { recursive: true });

const db = new DatabaseSync(process.env.DB_PATH || path.join(DATA, 'app.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
db.exec(fs.readFileSync(path.join(__dirname, 'db', '001_init.sql'), 'utf8'));

// ---------- helpers ----------
const now = () => new Date().toISOString();
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const newToken = () => crypto.randomBytes(32).toString('base64url'); // 256 bits
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const nz = (v) => (v === undefined || v === '' ? null : v);
function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const audit = (actorType, actorId, action, regId, meta) =>
  run('INSERT INTO audit_logs (actor_type,actor_id,action,registration_id,metadata) VALUES (?,?,?,?,?)',
    actorType, actorId == null ? null : String(actorId), action, regId ?? null, meta ? JSON.stringify(meta) : null);
const inr = (p) => '₹' + (p / 100).toLocaleString('en-IN');
const dateLong = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const weekday = (d) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const clean = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

function normPhone(s) {
  let d = String(s).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const text = (min, max) => z.string().transform(clean).pipe(z.string().min(min).max(max));
const phoneField = z.string().transform((s) => normPhone(s) || '').pipe(z.string().length(10, 'Enter a valid 10-digit Indian mobile number'));

// ---------- state machine ----------
const ALLOWED = {
  PENDING_PAYMENT: ['VERIFICATION_PENDING', 'EXPIRED', 'CANCELLED'],
  VERIFICATION_PENDING: ['PAID', 'REJECTED', 'PENDING_PAYMENT', 'CANCELLED'], // PENDING_PAYMENT = correction requested
  PAID: [], REJECTED: [], EXPIRED: [], CANCELLED: [],
};
function transition(regId, from, to) {
  if (!ALLOWED[from] || !ALLOWED[from].includes(to)) throw new HttpError(409, `Invalid status change ${from} → ${to}`);
  const r = run('UPDATE registrations SET registration_status=?, updated_at=?, confirmed_at=CASE WHEN ?=\'PAID\' THEN ? ELSE confirmed_at END WHERE id=? AND registration_status=?',
    to, now(), to, now(), regId, from);
  if (!r.changes) throw new HttpError(409, 'Registration changed meanwhile, reload and retry');
}

// ---------- workshop / settings ----------
const workshop = () => one('SELECT * FROM workshops WHERE id=1');
const DEFAULT_POLICIES = {
  policy_privacy: 'PRIVACY NOTICE (template, replace with your approved text)\n\nTerraNext Global Ventures collects your name, WhatsApp number, email, organisation, category, city and optional details only to administer the Master Meta Ads workshop, verify your payment, and send workshop-related communications.\n\nWe do not collect card details, UPI PINs, OTPs or passwords. Payment screenshots, if you upload one, are stored privately and visible only to the workshop team.\n\nTo request correction or deletion of your data, contact the workshop team on 9940411837.',
  policy_terms: 'TERMS AND CONDITIONS (template, replace with your approved text)\n\nRegistration is confirmed only after the workshop team verifies your payment. Submitting a transaction reference or opening WhatsApp does not confirm your seat.\n\nThe session plan may be adjusted by the organiser. The workshop is educational and does not guarantee advertising results.',
  policy_refund: 'REFUND AND CANCELLATION POLICY\n\nThe organiser has not yet published a refund and cancellation policy for this workshop. Please contact the workshop team on 9940411837 before making payment.',
};
for (const [k, v] of Object.entries(DEFAULT_POLICIES)) run('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)', k, v);
// First boot: use the official QR shipped in /seed (admin can replace it from Workshop Settings).
if (!workshop().qr_storage_key && fs.existsSync(path.join(__dirname, 'seed', 'official-qr.png'))) {
  fs.copyFileSync(path.join(__dirname, 'seed', 'official-qr.png'), path.join(PRIV, 'official-qr.png'));
  run('UPDATE workshops SET qr_storage_key=?, recipient_name=COALESCE(recipient_name,?) WHERE id=1', 'official-qr.png', 'Suji Tharan');
}
const seatsTaken = () => one("SELECT COUNT(*) c FROM registrations WHERE registration_status IN ('PAID','VERIFICATION_PENDING')").c;

// ---------- file uploads ----------
function sniff(buf) {
  if (buf.length > 12 && buf.slice(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
const upload = (mb) => multer({ storage: multer.memoryStorage(), limits: { fileSize: mb * 1024 * 1024, files: 1, fields: 10 } });
function savePrivate(file, prefix) {
  const ext = sniff(file.buffer);
  if (!ext) throw new HttpError(400, 'Only PNG, JPG or WEBP images are allowed');
  const key = `${prefix}-${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(PRIV, key), file.buffer, { mode: 0o600 });
  return key;
}
const sendPrivate = (res, key) => {
  const f = path.join(PRIV, path.basename(key));
  if (!fs.existsSync(f)) throw new HttpError(404, 'Not found');
  res.set({ 'Cache-Control': 'private, no-store', 'Content-Type': MIME[path.extname(f).slice(1).replace('jpeg', 'jpg')] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  res.send(fs.readFileSync(f));
};

// ---------- passwords + admin sessions ----------
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [alg, salt, hash] = (stored || 'scrypt$00$00').split('$');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const want = Buffer.from(hash, 'hex');
  return alg === 'scrypt' && want.length === got.length && crypto.timingSafeEqual(got, want);
}
const cookie = (req, name) => (req.headers.cookie || '').split(/;\s*/).map((c) => c.split('=')).find(([k]) => k === name)?.[1];
function adminFrom(req) {
  const t = cookie(req, 'adm');
  if (!t) return null;
  return one("SELECT a.id,a.name,a.email,a.role FROM admin_sessions s JOIN administrators a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND a.status='ACTIVE'", sha(t), now()) || null;
}
function requireAdmin(req, res, next) {
  const a = adminFrom(req);
  if (!a) return res.status(401).json({ error: 'Sign in required' });
  // CSRF: SameSite=Strict cookie + custom header (cross-site forms/fetches cannot set it without CORS preflight).
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'fetch') return res.status(403).json({ error: 'Forbidden' });
  req.admin = a;
  next();
}

// ---------- payment sessions ----------
const SESSION_HOURS = 72;
function issueSession(regId) {
  run('UPDATE payment_sessions SET revoked_at=? WHERE registration_id=? AND revoked_at IS NULL', now(), regId);
  const token = newToken();
  run('INSERT INTO payment_sessions (registration_id,token_hash,expires_at) VALUES (?,?,?)',
    regId, sha(token), new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString());
  return token;
}
function sessionFrom(token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) throw new HttpError(404, 'Link not valid');
  const row = one(`SELECT r.*, s.id AS session_id FROM payment_sessions s JOIN registrations r ON r.id=s.registration_id
                   WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?`, sha(token), now());
  if (!row) throw new HttpError(404, 'This link is invalid or has expired. Register again with the same details to get a new one.');
  return row;
}
const latestSub = (regId) => one('SELECT * FROM payment_submissions WHERE registration_id=? ORDER BY id DESC LIMIT 1', regId);

function whatsappFor(w, reg, sub) {
  const msg = [
    'Hello TerraNext Team,',
    'I have registered for the Master Meta Ads Workshop.',
    `Registration ID: ${reg.public_registration_id}`,
    `Name: ${reg.full_name}`,
    `Workshop Date: ${dateLong(w.event_date)}`,
    `Amount Paid: ${inr(reg.amount_due_paise)}`,
    `UPI Transaction Reference: ${sub.transaction_reference}`,
    `Payment Date: ${dateLong(sub.payment_date)}`,
    'Please verify my payment and confirm my registration.',
    'Thank you.',
  ].join('\n');
  return { url: `https://wa.me/91${w.contact_number}?text=${encodeURIComponent(msg)}`, text: msg };
}

// ---------- app ----------
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
const GA = process.env.GA4_MEASUREMENT_ID || '', PIXEL = process.env.META_PIXEL_ID || '';
const trackers = GA || PIXEL ? ['https://www.googletagmanager.com', 'https://connect.facebook.net', 'https://*.google-analytics.com', 'https://www.facebook.com'] : [];
app.use(helmet({
  referrerPolicy: { policy: 'no-referrer' },
  contentSecurityPolicy: { directives: {
    'script-src': ["'self'", 'https://unpkg.com', ...trackers],
    'connect-src': ["'self'", ...trackers],
    'img-src': ["'self'", 'data:', ...trackers],
    'upgrade-insecure-requests': PROD ? [] : null,
  } },
}));
app.use(express.json({ limit: '20kb' }));
app.use((req, res, next) => {
  if (/^\/(payment|payment-status|registration-confirmed|admin|api)(\/|$)/.test(req.path)) {
    res.set({ 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Cache-Control': 'no-store' });
  }
  next();
});

const limit = (windowMin, max) => rateLimit({ windowMs: windowMin * 60e3, limit: max, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Please try again shortly.' } });

// public
app.get('/api/config', (req, res) => {
  const w = workshop();
  res.json({
    title: w.title, description: w.description, eventDate: w.event_date, eventDateLong: dateLong(w.event_date), weekday: weekday(w.event_date),
    durationMinutes: w.duration_minutes, amountPaise: w.amount_paise, originalPaise: w.original_amount_paise,
    price: inr(w.amount_paise), original: inr(w.original_amount_paise), savings: inr(w.original_amount_paise - w.amount_paise),
    organizer: w.organizer, contact: w.contact_number, certificate: w.certificate_info, offerExpiry: w.offer_expiry,
    seatsLeft: w.capacity ? Math.max(0, w.capacity - seatsTaken()) : null, open: w.status === 'OPEN',
    ga4: GA, pixel: PIXEL,
  });
});
app.get('/api/policy/:name', (req, res) => {
  const t = { privacy: 'Privacy Policy', terms: 'Terms and Conditions', refund: 'Refund and Cancellation Policy' }[req.params.name];
  if (!t) throw new HttpError(404, 'Not found');
  res.json({ title: t, text: one('SELECT value FROM settings WHERE key=?', 'policy_' + req.params.name).value });
});

const CATEGORIES = ['Small Business Owner', 'SME', 'Real Estate Professional', 'Marketing Professional', 'Freelancer', 'Student', 'Other'];
const registerSchema = z.object({
  fullName: text(2, 80), phone: phoneField,
  email: z.string().transform(clean).pipe(z.string().toLowerCase().email('Enter a valid email address').max(120)),
  organization: text(2, 120), category: z.enum(CATEGORIES), city: text(2, 60),
  website: z.string().transform(clean).pipe(z.union([z.literal(''), z.string().url().max(200).regex(/^https?:\/\//i, 'Website must start with http:// or https://')])).optional(),
  learningGoal: text(0, 500).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: 'Please accept the privacy notice' }) }),
  reviewed: z.literal(true, { errorMap: () => ({ message: 'Please confirm you reviewed the workshop details and payment instructions' }) }),
});
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newPublicId = () => 'TNM-2026-' + Array.from({ length: 6 }, () => ID_CHARS[crypto.randomInt(ID_CHARS.length)]).join('');

app.post('/api/register', limit(15, 15), (req, res) => {
  const p = registerSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: Object.fromEntries(p.error.issues.map((i) => [i.path[0], i.message])) });
  const d = p.data, w = workshop();
  if (w.status !== 'OPEN') throw new HttpError(403, 'Registrations are closed');
  const out = tx(() => {
    const ex = one("SELECT * FROM registrations WHERE workshop_id=1 AND normalized_phone=? AND registration_status IN ('PENDING_PAYMENT','VERIFICATION_PENDING','PAID')", d.phone);
    if (ex) {
      // Recovery needs phone AND email, so a stranger who only knows a number gets nothing.
      if (ex.registration_status === 'PAID') throw new HttpError(409, 'This number is already registered and confirmed. Contact the workshop team if you need help.');
      if (ex.email !== d.email) throw new HttpError(409, 'A registration with this number already exists. Use the same email to resume it, or contact the workshop team.');
      audit('PARTICIPANT', ex.id, 'REGISTRATION_RECOVERED', ex.id);
      return { id: ex.public_registration_id, token: issueSession(ex.id), recovered: true };
    }
    if (w.capacity && seatsTaken() >= w.capacity) throw new HttpError(409, 'Registrations are full');
    for (let i = 0; i < 5; i++) {
      const pid = newPublicId();
      try {
        const r = run(`INSERT INTO registrations (public_registration_id,workshop_id,full_name,normalized_phone,email,organization_name,professional_category,city,website_url,learning_goal,privacy_consent_at,amount_due_paise,currency)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          pid, 1, d.fullName, d.phone, d.email, d.organization, d.category, d.city, nz(d.website), nz(d.learningGoal), now(), w.amount_paise, w.currency);
        audit('PARTICIPANT', r.lastInsertRowid, 'REGISTRATION_CREATED', r.lastInsertRowid, { amount_paise: w.amount_paise });
        return { id: pid, token: issueSession(Number(r.lastInsertRowid)) };
      } catch (e) { if (!/public_registration_id/.test(String(e.message))) throw e; }
    }
    throw new Error('Could not allocate registration id');
  });
  res.status(out.recovered ? 200 : 201).json({ registrationId: out.id, recovered: !!out.recovered, paymentUrl: `/payment/${out.token}` });
});

const sessionLimit = limit(1, 120);
app.get('/api/session/:token', sessionLimit, (req, res) => {
  const reg = sessionFrom(req.params.token), w = workshop(), sub = latestSub(reg.id);
  const body = {
    registrationId: reg.public_registration_id, name: reg.full_name, status: reg.registration_status,
    amountPaise: reg.amount_due_paise, amount: inr(reg.amount_due_paise),
    workshop: { title: w.title, date: dateLong(w.event_date), weekday: weekday(w.event_date), organizer: w.organizer, contact: w.contact_number, certificate: w.certificate_info },
    qrAvailable: !!w.qr_storage_key && ['PENDING_PAYMENT', 'VERIFICATION_PENDING'].includes(reg.registration_status),
    recipientName: w.recipient_name,
  };
  if (sub) {
    body.submission = { reference: sub.transaction_reference, paymentDate: sub.payment_date, submittedAt: sub.submitted_at, status: sub.verification_status, reason: sub.rejection_reason };
    if (reg.registration_status === 'VERIFICATION_PENDING' && sub.verification_status === 'SUBMITTED') {
      const wa = whatsappFor(w, reg, sub);
      body.whatsappUrl = wa.url; body.whatsappText = wa.text;
    }
  }
  if (reg.registration_status === 'PAID') body.confirmedAt = reg.confirmed_at;
  res.json(body);
});
// The QR is only streamed to a valid payment session; it is still not a secret and not proof of payment.
app.get('/api/session/:token/qr', sessionLimit, (req, res) => {
  const reg = sessionFrom(req.params.token), w = workshop();
  if (!w.qr_storage_key || !['PENDING_PAYMENT', 'VERIFICATION_PENDING'].includes(reg.registration_status)) throw new HttpError(404, 'Not available');
  sendPrivate(res, w.qr_storage_key);
});

const REF_RE = /^\d{12}$/; // UPI reference / UTR numbers are 12 digits
const SEQ = '01234567890123456789', RSEQ = [...SEQ].reverse().join('');
const junkRef = (r) => /(\d)\1{5}/.test(r) || [0, 1, 2, 3, 4, 5, 6].some((i) => SEQ.includes(r.slice(i, i + 6)) || RSEQ.includes(r.slice(i, i + 6)));
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
app.post('/api/session/:token/payment', limit(15, 15), upload(3).single('screenshot'), (req, res) => {
  const reg = sessionFrom(req.params.token), w = workshop();
  if (!w.qr_storage_key) throw new HttpError(503, 'Payment is temporarily unavailable. Please contact the workshop team.');
  const ref = clean(req.body.transactionReference || '').toUpperCase();
  const pd = clean(req.body.paymentDate || '');
  const errs = {};
  if (!REF_RE.test(ref)) errs.transactionReference = 'Enter the 12-digit UPI reference number (UTR) from your payment app';
  else if (junkRef(ref)) errs.transactionReference = 'That does not look like a real UPI reference number. Copy it from your payment app.';
  if (!req.file) errs.screenshot = 'Upload the payment screenshot from your UPI app';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pd) || isNaN(Date.parse(pd)) || pd > istToday() || pd < reg.created_at.slice(0, 10)) errs.paymentDate = 'Enter the date you paid (not before registering, not in the future)';
  if (Object.keys(errs).length) return res.status(400).json({ error: 'Please fix the highlighted fields', fields: errs });
  if (reg.registration_status !== 'PENDING_PAYMENT') throw new HttpError(409, 'Payment details are already submitted and awaiting verification.');
  if (one('SELECT COUNT(*) c FROM payment_submissions WHERE registration_id=?', reg.id).c >= 5) throw new HttpError(429, 'Too many submissions. Please contact the workshop team.');
  // A UTR already used by a different registration cannot be claimed again.
  if (one("SELECT 1 FROM payment_submissions WHERE transaction_reference=? AND registration_id<>? AND verification_status IN ('SUBMITTED','VERIFIED','REJECTED')", ref, reg.id)) throw new HttpError(409, 'This transaction reference has already been submitted. Contact the workshop team.');
  const key = savePrivate(req.file, 'shot');
  try {
    tx(() => {
      const r = run('INSERT INTO payment_submissions (registration_id,transaction_reference,payment_date,screenshot_storage_key) VALUES (?,?,?,?)', reg.id, ref, pd, key);
      transition(reg.id, 'PENDING_PAYMENT', 'VERIFICATION_PENDING');
      audit('PARTICIPANT', reg.id, 'PAYMENT_REPORTED', reg.id, { submission_id: Number(r.lastInsertRowid), has_screenshot: !!key });
    });
  } catch (e) {
    if (key) fs.rmSync(path.join(PRIV, key), { force: true });
    if (/UNIQUE/.test(String(e.message))) throw new HttpError(409, 'Payment details are already submitted.');
    throw e;
  }
  res.status(201).json({ ok: true });
});

// ---------- admin API ----------
app.post('/api/admin/login', limit(15, 10), (req, res) => {
  const p = z.object({ email: z.string().max(120), password: z.string().max(200) }).safeParse(req.body);
  const a = p.success ? one("SELECT * FROM administrators WHERE email=? AND status='ACTIVE'", p.data.email.trim().toLowerCase()) : null;
  const ok = checkPassword(p.success ? p.data.password : '', a?.password_hash); // always hash: no user-enumeration timing
  if (!a || !ok) return res.status(401).json({ error: 'Invalid email or password' });
  const t = newToken();
  run('DELETE FROM admin_sessions WHERE expires_at<?', now());
  run('INSERT INTO admin_sessions VALUES (?,?,?)', sha(t), a.id, new Date(Date.now() + 8 * 3600e3).toISOString());
  res.set('Set-Cookie', `adm=${t}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${PROD ? '; Secure' : ''}`);
  audit('ADMIN', a.id, 'LOGIN', null);
  res.json({ ok: true });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => {
  run('DELETE FROM admin_sessions WHERE token_hash=?', sha(cookie(req, 'adm')));
  res.set('Set-Cookie', 'adm=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0').json({ ok: true });
});
app.get('/api/admin/me', requireAdmin, (req, res) => res.json(req.admin));

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const by = Object.fromEntries(all('SELECT registration_status s, COUNT(*) c FROM registrations GROUP BY s').map((r) => [r.s, r.c]));
  res.json({
    total: Object.values(by).reduce((a, b) => a + b, 0), byStatus: by,
    submitted: one('SELECT COUNT(DISTINCT registration_id) c FROM payment_submissions').c,
    verifiedRevenuePaise: one("SELECT COALESCE(SUM(amount_due_paise),0) s FROM registrations WHERE registration_status='PAID'").s,
    byDate: all("SELECT date(created_at,'+330 minutes') d, COUNT(*) c FROM registrations WHERE created_at>=datetime('now','-30 days') GROUP BY d ORDER BY d"),
  });
});

const LIST_SQL = `SELECT r.id,r.public_registration_id,r.full_name,r.normalized_phone,r.email,r.professional_category,r.city,r.organization_name,r.created_at,r.amount_due_paise,r.registration_status,r.confirmed_at,
  s.id sub_id,s.transaction_reference,s.payment_date,s.submitted_at,s.verification_status sub_status,s.verified_at,s.screenshot_storage_key IS NOT NULL has_screenshot,s.rejection_reason
  FROM registrations r LEFT JOIN payment_submissions s ON s.id=(SELECT MAX(id) FROM payment_submissions WHERE registration_id=r.id)`;
app.get('/api/admin/registrations', requireAdmin, (req, res) => {
  const status = Object.keys(ALLOWED).includes(req.query.status) ? req.query.status : null;
  const q = String(req.query.q || '').trim().slice(0, 60), like = q ? `%${q}%` : null;
  const page = Math.max(1, parseInt(req.query.page) || 1), size = 25;
  const where = 'WHERE (?1 IS NULL OR r.registration_status=?1) AND (?2 IS NULL OR r.full_name LIKE ?2 OR r.normalized_phone LIKE ?2 OR r.email LIKE ?2 OR r.public_registration_id LIKE ?2 OR s.transaction_reference LIKE ?2)';
  const total = one(`SELECT COUNT(*) c FROM registrations r LEFT JOIN payment_submissions s ON s.id=(SELECT MAX(id) FROM payment_submissions WHERE registration_id=r.id) ${where}`, status, like).c;
  const rows = db.prepare(`${LIST_SQL} ${where} ORDER BY r.id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`).all(status, like);
  res.json({ total, page, pages: Math.ceil(total / size), rows });
});
app.get('/api/admin/registrations/:pid', requireAdmin, (req, res) => {
  const reg = one('SELECT * FROM registrations WHERE public_registration_id=?', req.params.pid);
  if (!reg) throw new HttpError(404, 'Not found');
  const { privacy_consent_at, ...r } = reg;
  res.json({
    registration: r,
    submissions: all('SELECT id,transaction_reference,payment_date,submitted_at,verification_status,verified_at,rejection_reason,screenshot_storage_key IS NOT NULL has_screenshot FROM payment_submissions WHERE registration_id=? ORDER BY id DESC', reg.id)
      .map((s) => ({ ...s, duplicateOf: one("SELECT r.public_registration_id p FROM payment_submissions x JOIN registrations r ON r.id=x.registration_id WHERE x.transaction_reference=? AND x.registration_id<>? LIMIT 1", s.transaction_reference, reg.id)?.p || null })),
    audit: all('SELECT actor_type,action,metadata,created_at FROM audit_logs WHERE registration_id=? ORDER BY id DESC LIMIT 50', reg.id),
  });
});
app.get('/api/admin/screenshot/:id', requireAdmin, (req, res) => {
  const s = one('SELECT screenshot_storage_key k FROM payment_submissions WHERE id=?', Number(req.params.id));
  if (!s?.k) throw new HttpError(404, 'Not found');
  sendPrivate(res, s.k);
});

// Decision endpoints act on a submission. They are idempotent and run in one transaction.
function decide(kind) {
  return (req, res) => {
    const id = Number(req.params.id);
    const p = z.object({ reason: text(0, 300).optional(), confirmed: z.boolean().optional() }).safeParse(req.body || {});
    if (!p.success) throw new HttpError(400, 'Invalid request');
    const { reason, confirmed } = p.data;
    if (kind !== 'verify' && !reason) throw new HttpError(400, 'A reason is required');
    if (kind === 'verify' && !confirmed) throw new HttpError(400, 'Tick the checklist to confirm you verified the payment independently');
    const out = tx(() => {
      const sub = one('SELECT * FROM payment_submissions WHERE id=?', id);
      if (!sub) throw new HttpError(404, 'Not found');
      const target = { verify: 'VERIFIED', reject: 'REJECTED', correct: 'CORRECTION_REQUESTED' }[kind];
      if (sub.verification_status === target) return { ok: true, already: true }; // repeated click
      if (sub.verification_status !== 'SUBMITTED') throw new HttpError(409, `Submission is already ${sub.verification_status}`);
      const reg = one('SELECT * FROM registrations WHERE id=?', sub.registration_id);
      if (kind === 'verify') {
        const dup = one("SELECT r.public_registration_id p FROM payment_submissions x JOIN registrations r ON r.id=x.registration_id WHERE x.transaction_reference=? AND x.verification_status='VERIFIED' AND x.id<>?", sub.transaction_reference, id);
        if (dup) throw new HttpError(409, `This transaction reference is already credited to ${dup.p}`);
      }
      run('UPDATE payment_submissions SET verification_status=?, verified_at=?, verified_by_admin_id=?, rejection_reason=? WHERE id=?',
        target, kind === 'verify' ? now() : null, req.admin.id, kind === 'verify' ? null : reason, id);
      transition(reg.id, reg.registration_status, { verify: 'PAID', reject: 'REJECTED', correct: 'PENDING_PAYMENT' }[kind]);
      audit('ADMIN', req.admin.id, { verify: 'PAYMENT_VERIFIED', reject: 'PAYMENT_REJECTED', correct: 'CORRECTION_REQUESTED' }[kind], reg.id, { submission_id: id, reason: reason || null });
      return { ok: true };
    });
    res.json(out);
  };
}
app.post('/api/admin/payments/:id/verify', requireAdmin, decide('verify'));
app.post('/api/admin/payments/:id/reject', requireAdmin, decide('reject'));
app.post('/api/admin/payments/:id/correct', requireAdmin, decide('correct'));
app.post('/api/admin/registrations/:pid/note', requireAdmin, (req, res) => {
  const p = z.object({ note: text(0, 1000) }).safeParse(req.body);
  if (!p.success) throw new HttpError(400, 'Invalid note');
  const r = run('UPDATE registrations SET admin_note=? WHERE public_registration_id=?', p.data.note, req.params.pid);
  if (!r.changes) throw new HttpError(404, 'Not found');
  res.json({ ok: true });
});

const settingsSchema = z.object({
  title: text(3, 150), description: text(10, 600), eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), durationMinutes: z.number().int().min(15).max(1440),
  amountRupees: z.number().positive().max(1e6), originalRupees: z.number().positive().max(1e6),
  offerExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), capacity: z.number().int().positive().max(100000).nullable(),
  organizer: text(2, 100), contactNumber: phoneField, certificate: text(2, 200), recipientName: text(0, 100),
  policies: z.object({ privacy: text(0, 20000), terms: text(0, 20000), refund: text(0, 20000) }),
});
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const w = workshop();
  res.json({
    title: w.title, description: w.description, eventDate: w.event_date, durationMinutes: w.duration_minutes, amountRupees: w.amount_paise / 100, originalRupees: w.original_amount_paise / 100,
    offerExpiry: w.offer_expiry, capacity: w.capacity, organizer: w.organizer, contactNumber: w.contact_number, certificate: w.certificate_info, recipientName: w.recipient_name || '', qrConfigured: !!w.qr_storage_key,
    policies: Object.fromEntries(['privacy', 'terms', 'refund'].map((k) => [k, one('SELECT value FROM settings WHERE key=?', 'policy_' + k).value])),
  });
});
app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const p = settingsSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  const d = p.data;
  if (d.originalRupees < d.amountRupees) throw new HttpError(400, 'Original price must not be lower than the offer price');
  tx(() => {
    run(`UPDATE workshops SET title=?,description=?,event_date=?,duration_minutes=?,amount_paise=?,original_amount_paise=?,offer_expiry=?,capacity=?,organizer=?,contact_number=?,certificate_info=?,recipient_name=?,updated_at=? WHERE id=1`,
      d.title, d.description, d.eventDate, d.durationMinutes, Math.round(d.amountRupees * 100), Math.round(d.originalRupees * 100), d.offerExpiry, d.capacity, d.organizer, d.contactNumber, d.certificate, nz(d.recipientName), now());
    for (const k of ['privacy', 'terms', 'refund']) run('UPDATE settings SET value=? WHERE key=?', d.policies[k], 'policy_' + k);
    audit('ADMIN', req.admin.id, 'SETTINGS_UPDATED', null); // existing registrations keep their frozen fee
  });
  res.json({ ok: true });
});
app.get('/api/admin/qr', requireAdmin, (req, res) => { const k = workshop().qr_storage_key; if (!k) throw new HttpError(404, 'No QR configured'); sendPrivate(res, k); });
app.post('/api/admin/qr', requireAdmin, upload(2).single('qr'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'Choose an image');
  const key = savePrivate(req.file, 'qr'), old = workshop().qr_storage_key;
  run('UPDATE workshops SET qr_storage_key=?, updated_at=? WHERE id=1', key, now());
  if (old && old !== 'official-qr.png') fs.rmSync(path.join(PRIV, path.basename(old)), { force: true });
  audit('ADMIN', req.admin.id, 'QR_REPLACED', null);
  res.json({ ok: true });
});

// ---------- pages ----------
const page = (f) => (req, res) => res.sendFile(path.join(PUB, f));
app.get('/register', page('register.html'));
app.get(['/payment/:t', '/payment-status/:t', '/registration-confirmed/:t'], page('session.html'));
app.get(['/privacy-policy', '/terms', '/refund-policy'], page('policy.html'));
app.get('/admin/login', page('admin.html'));
app.get(['/admin', '/admin/dashboard', '/admin/registrations', '/admin/payments', '/admin/workshop-settings'], (req, res) =>
  adminFrom(req) ? res.sendFile(path.join(PUB, 'admin.html')) : res.redirect('/admin/login'));
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /payment\nDisallow: /payment-status\nDisallow: /registration-confirmed\nDisallow: /api\n'));
app.use(express.static(PUB, { maxAge: PROD ? '1h' : 0 }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => { // never leak stack traces or DB errors
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : 'Invalid upload' });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Workshop site on http://localhost:${port}`));
}
module.exports = { app, db, hashPassword, normPhone, ALLOWED };
