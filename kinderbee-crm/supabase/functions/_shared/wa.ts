// WhatsApp sending shared by send-whatsapp (staff), the AI assistant and the campaign worker.
import { admin, secret } from './util.ts'
import { graphError } from './meta.ts'
import { retryable } from './campaign-core.ts'

export type WaConfig = { mode: 'off' | 'mock' | 'live'; token?: string; phoneId?: string; wabaId?: string }
export type Outgoing = { phone: string; body: string; meta_template?: string; lang?: string; params?: string[] }
export type Delivery = { status: 'sent' | 'failed'; error: string | null; wamid: string | null; retryable: boolean }

export async function waConfig(db: ReturnType<typeof admin>): Promise<WaConfig> {
  const { data: cfg } = await db.from('settings').select('value').eq('key', 'whatsapp').single()
  const mode = cfg?.value?.mode ?? (cfg?.value?.enabled ? 'live' : 'off')
  const token = await secret(db, 'whatsapp_token')
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? cfg?.value?.phone_number_id
  const wabaId = Deno.env.get('WHATSAPP_BUSINESS_ACCOUNT_ID') ?? cfg?.value?.business_account_id
  // Live without credentials behaves as off, so the app falls back to wa.me links
  return { mode: mode === 'live' && (!token || !phoneId) ? 'off' : mode, token, phoneId, wabaId }
}

/** One message to the Cloud API (or a simulated id in mock mode). */
export async function deliver(cfg: WaConfig, m: Outgoing): Promise<Delivery> {
  if (cfg.mode === 'mock') return { status: 'sent', error: null, wamid: `mock.${crypto.randomUUID()}`, retryable: false }
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
    if (!r.ok) return { status: 'failed', error: graphError(out?.error, r.status), wamid: null, retryable: retryable(r.status, out?.error?.code) }
    return { status: 'sent', error: null, wamid: out?.messages?.[0]?.id ?? null, retryable: false }
  } catch (e) {
    return { status: 'failed', error: String(e), wamid: null, retryable: true }
  }
}

/** Approved templates only. In live mode an approval granted in mock mode doesn't count. */
export async function approvedTemplate(db: ReturnType<typeof admin>, cfg: WaConfig, metaName: string, lang?: string) {
  let q = db.from('message_templates').select('meta_status, approval_simulated').eq('meta_template', metaName)
  if (lang) q = q.eq('lang', lang)
  const { data } = await q.limit(1).maybeSingle()
  if (!data) return 'Unknown template'
  if (data.meta_status !== 'approved') return `Template not approved by Meta (${data.meta_status})`
  if (cfg.mode === 'live' && data.approval_simulated) return 'Template was only approved in mock mode'
  return null
}
