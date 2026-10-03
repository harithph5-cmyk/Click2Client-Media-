import { api, setCsrf, loadConfig, esc, fmtDate, fmtMs, hostOf, brandLockup, toast, modal, ICON, scoreColor } from './common.js';
import { renderDashboard } from './dashboard.js';

const view = document.getElementById('view');
let cfg;
let sse;

function setTab(tab) {
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'new';
  const [path, qs] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(qs || '') };
}

async function route() {
  if (sse) { clearTimeout(sse); sse = null; }
  const { parts, query } = parseHash();
  const [name, id, sub] = parts;
  if (name !== 'audit' || view._auditId !== id) { delete view._state; view.onclick = null; view.onchange = null; }
  window.scrollTo({ top: 0 });
  try {
    if (name === 'new') return viewNew(query);
    if (name === 'run') return viewRun(id);
    if (name === 'audit' && sub === 'compare') return viewCompare(id, query.get('with'));
    if (name === 'audit') return viewAudit(id, sub);
    if (name === 'reports') return viewReports();
    if (name === 'projects') return viewProjects();
    if (name === 'settings') { location.href = '/admin#settings'; return; }
    location.hash = '#/new';
  } catch (e) {
    view.innerHTML = `<div class="card empty"><h3>Something went wrong</h3><p>${esc(e.message)}</p><a class="btn ghost sm" href="#/new" style="margin-top:14px">Start a new audit</a></div>`;
  }
}

// ── New audit ─────────────────────────────────────────────────────────────
function viewNew(query) {
  setTab('new');
  document.title = 'New audit — Click2Client Admin';
  const plan = cfg.plan;
  const psi = cfg.integrations.find((i) => i.id === 'pagespeed');
  const ai = cfg.integrations.find((i) => i.id === 'ai');
  const modes = [
    ['homepage', 'Homepage audit', 'The fastest check of your most important page.', '1 page · ~20 s'],
    ['quick', 'Quick audit', 'Homepage plus key linked pages. Catches site-wide patterns.', 'Up to 10 pages · ~1 min'],
    ['full', 'Full site audit', 'Crawl deeper with your own page limit.', `Up to ${plan.maxPages} pages`],
  ];
  view.innerHTML = `
    <div class="new-grid">
      <form id="f" class="card card-pad" style="padding:30px" novalidate>
        <div class="eyebrow">New audit</div>
        <h1 style="font-size:clamp(26px,3vw,34px);margin:10px 0 6px;letter-spacing:-0.035em">Which website should we examine?</h1>
        <p class="muted">We fetch and analyse the live site. Nothing is estimated.</p>
        <div class="url-bar" style="margin-top:22px;box-shadow:none"><span class="prefix">https://</span><input name="url" id="url" placeholder="yourbusiness.in" value="${esc(query.get('url') || '')}" inputmode="url" required aria-label="Website URL"></div>
        <p class="form-err small" style="color:var(--fail);margin-top:8px" hidden></p>

        <div class="field" style="margin-top:24px"><label>Audit type</label>
          <div class="modes">${modes.map(([k, t, d, m], i) => `<label class="mode ${i === 0 ? 'on' : ''} ${plan.modes.includes(k) ? '' : 'disabled'}"><input type="radio" name="mode" value="${k}" ${i === 0 ? 'checked' : ''} ${plan.modes.includes(k) ? '' : 'disabled'}><h4>${t}</h4><p>${d}</p><div class="meta">${m}</div></label>`).join('')}</div>
        </div>
        <div class="field hidden" id="limitWrap" style="margin-top:14px"><label for="crawlLimit">Crawl limit: <span id="limitVal">25</span> pages</label><input type="range" id="crawlLimit" name="crawlLimit" min="5" max="${plan.maxPages}" step="5" value="25" style="accent-color:var(--ink)"><span class="hint">Pages are fetched politely (${3} at a time) and robots.txt is respected.</span></div>

        <details class="more" style="margin-top:24px"><summary>${ICON.chev} Business details <span class="muted small" style="font-weight:500">— optional, sharpens the analysis</span></summary>
          <div class="grid" style="grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">
            <div class="field"><label>Business name</label><input class="input" name="businessName" placeholder="e.g. Sri Lakshmi Dental Care"></div>
            <div class="field"><label>Primary category</label><input class="input" name="category" placeholder="e.g. Dental clinic"></div>
            <div class="field"><label>Target city</label><input class="input" name="city" placeholder="e.g. Coimbatore"></div>
            <div class="field"><label>Business location / area</label><input class="input" name="location" placeholder="e.g. RS Puram"></div>
            <div class="field"><label>Target country</label><input class="input" name="country" value="India"></div>
            <div class="field"><label>Target keywords</label><input class="input" name="keywords" placeholder="dental implants, root canal"><span class="hint">Comma-separated, up to 8</span></div>
          </div>
        </details>

        <label class="toggle" style="margin-top:20px"><input type="checkbox" name="usePageSpeed" ${psi.configured || psi.partiallyAvailable ? 'checked' : ''}><span><b style="font-weight:650">Include Google PageSpeed Insights</b><br><span class="small muted">Lab performance and real-user Core Web Vitals. Adds 20–60 seconds.${psi.configured ? '' : ' No API key is configured, so Google may refuse the request; the audit will continue without it.'}</span></span></label>

        <div class="row" style="margin-top:26px"><button class="btn accent lg" type="submit">Run audit ${ICON.arrow}</button></div>
      </form>

      <aside class="stack">
        <div class="card card-pad">
          <h3>What happens next</h3>
          <ol class="small" style="margin:12px 0 0;padding-left:18px;display:grid;gap:8px;color:var(--ink-2)">
            <li>We fetch your pages, robots.txt and sitemap.</li><li>We check HTTPS, links, images and metadata.</li><li>A rule engine scores ${cfg.stages.length > 8 ? '50+' : 'every'} checks against best practice.</li><li>${ai.configured ? 'Our consultant layer explains findings in context.' : 'Each issue is explained from our SEO rule library.'}</li><li>You get a prioritised 30-day plan.</li>
          </ol>
        </div>
        <div class="card card-pad">
          <h3>Data sources for this audit</h3>
          <div style="display:grid;gap:10px;margin-top:12px">${cfg.integrations.filter((i) => ['crawler', 'pagespeed', 'ai', 'backlinks', 'traffic'].includes(i.id)).map((i) => `<div class="row small" style="align-items:flex-start"><span class="dot ${i.configured ? 'pass' : i.partiallyAvailable ? 'warning' : ''}" style="margin-top:7px"></span><span><b style="font-weight:650">${esc(i.name)}</b><br><span class="muted">${i.configured ? 'Connected' : i.partiallyAvailable ? 'Keyless — limited quota' : 'Not connected — shown as unavailable'}</span></span></div>`).join('')}</div>
        </div>
        <a class="card card-pad" href="/admin" style="display:block;text-decoration:none"><div class="eyebrow">Admin</div><h3 style="margin-top:6px">Back to the admin portal →</h3><p class="small muted" style="margin-top:4px">Leads, payment verification and customer audits.</p></a>
      </aside>
    </div>`;

  const f = view.querySelector('#f');
  f.addEventListener('change', (e) => {
    if (e.target.name === 'mode') {
      f.querySelectorAll('.mode').forEach((m) => m.classList.toggle('on', m.querySelector('input').checked));
      f.querySelector('#limitWrap').classList.toggle('hidden', e.target.value !== 'full');
    }
  });
  f.querySelector('#crawlLimit').addEventListener('input', (e) => (f.querySelector('#limitVal').textContent = e.target.value));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    const err = f.querySelector('.form-err');
    err.hidden = true;
    if (!d.url.trim()) { err.textContent = 'Please enter a website address.'; err.hidden = false; return; }
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const r = await api('/audits', { method: 'POST', body: { ...d, usePageSpeed: Boolean(d.usePageSpeed), keywords: d.keywords || '' } });
      location.hash = `#/run/${r.id}`;
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
  if (!query.get('url')) f.querySelector('#url').focus();
}

// ── Run (live progress from server-sent events) ─────────────────────────
async function viewRun(id) {
  setTab('new');
  const rec = await api(`/audits/${id}`);
  if (rec.status === 'complete') { location.replace(`#/audit/${id}`); return; }
  const stages = cfg.stages;
  const state = Object.fromEntries(stages.map((s) => [s.id, { status: 'pending', detail: '' }]));
  const started = Date.now();
  let t0 = null;
  document.title = `Auditing ${hostOf(rec.website)} — Click2Client Admin`;

  const draw = (errorObj) => {
    const finished = stages.filter((s) => ['done', 'skipped'].includes(state[s.id].status)).length;
    const pct = Math.round((100 * finished) / stages.length);
    view.innerHTML = `<div class="run">
      <div class="eyebrow">${errorObj ? 'Audit stopped' : 'Audit in progress'}</div>
      <h1 style="font-size:clamp(24px,3vw,32px);margin:10px 0 6px;letter-spacing:-0.035em" class="break">${esc(rec.website)}</h1>
      <p class="muted small">${finished} of ${stages.length} stages complete · ${fmtMs(Date.now() - started)} elapsed. Progress reflects completed work, not a timer.</p>
      <div class="bar" style="margin:18px 0 8px;height:8px"><span style="width:${pct}%;background:var(--accent)"></span></div>
      ${errorObj ? `<div class="banner err" style="margin:18px 0"><div><b>We couldn't complete this audit.</b><br>${esc(errorObj.message)}</div></div><div class="row"><a class="btn" href="#/new?url=${encodeURIComponent(rec.website)}">Try again</a><a class="btn ghost" href="#/new">Audit another site</a></div>` : ''}
      <div class="card card-pad" style="margin-top:18px"><ul class="run-steps">${stages.map((s) => { const st = state[s.id]; return `<li class="${st.status}"><span class="run-ic">${st.status === 'done' || st.status === 'skipped' ? ICON.check : ''}</span><div><div class="lbl">${esc(s.label)}</div>${st.detail ? `<div class="det">${esc(st.detail)}</div>` : ''}</div><span class="t">${st.status === 'skipped' ? 'skipped' : st.at && t0 ? fmtMs(st.at - t0) : ''}</span></li>`; }).join('')}</ul></div>
    </div>`;
  };
  const apply = (events = []) => {
    for (const e of events) {
      if (!t0 && e.at) t0 = e.at;
      if (e.type === 'stage' && state[e.stage]) state[e.stage] = { status: e.status, detail: e.detail || state[e.stage].detail, at: e.status === 'running' ? null : e.at };
    }
  };
  apply(rec.progress);
  draw();
  // Progress is stored in the database as each step finishes; poll it.
  const myRoute = location.hash;
  const poll = async () => {
    if (location.hash !== myRoute) return;
    try {
      const r = await api(`/audits/${id}`);
      if (r.status === 'complete') { location.hash = `#/audit/${id}`; return; }
      if (r.status === 'failed') { apply(r.progress); draw(r.error); return; }
      apply(r.progress);
      draw();
    } catch {}
    sse = setTimeout(poll, 2000);
  };
  sse = setTimeout(poll, 1500);
}

// ── Audit dashboard ──────────────────────────────────────────────────────
async function viewAudit(id, section) {
  setTab('reports');
  const rec = await api(`/audits/${id}`);
  if (rec.status === 'running') { location.replace(`#/run/${id}`); return; }
  if (rec.status === 'failed') {
    view.innerHTML = `<div class="run"><div class="banner err"><div><b>This audit did not complete.</b><br>${esc(rec.error?.message || 'Unknown error')}</div></div><div class="row" style="margin-top:16px"><a class="btn" href="#/new?url=${encodeURIComponent(rec.website)}">Run again</a></div></div>`;
    return;
  }
  const a = { ...rec.audit, id };
  view._auditId = id;
  document.title = `${hostOf(a.website)} · ${a.score.overall}/100 — Click2Client Admin`;
  const actions = `
    ${rec.plan && rec.plan !== 'internal' ? `<a class="btn ghost sm" href="/audit/${id}" target="_blank">Customer view</a>` : ''}<a class="btn ghost sm" href="/report/${id}" target="_blank">${ICON.file} Client report</a>
    <button class="btn ghost sm" id="share">${ICON.link} Share</button>
    ${a.previousAuditId ? `<a class="btn ghost sm" href="#/audit/${id}/compare">Compare with previous</a>` : ''}
    <button class="btn sm" id="reaudit">${ICON.refresh} Re-audit</button>`;
  renderDashboard(view, a, { section, base: `#/audit/${id}`, branding: cfg.branding, actions });
  view.querySelector('#share').onclick = () => shareModal(id, a);
  view.querySelector('#reaudit').onclick = async (e) => {
    e.target.disabled = true;
    try { const r = await api(`/audits/${id}/reaudit`, { method: 'POST', body: {} }); location.hash = `#/run/${r.id}`; }
    catch (ex) { toast(ex.message); e.target.disabled = false; }
  };
}

function shareModal(id, a) {
  const link = `${location.origin}/report/${id}`;
  modal(`<div class="modal-head"><div><div class="eyebrow">Share report</div><h2 style="font-size:22px;margin-top:6px">${esc(hostOf(a.website))}</h2></div><span class="spacer"></span><button class="btn quiet sm" data-close>✕</button></div>
    <div class="modal-body grid" style="gap:16px">
      <div class="field"><label>Private link</label><div class="row"><input class="input mono" readonly value="${esc(link)}" id="lnk"><button class="btn sm" id="cp">Copy</button></div><span class="hint">Anyone with this link can view the client report. Links are unguessable.</span></div>
      <div class="row wrap-row"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`SEO audit for ${hostOf(a.website)}: ${link}`)}">${ICON.whatsapp} Send on WhatsApp</a><a class="btn ghost sm" href="/report/${id}?print=1" target="_blank">${ICON.file} Download PDF</a></div>
      <form class="field" id="em"><label>Email the report</label><div class="row"><input class="input" type="email" name="to" placeholder="client@business.in" required><button class="btn sm" type="submit">${ICON.mail} Send</button></div><span class="hint em-msg"></span></form>
    </div>`, {
    onMount(el) {
      el.querySelector('#cp').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { el.querySelector('#lnk').select(); } };
      el.querySelector('#em').onsubmit = async (e) => {
        e.preventDefault();
        const msg = el.querySelector('.em-msg');
        try { await api(`/audits/${id}/email`, { method: 'POST', body: { to: new FormData(e.target).get('to') } }); msg.textContent = 'Sent.'; msg.style.color = 'var(--pass)'; }
        catch (ex) { msg.textContent = ex.message; msg.style.color = 'var(--fail)'; }
      };
    },
  });
}

// ── Compare ──────────────────────────────────────────────────────────────
async function viewCompare(id, withId) {
  setTab('reports');
  const r = await api(`/audits/${id}/compare${withId ? `?with=${encodeURIComponent(withId)}` : ''}`);
  const c = r.comparison;
  const d = (v, invert = false) => (v == null ? '<span class="muted">—</span>' : v === 0 ? '<span class="muted">0</span>' : `<span class="${(v > 0) !== invert ? 'delta-up' : 'delta-down'}">${v > 0 ? '+' : ''}${v}</span>`);
  view.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Re-audit comparison</div><h1>Progress since ${fmtDate(c.previous.auditDate)}</h1></div><span class="spacer"></span><a class="btn ghost sm" href="#/audit/${id}">Back to current audit</a></div>
    <div class="blocks">
      <div class="card card-pad"><div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:24px;align-items:end">
        <div><div class="eyebrow">Previous</div><div class="big-delta" style="color:${scoreColor(c.previous.score)}">${c.previous.score}</div><div class="small muted">${fmtDate(c.previous.auditDate)} · ${c.previous.issues} issues</div></div>
        <div><div class="eyebrow">Current</div><div class="big-delta" style="color:${scoreColor(c.current.score)}">${c.current.score}</div><div class="small muted">${fmtDate(c.current.auditDate)} · ${c.current.issues} issues</div></div>
        <div><div class="eyebrow">Change</div><div class="big-delta">${d(c.scoreChange)}</div><div class="small muted">SEO score points</div></div>
        <div><div class="eyebrow">Issues fixed</div><div class="big-delta delta-up">${c.fixed.length}</div><div class="small muted">${c.introduced.length} new · ${c.persisting.length} remaining</div></div>
      </div></div>
      ${c.caveats.length ? `<div class="banner info"><div>${c.caveats.map(esc).join('<br>')}</div></div>` : ''}
      <div class="two">
        <div><h3 style="margin-bottom:10px">Category scores</h3><div class="card table-wrap"><table class="t"><thead><tr><th>Category</th><th class="num">Before</th><th class="num">After</th><th class="num">Change</th></tr></thead><tbody>${c.categories.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${x.before ?? '—'}</td><td class="num">${x.after ?? '—'}</td><td class="num">${d(x.change)}</td></tr>`).join('')}</tbody></table></div></div>
        <div><h3 style="margin-bottom:10px">Performance</h3><div class="card table-wrap"><table class="t"><thead><tr><th>Metric</th><th class="num">Before</th><th class="num">After</th><th class="num">Change</th></tr></thead><tbody>
          <tr><td>PageSpeed mobile</td><td class="num">${c.performance.mobile.before ?? '—'}</td><td class="num">${c.performance.mobile.after ?? '—'}</td><td class="num">${d(c.performance.mobile.change)}</td></tr>
          <tr><td>PageSpeed desktop</td><td class="num">${c.performance.desktop.before ?? '—'}</td><td class="num">${c.performance.desktop.after ?? '—'}</td><td class="num">${d(c.performance.desktop.change)}</td></tr>
          <tr><td>Server response (ms)</td><td class="num">${c.performance.ttfbMs.before ?? '—'}</td><td class="num">${c.performance.ttfbMs.after ?? '—'}</td><td class="num">${d(c.performance.ttfbMs.change, true)}</td></tr>
          <tr><td>HTML size (KB)</td><td class="num">${c.performance.htmlKb.before}</td><td class="num">${c.performance.htmlKb.after}</td><td class="num">${d(c.performance.htmlKb.after - c.performance.htmlKb.before, true)}</td></tr>
        </tbody></table></div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Issues fixed</h3><span class="pill pass plain">${c.fixed.length}</span></div>${c.fixed.length ? `<div class="table-wrap"><table class="t"><tbody>${c.fixed.map((x) => `<tr><td><b>${esc(x.title)}</b></td><td class="small muted">${esc(x.before ?? '')} → ${esc(x.after ?? '')}</td><td>${x.verified ? '<span class="pill pass">Verified pass</span>' : '<span class="pill info">No longer flagged</span>'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="card-pad muted small">No issues from the previous audit have been resolved yet.</p>'}</div>
      <div class="card"><div class="card-head"><h3>New issues</h3><span class="pill fail plain">${c.introduced.length}</span></div>${c.introduced.length ? `<div class="table-wrap"><table class="t"><tbody>${c.introduced.map((x) => `<tr><td><b>${esc(x.title)}</b></td><td class="small muted">${esc(x.value ?? '')}</td><td><span class="pill ${x.priority} plain">${x.priority}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="card-pad muted small">No new issues appeared.</p>'}</div>
      <div class="card"><div class="card-head"><h3>Still open</h3><span class="pill warning plain">${c.persisting.length}</span></div>${c.persisting.length ? `<div class="table-wrap"><table class="t"><tbody>${c.persisting.map((x) => `<tr><td><b>${esc(x.title)}</b></td><td class="small muted">${esc(x.after ?? '')}</td><td><span class="pill ${x.priority} plain">${x.priority}</span></td></tr>`).join('')}</tbody></table></div>` : '<p class="card-pad muted small">Nothing outstanding from before.</p>'}</div>
    </div>`;
}

// ── Reports (history) ────────────────────────────────────────────────────
async function viewReports() {
  setTab('reports');
  document.title = 'Reports — Click2Client Admin';
  const { audits } = await api('/audits?limit=100');
  view.innerHTML = `<div class="page-head"><div><div class="eyebrow">Audit history</div><h1>Reports</h1><p>Every audit run in this workspace.</p></div><span class="spacer"></span><a class="btn sm accent" href="#/new">+ New Audit</a></div>
    ${audits.length ? `<div class="card table-wrap"><table class="t"><thead><tr><th>Website</th><th>Date</th><th>Type</th><th class="num">Pages</th><th class="num">Issues</th><th class="num">Score</th><th></th></tr></thead><tbody>
      ${audits.map((x) => `<tr class="clickable" data-go="${x.status === 'running' ? `#/run/${x.id}` : `#/audit/${x.id}`}"><td><b class="break">${esc(hostOf(x.website))}</b></td><td class="small nowrap">${fmtDate(x.created_at, true)}</td><td class="small">${esc(x.mode)}</td><td class="num">${x.pages ?? '—'}</td><td class="num">${x.issues ?? '—'}</td><td class="num">${x.status === 'complete' ? `<b style="color:${scoreColor(x.score)}">${x.score}</b>` : x.status === 'running' ? '<span class="pill info">Running</span>' : '<span class="pill fail">Failed</span>'}</td><td class="nowrap">${x.status === 'complete' ? `<a class="btn quiet sm" href="/report/${x.id}" target="_blank" onclick="event.stopPropagation()">Report</a>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="card empty"><h3>No audits yet</h3><p>Run your first audit to start building history.</p><a class="btn sm" href="#/new" style="margin-top:14px">New audit</a></div>`}`;
  view.onclick = (e) => { const tr = e.target.closest('[data-go]'); if (tr) location.hash = tr.dataset.go; };
}

// ── Projects ─────────────────────────────────────────────────────────────
async function viewProjects() {
  setTab('projects');
  document.title = 'Projects — Click2Client Admin';
  const { projects } = await api('/projects');
  view.innerHTML = `<div class="page-head"><div><div class="eyebrow">Saved projects</div><h1>Projects</h1><p>One project per website, with its audit history and score trend.</p></div></div>
    ${projects.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${projects.map((p) => {
      const delta = p.latest_score != null && p.previous_score != null ? p.latest_score - p.previous_score : null;
      return `<div class="card card-pad"><div class="row"><div style="min-width:0"><h3 class="break">${esc(p.name !== p.domain ? p.name : p.domain)}</h3><div class="small muted break">${esc(p.domain)}</div></div><span class="spacer"></span><div style="text-align:right"><div style="font:780 30px/1 var(--display);color:${scoreColor(p.latest_score)}">${p.latest_score ?? '—'}</div>${delta != null ? `<div class="small ${delta >= 0 ? 'delta-up' : 'delta-down'}">${delta >= 0 ? '+' : ''}${delta} vs previous</div>` : ''}</div></div>
        <div class="small muted" style="margin-top:12px">${p.audit_count} audit${p.audit_count === 1 ? '' : 's'} · last ${fmtDate(p.last_audit_at)}</div>
        <div class="row wrap-row" style="margin-top:14px">${p.latest_audit_id ? `<a class="btn sm" href="#/audit/${p.latest_audit_id}">Open latest</a><button class="btn ghost sm" data-reaudit="${p.latest_audit_id}">${ICON.refresh} Re-audit</button>${delta != null ? `<a class="btn quiet sm" href="#/audit/${p.latest_audit_id}/compare">Compare</a>` : ''}` : ''}</div></div>`;
    }).join('')}</div>` : `<div class="card empty"><h3>No projects yet</h3><p>Projects are created automatically when an audit completes.</p></div>`}`;
  view.onclick = async (e) => {
    const b = e.target.closest('[data-reaudit]');
    if (!b) return;
    b.disabled = true;
    try { const r = await api(`/audits/${b.dataset.reaudit}/reaudit`, { method: 'POST', body: {} }); location.hash = `#/run/${r.id}`; } catch (ex) { toast(ex.message); b.disabled = false; }
  };
}

function applyBrand() {
  document.getElementById('brand').innerHTML = brandLockup(cfg.branding);
  if (cfg.branding.accent) document.documentElement.style.setProperty('--accent', cfg.branding.accent);
}

(async () => {
  try { const me = await api('/admin/me'); setCsrf(me.csrf); } catch { location.href = '/admin'; return; }
  cfg = await loadConfig();
  applyBrand();
  document.getElementById('acct').onclick = () => (location.href = '/admin');
  addEventListener('hashchange', route);
  route();
})();
