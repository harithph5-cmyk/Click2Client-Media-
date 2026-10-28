// Tools the Baasha AI agent may use. Every tool is read-only and runs on the server with limits:
// there is no file access, no shell, and nothing is sent, bought, deleted or published.
import * as cheerio from 'cheerio';
import { generate, tripped } from './gemini.js';
import { safeFetch, UrlRejected } from './ssrf.js';
import { searchWeb, SearchError } from './search.js';

/* ---------- calculator: a real parser, never eval ---------- */
export function calculate(expression) {
  const src = String(expression ?? '').trim();
  if (!src || src.length > 200) throw new Error('Give a short arithmetic expression.');
  const tokens = src.toLowerCase().match(/\d+\.?\d*(?:e[+-]?\d+)?|[a-z]+|[-+*/^%(),]|\S/g);
  let i = 0;
  const fns = { sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, ln: Math.log, log10: Math.log10 };
  const consts = { pi: Math.PI, e: Math.E };
  const peek = () => tokens[i], next = () => tokens[i++];
  function primary() {
    const t = next();
    if (t === undefined) throw new Error('The expression ended unexpectedly.');
    if (/^\d/.test(t)) return Number(t);
    if (t === '(') { const v = expr(); if (next() !== ')') throw new Error('Missing a closing bracket.'); return v; }
    if (t === '-') return -power();
    if (t === '+') return power();
    if (t in consts) return consts[t];
    if (t in fns) {
      if (next() !== '(') throw new Error(`${t} needs brackets, like ${t}(4).`);
      const args = []; if (peek() !== ')') { do { args.push(expr()); } while (peek() === ',' && next()); }
      if (next() !== ')') throw new Error('Missing a closing bracket.');
      return fns[t](...args);
    }
    throw new Error(`I can't use "${t}" in a calculation.`);
  }
  function power() { const b = primary(); if (peek() === '^') { next(); return b ** power(); } return b; }
  function term() { let v = power(); while (peek() === '*' || peek() === '/' || peek() === '%') { const o = next(), r = power(); v = o === '*' ? v * r : o === '/' ? v / r : v % r; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const o = next(), r = term(); v = o === '+' ? v + r : v - r; } return v; }
  const v = expr();
  if (i < tokens.length) throw new Error('I could not read the end of that expression.');
  if (!Number.isFinite(v)) throw new Error('That calculation has no finite result.');
  return Math.round(v * 1e10) / 1e10;
}

export function currentDatetime(timezone) {
  let tz = 'UTC';
  if (timezone) { try { new Intl.DateTimeFormat('en', { timeZone: String(timezone) }); tz = String(timezone); } catch { /* keep UTC */ } }
  return { timezone: tz, iso: new Date().toISOString(), local: new Intl.DateTimeFormat('en-GB', { dateStyle: 'full', timeStyle: 'long', timeZone: tz }).format(new Date()) };
}

/* ---------- reading a public web page ---------- */
export function pageText(html, limit = 6000) {
  const $ = cheerio.load(html);
  $('script,style,noscript,svg,iframe,nav,footer,header,form,aside').remove();
  $('p,div,li,h1,h2,h3,h4,h5,h6,br,tr,td,th,section,article').after(' ');   // keep words from running together
  const title = $('title').first().text().trim().replace(/\s+/g, ' ').slice(0, 200);
  const main = $('main, article').first().length ? $('main, article').first() : $('body');
  const text = main.text().replace(/\s+/g, ' ').trim();
  return { title, text: text.slice(0, limit), truncated: text.length > limit };
}

export async function fetchPage(url, signal) {
  try {
    const r = await safeFetch(url, { signal });
    if (r.status >= 400) return { ok: false, error: `The page answered with HTTP ${r.status}.` };
    const isHtml = /html|xml/i.test(r.type || '') || /^\s*</.test(r.body);
    const body = isHtml ? pageText(r.body) : { title: '', text: r.body.slice(0, 6000), truncated: r.body.length > 6000 };
    return { ok: true, url: r.url, ...body };
  } catch (e) {
    return { ok: false, error: e instanceof UrlRejected ? e.message : 'The page could not be opened.' };
  }
}

/* ---------- web search through Gemini's Google Search grounding ---------- */
export async function webSearch(query, signal) {
  const q = String(query ?? '').trim().slice(0, 300);
  if (!q) return { ok: false, category: 'bad_input', error: 'Give a search query.' };
  // Google Search grounding has no free quota: when it is known to be blocked, or just said so, use the keyless search
  if (tripped('search')) return fallbackSearch(q, signal);
  let r;
  try {
    r = await groundedSearch(q, signal);
  } catch (e) {
    if (e?.kind === 'search_quota' || e?.kind === 'quota_daily') return fallbackSearch(q, signal);
    throw e;
  }
  const sources = r.sources.slice(0, 8);
  // a search that worked but found nothing is reported as such, not as a failure and not as evidence
  return { ok: true, query: q, summary: r.text.slice(0, 3500), sources, empty: !sources.length, retries: (r.attempts || 1) - 1 };
}

// Keyless search: the facts are the real titles and snippets of the results (no AI summary, so no model quota is used).
async function fallbackSearch(q, signal) {
  try {
    const found = await searchWeb(q, signal, 6);
    return { ok: true, query: q, via: 'web', summary: found.map((r) => `${r.title} (${r.url}): ${r.snippet}`).join('\n').slice(0, 3500), sources: found.map(({ title, url }) => ({ title, url })), empty: false, note: 'General web search results; use fetch_page to read a page before relying on it.' };
  } catch (e) {
    if (e?.code === 'cancelled') throw e;
    if (e instanceof SearchError) {
      if (e.kind === 'no_results') return { ok: true, query: q, via: 'web', summary: 'The search found no results.', sources: [], empty: true };
      return { ok: false, category: `search_${e.kind}`, error: e.message };
    }
    throw e;
  }
}

async function groundedSearch(q, signal) {
  const r = await generate({
    contents: [{ role: 'user', parts: [{ text: `Search the web and report the facts found for: ${q}
Be concise. List concrete facts, names, numbers and dates, and say what you could not confirm.` }] }],
    tools: [{ google_search: {} }], maxOutputTokens: 1500, timeoutMs: 45000,
  }, signal);
  return r;
}

/* ---------- registry ---------- */
export const DECLARATIONS = [
  { name: 'web_search', description: 'Search the web for current information. Returns a factual summary and real source links.',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'What to search for' } }, required: ['query'] } },
  { name: 'fetch_page', description: 'Open one public web page and read its text. Use a URL that came from a search result or from the user.',
    parameters: { type: 'OBJECT', properties: { url: { type: 'STRING', description: 'Full http(s) address' } }, required: ['url'] } },
  { name: 'calculate', description: 'Evaluate an arithmetic expression exactly (supports + - * / ^ % brackets, sqrt, abs, round, min, max).',
    parameters: { type: 'OBJECT', properties: { expression: { type: 'STRING' } }, required: ['expression'] } },
  { name: 'current_datetime', description: 'Get the current date and time, optionally in an IANA timezone such as Asia/Kolkata.',
    parameters: { type: 'OBJECT', properties: { timezone: { type: 'STRING' } } } },
  { name: 'write_report', description: 'Save the finished deliverable as a Markdown report the user can download. Call it once, at the end, with the complete report.',
    parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, markdown: { type: 'STRING' } }, required: ['title', 'markdown'] } },
];

export const LABELS = { web_search: 'Searching the web', fetch_page: 'Reading a web page', calculate: 'Calculating', current_datetime: 'Checking the date and time', write_report: 'Writing the report' };

const LIMITS = { web_search: 4, fetch_page: 6 };       // calls per task, so one task cannot burn the quota
const norm = (v) => String(v ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const PERSISTENT = new Set(['search_quota', 'quota_daily', 'auth', 'model', 'not_configured', 'search_blocked']);

// Runs one tool call. Always returns a plain object (never throws) so the agent loop can continue.
// Failures are {ok:false, category, error}; a repeated identical call reuses the earlier result (deduped:true).
export async function runTool(name, args, ctx) {
  const a = args && typeof args === 'object' ? args : {};
  ctx.cache ||= new Map(); ctx.counts ||= {};
  const research = name === 'web_search' || name === 'fetch_page';
  const key = research ? `${name}:${norm(name === 'web_search' ? a.query : a.url)}` : null;
  if (key && ctx.cache.has(key)) return { ...ctx.cache.get(key), deduped: true };
  if (name === 'web_search' && ctx.searchDown) return { ok: false, skipped: true, category: ctx.searchDown.category, error: `Web search is not available in this task: ${ctx.searchDown.error}` };
  if (research && (ctx.counts[name] || 0) >= LIMITS[name]) return { ok: false, skipped: true, category: 'limit', error: `The limit of ${LIMITS[name]} ${name === 'web_search' ? 'searches' : 'pages'} per task was reached.` };
  if (research) ctx.counts[name] = (ctx.counts[name] || 0) + 1;
  let result;
  try {
    switch (name) {
      case 'web_search': { result = await webSearch(a.query, ctx.signal); if (result.ok) result.sources.forEach((s) => ctx.sources.set(s.url, s)); break; }
      case 'fetch_page': { result = await fetchPage(a.url, ctx.signal); if (result.ok) ctx.sources.set(result.url, { title: result.title || result.url, url: result.url }); break; }
      case 'calculate': return { ok: true, expression: String(a.expression).slice(0, 200), result: calculate(a.expression) };
      case 'current_datetime': return { ok: true, ...currentDatetime(a.timezone) };
      case 'write_report': {
        const title = String(a.title ?? 'Report').slice(0, 120), markdown = String(a.markdown ?? '').slice(0, 30000);
        if (markdown.trim().length < 20) return { ok: false, category: 'bad_input', error: 'The report is empty.' };
        ctx.report = { title, markdown }; return { ok: true, saved: true, characters: markdown.length };
      }
      default: return { ok: false, category: 'bad_input', error: `There is no tool called "${String(name).slice(0, 40)}".` };
    }
  } catch (e) {
    if (e?.code === 'cancelled') throw e;
    // provider errors keep their kind (quota, timeout...) and message; anything else is a plain tool error
    result = { ok: false, category: e?.kind || 'tool_error', error: String(e?.message || 'The tool failed.').slice(0, 300), retries: Math.max(0, (e?.attempts || 1) - 1) };
  }
  if (!result.ok && name === 'fetch_page') result.category ||= 'page_error';
  if (name === 'web_search' && !result.ok) {
    ctx.searchFails = (ctx.searchFails || 0) + 1;
    if (PERSISTENT.has(result.category) || ctx.searchFails >= 2) ctx.searchDown = result;   // do not keep running a failing search
  }
  if (key) ctx.cache.set(key, result);
  return result;
}
