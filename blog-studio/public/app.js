import { formatBody, faqHtml } from '/md.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const slugify = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
const fmt = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const lvl = (n) => (n >= 80 ? 'hi' : n >= 55 ? 'mid' : '');

let S = null; // server state
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, { method, headers: { 'content-type': 'application/json', 'x-studio': '1' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { showLogin(); throw new Error('Signed out'); }
  if (!r.ok) throw Object.assign(new Error(j.error?.message || 'Request failed'), { data: j.error });
  return j;
}
let toastT;
function toast(msg, bad) { const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), bad ? 6000 : 2800); }

// ── Icons / nav ──────────────────────────────────────────────────────────
const IC = { grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', plus: 'M12 5v14M5 12h14', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01', cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4', spark: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z', search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4', msg: 'M4 5h16v11H9l-5 4z', globe: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2', gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19 12l2-1-2-4-2 .5-1.5-1L15 4H9l-.5 2.5-1.5 1L5 7l-2 4 2 1v1l-2 1 2 4 2-.5 1.5 1L9 20h6l.5-2.5 1.5-1 2 .5 2-4-2-1z' };
const ico = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${IC[k]}"/></svg>`;
const NAV = [['dashboard', 'Dashboard', 'grid'], ['create', 'Create Blog', 'plus'], ['blogs', 'All Blogs', 'list'], ['calendar', 'Content Calendar', 'cal'], ['ai', 'AI Article Generator', 'spark'], ['seo', 'SEO Optimization', 'search'], ['aeo', 'AEO Optimization', 'msg'], ['geo', 'GEO Optimization', 'globe'], ['google', 'Google Performance', 'chart'], ['settings', 'Settings', 'gear']];

// ── Login ────────────────────────────────────────────────────────────────
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; }
$('#loginForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try { await api('/login', 'POST', { email: f.get('email'), password: f.get('password') }); await boot(); } catch (er) { $('#loginErr').textContent = er.message; }
});

async function boot() {
  try { S = await api('/state'); } catch { return showLogin(); }
  $('#login').hidden = true; $('#app').hidden = false;
  $('#siteLink').href = S.site + '/blog';
  route();
}
addEventListener('hashchange', route);

async function route() {
  if (!S) return;
  const [path, q] = location.hash.slice(2).split('?');
  const [page = 'dashboard', arg] = path.split('/');
  const params = new URLSearchParams(q || '');
  const active = page === 'edit' ? 'create' : page;
  $('#nav').innerHTML = NAV.map(([k, l, i]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${ico(i)}${l}</a>`).join('');
  stopEditor();
  const fn = { dashboard, create, blogs, calendar, ai: aiPage, seo: (m) => optPage(m, 'seo'), aeo: (m) => optPage(m, 'aeo'), geo: (m) => optPage(m, 'geo'), google, settings, edit: (m) => editor(m, arg, params.get('tab')) }[page] || dashboard;
  const main = $('#main');
  main.innerHTML = '<p class="muted" style="padding:30px">Loading…</p>';
  try { await fn(main); } catch (er) { if (er.message !== 'Signed out') main.innerHTML = `<div class="card"><div class="notice bad">${e(er.message)}</div></div>`; }
}

const head = (title, sub, actions = '') => `<div class="top"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`;
const pill = (s) => `<span class="pill ${s}">${({ not_reviewed: 'not reviewed', needs_work: 'needs work' })[s] || s}</span>`;
const newBtn = '<a class="btn primary big" href="#/create">＋ Create New Blog</a>';

// ── Dashboard ────────────────────────────────────────────────────────────
async function dashboard(m) {
  const [d, { articles }] = await Promise.all([api('/dashboard'), api('/articles')]);
  const months = [...Array(7)].map((_, i) => { const x = new Date(); x.setMonth(x.getMonth() - 6 + i, 1); return x; });
  const counts = months.map((x) => articles.filter((a) => (a.publishedAt || a.createdAt).slice(0, 7) === x.toISOString().slice(0, 7)).length);
  const max = Math.max(1, ...counts);
  const st = (n, l, f, hl) => `<a class="card stat ${hl ? 'hl' : ''}" href="#/blogs${f ? '?f=' + f : ''}"><span>${l}</span><b>${n}</b></a>`;
  m.innerHTML = head('Dashboard', 'Your publishing pipeline at a glance.', newBtn) + `
  <div class="grid cols-3" style="grid-template-columns:repeat(6,1fr)">
    ${st(d.total, 'Total articles', '', true)}${st(d.published, 'Published', 'published')}${st(d.drafts, 'Drafts', 'draft')}${st(d.scheduled, 'Scheduled', 'scheduled')}${st(d.review, 'Awaiting review', 'review')}${st(d.needsUpdate, 'Needs updating', 'stale')}
  </div>
  <div class="grid cols-2" style="margin-top:16px">
    <div class="card dark"><h2>Articles by month</h2><div class="bars">${counts.map((n, i) => `<div><i class="${i === 6 ? 'cur' : ''}" style="height:${Math.max(6, (n / max) * 120)}px"></i>${months[i].toLocaleString('en', { month: 'short' })}</div>`).join('')}</div></div>
    <div class="card"><h2>Upcoming publishing</h2>${d.upcoming.length ? `<table>${d.upcoming.map((u) => `<tr><td><a class="t" href="#/edit/${u.id}">${e(u.title || 'Untitled')}</a></td><td>${fmt(u.planned_date)}</td><td>${pill(u.status)}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing planned. <a href="#/calendar">Open the calendar →</a></p>'}</div>
  </div>
  <div class="grid cols-2" style="margin-top:16px">
    <div class="card"><h2>Recent articles</h2>${d.recent.length ? `<table>${d.recent.map((a) => `<tr><td><a class="t" href="#/edit/${a.id}">${e(a.title || 'Untitled')}</a><div class="hint">${e(a.keyword)}</div></td><td>${pill(a.status)}</td><td class="hint">${fmt(a.updatedAt)}</td></tr>`).join('')}</table>` : '<p class="muted">No articles yet — create your first one.</p>'}</div>
    <div class="card"><h2>Publishing activity</h2>${d.activity.length ? `<table>${d.activity.map((h) => `<tr><td>${h.ok ? '✅' : '⚠️'} ${e(h.action)}<div class="hint">${e(h.title || '')}</div></td><td class="hint">${fmt(h.created_at)}</td></tr>`).join('')}</table>` : '<p class="muted">No publishing activity yet.</p>'}</div>
  </div>`;
}

async function create(m) { const a = await api('/articles', 'POST', {}); location.hash = `#/edit/${a.id}`; }

// ── Library ──────────────────────────────────────────────────────────────
let LIB = { f: 'all', q: '', cat: '', tag: '' };
async function blogs(m, ) {
  const qf = new URLSearchParams(location.hash.split('?')[1] || '').get('f');
  if (qf) LIB.f = qf;
  const { articles } = await api('/articles');
  const tabs = [['all', 'All'], ['draft', 'Drafts'], ['review', 'Review'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['stale', 'Needs updating']];
  const cats = [...new Set(articles.map((a) => a.category).filter(Boolean))], tags = [...new Set(articles.flatMap((a) => a.tags))];
  const draw = () => {
    const rows = articles.filter((a) => (LIB.f === 'all' || (LIB.f === 'stale' ? a.needsUpdate : a.status === LIB.f)) && (!LIB.cat || a.category === LIB.cat) && (!LIB.tag || a.tags.includes(LIB.tag)) && (!LIB.q || `${a.title} ${a.keyword} ${a.slug}`.toLowerCase().includes(LIB.q.toLowerCase())));
    $('#rows', m).innerHTML = rows.map((a) => `<tr>
      <td><a class="t" href="#/edit/${a.id}">${e(a.title || 'Untitled')}</a><div class="hint">${a.publishedUrl ? `<a href="${e(a.publishedUrl)}" target="_blank" rel="noopener">${e(a.publishedUrl.replace(/^https?:\/\//, ''))}</a>` : '/blog/' + e(a.slug)}</div></td>
      <td>${pill(a.status)}${a.needsUpdate ? ' <span class="pill stale">needs update</span>' : ''}</td><td>${e(a.keyword)}</td>
      <td class="hint">${fmt(a.createdAt)}<br>${fmt(a.publishedAt)}<br>${fmt(a.updatedAt)}</td>
      <td>${pill(a.review.seo)} ${pill(a.review.aeo)} ${pill(a.review.geo)}<div class="hint">SEO ${a.scores.seo} · AEO ${a.scores.aeo} · GEO ${a.scores.geo}</div></td>
      <td class="row"><a class="btn sm" href="#/edit/${a.id}">Edit</a><button class="btn sm danger" data-del="${a.id}" data-live="${a.remoteSlug ? 1 : 0}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No articles match.</td></tr>';
  };
  m.innerHTML = head('All Blogs', `${articles.length} articles`, newBtn) + `<div class="card">
    <div class="tabs">${tabs.map(([k, l]) => `<button data-f="${k}" class="${LIB.f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="row" style="margin-bottom:12px"><input id="q" placeholder="Search title, keyword, slug…" value="${e(LIB.q)}" style="max-width:320px">
      <select id="cat" style="max-width:180px"><option value="">All categories</option>${cats.map((c) => `<option ${LIB.cat === c ? 'selected' : ''}>${e(c)}</option>`).join('')}</select>
      <select id="tag" style="max-width:180px"><option value="">All tags</option>${tags.map((c) => `<option ${LIB.tag === c ? 'selected' : ''}>${e(c)}</option>`).join('')}</select></div>
    <div class="scroll"><table><thead><tr><th>Article</th><th>Status</th><th>Primary keyword</th><th>Created / Published / Updated</th><th>Reviews</th><th></th></tr></thead><tbody id="rows"></tbody></table></div></div>`;
  draw();
  $$('.tabs button', m).forEach((b) => (b.onclick = () => { LIB.f = b.dataset.f; $$('.tabs button', m).forEach((x) => x.classList.toggle('on', x === b)); draw(); }));
  $('#q', m).oninput = (ev) => { LIB.q = ev.target.value; draw(); };
  $('#cat', m).onchange = (ev) => { LIB.cat = ev.target.value; draw(); };
  $('#tag', m).onchange = (ev) => { LIB.tag = ev.target.value; draw(); };
  m.onclick = (ev) => { const b = ev.target.closest('[data-del]'); if (b) deleteArticle(b.dataset.del, b.dataset.live === '1').then((ok) => ok && route()); };
}

async function deleteArticle(id, live) {
  if (!confirm('Delete this article from Blog Studio? This cannot be undone.')) return false;
  let remote = false;
  if (live) remote = confirm('This article is on your website.\n\nOK = also DELETE it from the live website (URL will stop working).\nCancel = keep it live and only remove it from the studio.');
  try { await api(`/articles/${id}${remote ? '?remote=1' : ''}`, 'DELETE'); toast(remote ? 'Deleted here and from the website.' : 'Deleted from the studio.'); return true; } catch (er) { toast(er.message, true); return false; }
}

// ── Calendar ─────────────────────────────────────────────────────────────
let CAL = { view: 'month', at: new Date() };
async function calendar(m) {
  const [{ items, done }, { articles }] = await Promise.all([api('/calendar'), api('/articles')]);
  const iso = (d) => d.toISOString().slice(0, 10);
  const draw = () => {
    const at = new Date(CAL.at); let days, title;
    if (CAL.view === 'week') { at.setDate(at.getDate() - ((at.getDay() + 6) % 7)); days = [...Array(7)].map((_, i) => { const d = new Date(at); d.setDate(at.getDate() + i); return d; }); title = `Week of ${fmt(days[0])}`; } else {
      const first = new Date(at.getFullYear(), at.getMonth(), 1); const s = new Date(first); s.setDate(1 - ((first.getDay() + 6) % 7));
      days = [...Array(42)].map((_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return d; }); title = at.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); if (days[35].getMonth() !== at.getMonth()) days.length = 35;
    }
    const todayS = iso(new Date());
    const unplanned = articles.filter((a) => !a.plannedDate && a.status !== 'published');
    const chip = (x) => `<a class="chip ${x.status}" draggable="true" data-id="${x.id}" href="#/edit/${x.id}" title="${e(x.title)}">${x.done ? '✓ ' : ''}${e(x.title || 'Untitled')}</a>`;
    $('#calbody', m).innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="row"><button class="btn sm" id="prev">‹</button><h2 style="margin:0">${title}</h2><button class="btn sm" id="next">›</button><button class="btn sm" id="tod">Today</button></div>
      <div class="tabs" style="margin:0"><button data-v="month" class="${CAL.view === 'month' ? 'on' : ''}">Monthly</button><button data-v="week" class="${CAL.view === 'week' ? 'on' : ''}">Weekly</button></div></div>
      <div class="cal ${CAL.view}">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow">${d}</div>`).join('')}${days.map((d) => { const k = iso(d); return `<div class="day ${k === todayS ? 'today' : ''} ${d.getMonth() !== at.getMonth() && CAL.view === 'month' ? 'out' : ''}" data-d="${k}"><b>${d.getDate()}</b>${items.filter((x) => x.planned_date === k).map(chip).join('')}</div>`; }).join('')}</div>
      <p class="hint" style="margin-top:10px">Drag an article onto a date to plan or reschedule it. Scheduled articles are also moved on the website.</p>
      <h3 style="margin:18px 0 8px">Unplanned articles</h3><div class="row">${unplanned.map(chip).join('') || '<span class="muted">All articles have a date.</span>'}</div>`;
    $('#prev', m).onclick = () => { CAL.at.setDate(CAL.at.getDate() - (CAL.view === 'week' ? 7 : 28)); if (CAL.view === 'month') CAL.at.setDate(1); draw(); };
    $('#next', m).onclick = () => { if (CAL.view === 'week') CAL.at.setDate(CAL.at.getDate() + 7); else CAL.at = new Date(CAL.at.getFullYear(), CAL.at.getMonth() + 1, 1); draw(); };
    $('#tod', m).onclick = () => { CAL.at = new Date(); draw(); };
    $$('[data-v]', m).forEach((b) => (b.onclick = () => { CAL.view = b.dataset.v; draw(); }));
    $$('.chip', m).forEach((c) => (c.ondragstart = (ev) => ev.dataTransfer.setData('text/plain', c.dataset.id)));
    $$('.day', m).forEach((d) => {
      d.ondragover = (ev) => { ev.preventDefault(); d.classList.add('over'); }; d.ondragleave = () => d.classList.remove('over');
      d.ondrop = async (ev) => {
        ev.preventDefault();
        const id = ev.dataTransfer.getData('text/plain'); if (!id) return;
        try { await api(`/calendar/${id}`, 'PUT', { date: d.dataset.d }); toast('Date updated.'); route(); } catch (er) { toast(er.message, true); }
      };
    });
  };
  m.innerHTML = head('Content Calendar', 'Plan, schedule and track publishing.', newBtn) + `<div class="card" id="calbody"></div>
    <div class="card" style="margin-top:16px"><h2>Completed publishing activity</h2>${done.length ? `<table>${done.map((h) => `<tr><td>${e(h.action)}</td><td>${e(h.title || '')}</td><td class="hint">${fmt(h.created_at)}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing published yet.</p>'}</div>`;
  draw();
}

// ── AI generator ─────────────────────────────────────────────────────────
function aiPage(m) {
  m.innerHTML = head('AI Article Generator', 'Enter a topic and keyword. The article lands in the editor as a draft for you to review.') + `<div class="card" style="max-width:760px"><form id="gen" class="fields">
    <label class="full">Blog topic<input name="topic" required placeholder="e.g. How local businesses in Madurai can get more Google Maps enquiries"></label>
    <label>Primary keyword<input name="keyword" required placeholder="local seo madurai"></label>
    <label>Secondary keywords<input name="secondary" placeholder="comma separated (optional)"></label>
    <label>Search intent<select name="intent"><option>informational</option><option>commercial</option><option>transactional</option><option>navigational</option></select></label>
    <label>Target audience<input name="audience" placeholder="small business owners in India"></label>
    <label>AI provider<select name="provider"><option value="claude" ${S.providers.claude ? '' : 'disabled'}>Claude ${S.providers.claude ? '' : '(no key)'}</option><option value="gemini" ${S.providers.gemini ? '' : 'disabled'}>Gemini ${S.providers.gemini ? '' : '(no key)'}</option></select></label>
    <div class="full"><button class="btn primary big" id="go">Generate article</button> <span class="hint" id="gs"></span></div></form>
    ${!S.providers.claude && !S.providers.gemini ? '<div class="notice bad" style="margin-top:14px">No AI key found. Add ANTHROPIC_API_KEY and/or GEMINI_API_KEY to blog-studio/.env and restart.</div>' : ''}
    <p class="hint">AI is told never to invent statistics or sources; you still verify every claim before publishing.</p></div>`;
  $('#gen', m).onsubmit = async (ev) => {
    ev.preventDefault();
    const b = Object.fromEntries(new FormData(ev.target));
    $('#go', m).disabled = true; $('#gs', m).textContent = 'Writing… this takes 30–90 seconds.';
    try { const a = await api('/ai/generate', 'POST', b); location.hash = `#/edit/${a.id}?tab=seo`; } catch (er) { toast(er.message, true); $('#go', m).disabled = false; $('#gs', m).textContent = ''; }
  };
}

// ── SEO / AEO / GEO overview pages ───────────────────────────────────────
const OPT = { seo: ['SEO Optimization', 'Search Engine Optimization: can Google understand and rank this page?'], aeo: ['AEO Optimization', 'Answer Engine Optimization: does the page answer questions directly and briefly?'], geo: ['GEO Optimization', 'Generative Engine Optimization: is the page clear, trustworthy and well-sourced for AI search? No optimization guarantees citations by ChatGPT, Gemini or Perplexity.'] };
async function optPage(m, k) {
  const { articles } = await api('/articles');
  m.innerHTML = head(OPT[k][0], OPT[k][1]) + `<div class="card"><div class="scroll"><table><thead><tr><th>Article</th><th>Readiness</th><th>Review status</th><th></th></tr></thead><tbody>${articles.map((a) => `<tr><td><a class="t" href="#/edit/${a.id}?tab=${k}">${e(a.title || 'Untitled')}</a><div class="hint">${e(a.keyword)}</div></td><td><span class="score ${lvl(a.scores[k])}">${a.scores[k]}</span></td><td>${pill(a.review[k])}</td><td><a class="btn sm" href="#/edit/${a.id}?tab=${k}">Optimize</a></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No articles yet.</td></tr>'}</tbody></table></div></div>`;
}

// ── Google ───────────────────────────────────────────────────────────────
async function google(m) {
  const { articles } = await api('/articles');
  const live = articles.filter((a) => a.publishedUrl);
  m.innerHTML = head('Google Performance', 'Search Console and GA4 data for your published articles.') + `
  ${S.google ? '' : '<div class="notice" style="margin-bottom:16px">Google is not connected yet. Add a service-account key in <b>blog-studio/.env</b> and your property IDs in <a href="#/settings">Settings</a>. Until then these tools stay unavailable — no fake data is shown.</div>'}
  <div class="card"><div class="row"><select id="pg" style="max-width:480px"><option value="">All pages (top pages, last 28 days)</option>${live.map((a) => `<option value="${e(a.publishedUrl)}">${e(a.title)}</option>`).join('')}</select>
  <button class="btn dark" id="perf">Search performance</button><button class="btn" id="org">Organic landing-page traffic (GA4)</button><button class="btn primary" id="insp">URL Inspection</button></div>
  <p class="hint">URL Inspection reports Google's current index status. Google gives no way to force indexing, and no request guarantees it — if a page isn't indexed, fix content/links and let Google recrawl.</p><div id="gout" style="margin-top:14px"></div></div>`;
  const out = $('#gout', m), sel = $('#pg', m);
  const run = (fn) => async () => { out.innerHTML = '<p class="muted">Loading…</p>'; try { out.innerHTML = await fn(); } catch (er) { out.innerHTML = `<div class="notice bad">${e(er.message)}</div>`; } };
  const tbl = (cols, rows) => `<div class="scroll"><table><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${cols.length}" class="muted">No data for this period yet.</td></tr>`}</tbody></table></div>`;
  $('#perf', m).onclick = run(async () => { const { rows } = await api('/google/performance' + (sel.value ? '?page=' + encodeURIComponent(sel.value) : '')); return tbl([sel.value ? 'Query' : 'Page', 'Impressions', 'Clicks', 'CTR', 'Avg. position'], rows.map((r) => [r.key, r.impressions, r.clicks, (r.ctr * 100).toFixed(1) + '%', r.position.toFixed(1)])); });
  $('#org', m).onclick = run(async () => { const { rows } = await api('/google/organic' + (sel.value ? '?path=' + encodeURIComponent(new URL(sel.value).pathname) : '')); return tbl(['Landing page', 'Organic sessions', 'Users'], rows.map((r) => [r.page, r.sessions, r.users])); });
  $('#insp', m).onclick = run(async () => { if (!sel.value) throw new Error('Choose a published article first.'); const r = await api('/google/inspect?url=' + encodeURIComponent(sel.value)); return tbl(['Field', 'Value'], [['Verdict', r.verdict], ['Coverage', r.coverage], ['Indexing', r.indexing], ['Last crawl', r.lastCrawl], ['Google canonical', r.googleCanonical], ['Your canonical', r.userCanonical], ['robots.txt', r.robots]]) + (r.link ? `<p><a href="${e(r.link)}" target="_blank" rel="noopener">Open in Search Console ↗</a></p>` : ''); });
}

// ── Settings ─────────────────────────────────────────────────────────────
function settings(m) {
  const chip = (ok, l) => `<span class="pill ${ok ? 'published' : 'draft'}">${ok ? '●' : '○'} ${l}</span>`;
  m.innerHTML = head('Settings', 'Connections and integrations.', '<button class="btn" id="out">Sign out</button>') + `<div class="grid cols-2">
    <div class="card"><h2>Connections</h2><p>${chip(S.publisher, 'Website publishing API')} ${chip(S.providers.claude, 'Claude')} ${chip(S.providers.gemini, 'Gemini')} ${chip(S.google, 'Google')}</p>
    <p class="hint">Keys and tokens live only in <b>blog-studio/.env</b> on the server; they are never sent to the browser.</p>
    <p>Website: <b>${e(S.site)}</b></p>
    <h3 style="margin-top:14px">Website-side setup (one time)</h3><ol class="hint" style="line-height:1.8"><li>Deploy the website with the new <code>server/blog-api.js</code> (already in this repo).</li><li>Generate a token: <code>node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"</code></li><li>Set it as <code>BLOG_API_TOKEN</code> in the website's environment (Hostinger hPanel) <i>and</i> in <code>blog-studio/.env</code>.</li><li>Restart both. This page then shows “Website publishing API” as connected.</li></ol>
    <button class="btn dark" id="test">Test website connection</button> <span class="hint" id="tr"></span></div>
    <div class="card"><h2>Google properties</h2><form id="gf" class="fields"><label class="full">Search Console property<input name="gscSite" value="${e(S.settings.gscSite)}" placeholder="sc-domain:click2clientmedia.com  or  https://click2clientmedia.com/"></label>
    <label class="full">GA4 property ID<input name="ga4" value="${e(S.settings.ga4)}" placeholder="123456789"></label><div class="full"><button class="btn primary">Save</button></div></form>
    <p class="hint">Add the service account's email as a user on both properties. Requires the Search Console API and Analytics Data API enabled.</p></div></div>`;
  $('#out', m).onclick = async () => { await api('/logout', 'POST'); S = null; showLogin(); };
  $('#gf', m).onsubmit = async (ev) => { ev.preventDefault(); const b = Object.fromEntries(new FormData(ev.target)); await api('/settings', 'PUT', b); S.settings = b; toast('Saved.'); };
  $('#test', m).onclick = async () => { const r = $('#tr', m); r.textContent = 'Testing…'; try { const t = await api('/publish-test', 'POST'); r.textContent = `✅ Connected: ${t.site} (${t.posts} posts)`; } catch (er) { r.textContent = '❌ ' + er.message; } };
}

// ── Editor ───────────────────────────────────────────────────────────────
let A = null, pending = new Set(), analysis = null, tab = 'ai', saveT, anT, mode = 'write', lastRewrite = null, aiBusy = false, flushing = Promise.resolve();
const stopEditor = () => { clearTimeout(saveT); clearTimeout(anT); if (A && pending.size) flush(); A = null; };
const patch = (o, immediate) => { Object.assign(A, o); Object.keys(o).forEach((k) => pending.add(k)); setSaving('Unsaved…'); clearTimeout(saveT); saveT = setTimeout(flush, immediate ? 0 : 1200); queueAnalyze(); };
const setSaving = (t) => { const s = $('#saving'); if (s) s.textContent = t; };
async function flush() {
  clearTimeout(saveT);
  if (!A || !pending.size) return flushing;
  const keys = [...pending], body = Object.fromEntries(keys.map((k) => [k, A[k]])); pending.clear();
  const id = A.id;
  flushing = api(`/articles/${id}`, 'PUT', body).then((r) => { if (A?.id === id) { for (const k of ['slug', 'updatedAt', 'canonical']) if (!pending.has(k)) A[k] = r[k]; setSaving('Saved ' + new Date().toLocaleTimeString()); const sl = $('[data-f=slug]'); if (sl && sl !== document.activeElement) sl.value = A.slug; } }).catch((er) => { keys.forEach((k) => pending.add(k)); setSaving('Not saved'); toast(er.message, true); });
  return flushing;
}
function queueAnalyze() { clearTimeout(anT); anT = setTimeout(async () => { if (!A) return; try { analysis = await api('/analyze', 'POST', A); renderPanel(); renderMeta(); } catch {} }, 500); }

async function editor(m, id, startTab) {
  A = await api(`/articles/${id}`); pending = new Set(); tab = startTab || (A.body ? 'seo' : 'ai'); mode = 'write';
  const cats = S.categories;
  m.innerHTML = head(`<span id="ttl">${e(A.title || 'New article')}</span>`, `<span id="st">${pill(A.status)}</span> <span class="hint" id="saving">Saved</span>`, `<button class="btn" id="rev">Revisions</button><button class="btn primary" id="savebtn">Save</button>`) + `
  <div class="editor"><div class="col">
    <div class="card"><h2>Basics</h2><div class="fields">
      <label class="full">Blog topic<input data-f="topic" value="${e(A.topic)}"></label>
      <label>Primary keyword<input data-f="keyword" value="${e(A.keyword)}"></label>
      <label>Secondary keywords<input data-f="secondary" value="${e(A.secondary)}" placeholder="comma separated"></label>
      <label>Search intent<select data-f="intent">${['', 'informational', 'commercial', 'transactional', 'navigational'].map((o) => `<option ${A.intent === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label>Target audience<input data-f="audience" value="${e(A.audience)}"></label>
      <label class="full">Article title (H1)<input data-f="title" value="${e(A.title)}"></label>
      <label>URL slug<input data-f="slug" value="${e(A.slug)}"><span class="hint" id="urlprev"></span></label>
      <label>Author<input data-f="author" value="${e(A.author)}"></label>
      <label>Category<input data-f="category" list="cats" value="${e(A.category)}"><datalist id="cats">${cats.map((c) => `<option>${e(c)}</option>`).join('')}</datalist></label>
      <label>Tags<input data-f="tags" value="${e(A.tags.join(', '))}" placeholder="comma separated"></label>
      <label class="full">Short description (shown on the blog index)<textarea data-f="excerpt" rows="2" maxlength="300">${e(A.excerpt)}</textarea></label>
      <label>Planned publish date<input type="date" data-f="plannedDate" value="${e(A.plannedDate)}"></label>
      <label>Status<select data-f="status" ${A.status === 'published' || A.status === 'scheduled' ? 'disabled' : ''}>${['draft', 'review'].map((o) => `<option ${A.status === o ? 'selected' : ''}>${o}</option>`).concat(A.status === 'published' || A.status === 'scheduled' ? [`<option selected>${A.status}</option>`] : []).join('')}</select></label>
    </div></div>
    <div class="card"><h2>Featured image</h2><div class="row"><input type="file" id="img" accept="image/png,image/jpeg,image/webp" style="max-width:280px"><button class="btn sm danger" id="imgx" ${A.image ? '' : 'hidden'}>Remove</button></div>
      <div id="imgprev" style="margin:10px 0">${A.image ? `<img src="${e(A.image)}" style="max-width:100%;max-height:180px;border-radius:14px">` : ''}</div>
      <label>Image ALT text<input data-f="imageAlt" value="${e(A.imageAlt)}" placeholder="Describe the image for screen readers and search"></label></div>
    <div class="card"><h2>Article content</h2>
      <div class="toolbar" id="tb"><button data-a="h2">H2</button><button data-a="h3">H3</button><button data-a="b"><b>B</b></button><button data-a="i"><i>I</i></button><button data-a="ul">• List</button><button data-a="ol">1. List</button><button data-a="q">❝ Quote</button><button data-a="link">🔗 Link</button><button data-a="img">🖼 Image</button><button data-a="table">▦ Table</button><span class="sp"></span><button data-m="write" class="on">Write</button><button data-m="split">Split</button><button data-m="prev">Preview</button></div>
      <div class="write" id="wr"><textarea id="body" spellcheck="true">${e(A.body)}</textarea><div class="live" id="live"></div></div>
      <p class="hint">Headings, lists, tables, links and images use simple Markdown — the live preview shows exactly how the website renders it. FAQs are added below.</p></div>
    <div class="card"><div class="row" style="justify-content:space-between"><h2>FAQ section</h2><button class="btn sm" id="addfaq">＋ Add question</button></div><div id="faqs"></div></div>
    <div class="card"><h2>SEO metadata</h2><div class="fields">
      <label class="full">Meta title <span class="hint" id="mtc"></span><input data-f="metaTitle" value="${e(A.metaTitle)}"></label>
      <label class="full">Meta description <span class="hint" id="mdc"></span><textarea data-f="metaDescription" rows="2">${e(A.metaDescription)}</textarea></label>
      <label class="full">Canonical URL<span class="row"><input data-f="canonical" value="${e(A.canonical)}" placeholder="${e(S.site)}/blog/${e(A.slug || 'your-slug')}"><button class="btn sm" id="defcan" type="button">Use default</button></span></label>
      <div class="full"><div class="serp"><div class="u" id="su"></div><div class="tt" id="st2"></div><div class="dd" id="sd"></div></div></div></div></div>
  </div>
  <aside class="card panel" id="panel"></aside></div>`;
  bindEditor(m);
  renderLive(); renderFaqs(); renderMeta(); renderPanel();
  queueAnalyze();
}

function bindEditor(m) {
  $$('[data-f]', m).forEach((el) => {
    const f = el.dataset.f;
    el.addEventListener('input', () => {
      let v = el.value;
      if (f === 'tags') v = v.split(',').map((x) => x.trim()).filter(Boolean);
      if (f === 'title') { const o = { title: v }; if (!A.remoteSlug && (!A.slug || A.slug === slugify(A.title))) { o.slug = slugify(v); $('[data-f=slug]').value = o.slug; } patch(o); $('#ttl').textContent = v || 'New article'; renderMeta(); return; }
      if (f === 'slug') v = slugify(v);
      patch({ [f]: v }); renderMeta();
    });
  });
  $('#body', m).addEventListener('input', (ev) => { patch({ body: ev.target.value }); renderLive(); });
  $('#savebtn', m).onclick = async () => { await flush(); toast('Saved.'); };
  $('#defcan', m).onclick = () => { const v = `${S.site}/blog/${A.slug}`; $('[data-f=canonical]').value = v; patch({ canonical: v }, true); };
  $('#addfaq', m).onclick = () => { A.faqs = [...A.faqs, { q: '', a: '' }]; patch({ faqs: A.faqs }); renderFaqs(); };
  $('#img', m).onchange = (ev) => ev.target.files[0] && loadImage(ev.target.files[0]);
  $('#imgx', m).onclick = () => { patch({ image: '', imageAlt: A.imageAlt }, true); $('#imgprev').innerHTML = ''; $('#imgx').hidden = true; };
  $('#rev', m).onclick = revisions;
  $('#tb', m).onclick = (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.m) { mode = b.dataset.m; $('#wr').className = 'write ' + (mode === 'write' ? '' : mode); $$('[data-m]', m).forEach((x) => x.classList.toggle('on', x === b)); renderLive(); return; }
    tool(b.dataset.a);
  };
}

function tool(kind) {
  const ta = $('#body'), s = ta.selectionStart, en = ta.selectionEnd, sel = ta.value.slice(s, en);
  const ins = (txt, selStart, selEnd) => { ta.setRangeText(txt, s, en, 'end'); ta.focus(); if (selStart != null) ta.setSelectionRange(s + selStart, s + selEnd); ta.dispatchEvent(new Event('input')); };
  const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
  const prefix = (p) => { ta.setRangeText(p, lineStart, lineStart, 'end'); ta.focus(); ta.dispatchEvent(new Event('input')); };
  if (kind === 'h2') return prefix('## '); if (kind === 'h3') return prefix('### '); if (kind === 'ul') return prefix('- '); if (kind === 'ol') return prefix('1. '); if (kind === 'q') return prefix('> ');
  if (kind === 'b') return ins(`**${sel || 'bold text'}**`, 2, 2 + (sel || 'bold text').length);
  if (kind === 'i') return ins(`*${sel || 'italic text'}*`, 1, 1 + (sel || 'italic text').length);
  if (kind === 'link') { const u = prompt('Link URL (https://… or /page)'); if (u) ins(`[${sel || 'link text'}](${u})`); return; }
  if (kind === 'img') { const u = prompt('Image URL (must be https://…)'); if (u) ins(`![${prompt('ALT text') || ''}](${u})`); return; }
  if (kind === 'table') return ins('\n| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |\n');
}

function renderLive() { if (mode !== 'write') $('#live').innerHTML = formatBody(A.body) + faqHtml(A.faqs); }
function renderFaqs() {
  const box = $('#faqs'); if (!box) return;
  box.innerHTML = A.faqs.map((f, i) => `<div class="faq-item"><input data-q="${i}" placeholder="Question" value="${e(f.q)}"><textarea data-a="${i}" rows="2" placeholder="Short, direct answer">${e(f.a)}</textarea><button class="btn sm danger" data-x="${i}" style="justify-self:start">Remove</button></div>`).join('') || '<p class="muted">No FAQs yet. Add them manually or use the AEO tab to generate them from the article.</p>';
  box.oninput = (ev) => { const t = ev.target; const i = t.dataset.q ?? t.dataset.a; A.faqs[i][t.dataset.q != null ? 'q' : 'a'] = t.value; patch({ faqs: A.faqs }); renderLive(); };
  box.onclick = (ev) => { const x = ev.target.dataset.x; if (x == null) return; A.faqs.splice(x, 1); patch({ faqs: A.faqs }); renderFaqs(); renderLive(); };
}
function renderMeta() {
  if (!$('#mtc')) return;
  const mt = A.metaTitle || A.title || '', md = A.metaDescription || A.excerpt || '';
  $('#mtc').textContent = `${A.metaTitle.length}/60`; $('#mtc').className = 'hint ' + (A.metaTitle.length >= 30 && A.metaTitle.length <= 60 ? 'ok' : 'bad');
  $('#mdc').textContent = `${A.metaDescription.length}/160`; $('#mdc').className = 'hint ' + (A.metaDescription.length >= 70 && A.metaDescription.length <= 160 ? 'ok' : 'bad');
  const url = `${S.site}/blog/${A.slug || 'your-slug'}`;
  $('#urlprev').textContent = url;
  $('#su').textContent = (A.canonical || url).replace(/^https?:\/\//, '').replace(/\//g, ' › '); $('#st2').textContent = mt.slice(0, 62) || 'Meta title'; $('#sd').textContent = md.slice(0, 160) || 'Meta description';
}

async function loadImage(file) {
  const img = new Image(); img.src = URL.createObjectURL(file);
  await img.decode().catch(() => {});
  let w = Math.min(1400, img.width), q = 0.85, out;
  for (let i = 0; i < 5; i++) { const c = document.createElement('canvas'); c.width = w; c.height = Math.round((img.height * w) / img.width); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); out = c.toDataURL('image/jpeg', q); if (out.length < 1_200_000) break; w = Math.round(w * 0.8); q -= 0.08; }
  patch({ image: out }, true); $('#imgprev').innerHTML = `<img src="${out}" style="max-width:100%;max-height:180px;border-radius:14px">`; $('#imgx').hidden = false;
}

async function revisions() {
  const { revisions } = await api(`/articles/${A.id}/revisions`);
  if (!revisions.length) return toast('No earlier revisions yet.');
  const list = revisions.map((r, i) => `${i + 1}. ${new Date(r.createdAt).toLocaleString()} — ${r.title || 'Untitled'}`).join('\n');
  const n = Number(prompt(`Restore which revision? Enter its number (your current text is replaced).\n\n${list}`));
  if (!n || !revisions[n - 1]) return;
  await flush(); A = { ...(await api(`/articles/${A.id}/restore`, 'POST', { revisionId: revisions[n - 1].id })) }; route();
}

// ── Right panel ──────────────────────────────────────────────────────────
const PT = [['ai', 'AI'], ['seo', 'SEO'], ['aeo', 'AEO'], ['geo', 'GEO'], ['pub', 'Preview & Publish']];
function renderPanel() {
  const p = $('#panel'); if (!p) return;
  const k = tab;
  p.innerHTML = `<div class="tabs">${PT.map(([t, l]) => `<button data-t="${t}" class="${tab === t ? 'on' : ''}">${l}${analysis && analysis[t] ? ` <small>${analysis[t].score}</small>` : ''}</button>`).join('')}</div><div id="pbody"></div>`;
  $$('[data-t]', p).forEach((b) => (b.onclick = () => { tab = b.dataset.t; renderPanel(); }));
  const body = $('#pbody', p);
  if (k === 'ai') return aiPanel(body);
  if (k === 'pub') return pubPanel(body);
  optPanel(body, k);
}

function aiPanel(b) {
  const x = A.manual?.ai || {};
  b.innerHTML = `<h2>AI writing</h2><div class="fields"><label class="full">Provider<select id="prov"><option value="claude" ${S.providers.claude ? '' : 'disabled'}>Claude</option><option value="gemini" ${S.providers.gemini ? '' : 'disabled'}>Gemini</option></select></label></div>
  <p><button class="btn primary" id="regen" ${A.keyword && A.topic ? '' : 'disabled'}>${A.body ? 'Regenerate whole article' : 'Generate article'}</button> <span class="hint">${A.keyword && A.topic ? '' : 'Fill topic and primary keyword first.'}</span></p>
  ${A.body ? '<p class="hint" style="color:var(--bad)">Regenerating replaces the title, body, FAQs and metadata (a revision is kept).</p>' : ''}
  <h3 style="margin-top:14px">Rewrite a section</h3><p class="hint">Put the cursor inside a section (or select text) in the editor, then describe the change.</p>
  <textarea id="inst" rows="2" placeholder="e.g. add a practical example for a Madurai restaurant; make it shorter"></textarea>
  <p><button class="btn dark" id="rw">Rewrite section</button></p><div id="rwout"></div>
  ${x.keywords?.length ? `<h3>Keyword suggestions</h3><p>${x.keywords.map((q) => `<span class="pill">${e(q)}</span>`).join(' ')}</p>` : ''}
  ${x.outline?.length ? `<h3>Outline</h3><ul class="hint">${x.outline.map((o) => `<li>${e(o)}</li>`).join('')}</ul>` : ''}
  ${x.internalLinks?.length ? `<h3>Internal link suggestions</h3><ul class="ckl">${x.internalLinks.map((l) => `<li><span></span><span><b>${e(l.anchor)}</b> → <code>${e(l.url)}</code><small>${e(l.reason)}</small></span></li>`).join('')}</ul>` : ''}
  ${x.externalSources?.length ? `<h3>External sources to consider</h3><div class="notice">AI suggested these. Open each one and confirm it says what you claim before linking.</div><ul class="ckl" style="margin-top:6px">${x.externalSources.map((l) => `<li><span></span><span><b>${e(l.name)}</b>${l.url ? ` — <a href="${e(l.url)}" target="_blank" rel="noopener">${e(l.url)}</a>` : ''}<small>${e(l.why)}</small></span></li>`).join('')}</ul>` : ''}
  ${x.needsSources?.length ? `<h3>Claims needing a verified source</h3><ul class="ckl">${x.needsSources.map((l) => `<li><span class="i">!</span><span>${e(l)}</span></li>`).join('')}</ul>` : ''}`;
  $('#prov', b).value = x.provider || (S.providers.claude ? 'claude' : 'gemini');
  $('#regen', b).onclick = async () => {
    if (A.body && !confirm('Replace the current article with a newly generated one?')) return;
    const btn = $('#regen', b); btn.disabled = true; btn.textContent = 'Writing… (30–90s)';
    try {
      await flush();
      const r = await api('/ai/generate', 'POST', { topic: A.topic, keyword: A.keyword, secondary: A.secondary, intent: A.intent, audience: A.audience, provider: $('#prov', b).value });
      const keep = A.id; await api(`/articles/${keep}`, 'PUT', { title: r.title, body: r.body, excerpt: r.excerpt, metaTitle: r.metaTitle, metaDescription: r.metaDescription, faqs: r.faqs, tags: r.tags, category: r.category, manual: { ...A.manual, ai: r.manual.ai } });
      await api(`/articles/${r.id}`, 'DELETE'); route();
    } catch (er) { toast(er.message, true); renderPanel(); }
  };
  $('#rw', b).onclick = async () => {
    const ta = $('#body'); let s = ta.selectionStart, en = ta.selectionEnd;
    if (s === en) { const lines = ta.value.split('\n'); let pos = 0, hs = 0; for (let i = 0; i < lines.length; i++) { if (pos > s) break; if (/^#{2,3}\s/.test(lines[i])) hs = pos; pos += lines[i].length + 1; } s = hs; en = ta.value.length; const re = /\n#{2,3}\s/g; re.lastIndex = s + 1; const n = re.exec(ta.value); if (n) en = n.index + 1; }
    const section = ta.value.slice(s, en); if (!section.trim()) return toast('Nothing to rewrite here.', true);
    $('#rw', b).disabled = true; $('#rwout', b).innerHTML = '<p class="muted">Rewriting…</p>';
    try {
      const r = await api('/ai/rewrite', 'POST', { provider: $('#prov', b).value, article: { title: A.title, keyword: A.keyword, body: A.body }, section, instruction: $('#inst', b).value });
      lastRewrite = { s, en, md: r.markdown };
      $('#rwout', b).innerHTML = `<div class="notice ok">Proposed replacement:</div><pre class="code" style="white-space:pre-wrap;margin:6px 0">${e(r.markdown)}</pre><div class="row"><button class="btn primary sm" id="ap">Apply</button><button class="btn sm" id="dc">Discard</button></div>`;
      $('#ap', b).onclick = () => { ta.setRangeText(lastRewrite.md.trim() + '\n\n', s, en, 'end'); ta.dispatchEvent(new Event('input')); $('#rwout', b).innerHTML = ''; toast('Section replaced.'); };
      $('#dc', b).onclick = () => ($('#rwout', b).innerHTML = '');
    } catch (er) { $('#rwout', b).innerHTML = `<div class="notice bad">${e(er.message)}</div>`; }
    $('#rw', b).disabled = false;
  };
}

function checklist(c) {
  return `<ul class="ckl">${c.map((x) => `<li class="${x.manual ? 'man' : x.pass ? 'ok' : ''}"><span class="i">${x.manual ? `<input type="checkbox" data-man="${x.id}" ${x.pass ? 'checked' : ''}>` : x.pass ? '✓' : '✕'}</span><span><b>${e(x.label)}</b>${x.tip ? `<small>${e(x.tip)}</small>` : ''}</span></li>`).join('')}</ul>`;
}
function optPanel(b, k) {
  if (!analysis) return (b.innerHTML = '<p class="muted">Analysing…</p>');
  const r = analysis[k], failing = r.checks.filter((c) => !c.pass && !c.manual);
  const intro = { seo: 'Readiness checks for search engines. A high score means fewer obvious problems — it does not guarantee rankings.', aeo: 'Answer-engine readiness: short direct answers and question-led structure.', geo: 'Helps AI search systems understand and trust the page. Nothing here guarantees citations by ChatGPT, Gemini, Perplexity or any other system.' }[k];
  b.innerHTML = `<div class="ring"><div class="big ${lvl(r.score)}">${r.score}</div><div><h2 style="margin:0">${k.toUpperCase()} readiness</h2><p class="hint" style="margin:4px 0 0">${intro}</p></div></div>
  <div class="row" style="margin:12px 0"><label style="flex:1">Review status<select id="rv">${['not_reviewed', 'needs_work', 'approved'].map((o) => `<option value="${o}" ${A.review[k] === o ? 'selected' : ''}>${o.replace('_', ' ')}</option>`).join('')}</select></label></div>
  ${checklist(r.checks)}
  <div class="row" style="margin-top:12px">${failing.length ? '<button class="btn dark sm" id="sug">AI suggestions for failing checks</button>' : ''}${k === 'aeo' ? '<button class="btn primary sm" id="mkfaq">Generate FAQs from article</button>' : ''}</div><div id="sugout"></div>
  ${k === 'aeo' ? `<h3 style="margin-top:14px">FAQ schema preview</h3><pre class="code">${e(JSON.stringify(analysis.schema['@graph'].find((g) => g['@type'] === 'FAQPage') || 'Add FAQs to generate FAQPage schema.', null, 2))}</pre>` : ''}
  ${k === 'seo' ? `<p class="hint" style="margin-top:12px">${analysis.stats.words} words · ${analysis.stats.headings} headings · ${analysis.stats.internal} internal / ${analysis.stats.external} external links. Length is informational — there is no ideal word count.</p>` : ''}`;
  $('#rv', b).onchange = (ev) => { A.review[k] = ev.target.value; api(`/articles/${A.id}`, 'PUT', { review: { [k]: ev.target.value } }).then(() => toast('Review status saved.')); };
  $$('[data-man]', b).forEach((c) => (c.onchange = () => { A.manual = { ...A.manual, [c.dataset.man]: c.checked }; patch({ manual: A.manual }); }));
  const sug = $('#sug', b);
  if (sug) sug.onclick = async () => { sug.disabled = true; try { const r2 = await api('/ai/improve', 'POST', { provider: S.providers.claude ? 'claude' : 'gemini', article: { title: A.title, body: A.body }, panel: k, failing }); $('#sugout', b).innerHTML = `<ul class="ckl" style="margin-top:8px">${(r2.suggestions || []).map((s) => `<li><span class="i">→</span><span><b>${e(s.issue)}</b><small>${e(s.fix)}</small></span></li>`).join('')}</ul>`; } catch (er) { $('#sugout', b).innerHTML = `<div class="notice bad">${e(er.message)}</div>`; } sug.disabled = false; };
  const mk = $('#mkfaq', b);
  if (mk) mk.onclick = async () => {
    mk.disabled = true; mk.textContent = 'Generating…';
    try { const r2 = await api('/ai/faqs', 'POST', { provider: S.providers.claude ? 'claude' : 'gemini', article: { title: A.title, keyword: A.keyword, body: A.body } }); A.faqs = r2.faqs.filter((f) => f.q && f.a); patch({ faqs: A.faqs }, true); renderFaqs(); renderLive(); b.insertAdjacentHTML('beforeend', `<h3 style="margin-top:14px">Conversational queries</h3><ul class="hint">${(r2.conversational || []).map((q) => `<li>${e(q)}</li>`).join('')}</ul>`); toast('FAQs added — review the answers against your article.'); } catch (er) { toast(er.message, true); }
    mk.disabled = false; mk.textContent = 'Generate FAQs from article';
  };
}

// Preview + approval + publish
let device = 'desktop';
const APPROVE = [['meta', 'Title, meta description and URL slug reviewed'], ['facts', 'Every fact, figure and source checked'], ['preview', 'Checked in desktop and mobile preview'], ['ai', 'Reviewed and edited by a human (not published raw AI text)']];
function pubPanel(b) {
  const ap = A.manual?.approve || {}, reviewsOk = ['seo', 'aeo', 'geo'].every((k) => A.review[k] === 'approved');
  const ready = APPROVE.every(([k]) => ap[k]) && reviewsOk && A.title && A.slug && A.body;
  const url = `${S.site}/blog/${A.slug}`;
  const srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${S.site}/css/base.css"><link rel="stylesheet" href="${S.site}/css/site.css"><style>body{margin:0;font-family:system-ui,sans-serif}.bl-article{padding:24px 0}.wrap{max-width:780px;margin:0 auto;padding:0 18px}.bl-prose{line-height:1.75}.bl-prose table,.bl-table table{border-collapse:collapse;width:100%}.bl-prose td,.bl-prose th{border:1px solid #ddd;padding:6px 10px}img{max-width:100%}</style></head><body><article class="bl-article"><header class="wrap bl-head"><h1>${e(A.title)}</h1><div class="bl-meta"><span class="bl-cat">${e(A.category)}</span> ${fmt(new Date())} · By ${e(A.author)}</div></header>${A.image ? `<div class="wrap"><figure class="bl-hero-img"><img src="${e(A.image)}" alt="${e(A.imageAlt)}"></figure></div>` : ''}<div class="wrap bl-prose">${formatBody(A.body)}${faqHtml(A.faqs)}</div></article></body></html>`;
  b.innerHTML = `<h2>Preview</h2><div class="tabs"><button data-d="desktop" class="${device === 'desktop' ? 'on' : ''}">Desktop</button><button data-d="mobile" class="${device === 'mobile' ? 'on' : ''}">Mobile</button></div>
  <div class="frame ${device}"><iframe sandbox="" id="pf"></iframe></div>
  <h3 style="margin-top:14px">Article URL</h3><p><code>${e(url)}</code></p>
  <h3>Search result preview</h3><div class="serp"><div class="u">${e((A.canonical || url).replace(/^https?:\/\//, '').replace(/\//g, ' › '))}</div><div class="tt">${e((A.metaTitle || A.title).slice(0, 62))}</div><div class="dd">${e((A.metaDescription || A.excerpt).slice(0, 160))}</div></div>
  <h3 style="margin-top:12px">FAQ preview</h3>${A.faqs.length ? A.faqs.map((f) => `<details><summary><b>${e(f.q)}</b></summary><p>${e(f.a)}</p></details>`).join('') : '<p class="muted">No FAQs.</p>'}
  <h3 style="margin-top:12px">Structured data (JSON-LD)</h3><pre class="code">${e(JSON.stringify(analysis?.schema || {}, null, 2))}</pre><p class="hint">The website generates its own BlogPosting / FAQPage / Breadcrumb JSON-LD from these fields when the page is served.</p>
  <h2 style="margin-top:18px">Approval checklist</h2><ul class="ckl">${APPROVE.map(([k, l]) => `<li><span><input type="checkbox" data-ap="${k}" ${ap[k] ? 'checked' : ''}></span><span><b>${l}</b></span></li>`).join('')}<li class="${reviewsOk ? 'ok' : ''}"><span class="i">${reviewsOk ? '✓' : '✕'}</span><span><b>SEO, AEO and GEO reviews marked “approved”</b><small>${reviewsOk ? '' : 'Set each in its tab after reviewing the checks.'}</small></span></li></ul>
  <h2 style="margin-top:18px">Publish</h2>
  ${S.publisher ? '' : `<div class="notice" style="margin-bottom:10px">Website publishing API isn't connected, so Publish will fail with an explanation and publish nothing. Use <b>Export</b> below, or complete the setup in <a href="#/settings">Settings</a>.</div>`}
  <div class="row"><button class="btn" id="pdraft">Save draft on website</button><button class="btn primary" id="ppub" ${ready ? '' : 'disabled'}>${A.remoteSlug && A.status === 'published' ? 'Update live article' : 'Publish now'}</button></div>
  <div class="row" style="margin-top:10px"><input type="datetime-local" id="pwhen" style="max-width:230px" value="${e((A.publishAt || '').slice(0, 16))}"><button class="btn dark" id="psch" ${ready ? '' : 'disabled'}>Schedule</button></div>
  <p class="hint">${ready ? 'All set.' : 'Publish and Schedule unlock when every approval box is ticked and all three reviews are approved.'} Times use your browser's timezone.</p>
  <div id="pres"></div>
  <h3 style="margin-top:14px">Export (manual fallback)</h3><div class="row"><a class="btn sm" href="/api/articles/${A.id}/export?format=html">HTML</a><a class="btn sm" href="/api/articles/${A.id}/export?format=md">Markdown</a><a class="btn sm" href="/api/articles/${A.id}/export?format=json">JSON</a></div>
  <div class="row" style="margin-top:14px"><button class="btn danger sm" id="pdel">Delete article…</button></div>
  <h3 style="margin-top:14px">Publishing history</h3><div id="phist" class="hint">Loading…</div>`;
  $('#pf', b).srcdoc = srcdoc;
  $$('[data-d]', b).forEach((x) => (x.onclick = () => { device = x.dataset.d; renderPanel(); }));
  $$('[data-ap]', b).forEach((c) => (c.onchange = () => { A.manual = { ...A.manual, approve: { ...ap, [c.dataset.ap]: c.checked } }; patch({ manual: A.manual }, true); setTimeout(renderPanel, 50); }));
  const go = async (mode, label, extra = {}) => {
    const res = $('#pres', b); res.innerHTML = `<p class="muted">${label}…</p>`;
    try {
      await flush();
      const r = await api(`/articles/${A.id}/publish`, 'POST', { mode, ...extra });
      A = { ...A, ...r.article }; $('#st').innerHTML = pill(A.status);
      res.innerHTML = `<div class="notice ${r.verified === false ? '' : 'ok'}"><b>${mode === 'draft' ? 'Draft saved on the website (not public).' : mode === 'schedule' ? 'Scheduled — the website will show it at that time.' : 'Confirmed by the website.'}</b>${r.verified === true ? '<br>Live URL loaded successfully.' : r.verified === false ? '<br>⚠ The website accepted it, but the public URL did not load yet — it may be cache or deployment lag. Check it before sharing.' : ''}<br>${mode === 'draft' ? '' : `<a href="${e(r.url)}" target="_blank" rel="noopener">${e(r.url)}</a>`}</div>`;
      loadHist(b);
    } catch (er) { res.innerHTML = `<div class="notice bad"><b>Not published.</b> ${e(er.message)}<br>${e(er.data?.help || '')}</div>`; loadHist(b); }
  };
  $('#pdraft', b).onclick = () => go('draft', 'Saving draft');
  $('#ppub', b).onclick = () => go('publish', A.remoteSlug ? 'Updating' : 'Publishing');
  $('#psch', b).onclick = () => { const v = $('#pwhen', b).value; if (!v) return toast('Pick a date and time.', true); go('schedule', 'Scheduling', { publishAt: new Date(v).toISOString() }); };
  $('#pdel', b).onclick = async () => { if (await deleteArticle(A.id, Boolean(A.remoteSlug))) { A = null; location.hash = '#/blogs'; } };
  loadHist(b);
}
async function loadHist(b) { const el = $('#phist', b); if (!el || !A) return; const { history } = await api(`/history?article=${A.id}`); el.innerHTML = history.length ? `<table>${history.map((h) => `<tr><td>${h.ok ? '✅' : '⚠️'} ${e(h.action)}</td><td>${e(h.message)}</td><td>${new Date(h.created_at).toLocaleString()}</td></tr>`).join('')}</table>` : 'Nothing yet.'; }

boot();
