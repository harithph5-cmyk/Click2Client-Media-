// Off-Page Command Center (OffPageOS): answer-first articles → Reddit/Medium/Quora/LinkedIn drafts,
// community comment queue and backlink pipeline. One shared workspace saved to /admin/crm/offpage.

import { api, esc, toast, modal } from '../common.js';
import { head, hbars, pill, debounce } from './ui.js';

const PLATS = ['reddit', 'medium', 'quora', 'linkedin'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const TIPS = {
  reddit: 'Lead with genuine value, skip promotional links in the body, end with an open question.',
  medium: 'Use "Import a Story" so rel="canonical" points back to your blog and SEO equity flows to your site.',
  quora: 'Open with the 40–60 word direct answer first (mirrors AEO snippets), then back it up with proof.',
  linkedin: 'Short scannable lines, a strong hook, and put your blog link in the first comment to protect reach.',
};
const BL_STAGES = ['Prospect', 'Outreach Sent', 'Negotiating', 'Live', 'Lost'];
const BL_TYPES = ['Guest Post', 'Resource Page', 'Digital PR', 'Niche Edit', 'Medium Canonical', 'Community Mention'];
const words = (s) => (String(s || '').trim() ? String(s).trim().split(/\s+/).length : 0);
const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);

const newArticle = () => ({
  id: 'art-' + Date.now(), title: 'Untitled answer-first article', question: '', url: location.origin + '/blog/', keyword: '',
  answer: '', stats: '', body: '## Key takeaway 1\n- \n## Key takeaway 2\n- ',
  platforms: Object.fromEntries(PLATS.map((p) => [p, { status: 'Not Started', url: '', draft: '' }])),
});

export function score(a) {
  const checks = [
    ['Question-led AEO', (a.question || '').trim().length > 10 && /\?|how|what|why|when|which|best/i.test(a.question), 20],
    ['40–65w direct answer', words(a.answer) >= 35 && words(a.answer) <= 75, 25],
    ['GEO data / citations', (a.stats || '').trim().length >= 25, 20],
    ['Structured takeaways', /(##|^- |\n- )/m.test(a.body || ''), 20],
    ['Canonical URL set', /^https?:\/\/.+/.test((a.url || '').trim()), 15],
  ];
  return { score: checks.reduce((n, c) => n + (c[1] ? c[2] : 0), 0), checks };
}

export function draftFor(a, plat) {
  const q = a.question || a.title; const ans = a.answer || 'Add your 40–60 word direct answer in the master editor.';
  const stats = lines(a.stats); const url = a.url || ''; const kw = (a.keyword || 'SEO').replace(/\s+/g, '');
  const bullets = lines(a.body).filter((l) => l.startsWith('-') || l.startsWith('##')).slice(0, 5);
  if (plat === 'reddit') return `${q}\n\nQuick breakdown from our recent testing on ${a.keyword || 'this topic'}:\n\n${ans}\n\n${stats.length ? 'Key observations:\n' + stats.map((s) => '- ' + s).join('\n') + '\n\n' : ''}${bullets.length ? 'What worked in practice:\n' + bullets.map((b) => b.replace(/^##\s*/, '• ')).join('\n') + '\n\n' : ''}How are you approaching this in your own workflow? Happy to compare notes in the comments.`;
  if (plat === 'medium') return `# ${a.title}\n\n*Canonical import URL: ${url}*\n\n**Direct answer:** ${ans}\n\n${a.body || ''}\n\n${stats.length ? '## Key data points\n' + stats.map((s) => '- ' + s).join('\n') + '\n\n' : ''}---\n*Originally published at ${url}.*`;
  if (plat === 'quora') return `${ans}\n\n${stats.length ? 'Why this matters:\n' + stats.map((s) => '• ' + s).join('\n') + '\n\n' : ''}${bullets.length ? 'Step-by-step:\n' + bullets.map((b) => b.replace(/^##\s*/, '→ ')).join('\n') + '\n\n' : ''}Full guide with examples: ${url}`;
  return `${q}\n\nMost teams overcomplicate this.\n\nThe short answer:\n${ans}\n\n${stats.length ? stats.map((s) => '→ ' + s).join('\n') + '\n\n' : ''}Full breakdown link in the first comment 👇\n\n#${kw} #SEO #GEO #AEO #DigitalMarketing`;
}

export function utm(base, plat, kw) {
  const b = (base || '').trim(); if (!b) return '';
  const c = String(kw || 'offpage').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'offpage';
  return `${b}${b.includes('?') ? '&' : '?'}utm_source=${plat}&utm_medium=offpage_social&utm_campaign=${c}`;
}

function pitch(b, brand) {
  const sign = `Best regards,\n${brand}`;
  if (b.type === 'Resource Page') return `Subject: Quick addition for your resource guide on ${b.domain}\n\nHi there,\n\nI was reading your curated resource page on ${b.domain} — really solid picks.\n\nWe published a guide on "${b.anchor}" with fresh data and a practical checklist (${b.targetUrl}). It fills a gap your readers may find useful.\n\nWould you be open to adding it?\n\n${sign}`;
  if (b.type === 'Digital PR') return `Subject: Data point for your next piece on ${b.anchor}\n\nHi there,\n\nSaw your recent coverage on ${b.domain}. We just analysed ${b.anchor} (${b.targetUrl}) and found a sharp shift worth a mention.\n\nHappy to share the takeaways or a 2-sentence expert quote if you're covering this soon.\n\n${sign}`;
  return `Subject: ${b.type} idea for ${b.domain}\n\nHi team,\n\nBig fan of what you publish on ${b.domain}. I'd like to pitch a concise, data-backed ${b.type.toLowerCase()} on "${b.anchor}" — zero fluff, real examples.\n\nSample of our work: ${b.targetUrl}\n\nWant 2–3 headline angles?\n\n${sign}`;
}

const copy = async (t, msg) => { if (!t) return toast('Nothing to copy yet.'); try { await navigator.clipboard.writeText(t); toast(msg); } catch { toast('Copy failed — select and copy manually.'); } };

export async function offpageTab(view, { state }) {
  view.innerHTML = '<div class="skel"><i></i><i></i><i></i></div>';
  const S = (state.op ||= { sub: 'dashboard', art: null, plat: 'reddit', ws: null });
  if (!S.ws) {
    const { workspace } = await api('/admin/crm/offpage');
    S.ws = workspace || { articles: [newArticle()], comments: [], backlinks: [] };
  }
  const ws = S.ws;
  const save = debounce(async () => {
    try { await api('/admin/crm/offpage', { method: 'PUT', body: { workspace: ws } }); const el = view.querySelector('#op-saved'); if (el) el.textContent = 'Saved'; }
    catch (e) { toast('Could not save: ' + e.message); }
  }, 700);
  const touch = () => { const el = view.querySelector('#op-saved'); if (el) el.textContent = 'Saving…'; save(); };
  const art = () => ws.articles.find((a) => a.id === S.art) || (S.art = ws.articles[0]?.id, ws.articles[0]);

  const SUBS = [['dashboard', 'Dashboard'], ['content', 'Content & syndication'], ['comments', 'Comment queue'], ['backlinks', 'Backlink pipeline'], ['automations', 'Automations']];

  function paint() {
    view.innerHTML = head('Marketing & SEO', 'Off-Page Command Center', 'Answer-first content, community reach and backlink pipeline for SEO, GEO &amp; AEO.',
      '<span class="small muted" id="op-saved">Saved</span>') +
      `<div class="op-tabs">${SUBS.map(([k, l]) => `<button class="op-tab ${S.sub === k ? 'on' : ''}" data-sub="${k}">${l}</button>`).join('')}</div><div id="op-body"></div>`;
    view.querySelectorAll('[data-sub]').forEach((b) => (b.onclick = () => { S.sub = b.dataset.sub; paint(); }));
    ({ dashboard, content, comments, backlinks, automations }[S.sub])(view.querySelector('#op-body'));
  }

  // ── Dashboard ──
  function dashboard(el) {
    const avg = ws.articles.length ? Math.round(ws.articles.reduce((n, a) => n + score(a).score, 0) / ws.articles.length) : 0;
    const pub = (p) => ws.articles.filter((a) => a.platforms?.[p]?.status === 'Published').length;
    const posted = ws.comments.filter((c) => c.status === 'Posted'); const queued = ws.comments.length - posted.length;
    const live = ws.backlinks.filter((b) => b.status === 'Live'); const dr = live.length ? Math.round(live.reduce((n, b) => n + (+b.dr || 0), 0) / live.length) : 0;
    const totalPub = PLATS.reduce((n, p) => n + pub(p), 0); const cap4 = ws.articles.length * 4;
    const acts = [];
    ws.articles.forEach((a) => PLATS.forEach((p) => { const st = a.platforms?.[p]?.status || 'Not Started'; if (st !== 'Published') acts.push({ t: 'Syndicate', x: `Publish "${a.title}" on ${cap(p)}`, s: st, go: () => { S.art = a.id; S.plat = p; S.sub = 'content'; paint(); } }); }));
    ws.comments.filter((c) => c.status !== 'Posted').slice(0, 3).forEach((c) => acts.push({ t: 'Comment', x: `Reply on ${c.platform} (${c.community}): ${c.title}`, s: c.status, go: () => { S.sub = 'comments'; paint(); } }));
    ws.backlinks.filter((b) => ['Prospect', 'Outreach Sent'].includes(b.status)).slice(0, 3).forEach((b) => acts.push({ t: 'Backlink', x: `${b.status === 'Prospect' ? 'Pitch' : 'Follow up with'} ${b.domain} (DR ${b.dr})`, s: b.type, go: () => { S.sub = 'backlinks'; paint(); } }));
    el.innerHTML = `<div class="op-kpis">
        ${[['Answer-first articles', ws.articles.length, `Avg AEO/GEO score ${avg}/100`], ['Syndicated posts', `${totalPub} / ${cap4}`, `${cap4 ? Math.round((100 * totalPub) / cap4) : 0}% distribution coverage`], ['Comments posted', posted.length, `${queued} queued`], ['Live backlinks', live.length, `Avg live DR ${dr}`]].map(([l, v, s]) => `<div class="card card-pad"><div class="small muted">${l}</div><div class="op-kpi">${v}</div><div class="small muted">${s}</div></div>`).join('')}
      </div>
      <div class="grid2"><div class="card card-pad"><h3>Channel activity</h3><p class="small muted">Published syndications per platform</p>${hbars(PLATS.map((p) => ({ label: p, value: pub(p) })))}</div>
      <div class="card card-pad"><h3>Backlink funnel</h3><p class="small muted">Prospects by stage</p>${hbars(BL_STAGES.map((s) => ({ label: s, value: ws.backlinks.filter((b) => b.status === s).length })))}</div></div>
      <div class="card card-pad" style="margin-top:16px"><h3>Priority action queue</h3>${acts.length ? acts.slice(0, 8).map((a, i) => `<div class="op-act"><span class="pl na">${a.t}</span><span>${esc(a.x)}<small class="muted"> · ${esc(a.s)}</small></span><button class="btn sm ghost" data-go="${i}">Open</button></div>`).join('') : '<p class="small muted">All caught up. Add an article, thread or prospect.</p>'}</div>`;
    el.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => acts[+b.dataset.go].go()));
  }

  // ── Content & syndication ──
  function content(el) {
    const a = art();
    if (!a) { el.innerHTML = '<div class="card card-pad"><button class="btn accent" id="op-new">+ New article</button></div>'; el.querySelector('#op-new').onclick = () => { const n = newArticle(); ws.articles.unshift(n); S.art = n.id; touch(); paint(); }; return; }
    const sc = score(a); const pd = a.platforms[S.plat] || (a.platforms[S.plat] = { status: 'Not Started', url: '', draft: '' });
    const F = (id, label, key, tag = 'input', rows = 3, ph = '') => `<div class="field"><label for="${id}">${label}</label>${tag === 'input' ? `<input class="input" id="${id}" value="${esc(a[key])}" placeholder="${esc(ph)}">` : `<textarea class="input" id="${id}" rows="${rows}" placeholder="${esc(ph)}">${esc(a[key])}</textarea>`}</div>`;
    el.innerHTML = `<div class="op-split"><div class="card"><div class="op-list">${ws.articles.map((x) => `<button class="op-art ${x.id === a.id ? 'on' : ''}" data-art="${x.id}"><b>${esc(x.title || 'Untitled')}</b><small>AEO/GEO ${score(x).score} · ${PLATS.filter((p) => x.platforms?.[p]?.status === 'Published').length}/4 live</small></button>`).join('')}</div><div style="padding:10px"><button class="btn sm accent" id="op-new" style="width:100%">+ New article</button></div></div>
      <div style="display:grid;gap:16px;min-width:0">
      <div class="card card-pad" style="display:grid;gap:12px">
        <div class="row wrap-row"><b>Master article</b><span class="pl ${sc.score >= 80 ? 'good' : sc.score >= 50 ? 'warn' : 'bad'}" id="op-score">AEO/GEO ${sc.score}/100</span><span class="spacer"></span>
          <button class="btn sm accent" id="op-all">Generate all 4 drafts</button><button class="btn sm ghost" id="op-schema">Copy JSON-LD</button><button class="btn sm quiet" id="op-del">Delete</button></div>
        <div class="fgrid">${F('op-title', 'Article title', 'title')}${F('op-question', 'Target AEO question / prompt', 'question', 'input', 1, 'What is the fastest white-hat way to get backlinks?')}${F('op-url', 'Canonical blog URL (your site)', 'url')}${F('op-keyword', 'Primary entity / keyword', 'keyword')}</div>
        <div class="field"><label for="op-answer">Direct answer / TL;DR (ideal 40–65 words) <span id="op-wc" class="muted"></span></label><textarea class="input" id="op-answer" rows="3">${esc(a.answer)}</textarea></div>
        ${F('op-stats', 'Quotable GEO data points / citations (one per line)', 'stats', 'ta', 2)}${F('op-body', 'Core takeaways / outline (## sections, - bullets)', 'body', 'ta', 4)}
        <div class="op-checks" id="op-checks"></div></div>
      <div class="card"><div class="op-tabs" style="padding:12px 16px 0">${PLATS.map((p) => `<button class="op-tab ${S.plat === p ? 'on' : ''}" data-plat="${p}">${cap(p)} ${a.platforms[p]?.status === 'Published' ? '✓' : ''}</button>`).join('')}</div>
        <div class="card-pad" style="display:grid;gap:12px"><p class="small muted">${TIPS[S.plat]}</p>
          <div class="row wrap-row"><label class="small muted" for="op-status">Status</label><select class="input" id="op-status" style="width:auto">${['Not Started', 'Drafted', 'Scheduled', 'Published'].map((s) => `<option ${pd.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select><span class="spacer"></span><button class="btn sm quiet" id="op-regen">Regenerate</button><button class="btn sm" id="op-copy">Copy post</button></div>
          <textarea class="input" id="op-draft" rows="8" style="font-family:ui-monospace,monospace;font-size:13px">${esc(pd.draft)}</textarea>
          <div class="fgrid"><div class="field"><label for="op-live">Published post URL</label><input class="input" id="op-live" value="${esc(pd.url)}" placeholder="https://reddit.com/r/…"></div>
          <div class="field"><label>UTM link</label><div class="row"><input class="input" id="op-utm" readonly><button class="btn sm ghost" id="op-copyutm">Copy</button></div></div></div></div></div></div></div>`;
    const refresh = () => {
      const s = score(a); const b = el.querySelector('#op-score'); b.textContent = `AEO/GEO ${s.score}/100`; b.className = `pl ${s.score >= 80 ? 'good' : s.score >= 50 ? 'warn' : 'bad'}`;
      const w = words(a.answer); el.querySelector('#op-wc').textContent = `· ${w} words ${w >= 35 && w <= 75 ? '(optimal)' : '(aim 40–65)'}`;
      el.querySelector('#op-checks').innerHTML = s.checks.map(([l, ok]) => `<span class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${l}</span>`).join('');
      el.querySelector('#op-utm').value = utm(a.url, S.plat, a.keyword);
    };
    refresh();
    const bind = { 'op-title': 'title', 'op-question': 'question', 'op-url': 'url', 'op-keyword': 'keyword', 'op-answer': 'answer', 'op-stats': 'stats', 'op-body': 'body' };
    Object.entries(bind).forEach(([id, k]) => (el.querySelector('#' + id).oninput = (e) => { a[k] = e.target.value; touch(); refresh(); if (k === 'title') el.querySelector(`[data-art="${a.id}"] b`).textContent = a.title || 'Untitled'; }));
    el.querySelectorAll('[data-art]').forEach((b) => (b.onclick = () => { S.art = b.dataset.art; paint(); }));
    el.querySelectorAll('[data-plat]').forEach((b) => (b.onclick = () => { S.plat = b.dataset.plat; paint(); }));
    el.querySelector('#op-new').onclick = () => { const n = newArticle(); ws.articles.unshift(n); S.art = n.id; touch(); paint(); };
    el.querySelector('#op-status').onchange = (e) => { pd.status = e.target.value; touch(); paint(); };
    el.querySelector('#op-draft').oninput = (e) => { pd.draft = e.target.value; touch(); };
    el.querySelector('#op-live').oninput = (e) => { pd.url = e.target.value; touch(); };
    el.querySelector('#op-copy').onclick = () => copy(pd.draft, 'Post copied');
    el.querySelector('#op-copyutm').onclick = () => copy(el.querySelector('#op-utm').value, 'UTM link copied');
    const fill = (p) => { const d = a.platforms[p] ||= { status: 'Not Started', url: '', draft: '' }; d.draft = draftFor(a, p); if (d.status === 'Not Started') d.status = 'Drafted'; };
    el.querySelector('#op-regen').onclick = () => { fill(S.plat); touch(); paint(); toast(`${cap(S.plat)} draft regenerated`); };
    el.querySelector('#op-all').onclick = () => { PLATS.forEach(fill); touch(); paint(); toast('Generated all 4 drafts'); };
    el.querySelector('#op-schema').onclick = () => copy(`<script type="application/ld+json">\n${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: a.question || a.title, acceptedAnswer: { '@type': 'Answer', text: a.answer } }] }, null, 2)}\n</script>`, 'FAQ JSON-LD copied');
    el.querySelector('#op-del').onclick = () => { if (!confirm('Delete this article and its 4 platform drafts?')) return; ws.articles = ws.articles.filter((x) => x.id !== a.id); S.art = null; touch(); paint(); };
  }

  // ── Comment queue ──
  function comments(el) {
    const f = (S.cf ||= { p: 'All', s: 'All', q: '' });
    const posted = ws.comments.filter((c) => c.status === 'Posted').length;
    const rows = ws.comments.filter((c) => (f.p === 'All' || c.platform === f.p) && (f.s === 'All' || c.status === f.s) && (!f.q || (c.title + c.community + c.draft).toLowerCase().includes(f.q.toLowerCase())));
    const opt = (list, v) => list.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
    el.innerHTML = `<div class="card card-pad" style="display:grid;gap:12px"><div class="row wrap-row"><b>Daily commenting sprint (goal 5)</b><span class="spacer"></span><b>${posted} / 5</b></div><div class="op-bar"><i style="width:${Math.min(100, posted * 20)}%"></i></div>
      <div class="row wrap-row"><select class="input" style="width:auto" id="cf-p">${opt(['All', 'Reddit', 'Quora', 'LinkedIn', 'Medium'], f.p)}</select><select class="input" style="width:auto" id="cf-s">${opt(['All', 'Queued', 'Drafted', 'Posted'], f.s)}</select><input class="input" id="cf-q" style="flex:1;min-width:160px" placeholder="Search threads…" value="${esc(f.q)}"><button class="btn sm accent" id="cm-add">+ Add target thread</button></div></div>
      <div class="card card-pad" style="margin-top:16px;display:grid;gap:10px"><b>Value-first comment composer</b>
        <div class="row wrap-row"><select class="input" style="width:auto;max-width:280px" id="cp-art">${ws.articles.map((a) => `<option value="${a.id}">${esc(a.title)}</option>`).join('')}</select><select class="input" style="width:auto" id="cp-style"><option value="direct">Direct answer + data point (no link)</option><option value="soft">Helpful breakdown + soft link</option><option value="experience">First-hand experience hook</option><option value="question">Value add + follow-up question</option></select><button class="btn sm accent" id="cp-gen">Generate reply</button><button class="btn sm" id="cp-copy">Copy</button></div>
        <textarea class="input" id="cp-out" rows="3" placeholder="Generate a natural, non-promotional reply…"></textarea></div>
      <div class="grid2">${rows.length ? rows.map((c) => `<div class="card card-pad" style="display:grid;gap:8px"><div class="row"><span class="pl na">${esc(c.platform)}</span><small class="muted">${esc(c.community)}</small><span class="spacer"></span><select class="input" style="width:auto;height:30px" data-cs="${c.id}">${opt(['Queued', 'Drafted', 'Posted'], c.status)}</select></div><b>${esc(c.title)}</b><textarea class="input" rows="3" data-cd="${c.id}">${esc(c.draft)}</textarea><div class="row">${c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">Open thread ↗</a>` : ''}<span class="spacer"></span><button class="btn sm" data-cc="${c.id}">Copy</button><button class="btn sm quiet" data-cx="${c.id}">Delete</button></div></div>`).join('') : '<div class="card card-pad muted">No threads match. Add a target thread to start.</div>'}</div>`;
    const by = (id) => ws.comments.find((c) => c.id === id);
    el.querySelector('#cf-p').onchange = (e) => { f.p = e.target.value; comments(el); };
    el.querySelector('#cf-s').onchange = (e) => { f.s = e.target.value; comments(el); };
    el.querySelector('#cf-q').oninput = debounce((e) => { f.q = e.target.value; comments(el); el.querySelector('#cf-q').focus(); }, 250);
    el.querySelectorAll('[data-cs]').forEach((s) => (s.onchange = () => { by(s.dataset.cs).status = s.value; touch(); comments(el); }));
    el.querySelectorAll('[data-cd]').forEach((t) => (t.oninput = () => { by(t.dataset.cd).draft = t.value; touch(); }));
    el.querySelectorAll('[data-cc]').forEach((b) => (b.onclick = () => copy(by(b.dataset.cc).draft, 'Reply copied')));
    el.querySelectorAll('[data-cx]').forEach((b) => (b.onclick = () => { ws.comments = ws.comments.filter((c) => c.id !== b.dataset.cx); touch(); comments(el); }));
    el.querySelector('#cp-copy').onclick = () => copy(el.querySelector('#cp-out').value, 'Reply copied');
    el.querySelector('#cp-gen').onclick = () => {
      const a = ws.articles.find((x) => x.id === el.querySelector('#cp-art').value); if (!a) return;
      const st = lines(a.stats)[0] || 'Consistent third-party entity mentions make a measurable difference.'; const k = el.querySelector('#cp-style').value;
      el.querySelector('#cp-out').value = k === 'direct' ? `${a.answer}\n\nOne thing we noticed in practice: ${st}` : k === 'soft' ? `${a.answer}\n\nWe tested this recently (${st}). Happy to share the full breakdown: ${a.url}` : k === 'experience' ? `We hit this exact bottleneck with ${a.keyword}. What moved the needle: ${st}` : `Solid point — ${st} Curious how you're tracking this today?`;
    };
    el.querySelector('#cm-add').onclick = () => modal(`<h3>Add target thread</h3><form id="cmf" class="fgrid" style="margin-top:12px"><div class="field"><label>Platform</label><select class="input" name="platform"><option>Reddit</option><option>Quora</option><option>LinkedIn</option><option>Medium</option></select></div><div class="field"><label>Community / author</label><input class="input" name="community" required placeholder="r/SEO"></div><div class="field" style="grid-column:1/-1"><label>Post / question title</label><input class="input" name="title" required></div><div class="field" style="grid-column:1/-1"><label>Post URL</label><input class="input" name="url" type="url"></div><div class="field" style="grid-column:1/-1"><label>Planned comment draft</label><textarea class="input" name="draft" rows="3"></textarea></div><div class="row" style="grid-column:1/-1;justify-content:flex-end"><button class="btn ghost" type="button" data-close>Cancel</button><button class="btn accent" type="submit">Add to queue</button></div></form>`, {
      onMount: (m, close) => (m.querySelector('#cmf').onsubmit = (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); ws.comments.unshift({ id: 'cm-' + Date.now(), ...d, status: d.draft.trim() ? 'Drafted' : 'Queued' }); touch(); close(); comments(el); }),
    });
  }

  // ── Backlink pipeline ──
  function backlinks(el) {
    const f = (S.bf ||= { s: 'All', t: 'All', q: '' });
    const rows = ws.backlinks.filter((b) => (f.s === 'All' || b.status === f.s) && (f.t === 'All' || b.type === f.t) && (!f.q || (b.domain + b.anchor + b.contact + b.targetUrl).toLowerCase().includes(f.q.toLowerCase())));
    const opt = (list, v) => list.map((x) => `<option ${x === v ? 'selected' : ''}>${x}</option>`).join('');
    el.innerHTML = `<div class="card card-pad row wrap-row"><select class="input" style="width:auto" id="bf-s">${opt(['All', ...BL_STAGES], f.s)}</select><select class="input" style="width:auto" id="bf-t">${opt(['All', ...BL_TYPES], f.t)}</select><input class="input" id="bf-q" style="flex:1;min-width:160px" placeholder="Search domain, anchor, contact…" value="${esc(f.q)}"><button class="btn sm ghost" id="bl-csv">Export CSV</button><button class="btn sm accent" id="bl-add">+ Add prospect</button></div>
      <div class="card" style="margin-top:16px"><div class="tw"><table class="tbl"><thead><tr><th>Target domain</th><th>DR</th><th>Type</th><th>Anchor &amp; target</th><th>Stage</th><th></th></tr></thead><tbody>${rows.length ? rows.map((b) => `<tr><td><b>${esc(b.domain)}</b><br><small class="muted">${esc(b.contact || 'No contact')}</small></td><td>${esc(b.dr)}</td><td>${esc(b.type)}</td><td>“${esc(b.anchor)}”<br><small class="muted">${esc(b.targetUrl)}</small></td><td><select class="input" style="height:30px;width:auto" data-bs="${b.id}">${opt(BL_STAGES, b.status)}</select></td><td style="white-space:nowrap"><button class="btn sm ghost" data-bp="${b.id}">Pitch</button><button class="btn sm quiet" data-bx="${b.id}">Delete</button></td></tr>`).join('') : '<tr><td colspan="6" class="muted" style="padding:24px;text-align:center">No prospects match.</td></tr>'}</tbody></table></div></div>`;
    const by = (id) => ws.backlinks.find((b) => b.id === id);
    el.querySelector('#bf-s').onchange = (e) => { f.s = e.target.value; backlinks(el); };
    el.querySelector('#bf-t').onchange = (e) => { f.t = e.target.value; backlinks(el); };
    el.querySelector('#bf-q').oninput = debounce((e) => { f.q = e.target.value; backlinks(el); el.querySelector('#bf-q').focus(); }, 250);
    el.querySelectorAll('[data-bs]').forEach((s) => (s.onchange = () => { by(s.dataset.bs).status = s.value; touch(); }));
    el.querySelectorAll('[data-bx]').forEach((b) => (b.onclick = () => { ws.backlinks = ws.backlinks.filter((x) => x.id !== b.dataset.bx); touch(); backlinks(el); }));
    el.querySelectorAll('[data-bp]').forEach((b) => (b.onclick = () => { const x = by(b.dataset.bp); modal(`<h3>Outreach pitch</h3><p class="small muted">To: ${esc(x.contact || x.domain)} · ${esc(x.type)} (DR ${esc(x.dr)})</p><textarea class="input" id="pt" rows="10" style="font-family:ui-monospace,monospace;font-size:13px;margin:10px 0">${esc(pitch(x, 'Click2Client Media'))}</textarea><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Close</button><button class="btn accent" id="ptc">Copy email</button></div>`, { onMount: (m) => (m.querySelector('#ptc').onclick = () => copy(m.querySelector('#pt').value, 'Pitch copied')) }); }));
    el.querySelector('#bl-csv').onclick = () => {
      const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [['Domain', 'DR', 'Type', 'Anchor', 'Target URL', 'Contact', 'Stage'].join(','), ...ws.backlinks.map((b) => [b.domain, b.dr, b.type, b.anchor, b.targetUrl, b.contact, b.status].map(q).join(','))].join('\n');
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'offpage-backlinks.csv' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    el.querySelector('#bl-add').onclick = () => modal(`<h3>Add backlink prospect</h3><form id="blf" class="fgrid" style="margin-top:12px"><div class="field"><label>Target domain</label><input class="input" name="domain" required placeholder="searchenginejournal.com"></div><div class="field"><label>Est. DR</label><input class="input" name="dr" type="number" min="0" max="100" value="55"></div><div class="field"><label>Link type</label><select class="input" name="type">${opt(BL_TYPES, '')}</select></div><div class="field"><label>Stage</label><select class="input" name="status">${opt(BL_STAGES.slice(0, 4), '')}</select></div><div class="field"><label>Target anchor text</label><input class="input" name="anchor" required></div><div class="field"><label>Your target URL</label><input class="input" name="targetUrl" type="url"></div><div class="field" style="grid-column:1/-1"><label>Editor / contact</label><input class="input" name="contact" placeholder="editor@domain.com"></div><div class="row" style="grid-column:1/-1;justify-content:flex-end"><button class="btn ghost" type="button" data-close>Cancel</button><button class="btn accent" type="submit">Save prospect</button></div></form>`, {
      onMount: (m, close) => (m.querySelector('#blf').onsubmit = (e) => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); ws.backlinks.unshift({ id: 'bl-' + Date.now(), ...d, dr: +d.dr || 0 }); touch(); close(); backlinks(el); }),
    });
  }

  // ── Automations ──
  function automations(el) {
    el.innerHTML = `<div class="grid2"><div class="card card-pad" style="display:grid;gap:10px"><h3>Auto-discover Reddit &amp; Quora threads</h3><p class="small muted">Ready-to-paste Google queries for fresh threads to comment on.</p><div class="row"><input class="input" id="au-topic" value="${esc(S.topic || 'off-page SEO')}"><button class="btn sm accent" id="au-go">Build</button></div><div id="au-out" style="display:grid;gap:8px"></div></div>
      <div class="card card-pad"><h3>Weekly cadence</h3><ul class="small" style="line-height:1.7;padding-left:18px"><li><b>Day 1:</b> publish the answer-first article on the blog with a 40–60 word TL;DR + JSON-LD.</li><li><b>Day 2:</b> Medium “Import a story” (keeps canonical) + LinkedIn summary, link in first comment.</li><li><b>Day 3:</b> non-promotional breakdown on 1–2 subreddits + answer 2 Quora questions.</li><li><b>Day 4–5:</b> 5 backlink pitches + 5 daily comments.</li></ul></div></div>
      <div class="card card-pad row wrap-row" style="margin-top:16px"><div><h3>Backup</h3><p class="small muted">Everything is saved to the server for the whole team. Export a JSON copy anytime.</p></div><span class="spacer"></span><button class="btn sm" id="au-exp">Export JSON</button></div>`;
    const build = () => {
      const t = (S.topic = el.querySelector('#au-topic').value.trim() || 'off-page SEO');
      const qs = [['Reddit fresh discussions', `site:reddit.com "${t}" ("how do you" OR "recommend" OR "best way")`], ['Quora high-intent questions', `site:quora.com "${t}" ("what is" OR "how to")`], ['LinkedIn posts to comment on', `site:linkedin.com/posts "${t}"`], ['Resource-page backlink prospects', `"${t}" (inurl:resources OR intitle:"useful links" OR intitle:"guide")`]];
      el.querySelector('#au-out').innerHTML = qs.map(([l, q], i) => `<div class="row" style="gap:8px;padding:8px;border:1px solid var(--line);border-radius:8px"><div style="min-width:0;flex:1"><b class="small">${l}</b><div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,monospace">${esc(q)}</div></div><button class="btn sm ghost" data-q="${i}">Copy</button></div>`).join('');
      el.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => copy(qs[+b.dataset.q][1], 'Query copied')));
    };
    el.querySelector('#au-go').onclick = build; build();
    el.querySelector('#au-exp').onclick = () => { const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(ws, null, 2)], { type: 'application/json' })), download: 'offpage-workspace.json' }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  }

  paint();
}
