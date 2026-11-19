// SEO / GEO / AEO agent living in the admin panel. State is one settings row ("seo_agent").
//   research → tasks (new articles)  ·  write → QA loop → draft  ·  publish (manual or capped auto)
//   audit → tasks (improve existing posts)  ·  conversions = leads by source
// Replaces the Linear board with a built-in task list. No SERP key? GSC + the LLM still work.

import * as store from './store/db.js';
import * as blog from './blog.js';
import * as google from '../blog-studio/google.js';
import { llm as altLlm, providers as altProviders } from '../blog-studio/ai.js';

const env = process.env;
const SITE = () => env.GSC_SITE || 'https://click2clientmedia.com/';
const DAY = 864e5;
const DEFAULT_CONTEXT = `Click2Client Media is an India-based digital agency. We sell SEO, GEO (generative engine) and AEO (answer engine) optimisation, SEO audits, websites, Meta ads and AI automation to small and mid-size businesses.
Ideal client: an owner or marketing head of a local or service business who wants more enquiries and clients, not traffic for its own sake.
Tone: plain, direct, practical, like a consultant explaining to a busy owner. Short sentences. No hype.
Offers to link to: free SEO audit (/seo-audit), enquiry form (/enquire), services (/services).`;

// ── state ────────────────────────────────────────────────────────────────
const fresh = () => ({ tasks: [], runs: [], config: { context: DEFAULT_CONTEXT, autoPublish: false, perDay: 1, seeds: '' } });
export async function getState() {
  const s = (await store.getSetting('seo_agent', null)) || fresh();
  s.config = { ...fresh().config, ...s.config };
  return s;
}
const put = (s) => store.setSetting('seo_agent', s);
const log = (s, msg) => { s.runs.unshift({ at: new Date().toISOString(), msg }); s.runs.length = Math.min(s.runs.length, 30); };
async function mutate(fn) { const s = await getState(); const r = await fn(s); await put(s); return r; }
const id = () => Math.random().toString(36).slice(2, 10);

export async function saveConfig(c) {
  return mutate((s) => {
    s.config.context = String(c.context ?? s.config.context).slice(0, 4000);
    s.config.seeds = String(c.seeds ?? s.config.seeds).slice(0, 2000);
    s.config.autoPublish = Boolean(c.autoPublish);
    s.config.perDay = Math.min(3, Math.max(1, Number(c.perDay) || 1)); // never mass-publish
    return s.config;
  });
}

// ── LLM: Claude (Sonnet writer / Haiku QA) → else Gemini → else OpenAI ─────
export const llmProvider = () => (env.ANTHROPIC_API_KEY ? 'anthropic' : altProviders().gemini ? 'gemini' : altProviders().openai ? 'openai' : null);

async function ask(system, user, { qa = false, maxTokens = 8000 } = {}) {
  const p = llmProvider();
  if (!p) throw Object.assign(new Error('No AI key set. Add ANTHROPIC_API_KEY (or GEMINI_API_KEY) to the server environment.'), { status: 409 });
  if (p !== 'anthropic') return altLlm(p, system, user, { json: false, maxTokens });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: qa ? env.SEO_QA_MODEL || 'claude-haiku-5-5' : env.SEO_WRITER_MODEL || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(170_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || `Claude API returned ${r.status}`), { status: 502 });
  return j.content?.map((c) => c.text || '').join('') || '';
}
const parseJson = (t) => {
  const m = /[[{][\s\S]*[\]}]/.exec(String(t));
  try { return JSON.parse(m ? m[0] : t); } catch { throw Object.assign(new Error('AI returned an unreadable answer. Try again.'), { status: 502 }); }
};

// ── optional SERP data (DataForSEO) ────────────────────────────────────────
export const serpConfigured = () => Boolean(env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD);
async function volumes(keywords) {
  if (!serpConfigured() || !keywords.length) return {};
  try {
    const r = await fetch('https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live', {
      method: 'POST', headers: { authorization: 'Basic ' + Buffer.from(`${env.DATAFORSEO_LOGIN}:${env.DATAFORSEO_PASSWORD}`).toString('base64'), 'content-type': 'application/json' },
      body: JSON.stringify([{ keywords: keywords.slice(0, 100), location_code: Number(env.DATAFORSEO_LOCATION || 2356), language_code: 'en' }]), signal: AbortSignal.timeout(60_000),
    });
    const j = await r.json();
    return Object.fromEntries((j.tasks?.[0]?.result || []).map((x) => [x.keyword, { volume: x.search_volume, competition: x.competition }]));
  } catch { return {}; }
}

// ── QA (deterministic + one cheap LLM pass for invented claims) ────────────
const TELLS = ['delve', "in today's fast-paced", 'game-changer', 'game changer', 'unlock the', 'in the ever-evolving', 'it is important to note', "it's important to note", 'navigate the landscape', 'tapestry', 'revolutionize', 'seamlessly', 'leverage the power'];
const words = (t) => (String(t).match(/\S+/g) || []).length;

export function qaCheck(a) {
  const issues = [];
  const add = (sev, msg) => issues.push({ sev, msg });
  const all = [a.title, a.metaTitle, a.metaDescription, a.excerpt, a.body, ...(a.faqs || []).flatMap((f) => [f.q, f.a])].join('\n');
  const kw = String(a.keyword || '').toLowerCase();
  const first = String(a.body || '').split(/\n\s*\n/).find((p) => p.trim() && !p.trim().startsWith('#')) || '';
  if (/[—–]/.test(all)) add('fail', 'Contains em/en dashes (an AI tell). Use commas, colons or full stops.');
  const tells = TELLS.filter((t) => all.toLowerCase().includes(t));
  if (tells.length >= 1) add('fail', `AI-sounding phrases: ${tells.join(', ')}.`);
  if (words(a.body) < 900) add('fail', `Too short (${words(a.body)} words). Aim for 1,000 to 1,600.`);
  if ((String(a.body).match(/^##\s/gm) || []).length < 3) add('fail', 'Needs at least 3 H2 sections.');
  if (kw && !String(a.title).toLowerCase().includes(kw)) add('fail', 'Target keyword missing from the title.');
  if (kw && !String(a.metaTitle || a.title).toLowerCase().includes(kw)) add('warn', 'Target keyword missing from the meta title.');
  if (kw && !first.toLowerCase().includes(kw) && !String(a.body).split(/\s+/).slice(0, 150).join(' ').toLowerCase().includes(kw)) add('fail', 'Target keyword missing from the first 150 words.');
  if (!a.metaTitle || a.metaTitle.length > 62) add('fail', 'Meta title must be 1 to 62 characters.');
  if (!a.metaDescription || a.metaDescription.length < 110 || a.metaDescription.length > 160) add('fail', 'Meta description must be 110 to 160 characters.');
  if (words(first) > 70) add('warn', 'AEO: open with a direct 1 to 2 sentence answer (under 60 words) so AI answer engines can quote it.');
  if ((a.faqs || []).length < 3) add('fail', 'AEO/GEO: add at least 3 FAQs (they become FAQ schema).');
  if (!/\]\(\/(enquire|seo-audit|services)/.test(a.body)) add('fail', 'No call to action: link to /enquire or /seo-audit.');
  if (!/\]\(\/(?!enquire|seo-audit)/.test(a.body) && !/\]\(\/(services|blog|products|courses)/.test(a.body)) add('warn', 'Add at least one internal link to another page.');
  if (!a.imageAlt) add('warn', 'No cover image alt text.');
  if (/\b\d{2,3}(\.\d+)?\s?%/.test(a.body) || /\b(studies show|research shows|according to)\b/i.test(a.body)) add('warn', 'Contains statistics or "studies show" claims. Verify them or remove.');
  return issues;
}

async function qaClaims(a) {
  try {
    const out = parseJson(await ask('You fact-check marketing articles. Reply with JSON only.', `List specific statistics, named studies, dated facts or guarantees in this article that cannot be verified from common knowledge and look invented. JSON: {"claims":["..."]}. Empty array if none.\n\n${a.body}`, { qa: true, maxTokens: 800 }));
    return (out.claims || []).slice(0, 5);
  } catch { return []; }
}

export async function qa(a) {
  const issues = qaCheck(a);
  for (const c of await qaClaims(a)) issues.push({ sev: 'fail', msg: `Possibly invented claim: "${String(c).slice(0, 140)}"` });
  const fails = issues.filter((i) => i.sev === 'fail').length;
  return { pass: fails === 0, score: Math.max(0, 100 - fails * 15 - (issues.length - fails) * 5), issues };
}

// ── research → new-article tasks ───────────────────────────────────────────
export async function research() {
  const s0 = await getState();
  const posts = (await blog.getBlog()).posts;
  let gsc = [];
  if (google.configured()) { try { gsc = await google.topQueries(SITE()); } catch (e) { gsc = []; } }
  const cand = gsc.filter((q) => q.impressions >= 5).sort((a, b) => b.impressions - a.impressions).slice(0, 60);
  const seeds = s0.config.seeds.split('\n').map((x) => x.trim()).filter(Boolean);
  const vol = await volumes([...cand.map((c) => c.key), ...seeds]);
  const known = [...s0.tasks.map((t) => t.keyword), ...posts.map((p) => p.keyword || p.title)].filter(Boolean);
  const prompt = `Business context:\n${s0.config.context}\n\nSearch Console queries (last 28 days, impressions/position):\n${cand.map((c) => `${c.key} | ${c.impressions} | ${c.position.toFixed(1)}${vol[c.key] ? ' | vol ' + vol[c.key].volume : ''}`).join('\n') || '(none yet, the site is new)'}\n\nSeed topics from the owner:\n${seeds.join('\n') || '(none)'}\n\nAlready covered (do not repeat):\n${known.join('\n') || '(none)'}\n\nPropose up to 8 keywords to write articles for. Prefer bottom-of-funnel and commercial-intent searches that bring paying clients (hire, agency, cost, pricing, best, vs, near me, how to choose, service-specific), plus a few AEO/GEO questions an AI assistant would be asked. The site is young, so favour low-competition long-tail terms.\nReply JSON only: [{"keyword":"","intent":"informational|commercial|transactional","format":"blog post|landing page","difficulty":"low|medium|high","funnel":"bottom|middle|top","why":"one line","brief":"3 to 5 lines: angle, reader, sections, the CTA"}]`;
  const ideas = parseJson(await ask('You are a senior SEO strategist. Reply with JSON only.', prompt, { maxTokens: 4000 }));
  return mutate((s) => {
    const have = new Set(s.tasks.map((t) => t.keyword.toLowerCase()));
    let n = 0;
    for (const i of Array.isArray(ideas) ? ideas : []) {
      const keyword = String(i.keyword || '').trim().toLowerCase().slice(0, 90);
      if (!keyword || have.has(keyword) || i.funnel === 'top') continue;
      const g = cand.find((c) => c.key === keyword);
      s.tasks.unshift({ id: id(), type: 'new', status: 'todo', keyword, intent: i.intent, format: i.format, difficulty: i.difficulty, funnel: i.funnel, why: String(i.why || '').slice(0, 200), brief: String(i.brief || '').slice(0, 900), impressions: g?.impressions ?? null, position: g ? +g.position.toFixed(1) : null, volume: vol[keyword]?.volume ?? null, createdAt: new Date().toISOString() });
      have.add(keyword); n++;
    }
    log(s, `Research: ${n} new keyword tasks${google.configured() ? '' : ' (Search Console not connected, used seed topics and AI only)'}.`);
    return n;
  });
}

// ── write → QA loop → draft ────────────────────────────────────────────────
const WRITER = (ctx) => `You write SEO articles that people enjoy reading and that AI answer engines can quote.
${ctx}
Rules: write for the reader first. Open with the direct answer in 1 to 2 sentences. Short paragraphs, concrete examples, real steps. Markdown subset only: ## and ### headings, - lists, **bold**, [text](/path) links, | tables |. 1,100 to 1,500 words. At least 4 H2 sections. Put the target keyword in the title, the first paragraph and one H2.
Never use em dashes or en dashes. Never use filler like "in today's fast-paced world", "unlock", "game-changer", "delve", "leverage". Do not invent statistics, studies, client results, prices or guarantees; speak from practical experience instead.
End the body with a short call to action linking to [free SEO audit](/seo-audit) or [enquire](/enquire). Add one internal link such as [our services](/services).
Reply JSON only: {"title":"","slug":"","excerpt":"max 200 chars","metaTitle":"max 60 chars with keyword","metaDescription":"125 to 155 chars","category":"","tags":[""],"imageAlt":"","body":"markdown without the H1","faqs":[{"q":"","a":"40 to 70 word answer"}]}  with 4 to 5 faqs.`;

export async function writeTask(taskId) {
  const s = await getState();
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t) throw Object.assign(new Error('Task not found.'), { status: 404 });
  await mutate((st) => { const x = st.tasks.find((y) => y.id === taskId); x.status = 'writing'; delete x.error; });
  try {
    let art = null, res = null, feedback = '';
    for (let round = 1; round <= 3; round++) {
      art = parseJson(await ask(WRITER(s.config.context), `Target keyword: ${t.keyword}\nSearch intent: ${t.intent}\nFormat: ${t.format}\nBrief: ${t.brief}\n${feedback ? `\nYour previous draft FAILED QA. Rewrite it fixing every item:\n${feedback}\n\nPrevious draft:\n${JSON.stringify(art)}` : ''}`));
      art.keyword = t.keyword;
      res = await qa(art);
      if (res.pass) break;
      feedback = res.issues.map((i) => `- [${i.sev}] ${i.msg}`).join('\n');
    }
    const rec = await blog.upsertRich(null, { ...art, status: 'draft', category: art.category || 'SEO' });
    await mutate((st) => { const x = st.tasks.find((y) => y.id === taskId); Object.assign(x, { status: res.pass ? 'ready' : 'qa_failed', postId: rec.id, qa: res }); log(st, `Wrote "${rec.title}" (QA ${res.pass ? 'passed' : 'FAILED after 3 rounds'}).`); });
  } catch (e) {
    await mutate((st) => { const x = st.tasks.find((y) => y.id === taskId); x.status = 'todo'; x.error = e.message; });
  }
}

export async function publishTask(taskId, { force = false } = {}) {
  const s = await getState();
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t?.postId) throw Object.assign(new Error('Nothing written for this task yet.'), { status: 400 });
  if (t.status !== 'ready' && !force) throw Object.assign(new Error('This draft has not passed QA. Fix it in the Blog tab or publish anyway.'), { status: 409 });
  const post = (await blog.getBlog()).posts.find((p) => p.id === t.postId);
  if (!post) throw Object.assign(new Error('Draft was deleted from the Blog tab.'), { status: 404 });
  await blog.upsertRich(post.id, { ...post, status: 'published' });
  await mutate((st) => { const x = st.tasks.find((y) => y.id === taskId); x.status = 'done'; x.publishedAt = new Date().toISOString(); log(st, `Published "${post.title}".`); });
}

// ── audit → improve tasks for live posts ───────────────────────────────────
export async function audit() {
  const posts = await blog.publishedPosts();
  const base = SITE().replace(/\/$/, '');
  let perf = {};
  if (google.configured()) { try { perf = Object.fromEntries((await google.searchPerformance(SITE())).map((r) => [r.key.replace(base, '').replace(/\/$/, ''), r])); } catch { perf = {}; } }
  const found = [];
  for (const p of posts) {
    const r = perf[`/blog/${p.id}`];
    const q = qaCheck({ ...p, keyword: p.keyword || '' }).filter((i) => i.sev === 'fail');
    const age = (Date.now() - Date.parse(p.date)) / DAY;
    if (q.length) found.push([p, 'Fails QA checks', q.map((i) => i.msg).join(' ')]);
    if (r && r.impressions >= 50 && r.ctr < 0.015) found.push([p, `Low CTR (${(r.ctr * 100).toFixed(1)}% on ${r.impressions} impressions)`, 'Rewrite the meta title and description to match the search intent and add a clearer benefit.']);
    else if (r && r.position > 7 && r.position <= 20 && r.impressions >= 20) found.push([p, `Ranking #${r.position.toFixed(0)}, close to page one`, 'Strengthen the section answering the main query, add FAQs and internal links pointing at this post.']);
    else if (!r && google.configured() && age > 21) found.push([p, 'No impressions after 21 days', 'Inspect the URL in Search Console (indexed?). Add internal links from the home page and related posts.']);
  }
  return mutate((s) => {
    let n = 0;
    for (const [p, title, fix] of found) {
      if (s.tasks.some((t) => t.type === 'improve' && t.postId === p.id && t.status !== 'done')) continue;
      s.tasks.unshift({ id: id(), type: 'improve', status: 'todo', keyword: p.keyword || p.title.toLowerCase(), postId: p.id, why: title, brief: fix, createdAt: new Date().toISOString() });
      n++;
    }
    log(s, `Audit: ${posts.length} live posts checked, ${n} improvement tasks.`);
    return n;
  });
}

export async function patchTask(taskId, status) {
  return mutate((s) => { const x = s.tasks.find((y) => y.id === taskId); if (x && ['todo', 'done', 'dismissed'].includes(status)) x.status = status; });
}
export const deleteTask = (taskId) => mutate((s) => { s.tasks = s.tasks.filter((t) => t.id !== taskId); });

// ── weekly/daily tick, called by an external cron hitting /api/seo/cron ─────
export async function tick() {
  const s = await getState();
  const last = (re) => Date.parse(s.runs.find((r) => re.test(r.msg))?.at || 0);
  if (Date.now() - last(/^Research/) > 7 * DAY) await research().catch(() => {});
  if (Date.now() - last(/^Audit/) > 7 * DAY) await audit().catch(() => {});
  const st = await getState();
  const today = new Date().toISOString().slice(0, 10);
  let publishedToday = st.tasks.filter((t) => (t.publishedAt || '').startsWith(today)).length;
  const cap = st.config.perDay;
  for (const t of st.tasks.filter((x) => x.type === 'new' && x.status === 'todo').slice(0, cap)) await writeTask(t.id);
  if (st.config.autoPublish) for (const t of (await getState()).tasks.filter((x) => x.status === 'ready')) { if (publishedToday >= cap) break; await publishTask(t.id).catch(() => {}); publishedToday++; }
}

// ── status + conversions (leads by source) + llms.txt for GEO ───────────────
export async function overview() {
  const s = await getState();
  const stats = await store.stats().catch(() => ({}));
  return {
    state: s,
    connections: [
      { name: 'Search Console', ok: google.configured(), hint: 'Set GOOGLE_SERVICE_ACCOUNT_JSON and add its email as a user on the Search Console property.' },
      { name: 'AI writer', ok: Boolean(llmProvider()), hint: 'Set ANTHROPIC_API_KEY (Claude) or GEMINI_API_KEY.', detail: llmProvider() },
      { name: 'Keyword volumes (DataForSEO)', ok: serpConfigured(), hint: 'Optional. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.' },
      { name: 'Auto-run cron', ok: Boolean(env.SEO_CRON_TOKEN), hint: 'Set SEO_CRON_TOKEN, then call POST /api/seo/cron daily with header "Authorization: Bearer <token>".' },
    ],
    conversions: stats.bySource || [],
    site: SITE(),
  };
}

export async function llmsTxt(origin) {
  const posts = await blog.publishedPosts();
  return `# Click2Client Media\n> Digital agency: SEO, GEO and AEO optimisation, SEO audits, websites, Meta ads and AI automation for growing businesses.\n\n## Key pages\n- [Services](${origin}/services)\n- [Free SEO audit](${origin}/seo-audit)\n- [Enquire](${origin}/enquire)\n- [Blog](${origin}/blog)\n\n## Articles\n${posts.map((p) => `- [${p.title}](${origin}/blog/${p.id}): ${p.excerpt || ''}`).join('\n')}\n`;
}
