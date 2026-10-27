// Abuse protection for a public endpoint that spends the site owner's AI quota.
// Counters live in memory per server instance, so on serverless hosting they are approximate (documented).
const hits = new Map();           // key -> number[] (timestamps)
let day = { key: '', n: 0 };

// true when the caller is over `max` requests within `windowMs`
export function rateLimited(key, max, windowMs = 3600_000, now = Date.now()) {
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return false;
}

// global daily ceiling (BAASHA_DAILY_LIMIT, default 600 AI requests per instance per UTC day)
export function dailyCapReached(now = new Date()) {
  const k = now.toISOString().slice(0, 10);
  if (day.key !== k) day = { key: k, n: 0 };
  const cap = Number(process.env.BAASHA_DAILY_LIMIT) || 600;
  if (day.n >= cap) return true;
  day.n += 1; return false;
}

export const LIMITS = { chat: 40, research: 15, agent: 6 };   // per IP per hour
export function resetLimits() { hits.clear(); day = { key: '', n: 0 }; }
