// The owner's on/off switch for Baasha AI (shown in the admin portal). When it is off, chat, research and the agent
// answer "switched off" without calling the AI provider. The setting lives in the site's settings table; a read is
// cached for 15 seconds, and if the database cannot be read the last known value is kept (the default is on).
let cache = { v: true, at: 0 };
let backend = null;                                   // tests can replace the storage

async function db() { const m = await import('../store/db.js'); return m.databaseEnvVar ? m : null; }
export const setSwitchBackend = (b) => { backend = b; cache = { v: true, at: 0 }; };

export async function isEnabled(now = Date.now()) {
  if (now - cache.at < 15_000) return cache.v;
  try {
    const raw = backend ? await backend.get() : await (async () => { const d = await db(); return d ? d.getSetting('baasha_enabled', true) : cache.v; })();
    cache = { v: !(raw === false || raw === 'false'), at: now };
  } catch (e) { console.error('[baasha] switch read failed, keeping the last value:', e?.code || e?.message); cache = { ...cache, at: now }; }
  return cache.v;
}

export async function setEnabled(enabled) {
  const v = Boolean(enabled);
  if (backend) await backend.set(v); else { const d = await db(); if (d) await d.setSetting('baasha_enabled', v); }
  cache = { v, at: Date.now() };
  return v;
}
