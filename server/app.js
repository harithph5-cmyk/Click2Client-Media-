// The Express application. Exported without listening so it runs both as a
// normal Node server (server/index.js) and as a Vercel function (api/index.js).
//
// Serverless-safe design:
//  • all state lives in the database (no in-memory job registry),
//  • an audit runs inside the request's lifetime via waitUntil() with a time
//    budget, and writes its progress to the DB, which the browser polls.

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitUntil } from '@vercel/functions';
import { config, integrationStatus } from './config.js';
import { runAudit, MODES, STAGES } from './engine/auditor.js';
import { compareAudits } from './engine/compare.js';
import { normalizeInputUrl, AuditInputError } from './lib/net.js';
import * as store from './store/db.js';
import { TIERS, publicTiers, shapeAudit, rateLimited } from './commerce/plans.js';
import { upiLink } from './commerce/payments.js';
import { login, logout, requireAdmin, requireAdminPage, currentSession } from './security/auth.js';
import { renderPage, renderPost, renderProject, PAGES, sitemap, robots, siteSettings, siteUrl } from './site/render.js';
import { reportReadyEmail, notifyOwner, forwardLead } from './notify.js';
import * as portfolio from './portfolio.js';
import * as media from './media.js';
import * as blog from './blog.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.join(here, '..', 'public');
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '1.5mb' })); // allows a QR image upload in settings

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'SAMEORIGIN',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (config.isProduction) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Wrap async handlers so rejected promises reach the error handler.
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ── Validation helpers ───────────────────────────────────────────────────
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(e);
const validPhone = (p) => /^\+?[\d\s-]{7,18}$/.test(p) && p.replace(/\D/g, '').length >= 7;
const bad = (res, code, message, status = 400) => res.status(status).json({ error: { code, message } });

// ── Audit execution ──────────────────────────────────────────────────────
// Time budget per audit. Vercel functions are configured for 300 s
// (vercel.json); we stop crawling early to leave room for the final steps.
const BUDGET_MS = Number(process.env.AUDIT_TIME_BUDGET_MS || 270_000);

async function execute(id, input, meta) {
  const events = [{ type: 'started', at: Date.now() }];
  let saving = Promise.resolve();
  const emit = (e) => {
    events.push(e);
    if (e.type === 'stage') saving = saving.then(() => store.saveProgress(id, events.slice())).catch(() => {});
  };
  try {
    const audit = await runAudit({ ...input, deadlineAt: Date.now() + BUDGET_MS }, emit);
    audit.id = id;
    audit.plan = meta.plan;
    audit.previousAuditId = meta.previousAuditId || (await store.previousCompleteAudit(audit.domain, new Date().toISOString()));
    await saving;
    events.push({ type: 'complete', at: Date.now() });
    await store.completeAudit(id, audit, events);
    if (meta.email && meta.plan !== 'internal') {
      await reportReadyEmail({ to: meta.email, name: meta.name, website: audit.domain, score: audit.score.overall, link: `${meta.base}/audit/${id}`, tierName: TIERS[meta.plan].name });
    }
  } catch (err) {
    const error = err instanceof AuditInputError ? { code: err.code, message: err.message } : { code: 'internal', message: 'Something went wrong while auditing this website. Please try again in a few minutes.' };
    if (!(err instanceof AuditInputError)) console.error(`[audit ${id}]`, err);
    await saving;
    events.push({ type: 'error', error, at: Date.now() });
    await store.failAudit(id, error, events).catch(() => {});
  }
}

async function startAudit({ input, plan, meta }) {
  const url = normalizeInputUrl(input.url);
  const domain = url.hostname.replace(/^www\./, '');
  const full = { ...input, url: url.toString() };
  const id = await store.createAudit({ website: url.toString(), domain, mode: input.mode, plan, input: full, previousAuditId: meta.previousAuditId || null, customerId: meta.customerId || null, orderId: meta.orderId || null, email: meta.email || null });
  // Keep the function alive until the audit finishes (no-op outside Vercel,
  // where the Node process simply keeps running).
  waitUntil(execute(id, full, { ...meta, plan }));
  return id;
}

function tierInput(plan, extra) {
  return { ...extra, mode: plan === 'free' ? 'quick' : 'full', crawlLimit: TIERS[plan].pages, usePageSpeed: true, skipAI: plan === 'free' };
}

async function saveLead(l) {
  const id = await store.createLead(l);
  forwardLead({ id, ...l }, () => store.markLeadForwarded(id));
  notifyOwner(`New lead: ${l.name} (${l.source})`, [`${l.name} · ${l.email || ''} · ${l.phone || ''}`, `Website: ${l.website || '—'}`, `Service: ${l.service || '—'}`, l.message || '']);
  return id;
}

const statusLabel = (s) => ({ pending: 'Payment Pending', screenshot_received: 'Under Verification', under_verification: 'Under Verification', verified: 'Payment Verified', rejected: 'Payment Rejected' })[s] || s;

// ═════════════════════════════ PUBLIC API ═════════════════════════════════
const pubApi = express.Router();

pubApi.get('/config', h(async (req, res) => {
  const s = await siteSettings();
  res.json({ company: s.companyName, phone: s.phone, whatsapp: s.whatsapp, email: s.email, instagram: s.instagram, facebook: s.facebook, tiers: publicTiers(), stages: STAGES });
}));

pubApi.post('/audits/free', h(async (req, res) => {
  const b = req.body || {};
  const d = { name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 20), business: clean(b.business, 160), url: clean(b.url, 400) };
  if (!d.url) return bad(res, 'invalid_url', 'Please enter your website address.');
  if (!d.name) return bad(res, 'invalid_name', 'Please enter your name.');
  if (!validEmail(d.email)) return bad(res, 'invalid_email', 'Please enter a valid email address.');
  if (!validPhone(d.phone)) return bad(res, 'invalid_phone', 'Please enter a valid phone / WhatsApp number.');
  if (!d.business) return bad(res, 'invalid_business', 'Please enter your business name.');
  let url;
  try { url = normalizeInputUrl(d.url); } catch (e) { return bad(res, e.code, e.message); }
  const domain = url.hostname.replace(/^www\./, '');
  const dup = await store.recentFreeAudit(domain, d.email, new Date(Date.now() - 24 * 3600_000).toISOString());
  if (dup) return res.json({ id: dup.id, existing: true, message: 'You already ran a free audit for this website in the last 24 hours — here it is.' });
  if (rateLimited('free:' + req.ip, 5)) return bad(res, 'rate_limited', 'You have reached the limit of free audits for now. Please try again in an hour.', 429);

  const customerId = await store.upsertCustomer({ name: d.name, email: d.email, phone: d.phone, company: d.business });
  const leadId = await saveLead({ name: d.name, email: d.email, phone: d.phone, whatsapp: d.phone, company: d.business, website: url.toString(), service: 'SEO Audit (Free)', source: 'free_audit' });
  const id = await startAudit({ plan: 'free', input: tierInput('free', { url: url.toString(), businessName: d.business, category: clean(b.category, 120) }), meta: { email: d.email, name: d.name, customerId, base: siteUrl(req) } });
  await store.linkLeadAudit(leadId, id);
  res.status(202).json({ id });
}));

// Customers poll this for progress while the audit runs.
pubApi.get('/audits/:id', h(async (req, res) => {
  const a = await store.getAudit(req.params.id);
  if (!a || a.plan === 'internal') return bad(res, 'not_found', 'This report does not exist or the link is incorrect.', 404);
  const out = { id: a.id, status: a.status, plan: a.plan, planName: TIERS[a.plan]?.name, website: a.website, createdAt: a.createdAt, error: a.error };
  if (a.status === 'running') out.progress = a.progress;
  if (a.status === 'complete') out.audit = shapeAudit(a.audit, a.plan);
  res.set({ 'x-robots-tag': 'noindex', 'cache-control': 'no-store' }).json(out);
}));

pubApi.post('/orders', h(async (req, res) => {
  const b = req.body || {};
  const plan = b.plan === 'p25' || b.plan === 'p50' ? b.plan : null;
  if (!plan) return bad(res, 'invalid_plan', 'Please choose an audit plan.');
  const d = { name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 20), business: clean(b.business, 160), url: clean(b.url, 400), category: clean(b.category, 120), location: clean(b.location, 120), requirements: clean(b.requirements, 1500) };
  if (!d.name) return bad(res, 'invalid_name', 'Please enter your full name.');
  if (!validEmail(d.email)) return bad(res, 'invalid_email', 'Please enter a valid email address.');
  if (!validPhone(d.phone)) return bad(res, 'invalid_phone', 'Please enter a valid WhatsApp number.');
  if (!d.business) return bad(res, 'invalid_business', 'Please enter your business name.');
  let url;
  try { url = normalizeInputUrl(d.url); } catch (e) { return bad(res, e.code, e.message); }
  if (rateLimited('order:' + req.ip, 10)) return bad(res, 'rate_limited', 'Too many requests. Please try again later.', 429);

  const amount = TIERS[plan].price; // server-side price — never taken from the request
  const customerId = await store.upsertCustomer({ name: d.name, email: d.email, phone: d.phone, company: d.business });
  const order = await store.createOrder({ ...d, website: url.toString(), plan, amount, customerId });
  await saveLead({ name: d.name, email: d.email, phone: d.phone, whatsapp: d.phone, company: d.business, website: url.toString(), service: TIERS[plan].name, message: d.requirements, source: `order_${plan}`, orderId: order.id });
  notifyOwner(`New ${TIERS[plan].name} order — ₹${amount}`, [`${d.name} · ${d.email} · ${d.phone}`, url.toString()]);
  res.status(201).json({ token: order.token });
}));

async function orderView(o) {
  const s = await siteSettings();
  const t = TIERS[o.plan];
  const text = `Hi Click2Client Media, I have completed the ₹${o.amount} payment for the ${t.name}. I am attaching my payment screenshot.\n\nName: ${o.name}\nBusiness: ${o.business}\nWebsite: ${o.website}\nEmail: ${o.email}\nOrder ref: ${o.id}`;
  const audit = o.audit_id ? await store.getAudit(o.audit_id) : null;
  return {
    ref: o.id, plan: o.plan, planName: t.name, pages: t.pages, amount: o.amount,
    paymentStatus: o.payment_status, paymentStatusLabel: statusLabel(o.payment_status),
    name: o.name, business: o.business, website: o.website, email: o.email, createdAt: o.created_at,
    qrAvailable: true, upiId: s.upiId || null, payeeName: s.payeeName,
    upiLink: upiLink({ upiId: s.upiId, payeeName: s.payeeName, amount: o.amount, note: `${t.short} ${o.id}` }),
    whatsappHref: `https://wa.me/${s.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`,
    auditId: o.payment_status === 'verified' ? o.audit_id : null,
    auditStatus: o.payment_status === 'verified' ? audit?.status || null : null,
  };
}

pubApi.get('/orders/:token', h(async (req, res) => {
  const o = await store.getOrderByToken(req.params.token);
  if (!o) return bad(res, 'not_found', 'Order not found. Please check your link.', 404);
  res.set({ 'x-robots-tag': 'noindex', 'cache-control': 'no-store' }).json(await orderView(o));
}));

pubApi.post('/orders/:token/submitted', h(async (req, res) => {
  const o = await store.getOrderByToken(req.params.token);
  if (!o) return bad(res, 'not_found', 'Order not found.', 404);
  // Clicking the WhatsApp button only tells us a screenshot is on its way. It never marks the order paid.
  if (o.payment_status === 'pending') await store.updateOrder(o.id, { payment_status: 'screenshot_received' });
  res.json(await orderView(await store.getOrderByToken(req.params.token)));
}));

// QR uploaded in Admin → Settings takes priority; otherwise the built-in QR
// (a static file, served by Vercel's CDN) is used.
const DEFAULT_QR = '/img/payment-qr.webp';
pubApi.get('/payment-qr', h(async (req, res) => {
  const qr = await store.getSetting('payment_qr', null);
  if (!qr) return res.set('cache-control', 'no-cache').redirect(302, DEFAULT_QR);
  res.set({ 'content-type': qr.mime, 'cache-control': 'no-cache' }).send(Buffer.from(qr.data, 'base64'));
}));

const leadHandler = h(async (req, res) => {
  const b = req.body || {};
  const l = { name: clean(b.name, 120), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 20), whatsapp: clean(b.whatsapp || b.phone, 20), company: clean(b.company || b.business, 160), website: clean(b.website, 300), service: clean(b.service, 120), message: clean(b.message, 2000), source: clean(b.source || b.intent || 'website', 60), auditId: clean(b.auditId, 40) || null };
  if (!l.name) return bad(res, 'invalid_name', 'Please enter your name.');
  if (!l.email && !l.phone) return bad(res, 'invalid_contact', 'Please share an email or phone number so we can reply.');
  if (l.email && !validEmail(l.email)) return bad(res, 'invalid_email', 'Please enter a valid email address.');
  if (l.phone && !validPhone(l.phone)) return bad(res, 'invalid_phone', 'Please enter a valid phone number.');
  if (rateLimited('lead:' + req.ip, 20)) return bad(res, 'rate_limited', 'Too many submissions. Please try again later.', 429);
  const id = await saveLead(l);
  res.status(201).json({ id, ok: true });
});
pubApi.post('/leads', leadHandler);

app.use('/api/public', pubApi);
app.post('/api/leads', leadHandler); // used by the shared lead modal

// ═════════════════════════════ ADMIN API ══════════════════════════════════
const admin = express.Router();
admin.post('/login', h(login));
admin.post('/logout', h(logout));
admin.get('/me', h(async (req, res) => {
  const s = await currentSession(req);
  if (!s) return bad(res, 'unauthorized', 'Please sign in.', 401);
  res.json({ ok: true, csrf: s.csrf });
}));
admin.use(h(requireAdmin));

admin.get('/stats', h(async (req, res) => res.json(await store.stats())));
admin.get('/leads', h(async (req, res) => res.json({ leads: await store.listLeads(), statuses: store.LEAD_STATUSES })));
admin.patch('/leads/:id', h(async (req, res) => {
  if (!store.LEAD_STATUSES.includes(req.body?.status)) return bad(res, 'invalid_status', 'Unknown status.');
  await store.updateLeadStatus(req.params.id, req.body.status);
  res.json({ ok: true });
}));

admin.get('/orders', h(async (req, res) => res.json({ orders: await store.listOrders(), statuses: store.PAYMENT_STATUSES })));
async function startPaidAudit(o, req) {
  const id = await startAudit({
    plan: o.plan,
    input: tierInput(o.plan, { url: o.website, businessName: o.business, category: o.category, city: o.location, location: o.location }),
    meta: { email: o.email, name: o.name, customerId: o.customer_id, orderId: o.id, base: siteUrl(req) },
  });
  await store.updateOrder(o.id, { audit_id: id });
  return id;
}
admin.patch('/orders/:id', h(async (req, res) => {
  const o = await store.getOrder(req.params.id);
  if (!o) return bad(res, 'not_found', 'Order not found.', 404);
  const status = req.body?.paymentStatus;
  if (status && !store.PAYMENT_STATUSES.includes(status)) return bad(res, 'invalid_status', 'Unknown payment status.');
  const fields = {};
  if (status) fields.payment_status = status;
  if (typeof req.body?.transactionId === 'string') fields.transaction_id = clean(req.body.transactionId, 80);
  if (typeof req.body?.note === 'string') fields.admin_note = clean(req.body.note, 500);
  if (status === 'verified' && o.payment_status !== 'verified') fields.verified_at = new Date().toISOString();
  await store.updateOrder(o.id, fields);
  let auditId = o.audit_id;
  // Only an admin marking the payment VERIFIED unlocks and starts the paid audit.
  if (status === 'verified' && !auditId) {
    try { auditId = await startPaidAudit(o, req); } catch (e) { return bad(res, 'audit_start_failed', `Payment saved, but the audit could not start: ${e.message}`); }
  }
  res.json({ ok: true, auditId });
}));
admin.post('/orders/:id/restart', h(async (req, res) => {
  const o = await store.getOrder(req.params.id);
  if (!o || o.payment_status !== 'verified') return bad(res, 'not_verified', 'Only verified orders can start an audit.');
  try { res.json({ auditId: await startPaidAudit(o, req) }); } catch (e) { bad(res, 'audit_start_failed', e.message); }
}));

admin.get('/audits', h(async (req, res) => res.json({ audits: await store.listAudits({ plan: req.query.plan || undefined, limit: 300 }) })));

// Permanent deletion of test or unwanted entries. Body: { ids: [...] }.
// Protected by the admin session + CSRF token like every other admin write.
const deleter = (fn) => h(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  if (!ids.length) return bad(res, 'no_ids', 'Select at least one entry to delete.');
  res.json({ ok: true, deleted: await fn(ids) });
});
admin.post('/leads/delete', deleter((ids) => store.deleteLeads(ids)));
admin.post('/orders/delete', deleter((ids) => store.deleteOrders(ids)));
admin.post('/audits/delete', deleter((ids) => store.deleteAudits(ids)));

admin.get('/settings', h(async (req, res) => {
  res.json({ settings: await siteSettings(), qrConfigured: Boolean(await store.getSetting('payment_qr', null)), integrations: integrationStatus(), pricing: { p25: TIERS.p25.price, p50: TIERS.p50.price }, database: store.databaseEnvVar });
}));
admin.put('/settings', h(async (req, res) => {
  const allowed = ['phone', 'whatsapp', 'email', 'instagram', 'facebook', 'upiId', 'payeeName', 'reportFooter', 'city', 'region', 'ga4Id', 'gtmId', 'gscVerification'];
  const next = {};
  for (const k of allowed) if (typeof req.body?.[k] === 'string') next[k] = clean(req.body[k], 400);
  if (typeof req.body?.testimonials === 'string') next.testimonials = String(req.body.testimonials).slice(0, 4000);
  const badUrl = (v) => v !== undefined && v !== '' && !/^https:\/\//.test(v);
  if (badUrl(next.instagram) || badUrl(next.facebook)) return bad(res, 'invalid_url', 'Social links must start with https://');
  if (next.ga4Id) next.ga4Id = next.ga4Id.toUpperCase();
  if (next.gtmId) next.gtmId = next.gtmId.toUpperCase();
  if (next.ga4Id && !/^G-[A-Z0-9]{4,15}$/.test(next.ga4Id)) return bad(res, 'invalid_ga4', 'The GA4 Measurement ID looks like G-XXXXXXXXXX.');
  if (next.gtmId && !/^GTM-[A-Z0-9]{4,10}$/.test(next.gtmId)) return bad(res, 'invalid_gtm', 'The Tag Manager container ID looks like GTM-XXXXXXX.');
  if (next.gscVerification) next.gscVerification = next.gscVerification.replace(/^.*content="([^"]+)".*$/, '$1').trim();
  if (next.gscVerification && !/^[A-Za-z0-9_-]{10,100}$/.test(next.gscVerification)) return bad(res, 'invalid_gsc', 'Paste the Search Console HTML-tag verification code (the content="…" value).');
  if (next.whatsapp && next.whatsapp.replace(/\D/g, '').length < 10) return bad(res, 'invalid_whatsapp', 'Enter the WhatsApp number with country code, e.g. 919940411837.');
  await store.setSetting('site', { ...(await store.getSetting('site', {})), ...next });
  res.json({ settings: await siteSettings() });
}));
admin.put('/settings/qr', h(async (req, res) => {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.dataUrl || '');
  if (!m) return bad(res, 'invalid_image', 'Upload a PNG, JPG or WebP image.');
  if (m[3].length > 1_400_000) return bad(res, 'too_large', 'Please use an image under 1 MB.');
  await store.setSetting('payment_qr', { mime: m[1], data: m[3] });
  res.json({ ok: true });
}));
admin.delete('/settings/qr', h(async (req, res) => { await store.setSetting('payment_qr', null); res.json({ ok: true }); }));

// Portfolio CMS (admin only — every route sits behind requireAdmin + CSRF)
const pfErr = (res, e) => bad(res, 'invalid', e.message, e.status || 400);
const pf = (fn) => h(async (req, res) => { try { await fn(req, res); } catch (e) { if (!e.status) throw e; pfErr(res, e); } });
admin.get('/portfolio', pf(async (req, res) => res.json({ projects: await portfolio.listProjects({ publishedOnly: false }), categories: await portfolio.listCategories(), media: media.mediaStatus() })));
admin.get('/portfolio/projects/:id', pf(async (req, res) => { const p = await portfolio.getProject(req.params.id); if (!p) return bad(res, 'not_found', 'Project not found.', 404); res.json(p); }));
admin.post('/portfolio/projects', pf(async (req, res) => res.status(201).json(await portfolio.saveProject(null, req.body || {}))));
admin.put('/portfolio/projects/:id', pf(async (req, res) => res.json(await portfolio.saveProject(req.params.id, req.body || {}))));
admin.patch('/portfolio/projects/:id', pf(async (req, res) => res.json(await portfolio.setFlags(req.params.id, req.body || {}))));
admin.post('/portfolio/projects/:id/duplicate', pf(async (req, res) => res.status(201).json(await portfolio.duplicateProject(req.params.id))));
admin.delete('/portfolio/projects/:id', pf(async (req, res) => { await portfolio.deleteProject(req.params.id); res.json({ ok: true }); }));
admin.put('/portfolio/order', pf(async (req, res) => { await portfolio.reorder(req.body?.ids); res.json({ ok: true }); }));
admin.post('/portfolio/categories', pf(async (req, res) => res.status(201).json({ slug: await portfolio.saveCategory(null, req.body || {}) })));
admin.put('/portfolio/categories/order', pf(async (req, res) => { await portfolio.reorderCategories(req.body?.slugs); res.json({ ok: true }); }));
admin.put('/portfolio/categories/:slug', pf(async (req, res) => res.json({ slug: await portfolio.saveCategory(req.params.slug, req.body || {}) })));
admin.delete('/portfolio/categories/:slug', pf(async (req, res) => { await portfolio.deleteCategory(req.params.slug); res.json({ ok: true }); }));
admin.get('/portfolio/media', pf(async (req, res) => res.json({ ...media.mediaStatus(), files: await media.listMedia({ fresh: req.query.fresh === '1' }) })));
admin.post('/portfolio/media', pf(async (req, res) => res.status(201).json(await media.uploadMedia(req.body?.folder, req.body?.filename, req.body?.dataUrl))));
admin.post('/portfolio/media/auto-match', pf(async (req, res) => res.json({ matched: await portfolio.autoMatchCovers(await media.listMedia({ fresh: true })) })));

// Blog management
admin.get('/blog', h(async (req, res) => res.json(await blog.getBlog())));
admin.post('/blog', h(async (req, res) => { try { res.status(201).json(await blog.upsertPost(null, req.body || {})); } catch (e) { pfErr(res, e); } }));
admin.put('/blog/:id', h(async (req, res) => { try { res.json(await blog.upsertPost(req.params.id, req.body || {})); } catch (e) { pfErr(res, e); } }));
admin.delete('/blog/:id', h(async (req, res) => { await blog.deletePost(req.params.id); res.json({ ok: true }); }));
admin.put('/blog/:id/cover', h(async (req, res) => { try { await blog.setCover(req.params.id, req.body?.dataUrl ?? null); res.json({ ok: true }); } catch (e) { pfErr(res, e); } }));
admin.delete('/blog/:id/cover', h(async (req, res) => { try { await blog.setCover(req.params.id, null); res.json({ ok: true }); } catch (e) { pfErr(res, e); } }));

app.use('/api/admin', admin);

// ── Internal audit workspace API (admin only) ───────────────────────────
const ws = express.Router();
ws.use(h(requireAdmin));
ws.get('/config', h(async (req, res) => {
  const s = await siteSettings();
  res.json({
    branding: { productName: 'Click2Client', companyName: s.companyName, phone: s.phone, whatsapp: s.whatsapp, email: s.email, reportFooter: s.reportFooter },
    modes: MODES, stages: STAGES, plan: { name: 'Admin', modes: ['homepage', 'quick', 'full'], maxPages: config.crawler.maxPagesCeiling, auditsPerHour: 200 },
    integrations: integrationStatus(), adminProtected: true,
  });
}));
ws.post('/audits', h(async (req, res) => {
  const b = req.body || {};
  const mode = MODES[b.mode] ? b.mode : 'homepage';
  try {
    const id = await startAudit({ plan: 'internal', input: { ...b, mode, crawlLimit: Math.max(2, Math.min(parseInt(b.crawlLimit, 10) || 25, config.crawler.maxPagesCeiling)) }, meta: { previousAuditId: b.previousAuditId } });
    res.status(202).json({ id, status: 'running' });
  } catch (e) { bad(res, e.code || 'invalid', e.message); }
}));
ws.get('/audits', h(async (req, res) => res.json({ audits: await store.listAudits({ domain: req.query.domain, limit: Math.min(parseInt(req.query.limit, 10) || 100, 300) }) })));
ws.get('/audits/:id', h(async (req, res) => {
  const a = await store.getAudit(req.params.id);
  if (!a) return bad(res, 'not_found', 'Audit not found.', 404);
  res.set('cache-control', 'no-store').json(a);
}));
ws.post('/audits/:id/reaudit', h(async (req, res) => {
  const a = await store.getAudit(req.params.id);
  if (!a?.input) return bad(res, 'not_found', 'Audit not found.', 404);
  try {
    const id = await startAudit({ plan: 'internal', input: { ...a.input, usePageSpeed: req.body?.usePageSpeed ?? a.input.usePageSpeed, skipAI: false }, meta: { previousAuditId: a.status === 'complete' ? a.id : null } });
    res.status(202).json({ id, status: 'running', previousAuditId: a.id });
  } catch (e) { bad(res, e.code || 'invalid', e.message); }
}));
ws.get('/audits/:id/compare', h(async (req, res) => {
  const curr = await store.getAudit(req.params.id);
  if (!curr?.audit) return bad(res, 'not_found', 'Audit not found or not complete.', 404);
  const prevId = req.query.with || curr.audit.previousAuditId;
  const prev = prevId && (await store.getAudit(prevId));
  if (!prev?.audit) return bad(res, 'no_previous', 'There is no earlier audit of this website to compare with.', 404);
  if (prev.domain !== curr.domain) return bad(res, 'domain_mismatch', 'Audits are for different websites.');
  res.json({ previousId: prevId, currentId: curr.id, comparison: compareAudits(prev.audit, curr.audit) });
}));
ws.get('/projects', h(async (req, res) => res.json({ projects: await store.listProjects() })));
app.use('/api', ws);

app.use('/api', (req, res) => bad(res, 'not_found', 'Unknown API route.', 404));

// ═════════════════════════════ PAGES ══════════════════════════════════════
for (const [id, p] of Object.entries(PAGES)) {
  app.get(p.path, h(async (req, res) => res.type('html').send(await renderPage(id, req))));
}
app.get(['/index.html', '/home'], (req, res) => res.redirect(301, '/'));
app.get(['/seo-audit/', '/services/', '/enquire/'], (req, res) => res.redirect(301, req.path.replace(/\/$/, '')));
// Analytics loader used by every public page. Loads nothing unless a GA4 or
// GTM ID is set in Admin → Settings. Exposes window.c2cTrack(event, params)
// and auto-tracks WhatsApp and phone clicks.
app.get('/analytics.js', h(async (req, res) => {
  const s = await siteSettings();
  const cfg = JSON.stringify({ ga4: /^G-[A-Z0-9]+$/.test(s.ga4Id || '') ? s.ga4Id : '', gtm: /^GTM-[A-Z0-9]+$/.test(s.gtmId || '') ? s.gtmId : '' });
  res.set({ 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'public, max-age=300' }).send(`(function(){var c=${cfg};var w=window,d=document;w.dataLayer=w.dataLayer||[];
if(c.gtm){w.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});var g=d.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtm.js?id='+c.gtm;d.head.appendChild(g);}
if(c.ga4){var s=d.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+c.ga4;d.head.appendChild(s);w.gtag=function(){w.dataLayer.push(arguments);};w.gtag('js',new Date());w.gtag('config',c.ga4);}
w.c2cTrack=function(n,p){p=p||{};try{w.dataLayer.push(Object.assign({event:n},p));if(c.ga4&&w.gtag)w.gtag('event',n,p);}catch(e){}};
d.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target:null;if(!t)return;if(t.closest('a[href*="wa.me/"]'))w.c2cTrack('whatsapp_click',{link_location:location.pathname});else if(t.closest('a[href^="tel:"]'))w.c2cTrack('phone_click',{link_location:location.pathname});},true);})();`);
}));

// Portfolio project pages (published; admins can preview drafts)
app.get('/portfolio/:slug', h(async (req, res, next) => {
  const p = await portfolio.getBySlug(req.params.slug);
  if (!p) return next();
  if (!p.published) {
    if (!(await currentSession(req).catch(() => null))) return next();
    res.set('x-robots-tag', 'noindex, nofollow');
  }
  res.type('html').send(await renderProject(req, p));
}));

app.get('/blog/:slug', h(async (req, res, next) => {
  const post = (await blog.publishedPosts()).find((p) => p.id === req.params.slug);
  if (!post) return next();
  res.type('html').send(await renderPost(req, post));
}));
app.get('/blog-img/:id', h(async (req, res) => {
  const img = await blog.getCover(req.params.id);
  if (!img) return res.status(404).end();
  res.set({ 'content-type': img.mime, 'cache-control': 'public, max-age=31536000, immutable' }).send(Buffer.from(img.data, 'base64'));
}));

app.get('/sitemap.xml', h(async (req, res) => res.type('application/xml').send(await sitemap(req))));
app.get('/robots.txt', (req, res) => res.type('text/plain').send(robots(req)));

const privatePage = (file) => (req, res) => res.set('x-robots-tag', 'noindex, nofollow').sendFile(path.join(pub, file));
app.get('/audit/:id', privatePage('audit.html'));
app.get('/report/:id', privatePage('report.html'));
app.get('/order/:token', privatePage('order.html'));
app.get('/admin', privatePage('admin.html'));
app.get('/app', h(requireAdminPage), privatePage('app.html'));

const page404 = `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | Click2Client Media</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/css/base.css"><link rel="stylesheet" href="/css/site.css"></head><body><main class="wrap" style="padding:120px 0;text-align:center"><p class="eyebrow">404</p><h1 class="display" style="font-size:44px;margin:12px 0">This page could not be found.</h1><p class="muted">The link may be broken or the page may have moved.</p><p style="margin-top:28px"><a class="btn primary" href="/">Go to homepage</a> <a class="btn outline" href="/seo-audit">Run a free SEO audit</a></p></main></body></html>`;
app.get(/\.html$/i, (req, res) => res.status(404).type('html').send(page404)); // page shells only via their routes
app.use(express.static(pub, { index: false, maxAge: 0, extensions: [] }));
app.use((req, res) => res.status(404).type('html').send(page404));

app.use((err, req, res, next) => {
  const dbMissing = err instanceof store.DatabaseConfigError;
  console.error(dbMissing ? `[config] ${err.message}` : err);
  if (req.path.startsWith('/api')) {
    return dbMissing
      ? bad(res, 'service_unavailable', 'This service is being set up. Please try again shortly or contact us on WhatsApp.', 503)
      : bad(res, 'internal', 'Unexpected server error. Please try again.', 500);
  }
  res.status(dbMissing ? 503 : 500).type('text').send(dbMissing ? 'This page is temporarily unavailable. Please try again shortly.' : 'Unexpected server error.');
});

export default app;
