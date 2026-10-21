// Runs the AI assistant for one inbound WhatsApp message: classify, maybe reply, record the enquiry, hand off.
// The AI can only do three things, all through narrow server functions: send one reply to this contact
// (wa_claim_ai_reply), and create/update this contact's enquiry and follow-up (wa_apply_ai). No SQL, no other tools.
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import { admin, secret } from './util.ts'
import { deliver, waConfig } from './wa.ts'
import { HANDOFF_REPLY, inHours, mockAssistant, parseAiResult, RESULT_SCHEMA, systemPrompt, transcript, type AiResult } from './assistant-core.ts'

type Db = ReturnType<typeof admin>

export async function runAssistant(db: Db, messageId: string) {
  const t0 = Date.now()
  const { data: msg } = await db.from('wa_messages').select('id, contact_id, body, direction').eq('id', messageId).single()
  if (!msg || msg.direction !== 'in') return { outcome: 'skipped:not an inbound message' }
  const log = async (row: Record<string, unknown>) => {
    await db.from('ai_logs').insert({ message_id: messageId, contact_id: msg.contact_id, ms: Date.now() - t0, ...row })
    return row
  }

  const { data: s } = await db.from('settings').select('value').eq('key', 'ai').single()
  const ai = s?.value ?? {}
  if (!ai.enabled) return { outcome: 'skipped:AI off' } // not logged: every message would add a row
  const { data: c } = await db.from('wa_contacts').select('*').eq('id', msg.contact_id).single()
  if (!c) return { outcome: 'skipped:no contact' }
  if (c.ai_paused) return log({ outcome: 'skipped:AI paused (staff handling)' })
  if (c.opted_out_at) return log({ outcome: 'skipped:opted out' })

  const [{ data: thread }, { data: kb }, { data: lead }] = await Promise.all([
    db.from('wa_messages').select('direction, sender, body, created_at').eq('contact_id', c.id).in('direction', ['in', 'out'])
      .order('created_at', { ascending: false }).limit(30),
    db.from('kb_articles').select('title, topic, body').eq('active', true).order('topic').order('title'),
    c.lead_id ? db.from('leads').select('name, child_age, preferred_centre, category').eq('id', c.lead_id).single() : Promise.resolve({ data: null }),
  ])
  const known = {
    'Name': lead?.name ?? c.name, 'Child age': lead?.child_age, 'Preferred centre': lead?.preferred_centre,
    'Existing KinderBee parent': c.student_id ? 'yes' : null,
  }

  // ── Ask the model (or the rule-based mock when no key is set) ──
  const apiKey = await secret(db, 'anthropic_api_key')
  const model = apiKey ? (ai.model || 'claude-haiku-5-5') : 'mock'
  let r: AiResult | null = null
  let usage: { input_tokens?: number; output_tokens?: number } = {}
  let error: string | null = null
  if (!apiKey) r = mockAssistant(msg.body ?? '')
  else {
    try {
      const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 45_000 })
      const res = await client.messages.create({
        model,
        max_tokens: 2000,
        system: [{ type: 'text', text: systemPrompt(kb ?? []), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: transcript((thread ?? []).reverse(), known) }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: RESULT_SCHEMA as unknown as Record<string, unknown> } },
      })
      usage = res.usage
      if (res.stop_reason === 'refusal') error = 'Model declined to answer'
      else if (res.stop_reason === 'max_tokens') error = 'Reply was cut off'
      else {
        const text = res.content.find((b) => b.type === 'text')
        r = text?.type === 'text' ? parseAiResult(text.text) : null
        if (!r) error = 'Unreadable AI output'
      }
    } catch (e) {
      error = e instanceof Anthropic.APIError ? `Claude API ${e.status}: ${e.message}` : String(e)
    }
  }
  // Anything went wrong → acknowledge and hand off to a person; never guess.
  if (!r) {
    r = { ...mockAssistant(msg.body ?? ''), summary: 'The AI could not process this message. Please read the conversation.' }
    r.reply = HANDOFF_REPLY
  }

  // ── Reply (unless staff handle working hours, or WhatsApp sending is off) ──
  let replied = false, skip: string | null = null
  const staffHours = ai.reply_when === 'after_hours' && inHours(new Date(), ai.hours)
  const cfg = await waConfig(db)
  if (staffHours) skip = 'working hours (staff reply)'
  else if (cfg.mode === 'off') skip = 'WhatsApp sending is off'
  else if (r.reply) {
    const { data: claim } = await db.rpc('wa_claim_ai_reply', { p_message: messageId, p_body: r.reply, p_simulated: cfg.mode === 'mock' })
    if (claim?.skip || !claim?.id) skip = claim?.skip ?? 'not claimed'
    else {
      const out = await deliver(cfg, { phone: claim.phone, body: r.reply })
      await db.from('wa_messages').update({ status: out.status, error: out.error, wamid: out.wamid }).eq('id', claim.id)
      if (out.status === 'sent') {
        replied = true
        await db.from('wa_contacts').update({ last_message_at: new Date().toISOString(), last_message: r.reply.slice(0, 200) }).eq('id', c.id)
      } else skip = `send failed: ${out.error}`
    }
  }

  const { data: leadId, error: applyErr } = await db.rpc('wa_apply_ai', {
    p_contact: c.id,
    p: {
      intent: r.intent, category: r.category, priority: r.priority, summary: r.summary, needs_human: r.needs_human,
      replied, name: r.name, child_age: r.child_age, preferred_centre: r.preferred_centre,
    },
  })
  return log({
    lead_id: leadId ?? null, model, intent: r.intent, category: r.category, priority: r.priority,
    confident: r.confident, needs_human: r.needs_human,
    outcome: error || applyErr ? 'error' : replied ? (r.needs_human ? 'handed_off' : 'replied') : `skipped:${skip ?? 'no reply'}`,
    error: error ?? applyErr?.message ?? null, input_tokens: usage.input_tokens ?? null, output_tokens: usage.output_tokens ?? null,
  })
}
