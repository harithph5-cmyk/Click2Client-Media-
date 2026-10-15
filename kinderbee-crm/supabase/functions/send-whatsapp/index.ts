// POST { messages: [{ phone, body, template?, meta_template?, lang?, params? }] }
// Sends through the WhatsApp Business Cloud API and logs each message.
// Returns { configured: false } when no API is set up so the app can fall back to wa.me links.
import { admin, caller, cors, json } from '../_shared/util.ts'

type Msg = { phone: string; body: string; template?: string; meta_template?: string; lang?: string; params?: string[] }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const me = await caller(req)
  const allowed = me && (me.role === 'ceo' || me.modules.includes('whatsapp') || me.modules.includes('payments'))
  if (!allowed) return json({ error: 'Not allowed' }, 403)

  const db = admin()
  const { data: cfg } = await db.from('settings').select('value').eq('key', 'whatsapp').single()
  const { data: secret } = await db.from('app_secrets').select('value').eq('key', 'whatsapp_token').maybeSingle()
  const token = Deno.env.get('WHATSAPP_TOKEN') ?? secret?.value
  const phoneId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') ?? cfg?.value?.phone_number_id
  if (!token || !phoneId || !cfg?.value?.enabled) return json({ configured: false })

  const { messages } = (await req.json()) as { messages: Msg[] }
  if (!Array.isArray(messages) || messages.length > 1000) return json({ error: 'messages[] (max 1000) required' }, 400)

  const results = []
  for (const m of messages) {
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
    let status = 'sent', error: string | null = null, provider_id: string | null = null
    try {
      const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const out = await r.json()
      if (!r.ok) { status = 'failed'; error = out?.error?.message ?? `HTTP ${r.status}` }
      else provider_id = out?.messages?.[0]?.id ?? null
    } catch (e) {
      status = 'failed'; error = String(e)
    }
    results.push({ phone: m.phone, status, error })
    await db.from('message_log').insert({ phone: m.phone, template: m.template, body: m.body, status, error, provider_id, created_by: me.id })
  }
  return json({ configured: true, results })
})
