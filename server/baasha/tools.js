// Tools the Baasha AI agent may use. Every tool is read-only and runs on the server with limits:
// there is no file access, no shell, and nothing is sent, bought, deleted or published.
import * as cheerio from 'cheerio';
import { generate } from './gemini.js';
import { safeFetch, UrlRejected } from './ssrf.js';

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
  if (!q) return { ok: false, error: 'Give a search query.' };
  const r = await generate({
    contents: [{ role: 'user', parts: [{ text: `Search the web and report the facts found for: ${q}\nBe concise. List concrete facts, names, numbers and dates, and say what you could not confirm.` }] }],
    tools: [{ google_search: {} }], maxOutputTokens: 1500, timeoutMs: 45000,
  }, signal);
  return { ok: true, query: q, summary: r.text.slice(0, 3500), sources: r.sources.slice(0, 8) };
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

// Runs one tool call. Always returns a plain object (never throws) so the agent loop can continue.
export async function runTool(name, args, ctx) {
  const a = args && typeof args === 'object' ? args : {};
  try {
    switch (name) {
      case 'web_search': { const r = await webSearch(a.query, ctx.signal); if (r.ok) r.sources.forEach((s) => ctx.sources.set(s.url, s)); return r; }
      case 'fetch_page': { const r = await fetchPage(a.url, ctx.signal); if (r.ok) ctx.sources.set(r.url, { title: r.title || r.url, url: r.url }); return r; }
      case 'calculate': return { ok: true, expression: String(a.expression).slice(0, 200), result: calculate(a.expression) };
      case 'current_datetime': return { ok: true, ...currentDatetime(a.timezone) };
      case 'write_report': {
        const title = String(a.title ?? 'Report').slice(0, 120), markdown = String(a.markdown ?? '').slice(0, 30000);
        if (markdown.trim().length < 20) return { ok: false, error: 'The report is empty.' };
        ctx.report = { title, markdown }; return { ok: true, saved: true, characters: markdown.length };
      }
      default: return { ok: false, error: `There is no tool called "${String(name).slice(0, 40)}".` };
    }
  } catch (e) {
    if (e?.code === 'cancelled') throw e;
    return { ok: false, error: String(e?.message || 'The tool failed.').slice(0, 300) };
  }
}
