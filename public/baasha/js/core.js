// Small shared helpers (DOM, toast, copy, accessible dialog).
export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export function icon(name, extra = '') { const s = el('span', 'ms ' + extra, name); s.setAttribute('aria-hidden', 'true'); return s; }

let toastTimer;
export function toast(t, ms = 2400) {
  const e = $('toast'); e.textContent = t; e.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { e.style.display = 'none'; }, ms);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* fall back */ }
  const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
  ta.remove(); return ok;
}

// Modal for confirmations and rename. Resolves true / typed text, or null when cancelled.
export function ask({title, body = '', ok = 'OK', danger = false, input = null}) {
  const dlg = $('dlg'), inp = $('dlgInput'), okb = $('dlgOk');
  $('dlgTitle').textContent = title; $('dlgBody').textContent = body; $('dlgBody').hidden = !body;
  $('dlgField').hidden = input === null; if (input !== null) inp.value = input;
  okb.textContent = ok; okb.className = 'btn ' + (danger ? 'danger solid' : 'primary');
  return new Promise(resolve => {
    const done = v => { dlg.close(); dlg.removeEventListener('cancel', onCancel); $('dlgCancel').onclick = null; $('dlgForm').onsubmit = null; resolve(v); };
    const onCancel = e => { e.preventDefault(); done(null); };
    dlg.addEventListener('cancel', onCancel); $('dlgCancel').onclick = () => done(null);
    $('dlgForm').onsubmit = e => { e.preventDefault(); if (input !== null) { const v = inp.value.trim(); if (!v) { inp.focus(); return; } done(v); } else done(true); };
    dlg.showModal(); (input !== null ? inp : danger ? $('dlgCancel') : okb).focus(); if (input !== null) inp.select();
  });
}
