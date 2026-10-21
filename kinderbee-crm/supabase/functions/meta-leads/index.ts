// Meta Lead Ads webhook (Page subscription, field "leadgen"). GET = subscription check, POST = new lead notification.
// Meta only sends the lead id, so the lead is fetched from the Graph API with the Page access token, then stored
// through submit_meta_lead() (idempotent per lead id, so Meta's retries never create duplicates).
// Leads are never messaged automatically from here: WhatsApp contact needs the form's opt-in and an approved template.
import { admin, secret } from '../_shared/util.ts'
import { validSignature } from '../_shared/meta.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const db = admin()

  if (req.method === 'GET') {
    const want = await secret(db, 'meta_verify_token') ?? await secret(db, 'whatsapp_verify_token')
    const ok = !!want && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === want
    return new Response(ok ? url.searchParams.get('hub.challenge') : 'forbidden', { status: ok ? 200 : 403 })
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const raw = await req.text()
  const appSecret = await secret(db, 'whatsapp_app_secret') // same Meta app
  if (!appSecret || !(await validSignature(raw, req.headers.get('x-hub-signature-256'), appSecret))) {
    return new Response('bad signature', { status: 401 })
  }
  const pageToken = await secret(db, 'meta_page_token')
  if (!pageToken) {
    console.error('meta-leads: META_PAGE_TOKEN is not set')
    return new Response('not configured', { status: 500 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }
  let failed = false
  for (const entry of body.entry ?? []) {
    for (const ch of entry.changes ?? []) {
      if (ch.field !== 'leadgen' || !ch.value?.leadgen_id) continue
      const id = String(ch.value.leadgen_id)
      const r = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(id)}?fields=field_data,form_id,ad_id,adset_id,campaign_id,created_time`, {
        headers: { Authorization: `Bearer ${pageToken}` },
      })
      const lead = await r.json().catch(() => ({}))
      if (!r.ok) {
        console.error('meta-leads: Graph error', lead?.error?.code, lead?.error?.message)
        failed = true
        continue
      }
      const { error } = await db.rpc('submit_meta_lead', {
        p: { leadgen_id: id, form_id: lead.form_id ?? ch.value.form_id, ad_id: lead.ad_id, adset_id: lead.adset_id, campaign_id: lead.campaign_id, field_data: lead.field_data },
      })
      if (error) { console.error('meta-leads: save failed', error.message); failed = true }
    }
  }
  // 500 makes Meta retry; leads already saved are skipped on the retry.
  return new Response(failed ? 'retry' : 'ok', { status: failed ? 500 : 200 })
})
