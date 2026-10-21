// POST { messages: [{ phone, body, template?, meta_template?, lang?, params?, key?, reply? }] }
// Sends through the WhatsApp Business Cloud API (mode "live") or simulates it (mode "mock"), and records each
// message on the contact's conversation. Returns { configured: false } in mode "off" so the app falls back to wa.me links.
// `key` makes a send idempotent; `reply: true` marks a manual inbox reply (pauses AI, assigns the conversation).
import { admin, caller, cors, json } from '../_shared/util.ts'
import { inWindow } from '../_shared/meta.ts'
import { deliver, waConfig } from '../_shared/wa.ts'

type Msg = {
  phone: string; body: string; template?: string; meta_template?: string; lang?: string; params?: string[]
  key?: string; reply?: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const me = await caller(req)
  const allowed = me && (me.role === 'ceo' || me.modules.includes('whatsapp') || me.modules.includes('payments'))
  if (!allowed) return json({ error: 'Not allowed' }, 403)

  const db = admin()
  const cfg = await waConfig(db)
  if (cfg.mode === 'off') return json({ configured: false })
  const simulated = cfg.mode === 'mock'

  const { messages } = (await req.json()) as { messages: Msg[] }
  if (!Array.isArray(messages) || messages.length > 1000) return json({ error: 'messages[] (max 1000) required' }, 400)
  if (messages.some((m) => m.reply) && !(me.role === 'ceo' || me.modules.includes('whatsapp'))) return json({ error: 'Not allowed' }, 403)

  // ponytail: sequential sends inside the request; bulk campaigns move to the wa_jobs queue in phase 4
  const results: { phone: string; status: string; error: string | null; simulated: boolean }[] = []
  for (const m of messages) {
    const done = (status: string, error: string | null) => { results.push({ phone: m.phone, status, error, simulated }); return status }

    const { data: cid, error: cErr } = await db.rpc('wa_contact', { p_phone: m.phone, p_name: null })
    if (cErr) { done('failed', 'Invalid number'); continue }
    const { data: c } = await db.from('wa_contacts').select('opted_out_at, last_inbound_at, assigned_to').eq('id', cid).single()
    const blocked = c?.opted_out_at ? 'Opted out of WhatsApp'
      : !m.meta_template && !inWindow(c?.last_inbound_at) ? 'Outside the 24-hour window. Use an approved template.' : null

    // Claim the send first: a repeated key finds the existing row and stops here
    const { data: claimed } = await db.from('wa_messages').upsert({
      contact_id: cid, direction: 'out', sender: m.reply ? 'staff' : 'system', sent_by: me.id,
      kind: m.meta_template ? 'template' : 'text', body: m.body, template: m.template ?? null,
      idempotency_key: m.key ?? null, status: blocked ? 'failed' : 'queued', error: blocked, simulated,
    }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id')
    if (!claimed?.length) { done('duplicate', 'Already sent'); continue }
    if (blocked) { done('failed', blocked); continue }

    const { status, error, wamid } = await deliver(cfg, m)
    done(status, error)
    await db.from('wa_messages').update({ status, error, wamid }).eq('id', claimed[0].id)
    if (status === 'sent') {
      await db.from('wa_contacts').update({
        last_message_at: new Date().toISOString(), last_message: m.body.slice(0, 200),
        ...(m.reply ? { ai_paused: true, unread: 0, assigned_to: c?.assigned_to ?? me.id } : {}),
      }).eq('id', cid)
    }
    await db.from('message_log').insert({
      phone: m.phone, template: m.template, body: m.body, status, error, provider_id: wamid, created_by: me.id, contact_id: cid, simulated,
    })
  }
  return json({ configured: true, mode: cfg.mode, results })
})
