// WhatsApp sending shared by send-whatsapp (staff and bulk) and the AI assistant.
import { admin, secret } from './util.ts'
import { graphError } from './meta.ts'

export type WaConfig = { mode: 'off' | 'mock' | 'live'; token?: string; phoneId?: string }
export type Outgoing = { phone: string; body: string; meta_template?: string; lang?: string; params?: string[] }

export async function waConfig(db: ReturnType<typeof admin>): Promise<WaConfig> {
  const { data: cfg } = await db.from('settings').select('value').eq('key', 'whatsapp').single()
  const mode = cfg?.value?.mode ?? (cfg?.value?.enabled ? 'live' : 'off')
  const token = await secret(db, 'whatsapp_token')
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? cfg?.value?.phone_number_id
  // Live without credentials behaves as off, so the app falls back to wa.me links
  return { mode: mode === 'live' && (!token || !phoneId) ? 'off' : mode, token, phoneId }
}

/** One message to the Cloud API (or a simulated id in mock mode). */
export async function deliver(cfg: WaConfig, m: Outgoing): Promise<{ status: 'sent' | 'failed'; error: string | null; wamid: string | null }> {
  if (cfg.mode === 'mock') return { status: 'sent', error: null, wamid: `mock.${crypto.randomUUID()}` }
  const to = m.phone.replace(/\D/g, '')
  const payload = m.meta_template
    ? {
        messaging_product: 'whatsapp', to, type: 'template',
        template: {
          name: m.meta_template, language: { code: m.lang ?? 'en' },
          components: m.params?.length ? [{ type: 'body', parameters: m.params.map((text) => ({ type: 'text', text })) }] : [],
        },
      }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: m.body } }
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${cfg.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const out = await r.json().catch(() => ({}))
    if (!r.ok) return { status: 'failed', error: graphError(out?.error, r.status), wamid: null }
    return { status: 'sent', error: null, wamid: out?.messages?.[0]?.id ?? null }
  } catch (e) {
    return { status: 'failed', error: String(e), wamid: null }
  }
}
