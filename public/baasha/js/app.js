// Baasha AI web app: Chat, Research and Agent modes. History and reports are kept in this browser only.
import {$, el, icon, toast, copyText, ask} from './core.js';
import {md} from './markdown.js';
import {statusView, loadDb, addReport, RUN_TITLES} from './state.js';
import {initWorkspace} from './workspace.js';

const KEY = 'baasha.v1';
const MODES = {
  chat: {label: 'Chat', hint: 'Answers from the AI model. No web access.', ph: 'Ask Baasha anything...',
    ideas: [['code', 'Write a Python function', 'Write a Python function that checks whether a string is a palindrome, with two tests.'], ['edit_document', 'Draft an email', 'Draft a polite follow-up email to a client who has not replied in a week.'], ['psychology', 'Explain a concept', 'Explain how an API works to a complete beginner, with an everyday example.']]},
  research: {label: 'Research', hint: 'Searches the web and cites its sources.', ph: 'What should Baasha research?',
    ideas: [['travel_explore', 'Latest on AI tools', 'What are the most useful new AI tools for small businesses this month?'], ['analytics', 'Compare two options', 'Compare Shopify and WooCommerce for a small Indian online store.'], ['school', 'Explain with sources', 'How do Google Business Profile reviews affect local search ranking?']]},
  agent: {label: 'Agent', hint: 'Plans the task, uses tools, checks its work and reports.', ph: 'Describe a task for the agent...',
    ideas: [['checklist', 'Competitor report', 'Find three competitors of a bakery in Chennai and write a short comparison report.'], ['calculate', 'EMI calculation', 'Calculate the monthly EMI for a loan of 500000 rupees at 9.5% a year for 36 months, show the working, and explain it simply.'], ['checklist', 'Audit my website', 'Audit my website (type the address here) and tell me the most important SEO issues to fix first, with the evidence.']]},
};
const S = {chat: null, mode: 'chat', busy: false, ctl: null, file: null, status: undefined};   // status: undefined = loading, null = failed

/* ---------- storage (this browser only) ---------- */
let db = {chats: [], reports: []};
try { db = loadDb(localStorage.getItem(KEY)); } catch (_) { /* storage blocked: start fresh */ }
function persist() {
  db.chats = db.chats.sort((a, b) => b.updated - a.updated).slice(0, 40);
  db.reports = db.reports.slice(0, 40);
  for (let i = 0; i < 6; i++) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return; }
    catch (_) { if (db.chats.length > 1) db.chats.pop(); else if (db.reports.length) db.reports.pop(); else break; }   // storage full: drop the oldest
  }
  toast('Your browser storage is full, so this chat could not be saved.', 5000);
}
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ---------- elements ---------- */
const view = $('view-chat'), thread = $('thread'), scroller = $('msgs'), prompt = $('prompt'), body = document.body;
const toBottom = () => { scroller.scrollTop = scroller.scrollHeight; };
const stick = () => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140;   // only follow the stream if the reader is at the bottom

function setView(mode) {            // welcome <-> conversation
  view.dataset.mode = mode; if (!view.hidden) body.dataset.mode = mode;
  (mode === 'welcome' ? $('slotWelcome') : $('dock')).appendChild($('zone'));
  if (mode === 'chat') toBottom();
}
function setBusy(on) {
  S.busy = on; $('send').hidden = on; $('stop').hidden = !on; $('ringwrap').classList.toggle('working', on);
  $('modes').querySelectorAll('button').forEach(b => { b.disabled = on; });
}

/* ---------- modes ---------- */
function setMode(m) {
  S.mode = m; const idx = Object.keys(MODES).indexOf(m);
  $('modes').dataset.active = idx;
  $('modes').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.mode === m));
  document.querySelectorAll('.nav a[data-nav]').forEach(a => { if (a.dataset.nav === m && !$('view-chat').hidden) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  prompt.placeholder = MODES[m].ph; $('modeHint').textContent = MODES[m].hint + ' Enter to send.';
  const sc = $('shortcuts'); sc.replaceChildren(el('span', '', 'Try:'));
  MODES[m].ideas.forEach(([ic, label, text]) => { const b = el('button', 'sc'); b.type = 'button'; b.append(icon(ic), document.createTextNode(label)); b.onclick = () => send(text); sc.appendChild(b); });
  if (S.chat && !S.chat.messages.length) S.chat.mode = m;
}
$('modes').addEventListener('click', e => { const b = e.target.closest('button[data-mode]'); if (b && !S.busy) setMode(b.dataset.mode); });
$('modes').addEventListener('keydown', e => {          // arrow keys move between radio options
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key) || S.busy) return;
  const keys = Object.keys(MODES), i = keys.indexOf(S.mode); setMode(keys[(i + (e.key === 'ArrowRight' ? 1 : keys.length - 1)) % keys.length]);
  $('modes').querySelector('[aria-checked=true]').focus(); e.preventDefault();
});
document.querySelectorAll('.nav a[data-nav]').forEach(a => a.addEventListener('click', e => {
  const n = a.dataset.nav; if (n === 'library') return;
  e.preventDefault(); if (location.hash !== '#/') location.hash = '#/'; else route(); if (!S.busy) setMode(n); closeDrawer(); prompt.focus();
}));

/* ---------- messages ---------- */
const domain = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return u; } };
function sourcesBox(sources) {
  const box = el('div', 'sources'); const h = el('h4'); h.append(el('span', '', 'Sources · ' + sources.length)); box.appendChild(h);
  const grid = el('div', 'sgrid');
  sources.forEach((s, i) => {
    const a = el('a', 'srcard'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    const d = domain(s.url), tx = el('div', 'tx'); tx.append(el('b', '', s.title || d), el('small', '', d));
    a.append(el('div', 'fav', String(i + 1)), tx); grid.appendChild(a);
  });
  box.appendChild(grid); return box;
}
function reportCard(rep) {
  const c = el('div', 'rep'); const t = el('div', 'rt');
  t.append(icon('description'), el('b', '', rep.title), el('small', '', rep.complete === false ? 'Preliminary report - saved to your Library' : 'Saved to your Library'));
  const dl = el('button', 'btn primary'); dl.type = 'button'; dl.append(icon('download'), document.createTextNode('Download .md')); dl.onclick = () => downloadReport(rep);
  c.append(t, dl); return c;
}
function downloadReport(rep) {
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([rep.markdown], {type: 'text/markdown;charset=utf-8'}));
  a.href = url; a.download = (rep.title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'report') + '.md';
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Builds a message row. Returns {row, bub, body}.
function renderMsg(m, {live = false} = {}) {
  if (view.dataset.mode !== 'chat') setView('chat');
  const row = el('div', 'msg ' + (m.role === 'user' ? 'user' : 'bot'));
  const bub = el('div', 'bub' + (m.error ? ' err' : ''));
  if (m.role === 'user') {
    if (m.file) { const a = el('div', 'att'); a.append(icon('attach_file'), document.createTextNode(m.file.name)); bub.append(a, document.createElement('br')); }
    bub.appendChild(document.createTextNode(m.content)); row.appendChild(bub); thread.appendChild(row); toBottom(); return {row, bub};
  }
  const bodyEl = el('div', 'body'), chips = el('div', 'chips');
  if (m.mode && m.mode !== 'chat') { const c = el('span', 'chip-s'); c.append(icon(m.mode === 'agent' ? 'auto_awesome' : 'travel_explore'), document.createTextNode(MODES[m.mode].label)); chips.appendChild(c); }
  if (m.sources?.length && m.mode === 'research') { const c = el('span', 'chip-s'); c.append(icon('language'), document.createTextNode('Searched the web')); chips.appendChild(c); }
  if (chips.children.length) bodyEl.appendChild(chips);
  if (m.run) bodyEl.appendChild(runCardStatic(m.run));
  if (m.error) bub.textContent = m.content; else if (m.content || !live) bub.innerHTML = md(m.content || '');
  if (m.content || m.error || live) bodyEl.appendChild(bub);
  if (m.sources?.length) bodyEl.appendChild(sourcesBox(m.sources));
  if (m.report) bodyEl.appendChild(reportCard(m.report));
  if (!live) bodyEl.appendChild(actionBar(m));
  row.append(el('div', 'av', 'B'), bodyEl); thread.appendChild(row); toBottom(); updateRegen();
  return {row, bub, body: bodyEl};
}
function actionBar(m) {
  const bar = el('div', 'actions');
  const mk = (name, ic, label, fn) => { const b = el('button'); b.type = 'button'; b.dataset.a = name; b.append(icon(ic), document.createTextNode(label)); b.onclick = fn; bar.appendChild(b); };
  if (m.error) { mk('retry', 'refresh', 'Try again', () => retry()); return bar; }
  mk('copy', 'content_copy', 'Copy', async () => toast((await copyText(m.content)) ? 'Copied' : 'Copy failed - select the text and press Ctrl+C'));
  mk('regen', 'refresh', m.mode === 'agent' ? 'Run again' : 'Regenerate', () => regenerate());
  return bar;
}
function updateRegen() {
  const last = thread.lastElementChild;
  thread.querySelectorAll('[data-a=regen],[data-a=retry]').forEach(b => { b.hidden = !(last && last.contains(b)); });
}
thread.addEventListener('click', e => {
  const b = e.target.closest('.copy-code'); if (!b) return;
  copyText(b.closest('.code').querySelector('code').textContent).then(ok => toast(ok ? 'Code copied' : 'Copy failed'));
});

/* ---------- agent run card (animated) ---------- */
function runShell() {
  const c = el('div', 'run'); c.dataset.state = 'working';
  c.innerHTML = '<div class="run-h"><div class="orbit" aria-hidden="true"><i class="o1"></i><i class="o2"></i><i class="core"></i></div>' +
    '<div class="rt"><b class="rtitle">Agent at work</b><small class="rstatus" aria-live="polite">Understanding your task...</small></div></div>' +
    '<div class="prog" role="progressbar" aria-label="Agent progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="4"><i style="width:4%"></i></div>' +
    '<ol class="plan" aria-label="Plan"></ol><div class="acts" aria-label="Tool activity"></div><div class="vf" hidden></div>';
  return c;
}
const q = (c, s) => c.querySelector(s);
function setPlan(c, plan) {
  const ol = q(c, '.plan'); ol.replaceChildren();
  (plan.steps || []).forEach((s, i) => { const li = el('li'); li.dataset.s = i === 0 ? 'active' : 'pending'; li.style.setProperty('--i', i); li.append(el('span', 'ck'), el('span', 't', s.title)); ol.appendChild(li); });
}
function setProgress(c, pct) { const p = q(c, '.prog'); p.setAttribute('aria-valuenow', Math.round(pct)); p.firstChild.style.width = Math.round(pct) + '%'; }
function advancePlan(c, done) {
  const items = [...q(c, '.plan').children];
  items.forEach((li, i) => { li.dataset.s = i < done ? 'done' : i === done ? 'active' : 'pending'; });
}
function toolRow(c, ev) {
  const r = el('div', 'act'); r.dataset.id = ev.id; r.dataset.s = 'run';
  r.append(el('span', 'st'), el('b', '', ev.label), el('small', '', ev.input ? ev.input.replace(/[{}"]/g, ' ').slice(0, 90) : ''));
  q(c, '.acts').appendChild(r); return r;
}
const runState = run => run.error || run.status === 'failed' ? 'error' : run.status === 'partially_completed' || run.status === 'waiting_for_approval' ? 'warn' : 'done';
function runCardStatic(run) {          // for saved history: no animation delays
  const c = runShell(); c.classList.add('static'); c.dataset.state = runState(run);
  q(c, '.rtitle').textContent = run.error ? 'The agent stopped' : RUN_TITLES[run.status] || 'Agent finished'; q(c, '.rstatus').textContent = run.summary || '';
  setPlan(c, {steps: run.plan || []}); advancePlan(c, (run.plan || []).length); setProgress(c, 100);
  (run.tools || []).forEach(t => { const r = toolRow(c, t); r.dataset.s = t.ok ? 'ok' : 'bad'; r.lastChild.textContent = t.detail || ''; });
  if (run.verify) showVerify(c, run.verify);
  return c;
}
function showVerify(c, v) {
  const box = q(c, '.vf'); box.hidden = false; box.replaceChildren();
  const add = (ic, text, cls = '') => { const s = el('span', 'vchip ' + cls); s.append(icon(ic), document.createTextNode(text)); box.appendChild(s); };
  if (v.sources) add('verified', `${v.sources} source${v.sources === 1 ? '' : 's'} checked`, 'ok'); else add('verified', 'Answer checked: no web links to verify', 'ok');
  if (v.linksRemoved) add('warning', `${v.linksRemoved} unverified link${v.linksRemoved === 1 ? '' : 's'} removed`, 'warn');
  if (v.toolsUsed?.length) add('build', `${v.toolsUsed.length} tool${v.toolsUsed.length === 1 ? '' : 's'} used`);
}

/* ---------- talking to the server ---------- */
async function* sse(res) {
  const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
  for (;;) {
    const {done, value} = await reader.read(); if (done) break;
    buf += dec.decode(value, {stream: true});
    let i; while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (\w+)/m.exec(block), data = /^data: (.*)$/m.exec(block);
      if (ev && data) { try { yield [ev[1], JSON.parse(data[1])]; } catch (_) { /* skip a damaged event */ } }
    }
  }
}
async function post(path, payload, signal) {
  let res;
  try { res = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload), signal}); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('Cannot reach Baasha AI. Check your internet connection and try again.'); }
  if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
    let msg = res.status === 429 ? 'You have reached the limit for now. Please try again later.' : res.status === 503 ? 'Baasha AI is not available right now.' : `Something went wrong (HTTP ${res.status}).`;
    try { const j = await res.json(); if (j?.error?.message) msg = j.error.message; } catch (_) { /* non-JSON error page */ }
    throw new Error(msg);
  }
  return res;
}
const apiMessages = chat => chat.messages.filter(m => !m.error).map(m => ({role: m.role, content: (m.file ? `[Attached file: ${m.file.name}]\n${m.file.text}\n\n` : '') + m.content}));

async function respond() {                   // answers the last user message of S.chat
  const chat = S.chat, last = chat.messages[chat.messages.length - 1], mode = last.mode || S.mode;
  S.ctl = new AbortController(); setBusy(true);
  const msg = {role: 'assistant', content: '', mode}; let ui;
  try {
    if (mode === 'agent') {
      const prior = chat.messages.slice(0, -1).filter(m => !m.error).slice(-6).map(m => `${m.role === 'user' ? 'User' : 'Baasha'}: ${m.content.slice(0, 900)}`).join('\n');
      const ctx = [prior ? `Earlier in this conversation:\n${prior}` : '', last.file ? `Attached file ${last.file.name}:\n${last.file.text}` : ''].filter(Boolean).join('\n\n');
      const res = await post('/api/baasha/agent', {task: last.content, context: ctx ? [{role: 'user', content: ctx.slice(0, 7800)}] : undefined}, S.ctl.signal);
      ui = renderMsg({...msg, content: ''}, {live: true});
      const card = runShell(); ui.body.prepend(card); const tools = []; let done = 0, planLen = 3; const run = {plan: [], tools};
      for await (const [t, d] of sse(res)) {
        if (t === 'status') q(card, '.rstatus').textContent = d.text + '...';
        else if (t === 'plan') { run.plan = d.steps; planLen = Math.max(d.steps.length, 1); setPlan(card, d); q(card, '.rstatus').textContent = d.goal || 'Plan ready'; setProgress(card, 12); }
        else if (t === 'tool_start') { toolRow(card, d); q(card, '.rstatus').textContent = d.label + '...'; }
        else if (t === 'tool_end') {
          const r = card.querySelector(`.act[data-id="${CSS.escape(d.id)}"]`); if (r) { r.dataset.s = d.ok ? 'ok' : 'bad'; r.lastChild.textContent = d.detail; }
          tools.push({id: d.id, label: r ? r.children[1].textContent : d.name, ok: d.ok, detail: d.detail, category: d.category}); done++; advancePlan(card, Math.min(done, planLen - 1)); setProgress(card, 12 + (done / (done + 2)) * 70);
        }
        else if (t === 'verify') { run.verify = d; q(card, '.rstatus').textContent = 'Checking the answer against what the tools returned...'; setProgress(card, 92); }
        else if (t === 'final') {
          run.status = d.status; advancePlan(card, planLen); setProgress(card, 100); card.dataset.state = runState(run); q(card, '.rtitle').textContent = RUN_TITLES[d.status] || 'Agent finished';
          run.summary = `${d.steps} tool step${d.steps === 1 ? '' : 's'} in ${d.seconds}s` + (d.stopped ? ` - ${d.stopped}` : ''); q(card, '.rstatus').textContent = run.summary;
          if (run.verify) showVerify(card, run.verify);
          msg.content = d.text; msg.sources = d.sources; msg.run = run;
          ui.bub.innerHTML = md(d.text); ui.bub.classList.add('reveal-final'); ui.body.insertBefore(ui.bub, null);
          if (d.sources?.length) ui.body.appendChild(sourcesBox(d.sources));
          if (d.report) { const rep = addReport(db.reports, {id: uid(), title: d.report.title, markdown: d.report.markdown, complete: d.report.complete, created: Date.now()}); msg.report = rep; ui.body.appendChild(reportCard(rep)); }
          if (d.status === 'completed') burst(card);
        }
        else if (t === 'error') throw new Error(d.message);
      }
    } else {
      const res = await post('/api/baasha/chat', {mode, messages: apiMessages(chat)}, S.ctl.signal);
      ui = renderMsg({...msg, content: ''}, {live: true});
      if (mode === 'research') ui.bub.innerHTML = '<span class="typing" role="status" aria-label="Searching"><span></span><span></span><span></span></span>';
      let raf = 0; const paint = () => { raf = 0; const f = stick(); ui.bub.innerHTML = md(msg.content) + '<span class="caret" aria-hidden="true"></span>'; if (f) toBottom(); };
      for await (const [t, d] of sse(res)) {
        if (t === 'token') { msg.content += d.t; if (!raf) raf = requestAnimationFrame(paint); }
        else if (t === 'result') { msg.content = d.text; msg.sources = d.sources; msg.queries = d.queries; ui.bub.innerHTML = md(d.text); if (d.sources.length) { const chipRow = el('div', 'chips'); const c = el('span', 'chip-s'); c.append(icon('language'), document.createTextNode('Searched the web')); chipRow.appendChild(c); ui.body.prepend(chipRow); ui.body.appendChild(sourcesBox(d.sources)); } }
        else if (t === 'error') throw new Error(d.message);
      }
      if (raf) cancelAnimationFrame(raf); ui.bub.innerHTML = md(msg.content);
      if (!msg.content.trim()) throw new Error('Baasha returned an empty answer. Please try again.');
    }
    chat.messages.push(msg); ui.body.appendChild(actionBar(msg));
  } catch (e) {
    if (e.name === 'AbortError') {                           // the user pressed Stop: keep what arrived
      if (ui) { ui.row.classList.add('stopped'); }
      if (msg.content.trim()) { msg.stopped = true; chat.messages.push(msg); ui.body.appendChild(actionBar(msg)); }
      else { ui?.row.remove(); chat.messages.push({role: 'assistant', content: 'Stopped before an answer arrived.', mode, error: true}); renderMsg(chat.messages.at(-1)); }
      toast('Stopped');
    } else {
      ui?.row.remove(); const em = {role: 'assistant', content: e.message, mode, error: true}; chat.messages.push(em); renderMsg(em);
    }
  } finally {
    S.ctl = null; setBusy(false); chat.updated = Date.now(); persist(); renderList(); updateRegen(); prompt.focus();
  }
}

function burst(card) {            // small celebratory sparkle when the agent finishes
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = el('div', 'burst'); for (let i = 0; i < 12; i++) { const s = el('i'); s.style.setProperty('--a', (i * 30) + 'deg'); s.style.setProperty('--d', (30 + (i % 3) * 14) + 'px'); b.appendChild(s); }
  card.querySelector('.orbit').appendChild(b); setTimeout(() => b.remove(), 1200);
}

/* ---------- sending ---------- */
function ensureChat() {
  if (S.chat) return S.chat;
  S.chat = {id: uid(), title: 'New chat', mode: S.mode, created: Date.now(), updated: Date.now(), messages: []}; db.chats.unshift(S.chat); return S.chat;
}
async function send(text) {
  if (S.busy) return;
  text = (text ?? prompt.value).trim();
  if (!text) { prompt.focus(); return; }
  if (S.status?.state === 'not_configured') { showNotice(); return; }   // otherwise let the server answer, so real problems get a real message
  const chat = ensureChat(), file = S.file;
  const m = {role: 'user', content: text, mode: S.mode}; if (file) m.file = file;
  chat.messages.push(m); if (chat.title === 'New chat') chat.title = text.replace(/\s+/g, ' ').slice(0, 60);
  prompt.value = ''; autosize(); clearFile(); setTitle(chat.title); renderMsg(m); persist(); renderList();
  await respond();
}
function retry() {                 // drop the error and ask again
  if (S.busy || !S.chat) return;
  while (S.chat.messages.length && S.chat.messages.at(-1).role === 'assistant') S.chat.messages.pop();
  thread.lastElementChild?.remove(); respond();
}
function regenerate() {            // replaces the latest answer instead of adding a second one
  if (S.busy || !S.chat) return;
  const ms = S.chat.messages; if (ms.at(-1)?.role !== 'assistant') return;
  ms.pop(); thread.lastElementChild?.remove(); updateRegen(); respond();
}
$('form').onsubmit = e => { e.preventDefault(); send(); };
prompt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
$('stop').onclick = () => S.ctl?.abort();
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.busy) S.ctl?.abort(); });
function autosize() { prompt.style.height = 'auto'; prompt.style.height = Math.min(prompt.scrollHeight, 200) + 'px'; $('count').textContent = prompt.value.length > 5000 ? prompt.value.length + ' / 6000' : ''; }
prompt.addEventListener('input', autosize);

/* ---------- attach a text file (read in the browser) ---------- */
function clearFile() { S.file = null; $('chip').classList.remove('show'); $('attachRow').classList.remove('show'); $('file').value = ''; }
$('attachBtn').onclick = () => { if (!S.busy) $('file').click(); };
$('chipX').onclick = clearFile;
$('file').onchange = async () => {
  const f = $('file').files[0]; if (!f) return;
  if (f.size > 100 * 1024) { toast('That file is larger than 100 KB.', 4000); clearFile(); return; }
  let text; try { text = await f.text(); } catch (_) { toast('That file could not be read.', 4000); clearFile(); return; }
  if (text.includes('\u0000')) { toast('That looks like a binary file, not text.', 4000); clearFile(); return; }
  const cut = text.length > 6000;
  S.file = {name: f.name.replace(/[^\w.\- ]/g, '_').slice(0, 80), text: text.slice(0, 6000)};
  $('chipName').textContent = S.file.name; $('chipWarn').textContent = cut ? 'Only the first 6,000 characters will be used.' : '';
  $('chip').classList.add('show'); $('attachRow').classList.add('show');
};

/* ---------- conversations ---------- */
function setTitle(t) { $('title').textContent = t || ''; $('titleChip').hidden = !t; }
function openChat(id) {
  if (S.busy) { toast('Wait for the answer to finish, or press Stop.'); return; }
  const c = db.chats.find(x => x.id === id); if (!c) return;
  S.chat = c; thread.replaceChildren(); clearFile(); setView('chat'); setTitle(c.title);
  c.messages.forEach(m => renderMsg(m)); setMode(c.messages.at(-1)?.mode || c.mode || 'chat'); renderList(); toBottom();
}
function newChat() {
  if (S.busy) { toast('Wait for the answer to finish, or press Stop.'); return; }
  S.chat = null; thread.replaceChildren(); clearFile(); prompt.value = ''; autosize(); setView('welcome'); setTitle(''); renderList(); prompt.focus();
}
async function renameChat(c) {
  const t = await ask({title: 'Rename conversation', input: c.title, ok: 'Rename'}); if (!t) return;
  c.title = t.slice(0, 80); persist(); renderList(); if (S.chat === c) setTitle(c.title); toast('Renamed');
}
async function deleteChat(c) {
  if (S.busy && S.chat === c) { toast('Press Stop first.'); return; }
  if (!await ask({title: 'Delete this conversation?', body: `"${c.title}" will be deleted from this browser. This cannot be undone.`, ok: 'Delete', danger: true})) return;
  db.chats = db.chats.filter(x => x !== c); persist(); if (S.chat === c) newChat(); else renderList(); toast('Conversation deleted');
}
function renderList() {
  const list = $('list'), qy = $('search').value.trim().toLowerCase(); list.replaceChildren();
  const chats = db.chats.filter(c => !qy || c.title.toLowerCase().includes(qy) || c.messages.some(m => m.content.toLowerCase().includes(qy))).sort((a, b) => b.updated - a.updated);
  if (!chats.length) list.appendChild(el('div', 'empty', qy ? 'No matching chats.' : 'No conversations yet. Start one!'));
  chats.forEach(c => {
    const row = el('div', 'item' + (c === S.chat ? ' active' : '')); row.setAttribute('role', 'listitem');
    const t = el('button', 't', c.title); t.type = 'button'; t.title = c.title; t.onclick = () => { go(''); openChat(c.id); closeDrawer(); };
    row.appendChild(t);
    [['edit', 'Rename', () => renameChat(c)], ['delete', 'Delete', () => deleteChat(c)]].forEach(([ic, label, fn]) => {
      const b = el('button', 'ic'); b.type = 'button'; b.setAttribute('aria-label', label + ' ' + c.title); b.title = label; b.appendChild(icon(ic)); b.onclick = fn; row.appendChild(b);
    });
    list.appendChild(row);
  });
}
let st; $('search').addEventListener('input', () => { clearTimeout(st); st = setTimeout(renderList, 150); });
$('newChat').onclick = () => { go(''); newChat(); closeDrawer(); };

/* ---------- library ---------- */
function renderReports() {
  const box = $('reports'); box.replaceChildren();
  if (!db.reports.length) { box.appendChild(el('p', 'lead', 'No reports yet. Ask the Agent to write one, for example: "Research three competitors and write a report".')); return; }
  db.reports.forEach(r => {
    const row = el('div', 'hrow'); const t = el('div', 't', r.title);
    row.append(icon('description'), t, el('small', '', (r.complete === false ? 'Preliminary - ' : '') + new Date(r.created).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'})));
    const dl = el('button', 'ic'); dl.type = 'button'; dl.setAttribute('aria-label', 'Download ' + r.title); dl.title = 'Download'; dl.appendChild(icon('download')); dl.onclick = () => downloadReport(r);
    const rm = el('button', 'ic'); rm.type = 'button'; rm.setAttribute('aria-label', 'Delete ' + r.title); rm.title = 'Delete'; rm.appendChild(icon('delete'));
    rm.onclick = async () => { if (await ask({title: 'Delete this report?', body: `"${r.title}" will be removed from this browser.`, ok: 'Delete', danger: true})) { db.reports = db.reports.filter(x => x !== r); persist(); renderReports(); } };
    row.append(dl, rm); box.appendChild(row);
  });
}

/* ---------- sidebar, routing ---------- */
const side = $('side'), PREF = 'baasha-sb';
const mobileMQ = matchMedia('(max-width:767px)'), tabletMQ = matchMedia('(min-width:768px) and (max-width:1023px)');
const pref = () => { try { return localStorage.getItem(PREF); } catch (_) { return null; } };
function layout() {
  if (mobileMQ.matches) { body.classList.remove('sb-mini'); side.inert = !body.classList.contains('sb-open'); }
  else { body.classList.remove('sb-open'); side.inert = false; const p = pref(); body.classList.toggle('sb-mini', p ? p === 'mini' : tabletMQ.matches); }
  $('collapse').setAttribute('aria-expanded', !body.classList.contains('sb-mini')); $('menu').setAttribute('aria-expanded', body.classList.contains('sb-open'));
}
function openDrawer(open) { body.classList.toggle('sb-open', open); layout(); (open ? $('newChat') : $('menu')).focus(); }
const closeDrawer = () => { if (mobileMQ.matches && body.classList.contains('sb-open')) { body.classList.remove('sb-open'); layout(); } };
$('collapse').onclick = () => { try { localStorage.setItem(PREF, body.classList.contains('sb-mini') ? 'full' : 'mini'); } catch (_) { /* optional */ } layout(); };
$('menu').onclick = () => openDrawer(!body.classList.contains('sb-open'));
$('scrim').onclick = () => openDrawer(false);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && body.classList.contains('sb-open')) openDrawer(false); });
mobileMQ.addEventListener('change', layout); tabletMQ.addEventListener('change', layout);
function go(r) { const h = r ? '#/' + r : '#/'; if (location.hash !== h && !(h === '#/' && !location.hash)) location.hash = h; else route(); }
function route() {
  const lib = location.hash === '#/library';
  $('view-chat').hidden = lib; $('view-library').hidden = !lib;
  body.dataset.mode = lib ? 'page' : view.dataset.mode;
  if (lib) renderReports();
  document.querySelectorAll('.nav a[data-nav]').forEach(a => { if ((lib && a.dataset.nav === 'library') || (!lib && a.dataset.nav === S.mode)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  document.title = (lib ? 'Library' : 'Baasha AI') + ' - Baasha AI | Click2Client Media'; closeDrawer();
}
addEventListener('hashchange', route);
$('navSettings').addEventListener('click', e => { e.preventDefault(); openSettings(); closeDrawer(); });

/* ---------- status, settings ---------- */
function showNotice() {
  const n = $('notice'); n.hidden = false;
  n.textContent = 'Baasha AI is not switched on yet. The site owner still has to finish setup, so answers are unavailable for now. You can read what it will do under Settings & safety.';
  toast('Baasha AI is not switched on yet.', 4000);
}
function paintStatus() {
  const v = statusView(S.status);
  $('dot').className = 'dot ' + (v.tone === 'on' ? 'on' : v.tone === 'warn' ? 'warn' : v.tone === 'wait' ? 'wait' : 'off'); $('statusTxt').textContent = v.label;
  $('notice').hidden = S.status?.state !== 'not_configured';
  if ($('cfg').open) paintSettings();
}
function paintSettings() {
  const v = statusView(S.status), box = $('cStatus'); box.replaceChildren();
  v.lines.forEach(l => box.appendChild(el('div', '', l)));
  $('cRetry').hidden = !v.canRetry; $('cRetry').disabled = S.status === undefined;
}
async function loadStatus() {
  S.status = undefined; paintStatus();
  try {
    const r = await fetch('/api/baasha/status', {cache: 'no-store', signal: AbortSignal.timeout(10000)});
    S.status = r.ok ? await r.json() : null;
  } catch (_) { S.status = null; }             // the loading state always ends: success, or "cannot reach"
  paintStatus();
  if (S.status?.state === 'not_configured') showNotice();
}
function openSettings() { paintSettings(); $('cfg').showModal(); }
$('cRetry').onclick = () => loadStatus();
$('cClear').onclick = async () => {
  if (!await ask({title: 'Delete everything?', body: 'All chats and reports saved in this browser will be deleted. This cannot be undone.', ok: 'Delete everything', danger: true})) return;
  db = {chats: [], reports: []}; persist(); newChat(); renderReports(); toast('Everything was deleted from this browser.');
};

/* ---------- start ---------- */
layout(); setMode('chat'); setView('welcome'); renderList(); route(); loadStatus(); autosize(); initWorkspace({toast, ask});
addEventListener('beforeunload', e => { if (S.busy) { e.preventDefault(); e.returnValue = ''; } });
