// POST { message_ids: [uuid] } — runs the AI assistant for inbound messages. Used by the Inbox after a
// simulated message (mock mode) and to retry; real webhooks call runAssistant directly.
import { admin, caller, cors, json } from '../_shared/util.ts'
import { runAssistant } from '../_shared/assistant.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const me = await caller(req)
  if (!me || !(me.role === 'ceo' || me.modules.includes('whatsapp'))) return json({ error: 'Not allowed' }, 403)
  const { message_ids } = await req.json().catch(() => ({}))
  if (!Array.isArray(message_ids) || !message_ids.length || message_ids.length > 20) return json({ error: 'message_ids[] (1–20) required' }, 400)
  const db = admin()
  const results = []
  for (const id of message_ids) results.push(await runAssistant(db, String(id)))
  return json({ results })
})
