// Meta webhook. GET = subscription check. POST = incoming messages and delivery statuses.
// The signature is checked here; everything else happens in wa_ingest_webhook() so duplicates are dropped atomically.
import { admin, secret } from '../_shared/util.ts'
import { validSignature } from '../_shared/meta.ts'
import { runAssistant } from '../_shared/assistant.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const db = admin()

  if (req.method === 'GET') {
    const want = await secret(db, 'whatsapp_verify_token')
    const ok = !!want && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === want
    return new Response(ok ? url.searchParams.get('hub.challenge') : 'forbidden', { status: ok ? 200 : 403 })
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const raw = await req.text()
  const appSecret = await secret(db, 'whatsapp_app_secret')
  if (!appSecret) {
    console.error('whatsapp-webhook: WHATSAPP_APP_SECRET is not set; rejecting unsigned traffic')
    return new Response('not configured', { status: 500 })
  }
  if (!(await validSignature(raw, req.headers.get('x-hub-signature-256'), appSecret))) return new Response('bad signature', { status: 401 })

  let body: any
  try { body = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }
  if (body?.object !== 'whatsapp_business_account') return new Response('ignored')

  const { data, error } = await db.rpc('wa_ingest_webhook', { p: body })
  if (error) {
    // Nothing was saved (the function is one transaction), so Meta's retry will be processed cleanly.
    console.error('whatsapp-webhook: ingest failed', error.message)
    await db.from('wa_webhook_events').insert({ event_key: `err:${crypto.randomUUID()}`, kind: 'error', error: error.message, payload: body })
    return new Response('retry', { status: 500 })
  }
  const { inbound = [], ...counts } = data ?? {}
  console.log('whatsapp-webhook', JSON.stringify(counts)) // counts only, no message content
  // Answer Meta at once; the AI runs after the response (one message at a time, oldest first).
  if (inbound.length) {
    const work = (async () => { for (const id of inbound) await runAssistant(db, id).catch((e) => console.error('assistant', String(e))) })()
    // @ts-ignore EdgeRuntime is a Supabase global
    typeof EdgeRuntime !== 'undefined' ? EdgeRuntime.waitUntil(work) : await work
  }
  return new Response('ok')
})
