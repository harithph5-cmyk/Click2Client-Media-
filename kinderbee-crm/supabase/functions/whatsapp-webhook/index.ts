// Meta webhook: GET = subscription check, POST = delivery status updates → message_log.status
import { admin } from '../_shared/util.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.verify_token') === Deno.env.get('WHATSAPP_VERIFY_TOKEN')
    return new Response(ok ? url.searchParams.get('hub.challenge') : 'forbidden', { status: ok ? 200 : 403 })
  }
  const body = await req.json().catch(() => ({}))
  const db = admin()
  for (const entry of body.entry ?? [])
    for (const ch of entry.changes ?? [])
      for (const s of ch.value?.statuses ?? [])
        if (['sent', 'delivered', 'read', 'failed'].includes(s.status))
          await db.from('message_log').update({ status: s.status, error: s.errors?.[0]?.title ?? null }).eq('provider_id', s.id)
  return new Response('ok')
})
