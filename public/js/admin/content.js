// Content: Blog CMS (SEO / AEO / GEO scores, approval workflow, AI drafts),
// content calendar and website page content.

import { api, esc, toast, modal } from '../common.js';
import { day, pill, nice, scoreChip, empty, errorBox, head, loading, formModal, refOptions, clearRefCache } from './ui.js';
import { scorePost } from '../scores.js';
import { entityTab } from './entity.js';

const canPublish = (meta) => meta.me.permissions.includes('*') || meta.me.permissions.includes('publish');
const STATUS = [['', 'All'], ['published', 'Published'], ['scheduled', 'Scheduled'], ['pending', 'Pending approval'], ['draft', 'Draft']];
const statusOf = (p) => (!p.published ? (p.pending ? 'pending' : 'draft') : p.publishAt && Date.parse(p.publishAt) > Date.now() ? 'scheduled' : 'published');

// Reads a cover upload, resized in the browser (same approach as the old blog form).
async function shrink(file) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const w = Math.min(1600, img.width); const c = document.createElement('canvas'); c.width = w; c.height = Math.round((img.height * w) / img.width);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

export async function blogTab(view, ctx) {
  const { state, meta } = ctx;
  if (state.hq?.get('edit')) { state.blogEdit = state.hq.get('edit'); state.hq.delete('edit'); }
  if (state.hq?.get('new') === '1') { state.blogEdit = 'new'; state.hq.delete('new'); }
  loading(view);
  let posts; try { posts = (await api('/admin/blog')).posts; } catch (e) { view.innerHTML = errorBox(e); return; }
  posts.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const editing = state.blogEdit === 'new' ? {} : posts.find((p) => p.id === state.blogEdit);
  if (editing) return blogForm(view, ctx, editing, state.blogEdit === 'new');

  const f = state.blogFilter || '';
  const shown = posts.filter((p) => !f || statusOf(p) === f);
  const pub = canPublish(meta);
  view.innerHTML = `${head('Content', 'Blog — SEO / AEO / GEO', `Every post is scored for search, answer-engine and AI-citation readiness. ${pub ? 'You can approve and publish.' : 'Posts you submit are published after approval.'} Live posts appear on <a href="/blog" target="_blank">/blog</a>.`, '<button class="btn accent sm" data-new>+ New post</button>')}
    <div class="pnl" style="padding:0"><div class="chips">${STATUS.map(([k, l]) => `<button class="chip ${f === k ? 'on' : ''}" data-s="${k}">${l}<b>${k ? posts.filter((p) => statusOf(p) === k).length : posts.length}</b></button>`).join('')}</div>
    ${shown.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Post</th><th>Category</th><th>Status</th><th>Scores</th><th></th></tr></thead><tbody>${shown.map((p) => { const s = scorePost(p); const st = statusOf(p); return `<tr data-id="${esc(p.id)}"><td><div class="ttl">${esc(p.title)}</div><div class="sub">${esc(p.date)} · /blog/${esc(p.id)}</div></td><td>${esc(p.category || '—')}</td><td>${pill(st)}</td><td>${scoreChip('SEO', s.seo)}${scoreChip('AEO', s.aeo)}${scoreChip('GEO', s.geo)}</td>
      <td class="act">${st === 'published' ? `<a class="btn sm quiet" href="/blog/${esc(p.id)}" target="_blank">View</a>` : ''}${st === 'pending' && pub ? '<button class="btn sm accent" data-approve>Approve &amp; publish</button> ' : ''}${st === 'published' && !pub ? '' : '<button class="btn sm ghost" data-edit>Edit</button>'} ${pub ? '<button class="btn sm quiet del" data-del>Delete</button>' : ''}</td></tr>`; }).join('')}</tbody></table></div>` : empty('No posts here', 'Write a post — or generate an AI draft and review it.')}</div>`;
  view.onclick = async (e) => {
    if (e.target.closest('[data-new]')) { state.blogEdit = 'new'; return blogTab(view, ctx); }
    const chip = e.target.closest('[data-s]'); if (chip) { state.blogFilter = chip.dataset.s; return blogTab(view, ctx); }
    const tr = e.target.closest('tr[data-id]'); if (!tr) return; const p = posts.find((x) => x.id === tr.dataset.id);
    try {
      if (e.target.closest('[data-edit]')) { state.blogEdit = p.id; return blogTab(view, ctx); }
      if (e.target.closest('[data-approve]') && confirm(`Approve and publish “${p.title}”?`)) { await api(`/admin/blog/${encodeURIComponent(p.id)}`, { method: 'PUT', body: { ...p, slug: p.id, published: true, pending: false } }); toast('Published'); return blogTab(view, ctx); }
      if (e.target.closest('[data-del]') && confirm(`Delete “${p.title}” permanently?`)) { await api(`/admin/blog/${encodeURIComponent(p.id)}`, { method: 'DELETE' }); toast('Deleted'); blogTab(view, ctx); }
    } catch (ex) { toast(ex.message); }
  };
}

function blogForm(view, ctx, p, isNew) {
  const { state, meta } = ctx; const pub = canPublish(meta);
  const cur = isNew ? 'draft' : statusOf(p) === 'scheduled' ? 'published' : statusOf(p);
  const I = (k, l, hint = '', extra = '') => `<div class="field"><label for="b-${k}">${l}</label><input class="input" id="b-${k}" name="${k}" value="${esc(p[k] || '')}" ${extra}>${hint ? `<span class="hint">${hint}</span>` : ''}</div>`;
  const faqRow = (x = {}) => `<div class="faq" style="display:grid;gap:6px;border:1px solid var(--line);border-radius:10px;padding:10px"><input class="input" data-q placeholder="Question" value="${esc(x.q || '')}"><textarea class="input" data-a rows="2" placeholder="Answer (1–3 sentences)">${esc(x.a || '')}</textarea><button type="button" class="btn sm quiet del" data-rmfaq style="justify-self:end">Remove</button></div>`;
  view.innerHTML = `${head('Blog', isNew ? 'New post' : 'Edit post', '', '<button class="btn ghost sm" data-back>← All posts</button>')}
    <div class="two" style="align-items:start;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr)">
    <form class="pnl stack" id="bf" style="gap:14px">
      ${I('title', 'Title *', '', 'required maxlength="140"')}${I('excerpt', 'Summary', 'One or two sentences that directly answer the topic — used as the page summary.', 'maxlength="300"')}
      <div class="field"><label for="b-body">Article</label><textarea class="input" id="b-body" name="body" rows="20" style="font:14.5px/1.6 var(--mono)">${esc(p.body || '')}</textarea><span class="hint"><code>## Heading</code> · <code>- bullet</code> · <code>1. numbered</code> · <code>&gt; quote</code> · <code>**bold**</code> · <code>[text](https://…)</code> · tables with <code>| a | b |</code></span></div>
      <div><label class="small" style="font-weight:600">FAQ section (adds FAQ schema)</label><div id="faqs" class="stack" style="gap:8px;margin-top:6px">${(p.faqs || []).map(faqRow).join('')}</div><button type="button" class="btn sm ghost" data-addfaq style="margin-top:8px">+ Add question</button></div>
      <h3 style="font:700 15px var(--display);margin-top:6px">Search &amp; sharing</h3>
      <div class="fgrid">${I('keyword', 'Focus keyword', '', 'maxlength="80"')}${I('slug', 'URL slug', 'Empty = from title', `placeholder="${esc(p.id || 'auto')}"`)}${I('metaTitle', 'SEO title', '30–65 characters', 'maxlength="120"')}${I('category', 'Category', '', 'maxlength="40"')}
        <div class="field wide"><label for="b-metaDescription">Meta description</label><textarea class="input" id="b-metaDescription" name="metaDescription" rows="2" maxlength="320">${esc(p.metaDescription || '')}</textarea><span class="hint">120–160 characters. Also used for Open Graph / social sharing.</span></div>
        ${I('imageAlt', 'Cover image ALT text')}${I('tags', 'Tags (comma separated)', '', `value="${esc((p.tags || []).join(', '))}"`)}${I('canonical', 'Canonical URL (optional)', '', 'placeholder="https://…"')}${I('author', 'Author', '', 'placeholder="Hari"')}${I('date', 'Publish date', '', 'type="date"')}</div>
      <div class="field"><label for="b-status">Status</label><select class="input" id="b-status" name="status"><option value="draft" ${cur === 'draft' ? 'selected' : ''}>Draft</option><option value="pending" ${cur === 'pending' ? 'selected' : ''}>Submit for approval</option>${pub ? `<option value="published" ${cur === 'published' ? 'selected' : ''}>Published</option>` : ''}</select><span class="hint">${pub ? 'Only “Published” goes live.' : 'Writers submit for approval; an approver publishes.'}</span></div>
      <div class="row"><button class="btn accent" type="submit">${isNew ? 'Create post' : 'Save post'}</button></div></form>
    <div class="stack" style="gap:16px"><div class="pnl"><h3>Optimisation scores</h3><div class="scorepanel" id="scores"></div></div>
      <div class="pnl"><h3>AI draft assistant</h3><p class="small muted" style="margin:-4px 0 10px">Generates a draft into this form. It is never published automatically — review, fix any “[verify]” facts, then submit for approval.</p><div class="stack" style="gap:8px"><input class="input" id="ai-topic" placeholder="Topic, e.g. Local SEO for clinics in Madurai"><input class="input" id="ai-kw" placeholder="Focus keyword (optional)"><button class="btn sm accent" type="button" id="ai-go">Generate draft</button></div></div>
      <div class="pnl"><h3>Cover image</h3>${isNew ? '<p class="small">Save the post first, then add a cover image.</p>' : `${p.cover ? `<img src="/blog-img/${esc(p.id)}?v=${p.cover}" alt="" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:10px;margin-bottom:10px">` : ''}<label class="btn sm accent" style="cursor:pointer">${p.cover ? 'Replace' : 'Upload'} cover<input type="file" data-cover accept="image/png,image/jpeg,image/webp" hidden></label>${p.cover ? ' <button class="btn sm quiet del" data-cover-del type="button">Remove</button>' : ''}`}</div></div></div>`;

  const form = view.querySelector('#bf');
  const collect = () => {
    const f = new FormData(form);
    return { ...Object.fromEntries(f), tags: String(f.get('tags') || '').split(',').map((t) => t.trim()).filter(Boolean), faqs: [...view.querySelectorAll('.faq')].map((r) => ({ q: r.querySelector('[data-q]').value, a: r.querySelector('[data-a]').value })).filter((x) => x.q && x.a) };
  };
  const rings = () => {
    const d = collect(); const s = scorePost({ ...d, id: d.slug || p.id, cover: p.cover });
    view.querySelector('#scores').innerHTML = [['SEO', s.seo, 'seo'], ['AEO', s.aeo, 'aeo'], ['GEO', s.geo, 'geo']].map(([l, v, k]) => `<div><div class="ring"><div class="v" style="--c:${v >= 75 ? '#16A34A' : v >= 50 ? '#F59E0B' : '#DC2626'}">${v}</div><div><b>${l} score</b><br><small>${{ seo: 'Google search', aeo: 'Answer engines & snippets', geo: 'AI citations (ChatGPT, Gemini…)' }[k]}</small></div></div>${s.tips[k].length ? `<ul class="tipl">${s.tips[k].slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<ul class="tipl"><li>All checks passed ✓</li></ul>'}</div>`).join('');
  };
  form.oninput = rings; rings();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = collect(); const body = { ...d, published: d.status === 'published', pending: d.status === 'pending' }; delete body.status;
    try {
      const r = await api(isNew ? '/admin/blog' : `/admin/blog/${encodeURIComponent(p.id)}`, { method: isNew ? 'POST' : 'PUT', body });
      toast(r.published ? 'Saved and published' : r.pending ? 'Submitted for approval' : 'Saved as draft');
      state.blogEdit = r.id; blogTab(view, ctx);
    } catch (ex) { toast(ex.message); }
  };
  view.querySelector('#ai-go').onclick = async (e) => {
    const topic = view.querySelector('#ai-topic').value.trim(); if (!topic) return toast('Enter a topic first.');
    const btn = e.target; btn.disabled = true; btn.textContent = 'Writing… (up to a minute)';
    try {
      const { draft: x } = await api('/admin/crm/ai/draft', { method: 'POST', body: { topic, keyword: view.querySelector('#ai-kw').value } });
      const set = (k, v) => { if (form[k] && v != null) form[k].value = v; };
      set('title', x.title); set('excerpt', x.excerpt); set('body', x.body); set('metaTitle', x.metaTitle); set('metaDescription', x.metaDescription); set('keyword', x.keyword); set('tags', (x.tags || []).join(', ')); set('status', 'draft');
      view.querySelector('#faqs').innerHTML = (x.faqs || []).map(faqRow).join('');
      rings(); toast('Draft generated — review it before submitting.');
    } catch (ex) { toast(ex.message); }
    btn.disabled = false; btn.textContent = 'Generate draft';
  };
  view.onclick = async (e) => {
    if (e.target.closest('[data-back]')) { state.blogEdit = null; return blogTab(view, ctx); }
    if (e.target.closest('[data-addfaq]')) { view.querySelector('#faqs').insertAdjacentHTML('beforeend', faqRow()); return; }
    if (e.target.closest('[data-rmfaq]')) { e.target.closest('.faq').remove(); return rings(); }
    if (e.target.closest('[data-cover-del]') && confirm('Remove the cover image?')) { try { await api(`/admin/blog/${encodeURIComponent(p.id)}/cover`, { method: 'DELETE' }); blogTab(view, ctx); } catch (ex) { toast(ex.message); } }
  };
  view.onchange = async (e) => {
    const file = e.target.matches('[data-cover]') && e.target.files[0]; if (!file) return;
    try { toast('Uploading…'); await api(`/admin/blog/${encodeURIComponent(p.id)}/cover`, { method: 'PUT', body: { dataUrl: await shrink(file) } }); toast('Cover uploaded'); blogTab(view, ctx); } catch (ex) { toast(ex.message || 'Could not read that image.'); }
  };
}

export async function calendarTab(view, ctx) {
  const { state, meta } = ctx; const st = (state.cal ||= { month: new Date().toISOString().slice(0, 7) });
  loading(view);
  let d; try { d = await api(`/admin/crm/calendar?month=${st.month}`); } catch (e) { view.innerHTML = errorBox(e); return; }
  const [y, m] = st.month.split('-').map(Number); const first = new Date(Date.UTC(y, m - 1, 1)); const lead = (first.getUTCDay() + 6) % 7; const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = new Date().toISOString().slice(0, 10); const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<div class="c mute"></div>');
  for (let n = 1; n <= dim; n++) { const ds = `${st.month}-${String(n).padStart(2, '0')}`; cells.push(`<div class="c ${ds === today ? 'today' : ''}" data-day="${ds}"><span class="dn">${n}</span>${d.items.filter((x) => x.date === ds).map((x) => `<a class="ev ${esc(x.status)}" data-ev="${esc(x.source)}:${esc(x.id)}" title="${esc(x.title)} — ${esc(nice(x.status))}${x.writer_label ? ' · ' + esc(x.writer_label) : ''}">${esc(x.title)}</a>`).join('')}</div>`); }
  const label = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const shift = (n) => { const t = new Date(Date.UTC(y, m - 1 + n, 1)); return t.toISOString().slice(0, 7); };
  view.innerHTML = `${head('Content', 'Content Calendar', 'Planned topics, drafts, scheduled and published posts. Click a day to plan content.', `<button class="btn ghost sm" data-m="${shift(-1)}">← Prev</button><b style="min-width:130px;text-align:center">${label}</b><button class="btn ghost sm" data-m="${shift(1)}">Next →</button>`)}
    <div class="pnl" style="padding:0;overflow:hidden"><div class="calg">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<div class="h">${x}</div>`).join('')}${cells.join('')}</div></div>
    <p class="small muted" style="margin-top:8px">Blue = planned · amber = scheduled / pending approval · green = published · grey = draft</p>
    <h3 style="font:700 17px var(--display);margin:24px 0 10px">Content plan</h3><div id="plan"></div>`;
  const openPlan = async (row, date) => {
    const spec = meta.entities.content_calendar; const refs = { users: await refOptions('users', meta) };
    formModal({ title: row ? 'Edit planned content' : 'Plan content', fields: spec.fields, values: row ? { ...row } : { planned_on: date }, refs, onSave: async (v) => { await api(row ? `/admin/crm/e/content_calendar/${row.id}` : '/admin/crm/e/content_calendar', { method: row ? 'PUT' : 'POST', body: v }); clearRefCache(); toast('Saved'); calendarTab(view, ctx); } });
  };
  view.onclick = (e) => {
    const mb = e.target.closest('[data-m]'); if (mb) { st.month = mb.dataset.m; return calendarTab(view, ctx); }
    const ev = e.target.closest('[data-ev]');
    if (ev) { const [src, id] = ev.dataset.ev.split(':'); if (src === 'blog') { location.hash = `#blog?edit=${encodeURIComponent(id)}`; } else openPlan(d.items.find((x) => x.source === 'plan' && x.id === id)); return; }
    const c = e.target.closest('[data-day]'); if (c) openPlan(null, c.dataset.day);
  };
  await entityTab(view.querySelector('#plan'), 'content_calendar', ctx, { embedded: true });
}

export async function pagesTab(view, ctx) {
  loading(view);
  let d; try { d = await api('/admin/crm/pages'); } catch (e) { view.innerHTML = errorBox(e); return; }
  view.innerHTML = `${head('Content', 'Page Content', 'Edit the SEO title and description of any page, and change headings, CTA buttons or copy with exact-text replacements. Products, courses, brands and portfolio have their own tabs.')}
    <div class="pnl" style="padding:0"><div class="tw"><table class="tbl"><thead><tr><th>Page</th><th>SEO title</th><th>Meta description</th><th>Edits</th><th></th></tr></thead><tbody>${d.pages.map((p) => `<tr data-id="${esc(p.id)}"><td><div class="ttl">${esc(p.id)}</div><a class="sub" href="${esc(p.path)}" target="_blank">${esc(p.path)}</a></td><td>${esc(p.override.title || p.title)}</td><td class="sub">${esc((p.override.description || p.description).slice(0, 90))}…</td><td>${p.override.title || p.override.description || p.override.replacements?.length ? '<span class="pl info">Customised</span>' : '<span class="pl na">Default</span>'}</td><td class="act"><button class="btn sm ghost" data-edit>Edit</button></td></tr>`).join('')}</tbody></table></div></div>`;
  view.onclick = (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr || !e.target.closest('[data-edit]')) return; const p = d.pages.find((x) => x.id === tr.dataset.id); const ov = p.override;
    const rep = (x = {}) => `<div class="row" style="gap:6px;margin-bottom:6px"><input class="input" data-from placeholder="Existing text on the page" value="${esc(x.from || '')}" style="flex:1"><input class="input" data-to placeholder="Replace with" value="${esc(x.to || '')}" style="flex:1"><button type="button" class="btn sm quiet del" data-rm>×</button></div>`;
    modal(`<form class="mform" style="min-width:min(680px,92vw)"><h3 class="mh">Edit “${esc(p.id)}” page</h3><div class="field"><label>SEO title</label><input class="input" name="title" maxlength="120" value="${esc(ov.title || '')}" placeholder="${esc(p.title)}"></div><div class="field"><label>Meta description</label><textarea class="input" name="description" rows="3" maxlength="320" placeholder="${esc(p.description)}">${esc(ov.description || '')}</textarea></div>
      <div><label class="small" style="font-weight:600">Text replacements (headings, CTAs, copy)</label><p class="small muted">Each pair swaps one exact piece of visible text on this page. Leave everything empty to restore the default page.</p><div id="reps">${(ov.replacements || []).map(rep).join('')}</div><button type="button" class="btn sm ghost" data-addrep>+ Add replacement</button></div><p class="ferr" hidden></p><div class="mf"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn accent" type="submit">Save page</button></div></form>`, { onMount: (m, close) => {
      m.onclick = (ev) => { if (ev.target.closest('[data-addrep]')) m.querySelector('#reps').insertAdjacentHTML('beforeend', rep()); if (ev.target.closest('[data-rm]')) ev.target.closest('.row').remove(); };
      m.querySelector('form').onsubmit = async (ev) => { ev.preventDefault(); const f = new FormData(ev.target); const er = m.querySelector('.ferr');
        try { await api(`/admin/crm/pages/${p.id}`, { method: 'PUT', body: { title: f.get('title'), description: f.get('description'), replacements: [...m.querySelectorAll('#reps .row')].map((r) => ({ from: r.querySelector('[data-from]').value, to: r.querySelector('[data-to]').value })) } }); toast('Page updated'); close(); pagesTab(view, ctx); } catch (ex) { er.textContent = ex.message; er.hidden = false; } };
    } });
  };
}
