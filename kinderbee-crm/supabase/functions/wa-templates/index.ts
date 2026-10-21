// CEO only. POST { action: 'submit', template_id } sends a template to Meta for review;
// POST { action: 'sync' } pulls every template's approval status from Meta.
// In mock mode, submit marks the template approved *as a simulation*; live sending refuses those.
import { admin, caller, cors, json } from '../_shared/util.ts'
import { placeholders, toMetaBody } from '../_shared/campaign-core.ts'
import { graphError } from '../_shared/meta.ts'
import { waConfig } from '../_shared/wa.ts'

const STATUS: Record<string, string> = { APPROVED: 'approved', PENDING: 'pending', IN_APPEAL: 'pending', REJECTED: 'rejected', PAUSED: 'paused', DISABLED: 'disabled' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const me = await caller(req)
  if (!me || me.role !== 'ceo') return json({ error: 'Only the CEO can submit or sync templates' }, 403)
  const { action, template_id } = await req.json().catch(() => ({}))
  const db = admin()
  const cfg = await waConfig(db)

  if (action === 'submit') {
    const { data: t } = await db.from('message_templates').select('*').eq('id', template_id).single()
    if (!t) return json({ error: 'Template not found' }, 404)
    if (!t.meta_template || !/^[a-z0-9_]{1,512}$/.test(t.meta_template)) return json({ error: 'Set a Meta template name: lowercase letters, numbers and underscores' }, 400)
    const vars = placeholders(t.body)
    const missing = vars.filter((k) => !String(t.examples?.[k] ?? '').trim())
    if (missing.length) return json({ error: `Add a sample value for {${missing.join('}, {')}}; Meta reviews templates with examples` }, 400)

    if (cfg.mode === 'mock') {
      await db.from('message_templates').update({ meta_status: 'approved', approval_simulated: true, meta_template_id: `mock.${t.id}`, meta_reason: null }).eq('id', t.id)
      return json({ status: 'approved', simulated: true })
    }
    if (cfg.mode !== 'live' || !cfg.wabaId) return json({ error: 'Live mode, an access token and the WhatsApp Business Account ID are needed to submit' }, 400)

    const components: Record<string, unknown>[] = []
    if (t.header) components.push({ type: 'HEADER', format: 'TEXT', text: t.header })
    components.push({ type: 'BODY', text: toMetaBody(t.body), ...(vars.length ? { example: { body_text: [vars.map((k) => String(t.examples[k]))] } } : {}) })
    if (t.footer) components.push({ type: 'FOOTER', text: t.footer })
    if (Array.isArray(t.buttons) && t.buttons.length) components.push({ type: 'BUTTONS', buttons: t.buttons })
    const r = await fetch(`https://graph.facebook.com/v21.0/${cfg.wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: t.meta_template, language: t.lang, category: t.category.toUpperCase(), components }),
    })
    const out = await r.json().catch(() => ({}))
    if (!r.ok) return json({ error: graphError(out?.error, r.status) }, 400)
    const status = STATUS[out.status] ?? 'pending'
    await db.from('message_templates').update({
      meta_status: status, meta_template_id: out.id ?? null, approval_simulated: false, meta_reason: null,
      ...(out.category ? { category: String(out.category).toLowerCase() } : {}), // Meta may re-categorise
    }).eq('id', t.id)
    return json({ status })
  }

  if (action === 'sync') {
    if (cfg.mode !== 'live' || !cfg.wabaId) return json({ error: 'Sync needs live mode and the WhatsApp Business Account ID' }, 400)
    let url: string | null = `https://graph.facebook.com/v21.0/${cfg.wabaId}/message_templates?fields=name,language,status,category,id,rejected_reason&limit=100`
    let updated = 0
    while (url) {
      const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${cfg.token}` } })
      const out = await r.json().catch(() => ({}))
      if (!r.ok) return json({ error: graphError(out?.error, r.status) }, 400)
      for (const m of out.data ?? []) {
        const { data } = await db.from('message_templates').update({
          meta_status: STATUS[m.status] ?? 'pending', meta_template_id: m.id, approval_simulated: false,
          meta_reason: m.rejected_reason && m.rejected_reason !== 'NONE' ? m.rejected_reason : null,
          category: String(m.category ?? '').toLowerCase() || undefined,
        }).eq('meta_template', m.name).eq('lang', m.language).select('id')
        updated += data?.length ?? 0
      }
      url = out.paging?.next ?? null
    }
    return json({ updated })
  }
  return json({ error: 'action must be submit or sync' }, 400)
})
