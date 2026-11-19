// Admin → SEO Agent tab (SEO · GEO · AEO automation). Loaded by admin.js.
import { api, esc, fmtDate, toast } from './common.js';

let timer = null;
const COL = { todo: 'unavailable', writing: 'warn', ready: 'pass', qa_failed: 'fail', done: 'pass', dismissed: 'unavailable' };
const LBL = { todo: 'To do', writing: 'Writing…', ready: 'Ready to publish', qa_failed: 'QA failed', done: 'Done', dismissed: 'Dismissed' };

export async function seoTab(view, { head, state }) {
  clearTimeout(timer);
  const d = await api('/admin/seo');
  const { tasks, runs, config } = d.state;
  const open = tasks.filter((t) => !['done', 'dismissed'].includes(t.status));
  const row = (t) => `<tr data-id="${esc(t.id)}"><td><span class="pill ${t.type === 'new' ? 'pass' : 'warn'}">${t.type === 'new' ? 'New' : 'Improve'}</span></td>
    <td><b>${esc(t.keyword)}</b><div class="tiny muted">${esc([t.intent, t.format, t.difficulty && 'difficulty: ' + t.difficulty, t.volume != null && t.volume + '/mo', t.impressions != null && t.impressions + ' impr.'].filter(Boolean).join(' · '))}</div>
      <div class="small">${esc(t.type === 'improve' ? t.why + '. ' : '')}${esc(t.brief || '')}</div>
      ${t.qa?.issues?.length ? `<ul class="tiny" style="margin:6px 0 0 16px">${t.qa.issues.map((i) => `<li>${i.sev === 'fail' ? '❌' : '⚠️'} ${esc(i.msg)}</li>`).join('')}</ul>` : ''}${t.error ? `<div class="tiny" style="color:#b42318">${esc(t.error)}</div>` : ''}</td>
    <td><span class="pill ${COL[t.status]}">${LBL[t.status]}</span>${t.qa ? `<div class="tiny muted">QA ${t.qa.score}/100</div>` : ''}</td>
    <td class="nowrap">${t.type === 'new' && ['todo', 'qa_failed'].includes(t.status) ? '<button class="btn sm accent" data-write>Write</button>' : ''}
      ${t.postId ? '<button class="btn sm ghost" data-edit>Open draft</button>' : ''}
      ${t.type === 'new' && ['ready', 'qa_failed'].includes(t.status) && t.postId ? `<button class="btn sm" data-pub data-force="${t.status === 'qa_failed'}">Publish</button>` : ''}
      <button class="btn sm quiet" data-done>Done</button><button class="btn sm quiet" data-del>×</button></td></tr>`;

  view.innerHTML = `${head('Growth', 'SEO · GEO · AEO Agent', 'Finds keywords that bring clients, writes and QA-checks articles, and audits live posts. Nothing publishes without you unless auto-publish is on (capped per day).', '<button class="btn sm" data-research>Find keywords</button><button class="btn sm" data-audit>Audit live posts</button>')}
    <div class="card" style="margin-bottom:16px"><h3>Connections</h3><div class="row wrap-row">${d.connections.map((c) => `<span class="pill ${c.ok ? 'pass' : 'unavailable'}" title="${esc(c.hint)}">${c.ok ? '✓' : '○'} ${esc(c.name)}${c.detail ? ' · ' + esc(c.detail) : ''}</span>`).join('')}</div>
      ${d.connections.some((c) => !c.ok) ? `<p class="tiny muted">${d.connections.filter((c) => !c.ok).map((c) => esc(c.name + ': ' + c.hint)).join('<br>')}</p>` : ''}</div>
    <div class="card table-wrap" style="margin-bottom:16px"><h3 style="padding:16px 16px 0">Task board (${open.length} open)</h3>${open.length ? `<table class="t"><thead><tr><th></th><th>Keyword / brief</th><th>Status</th><th></th></tr></thead><tbody>${open.map(row).join('')}</tbody></table>` : '<div class="empty"><p>No tasks yet. Click <b>Find keywords</b>.</p></div>'}</div>
    <div class="two" style="align-items:start">
      <div class="card"><h3>Teach the agent about your business</h3><form id="seo-cfg">
        <div class="field"><label>Business, ideal client, tone, offers</label><textarea class="input" name="context" rows="8">${esc(config.context)}</textarea></div>
        <div class="field"><label>Seed topics (one per line, optional)</label><textarea class="input" name="seeds" rows="3">${esc(config.seeds)}</textarea></div>
        <div class="row wrap-row"><label class="small"><input type="checkbox" name="autoPublish" ${config.autoPublish ? 'checked' : ''}> Auto-publish QA-passed articles</label>
          <label class="small">Max per day <input class="input" type="number" name="perDay" min="1" max="3" value="${config.perDay}" style="width:70px"></label><button class="btn sm accent">Save</button></div></form></div>
      <div class="card"><h3>Conversions: leads by source</h3>${d.conversions.length ? `<table class="t"><tbody>${d.conversions.map((c) => `<tr><td>${esc(c.label)}</td><td><b>${c.n}</b></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No leads yet.</p>'}
        <p class="tiny muted">Repeat the topics that bring leads. For AI crawlers (GEO) <a href="/llms.txt" target="_blank">/llms.txt</a> is generated automatically.</p>
        <h3>Activity</h3>${runs.length ? runs.slice(0, 8).map((r) => `<div class="tiny"><span class="muted">${esc(fmtDate(r.at))}</span> ${esc(r.msg)}</div>`).join('') : '<p class="muted small">Nothing yet.</p>'}</div></div>`;

  if (tasks.some((t) => t.status === 'writing')) timer = setTimeout(() => state.tab === 'seo' && seoTab(view, { head, state }), 6000);
  const run = async (btn, fn, ok) => { btn.disabled = true; try { toast(ok(await fn())); } catch (ex) { toast(ex.message); } seoTab(view, { head, state }); };
  const post = (u, body) => api(u, { method: 'POST', body });
  view.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = e.target.closest('tr[data-id]')?.dataset.id;
    if (b.hasAttribute('data-research')) { b.textContent = 'Researching…'; return run(b, () => post('/admin/seo/research'), (r) => `${r.added} keyword tasks added`); }
    if (b.hasAttribute('data-audit')) return run(b, () => post('/admin/seo/audit'), (r) => `${r.added} improvement tasks added`);
    if (b.hasAttribute('data-write')) return run(b, () => post(`/admin/seo/tasks/${id}/write`), () => 'Writing started. Takes 1 to 3 minutes.');
    if (b.hasAttribute('data-pub')) { if (!confirm('Publish this article to the live blog?')) return; return run(b, () => post(`/admin/seo/tasks/${id}/publish`, { force: b.dataset.force === 'true' }), () => 'Published'); }
    if (b.hasAttribute('data-edit')) { state.blogEdit = tasks.find((x) => x.id === id).postId; location.hash = 'blog'; return; }
    if (b.hasAttribute('data-done')) return run(b, () => api(`/admin/seo/tasks/${id}`, { method: 'PATCH', body: { status: 'done' } }), () => 'Marked done');
    if (b.hasAttribute('data-del')) return run(b, () => api(`/admin/seo/tasks/${id}`, { method: 'DELETE' }), () => 'Removed');
  };
  view.onsubmit = async (e) => {
    e.preventDefault(); const f = e.target;
    try { await api('/admin/seo/config', { method: 'PUT', body: { context: f.context.value, seeds: f.seeds.value, autoPublish: f.autoPublish.checked, perDay: f.perDay.value } }); toast('Saved'); } catch (ex) { toast(ex.message); }
  };
}
