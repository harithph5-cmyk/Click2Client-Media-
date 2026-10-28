// The Workspace panel: Google sign-in, memory the owner controls, and saved task history.
// Everything is drawn with textContent (never innerHTML), and every change goes through the server, which takes the
// workspace from the signed-in session. Nothing here pretends to be saved: lists show what the server returned.
import {$, el} from './core.js';

const API = '/api/baasha';
let me = null;

async function api(path, {method = 'GET', body} = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && me?.csrf) headers['x-csrf-token'] = me.csrf;
  let res;
  try { res = await fetch(API + path, {method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store'}); }
  catch (_) { return {ok: false, status: 0, data: {error: {message: 'Cannot reach Baasha AI. Check your connection.'}}}; }
  let data = null; try { data = await res.json(); } catch (_) { data = {}; }
  return {ok: res.ok, status: res.status, data};
}
const errText = r => r.data?.error?.message || `Something went wrong (HTTP ${r.status}).`;
const when = iso => { try { return new Date(iso).toLocaleString([], {dateStyle: 'medium', timeStyle: 'short'}); } catch (_) { return ''; } };
const btn = (text, cls, fn) => { const b = el('button', 'btn ' + (cls || ''), text); b.type = 'button'; b.onclick = fn; return b; };

export function initWorkspace({toast, ask}) {
  const dlg = $('ws'); if (!dlg) return;
  const panels = {memory: $('wsMemory'), tasks: $('wsTasks'), account: $('wsAccount')};
  let tab = 'memory';

  function paintCard() {
    const b = document.querySelector('.usercard .t b'), s = document.querySelector('.usercard .t small'), c = document.querySelector('.usercard');
    if (!b || !s) return;
    if (me?.authenticated) { b.textContent = me.user.email.length > 26 ? me.user.email.slice(0, 25) + '...' : me.user.email; s.textContent = 'Signed in: workspace on'; c.title = 'Signed in with Google. Memory and task history are saved to your workspace. Chats stay in this browser.'; }
    else { b.textContent = 'Private to you'; s.textContent = 'Saved in this browser'; c.title = 'Your conversations are saved only in this browser.'; }
  }
  async function refreshMe() {
    const r = await api('/me'); me = r.ok ? r.data : {accounts: {configured: false}, authenticated: false, unreachable: true};
    paintCard(); return me;
  }
  const note = (parent, text) => parent.appendChild(el('div', 'note', text));

  /* ----- Account ----- */
  function renderAccount() {
    const p = panels.account; p.replaceChildren();
    if (!me || me.unreachable) { note(p, 'Baasha AI cannot be reached right now.'); return; }
    if (me.authenticated) {
      note(p, `Signed in as ${me.user.email}. Your memory and task history are saved to your workspace. Chats and reports stay in this browser.`);
      const row = el('div', 'drow');
      row.append(btn('Sign out', '', async () => { const r = await api('/auth/logout', {method: 'POST', body: {}}); if (r.ok) { await refreshMe(); renderAll(); toast('Signed out'); } else toast(errText(r)); }));
      p.appendChild(row);
      p.appendChild(el('h3', '', 'Delete my data'));
      note(p, 'Deletes your account, saved memory, memory history and task history from the server, and signs you out. Chats in this browser are not affected. This cannot be undone.');
      const d = el('div', 'drow');
      d.append(btn('Delete my workspace and account...', 'danger', async () => {
        if (!await ask({title: 'Delete your workspace?', body: 'All saved memory, task history and your account will be deleted. This cannot be undone.', ok: 'Delete everything', danger: true})) return;
        const r = await api('/workspace/delete', {method: 'POST', body: {confirm: 'DELETE'}});
        if (r.ok) { await refreshMe(); renderAll(); toast('Your workspace was deleted.'); } else toast(errText(r));
      }));
      p.appendChild(d); return;
    }
    if (!me.accounts?.configured) { note(p, 'Accounts are not switched on yet. The site owner still has to finish the Google sign-in setup. Everything else in Baasha AI works without an account.'); return; }
    note(p, 'Sign in with Google to keep memory and task history across devices. Baasha AI only receives your name and verified email address. It never sees your Google password.');
    const a = el('a', 'btn primary', 'Sign in with Google'); a.href = API + '/auth/google/start'; const row = el('div', 'drow'); row.appendChild(a); p.appendChild(row);
  }

  /* ----- Memory ----- */
  function memItem(m, reload) {
    const box = el('div', 'wsitem'); const head = el('div', 'wshead');
    head.append(el('span', 'chip-s', m.kind), el('b', '', m.subject || ''));
    const body = el('div', 'wsbody', m.content);
    const meta = el('small', '', `${m.source === 'owner' ? 'Added by you' : 'Proposed by the agent' + (m.taskId ? ' (task ' + m.taskId.slice(0, 6) + ')' : '')} · ${when(m.updatedAt)}`);
    const acts = el('div', 'drow');
    const run = async (fn, okMsg) => { const r = await fn(); if (r.ok) { if (okMsg) toast(okMsg); await reload(); } else toast(errText(r)); };
    if (m.status === 'proposed') {
      acts.append(btn('Approve', 'primary', () => run(() => api(`/workspace/memory/${m.id}/approve`, {method: 'POST', body: {}}), 'Saved to memory')), btn('Reject', '', () => run(() => api(`/workspace/memory/${m.id}`, {method: 'DELETE'}), 'Rejected')));
    } else {
      acts.append(btn('Edit', '', () => {
        const ta = el('textarea', ''); ta.value = m.content; ta.maxLength = 500; ta.rows = 3; ta.setAttribute('aria-label', 'Memory text');
        const save = btn('Save', 'primary', () => run(() => api(`/workspace/memory/${m.id}`, {method: 'PATCH', body: {content: ta.value}}), 'Updated'));
        body.replaceChildren(ta); acts.replaceChildren(save, btn('Cancel', '', reload)); ta.focus();
      }), btn('History', '', async () => {
        const r = await api(`/workspace/memory/${m.id}/history`); const old = box.querySelector('.wshist'); if (old) { old.remove(); return; }
        const h = el('div', 'wshist');
        if (!r.ok) h.textContent = errText(r); else if (!r.data.versions.length) h.textContent = 'No earlier versions. This memory has not been edited.';
        else r.data.versions.forEach(v => { const row = el('div', 'wsver'); row.append(el('span', '', `v${v.version} · ${when(v.changedAt)} · ${v.content}`), btn('Restore', '', () => run(() => api(`/workspace/memory/${m.id}/revert`, {method: 'POST', body: {version: v.version}}), 'Restored'))); h.appendChild(row); });
        box.appendChild(h);
      }), btn('Delete', 'danger', async () => { if (await ask({title: 'Delete this memory?', body: 'It and its history will be removed.', ok: 'Delete', danger: true})) run(() => api(`/workspace/memory/${m.id}`, {method: 'DELETE'}), 'Deleted'); }));
    }
    box.append(head, body, meta, acts); return box;
  }
  async function renderMemory() {
    const p = panels.memory; p.replaceChildren();
    if (!me?.authenticated) { note(p, me?.accounts?.configured ? 'Sign in (Account tab) to keep memory across chats and devices.' : 'Memory needs an account, and accounts are not switched on yet.'); return; }
    const r = await api('/workspace/memory'); if (!r.ok) { note(p, errText(r)); return; }
    const reload = () => renderMemory();
    const proposed = r.data.memories.filter(m => m.status === 'proposed'), saved = r.data.memories.filter(m => m.status === 'approved');
    note(p, 'Baasha AI can only propose a memory. Nothing is remembered until you approve it. Memory never stores passwords, keys or tokens.');
    if (proposed.length) { p.appendChild(el('h3', '', `Waiting for your review (${proposed.length})`)); proposed.forEach(m => p.appendChild(memItem(m, reload))); }
    p.appendChild(el('h3', '', `Saved memory (${saved.length} of ${r.data.limits.approved})`));
    if (!saved.length) note(p, 'Nothing saved yet. Add a fact below, or approve a proposal from the agent.'); saved.forEach(m => p.appendChild(memItem(m, reload)));
    p.appendChild(el('h3', '', 'Add a memory'));
    const kind = el('select', ''); kind.id = 'wsKind'; kind.setAttribute('aria-label', 'Kind'); [['preference', 'Preference'], ['project', 'Project or business'], ['website', 'Website'], ['lesson', 'Lesson']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; kind.appendChild(o); });
    const subj = el('input', ''); subj.id = 'wsSubject'; subj.type = 'text'; subj.maxLength = 80; subj.placeholder = 'Short label (optional)'; subj.setAttribute('aria-label', 'Subject');
    const txt = el('textarea', ''); txt.id = 'wsContent'; txt.rows = 3; txt.maxLength = 500; txt.placeholder = 'For example: We are a bakery in Chennai and our main goal is online orders.'; txt.setAttribute('aria-label', 'Memory text');
    const add = btn('Save memory', 'primary', async () => { const x = await api('/workspace/memory', {method: 'POST', body: {kind: kind.value, subject: subj.value, content: txt.value}}); if (x.ok) { toast('Saved to memory'); reload(); } else toast(errText(x)); });
    const form = el('div', 'wsform'); form.append(kind, subj, txt); p.append(form, add);
  }

  /* ----- Task history ----- */
  async function renderTasks() {
    const p = panels.tasks; p.replaceChildren();
    if (!me?.authenticated) { note(p, me?.accounts?.configured ? 'Sign in (Account tab) to keep a history of agent tasks.' : 'Task history needs an account, and accounts are not switched on yet.'); return; }
    const r = await api('/workspace/tasks'); if (!r.ok) { note(p, errText(r)); return; }
    if (!r.data.tasks.length) { note(p, 'No agent tasks yet. Run a task in Agent mode while signed in and it will appear here.'); return; }
    r.data.tasks.forEach(t => {
      const row = el('div', 'wsitem'); const head = el('div', 'wshead'); head.append(el('span', 'chip-s', t.status.replace(/_/g, ' ')), el('b', '', when(t.createdAt)));
      const goal = el('div', 'wsbody', t.goal); const acts = el('div', 'drow');
      acts.appendChild(btn('Show log', '', async () => {
        const old = row.querySelector('.wshist'); if (old) { old.remove(); return; }
        const d = await api('/tasks/' + t.id); const h = el('div', 'wshist');
        if (!d.ok) h.textContent = errText(d);
        else d.data.task.events.forEach(e => { const x = e.data || {}; const line = e.type === 'state' ? `state: ${x.from} -> ${x.to}` : e.type === 'tool' ? `tool ${x.tool}: ${x.status}${x.category ? ' (' + x.category + ')' : ''}, ${x.ms ?? '?'} ms` : e.type === 'policy' ? `policy ${x.tool}: ${x.decision} (${x.risk})` : e.type; h.appendChild(el('div', 'wsver', `${e.seq}. ${line}`)); });
        row.appendChild(h);
      }));
      row.append(head, goal, acts); p.appendChild(row);
    });
  }

  function renderAll() { renderAccount(); renderMemory(); renderTasks(); }
  function show(name) {
    tab = name;
    dlg.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
    Object.entries(panels).forEach(([k, el_]) => { el_.hidden = k !== name; });
  }
  dlg.querySelectorAll('[role=tab]').forEach(b => { b.onclick = () => show(b.dataset.tab); });
  dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });   // Enter in a field must not close the dialog
  $('navWorkspace')?.addEventListener('click', async e => { e.preventDefault(); await refreshMe(); renderAll(); show(me?.authenticated ? 'memory' : 'account'); dlg.showModal(); document.getElementById('scrim')?.click?.(); });

  const q = new URLSearchParams(location.search);
  if (q.get('signin') === 'failed') { toast('Sign-in did not complete. Please try again.', 5000); history.replaceState(null, '', location.pathname + location.hash); }
  refreshMe();
}
