// Shared front-end utilities (no framework, no build step).

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Sends a funnel event to GA4 / GTM when analytics is configured (no-op otherwise). */
export function track(event, params = {}) {
  try { window.c2cTrack ? window.c2cTrack(event, params) : (window.dataLayer = window.dataLayer || []).push({ event, ...params }); } catch {}
}

let csrfToken = '';
export const setCsrf = (t) => (csrfToken = t || '');

export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    ...opts,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}), ...(opts.headers || {}) },
    body: opts.body && typeof opts.body !== 'string' ? JSON.stringify(opts.body) : opts.body,
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Request failed (${res.status})`);
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }
  return data;
}

let cfgPromise;
export const loadConfig = () => (cfgPromise ||= api('/config'));

export const fmtDate = (iso, withTime = false) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime && { hour: '2-digit', minute: '2-digit' }) });
};
export const fmtNum = (n) => (n == null ? '—' : Number(n).toLocaleString('en-IN'));
export const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);
export const fmtKb = (b) => (b == null ? '—' : b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
export const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search || '/'; } catch { return u; } };

export const STATUS_LABEL = { pass: 'Passed', warning: 'Warning', fail: 'Issue', info: 'Info', unavailable: 'Unavailable' };
export const scoreColor = (s) => (s == null ? 'var(--na)' : s >= 85 ? 'var(--pass)' : s >= 70 ? '#00A596' : s >= 50 ? 'var(--saffron)' : 'var(--fail)');

/** The official Click2Client Media logo, cropped to the mark + wordmark. */
export function brandLockup(b, href = '/') {
  const name = esc(b?.companyName || 'Click2Client Media');
  return `<a class="logo-box" href="${esc(href)}" aria-label="${name}"><span class="logo-crop"><img src="/img/click2client-media-logo.webp" alt="${name}" width="2000" height="774"></span></a>`;
}

export function gauge(score, grade, size = 220) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const r = 90, cx = 110, cy = 105;
  const arc = Math.PI * r;
  const ticks = Array.from({ length: 11 }, (_, i) => {
    const a = Math.PI - (Math.PI * i) / 10;
    const x1 = cx + Math.cos(a) * (r + 12), y1 = cy - Math.sin(a) * (r + 12);
    const x2 = cx + Math.cos(a) * (r + (i % 5 === 0 ? 18 : 15)), y2 = cy - Math.sin(a) * (r + (i % 5 === 0 ? 18 : 15));
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--line-2)" stroke-width="1.2"/>`;
  }).join('');
  return `<div class="gauge" style="width:${size}px">
    <svg viewBox="0 0 220 128" role="img" aria-label="SEO score ${score ?? 'unavailable'} out of 100">
      ${ticks}
      <path d="M20 105 A90 90 0 0 1 200 105" stroke="var(--surface-3)" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M20 105 A90 90 0 0 1 200 105" stroke="${scoreColor(score)}" stroke-width="12" fill="none" stroke-linecap="round"
        stroke-dasharray="${arc.toFixed(1)}" stroke-dashoffset="${(arc * (1 - pct)).toFixed(1)}" style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)"/>
    </svg>
    <div class="g-val"><div><span class="g-num">${score ?? '—'}</span><span class="g-of"> / 100</span></div>
    ${grade ? `<div class="g-grade" style="color:${scoreColor(score)}">${esc(grade)}</div>` : ''}</div>
  </div>`;
}

export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2800);
}

export function modal(html, { onMount } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  onMount?.(bg.querySelector('.modal'), close);
  bg.querySelector('input,textarea,select,button')?.focus();
  return close;
}

export function whatsappLink(b, text) {
  const num = (b?.whatsapp || '').replace(/\D/g, '');
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : null;
}
export const telLink = (b) => (b?.phone ? `tel:${b.phone.replace(/[^\d+]/g, '')}` : null);

export const ICON = {
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91A9.86 9.86 0 0 0 12.04 2Zm5.82 14.06c-.24.68-1.42 1.3-1.95 1.34-.5.05-.97.23-3.27-.68-2.77-1.09-4.52-3.92-4.66-4.1-.13-.18-1.11-1.48-1.11-2.82 0-1.34.7-2 .95-2.27.25-.27.54-.34.72-.34h.52c.17 0 .39-.06.61.47.24.55.79 1.9.86 2.04.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.9 1.05.94 1.93 1.23 2.2 1.37.27.14.43.11.59-.07.16-.18.68-.8.86-1.07.18-.27.36-.23.61-.14.25.09 1.58.75 1.85.88.27.14.45.2.52.32.07.11.07.66-.17 1.33Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2Z"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
};

/** Lead capture modal — posts to /api/leads, separate from the audit engine. */
export function openLeadForm({ branding, auditId = '', website = '', intent = 'action_plan', score = null }) {
  const title = intent === 'specialist' ? 'Talk to an SEO specialist' : 'Get your SEO action plan';
  const wa = whatsappLink(branding, `Hi, I ran an SEO audit for ${website || 'my website'}${score != null ? ` (score ${score}/100)` : ''}. I'd like help fixing the issues.`);
  modal(`
    <div class="modal-head"><div><div class="eyebrow">${esc(branding.companyName)}</div><h2 style="font-size:24px;margin-top:8px">${title}</h2>
      <p class="muted small" style="margin-top:6px">A specialist will review your audit and get back with a prioritised plan. No obligation.</p></div>
      <span class="spacer"></span><button class="btn quiet sm" data-close aria-label="Close">✕</button></div>
    <form class="modal-body grid" style="gap:14px">
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Name *</label><input class="input" name="name" required autocomplete="name"></div>
        <div class="field"><label>Business</label><input class="input" name="business" autocomplete="organization"></div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 1fr;gap:12px">
        <div class="field"><label>Email</label><input class="input" name="email" type="email" autocomplete="email"></div>
        <div class="field"><label>Phone / WhatsApp</label><input class="input" name="phone" type="tel" autocomplete="tel" placeholder="+91"></div>
      </div>
      <div class="field"><label>Website</label><input class="input" name="website" value="${esc(website)}"></div>
      <div class="field"><label>Anything we should know?</label><textarea class="input" name="message" rows="3" placeholder="Goals, timelines, what you've tried…"></textarea></div>
      <p class="form-err small" style="color:var(--fail)" hidden></p>
      <div class="row wrap-row" style="margin-top:4px">
        <button class="btn accent" type="submit">Send request</button>
        ${wa ? `<a class="btn ghost" href="${wa}" target="_blank" rel="noopener">${ICON.whatsapp} WhatsApp instead</a>` : ''}
      </div>
      <p class="tiny muted">We'll use these details only to respond to this request.</p>
    </form>`, {
    onMount(el, close) {
      const form = el.querySelector('form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const err = form.querySelector('.form-err');
        err.hidden = true;
        try {
          await api('/leads', { method: 'POST', body: { ...data, auditId, intent } });
          track('generate_lead', { lead_source: intent });
          close();
          toast('Thank you — we will be in touch shortly.');
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
        }
      });
    },
  });
}
