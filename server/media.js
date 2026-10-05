// Supabase Storage for portfolio images. Server-side only: the service-role
// key never reaches the browser. Public pages use the bucket's public URLs.
//
// Env (Hostinger → Environment variables):
//   SUPABASE_URL                  e.g. https://<project>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY     Supabase → Project Settings → API (secret)
//   SUPABASE_PORTFOLIO_BUCKET     optional, defaults to "Portfolio"

const env = process.env;
const pick = (...names) => names.map((n) => env[n]).find(Boolean) || '';
const base = () => pick('SUPABASE_URL', 'database_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
const key = () => pick('SUPABASE_SERVICE_ROLE_KEY', 'database_SUPABASE_SERVICE_ROLE_KEY');
export const bucket = () => env.SUPABASE_PORTFOLIO_BUCKET || 'Portfolio';

export const mediaStatus = () => ({ configured: Boolean(base() && key()), url: base(), bucket: bucket() });

const encPath = (p) => p.split('/').map(encodeURIComponent).join('/');
export const publicUrl = (path) => `${base()}/storage/v1/object/public/${encodeURIComponent(bucket())}/${encPath(path)}`;
/** URL prefix of this bucket's public files — used to recognise our own images. */
export const publicPrefix = () => (base() ? `${base()}/storage/v1/object/public/${encodeURIComponent(bucket())}/` : '');

async function sb(path, init = {}) {
  if (!base() || !key()) throw Object.assign(new Error('Supabase Storage is not connected. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your hosting environment variables.'), { status: 503 });
  const res = await fetch(`${base()}/storage/v1${path}`, { ...init, headers: { apikey: key(), authorization: `Bearer ${key()}`, ...(init.headers || {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.message || data?.error || `Supabase Storage error (${res.status})`), { status: res.status === 409 ? 409 : 502 });
  return data;
}

const IMG = /\.(png|jpe?g|webp|gif|avif|svg)$/i;
let cache = null; // { at, files }

/** Every image in the bucket (folders walked recursively, max 3 levels). Cached 60 s. */
export async function listMedia({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cache.at < 60_000) return cache.files;
  const files = [];
  const walk = async (prefix, depth) => {
    for (let offset = 0; ; offset += 1000) {
      const items = await sb(`/object/list/${encodeURIComponent(bucket())}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
      });
      for (const it of items || []) {
        if (it.name === '.emptyFolderPlaceholder') continue;
        const path = prefix ? `${prefix}/${it.name}` : it.name;
        if (it.id == null) { if (depth < 3) await walk(path, depth + 1); continue; } // folder
        if (!IMG.test(it.name)) continue;
        files.push({ path, name: it.name, folder: prefix, url: publicUrl(path), size: it.metadata?.size ?? null, updated: it.updated_at || it.created_at || null });
      }
      if (!items || items.length < 1000) break;
    }
  };
  await walk('', 0);
  cache = { at: Date.now(), files };
  return files;
}

/** Uploads without ever overwriting: a taken name gets -2, -3 … appended. */
export async function uploadMedia(folder, filename, dataUrl) {
  const m = /^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('Upload a PNG, JPG or WebP image.'), { status: 400 });
  if (m[3].length > 1_400_000) throw Object.assign(new Error('Image is too large — please use one under 1 MB.'), { status: 400 });
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const safeFolder = String(folder || '').split('/').map((s) => s.replace(/[^\w .&-]/g, '').trim()).filter(Boolean).join('/');
  const stem = String(filename || 'image').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w .&()-]/g, '').trim().slice(0, 80) || 'image';
  const body = Buffer.from(m[3], 'base64');
  for (let n = 1; n <= 20; n++) {
    const path = [safeFolder, `${stem}${n > 1 ? `-${n}` : ''}.${ext}`].filter(Boolean).join('/');
    try {
      await sb(`/object/${encodeURIComponent(bucket())}/${encPath(path)}`, { method: 'POST', headers: { 'content-type': m[1], 'x-upsert': 'false', 'cache-control': '31536000' }, body });
      cache = null;
      return { path, url: publicUrl(path) };
    } catch (e) {
      if (e.status !== 409 && !/exists|duplicate/i.test(e.message)) throw e;
    }
  }
  throw Object.assign(new Error('Could not find a free file name — rename the image and try again.'), { status: 409 });
}
