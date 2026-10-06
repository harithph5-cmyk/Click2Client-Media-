// Audit products. Prices and page limits are decided here, on the server.
// What each tier is allowed to SEE is enforced by shapeAudit() before any
// audit data leaves the server — never by hiding things in the browser.

import { config } from '../config.js';
import * as store from '../store/db.js';

// Prices for the paid audits. Defaults come from the environment
// (PRICE_25_PAGE_AUDIT / PRICE_50_PAGE_AUDIT); the admin can change them in
// Admin → Settings, which stores them in the database. Every server instance
// refreshes its copy at most every 30 s, and orders always use this server-side
// value — never a price sent by the browser.
const live = { p25: config.pricing.p25, p50: config.pricing.p50 };
let checkedAt = 0;
export async function refreshPricing(force = false) {
  if (!force && Date.now() - checkedAt < 30_000) return live;
  checkedAt = Date.now();
  try {
    const saved = await store.getSetting('audit_pricing', null);
    if (saved) Object.assign(live, { p25: Number(saved.p25) || live.p25, p50: Number(saved.p50) || live.p50 });
  } catch { /* keep the last known prices if the database is briefly unreachable */ }
  return live;
}
export async function savePricing(body) {
  const n = (v, label) => { const x = Math.round(Number(v)); if (!Number.isFinite(x) || x < 1 || x > 100000) throw Object.assign(new Error(label + ' must be a whole number between 1 and 100000.'), { status: 400 }); return x; };
  const next = { p25: n(body?.p25, '25-page price'), p50: n(body?.p50, '50-page price') };
  await store.setSetting('audit_pricing', next);
  Object.assign(live, next);
  checkedAt = Date.now();
  return { ...live };
}

export const TIERS = {
  free: {
    id: 'free',
    name: 'Free 10-Page SEO Audit',
    short: 'Free audit',
    pages: 10,
    price: 0,
    focus: 'What is wrong?',
  },
  p25: {
    id: 'p25',
    name: '25-Page SEO Audit',
    short: '25-page audit',
    pages: 25,
    get price() { return live.p25; },
    focus: 'What is wrong — and how to fix it.',
  },
  p50: {
    id: 'p50',
    name: '50-Page SEO Growth Audit',
    short: '50-page growth audit',
    pages: 50,
    get price() { return live.p50; },
    focus: 'What should I do next?',
  },
  internal: { id: 'internal', name: 'Internal audit', short: 'Internal', pages: 100, price: 0, focus: 'Full access' },
};

export const publicTiers = () => ['free', 'p25', 'p50'].map((id) => ({ id, name: TIERS[id].name, pages: TIERS[id].pages, price: TIERS[id].price, focus: TIERS[id].focus }));

const STRIP_FIX = ['recommendation', 'implementation', 'implementationType', 'effort', 'expectedImpact', 'bucket'];

/**
 * Returns a copy of the audit containing only what the tier includes.
 *  free → issues, evidence, why it matters, affected pages. No fixes, no roadmap.
 *  p25  → + recommendation, how to fix, impact. No roadmap / effort / weekly plan.
 *  p50 & internal → everything.
 */
export function shapeAudit(audit, tier) {
  const a = structuredClone(audit);
  a.tier = tier;
  a.tierName = TIERS[tier]?.name || tier;
  a.locked = { recommendations: tier === 'free', roadmap: tier === 'free' || tier === 'p25', consultant: tier === 'free' };
  if (a.locked.recommendations) {
    a.issues = a.issues.map((i) => {
      for (const k of STRIP_FIX) delete i[k];
      return i;
    });
  }
  if (a.locked.roadmap) {
    a.roadmap = null;
    a.issueGroups = null;
    a.issues = a.issues.map((i) => { delete i.effort; delete i.bucket; return i; });
  }
  const ai = a.interpretation?.ai;
  if (ai?.available) {
    if (a.locked.consultant) a.interpretation.ai = { available: true, executiveSummary: ai.executiveSummary, sitePositioning: ai.sitePositioning, keyFindings: ai.keyFindings, strengths: ai.strengths, issueNotes: [] };
    else if (a.locked.roadmap) a.interpretation.ai.issueNotes = ai.issueNotes.map((n) => ({ issueId: n.issueId, consultantNote: n.consultantNote, suggestedFix: n.suggestedFix }));
  }
  return a;
}

// Simple in-memory per-key rate limiter (use Redis when running several instances).
const hits = new Map();
export function rateLimited(key, perHour) {
  const nowMs = Date.now();
  const list = (hits.get(key) || []).filter((t) => nowMs - t < 3600_000);
  if (list.length >= perHour) { hits.set(key, list); return true; }
  list.push(nowMs);
  hits.set(key, list);
  return false;
}
