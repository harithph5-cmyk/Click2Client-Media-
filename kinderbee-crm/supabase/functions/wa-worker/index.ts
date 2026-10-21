// Campaign send queue. Called every minute by pg_cron (x-worker-secret header) while campaigns are active,
// or by the CEO's "Send next batch now". Each run sends at most the per-minute limit, within the daily cap.
// Every recipient is re-checked just before sending: campaign still running, consent, opt-out, fees still owed.
import { admin, caller, cors, json, secret } from '../_shared/util.ts'
import { studentDues, type FeeComponent } from '../_shared/fees.ts'
import { backoffSeconds, fillTemplate, ineligible, istDate, placeholders } from '../_shared/campaign-core.ts'
import { deliver, waConfig } from '../_shared/wa.ts'

type Db = ReturnType<typeof admin>

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = admin()
  const want = await secret(db, 'worker_secret')
  const given = req.headers.get('x-worker-secret')
  const byCron = !!want && !!given && given.length === want.length && given === want
  if (!byCron) {
    const me = await caller(req)
    if (!me || me.role !== 'ceo') return json({ error: 'Not allowed' }, 403)
  }
  return json(await runBatch(db))
})

async function runBatch(db: Db) {
  const cfg = await waConfig(db)
  const { data: lim } = await db.from('settings').select('value').eq('key', 'campaign_limits').single()
  const perMinute = Math.min(Number(lim?.value?.per_minute ?? 60), 500)
  const maxAttempts = Number(lim?.value?.max_attempts ?? 5)
  const { data: sentToday } = await db.rpc('wa_sent_today')
  const room = Math.max(0, Math.min(perMinute, Number(lim?.value?.daily_max ?? 1000) - Number(sentToday ?? 0)))

  const { data: batch, error } = await db.rpc('wa_campaign_claim', { p_limit: room })
  if (error) return { error: error.message }
  const campaigns = new Map<string, any>()
  const counts: Record<string, number> = {}
  const today = istDate()

  for (const r of batch ?? []) {
    if (!campaigns.has(r.campaign_id)) {
      const { data } = await db.from('campaigns').select('*, message_templates(*)').eq('id', r.campaign_id).single()
      campaigns.set(r.campaign_id, data)
    }
    const c = campaigns.get(r.campaign_id)
    const t = c.message_templates
    const finish = async (status: string, patch: Record<string, unknown> = {}) => {
      counts[status] = (counts[status] ?? 0) + 1
      await db.from('campaign_recipients').update({ status, updated_at: new Date().toISOString(), ...patch }).eq('id', r.id)
    }

    // Paused or cancelled after this row was claimed → put it back (or cancel it)
    const { data: live } = await db.from('campaigns').select('status').eq('id', c.id).single()
    if (live?.status !== 'running') { await finish(live?.status === 'cancelled' ? 'cancelled' : 'pending', { attempts: r.attempts - 1 }); continue }

    // Consent can change between building and sending
    const { data: ct } = await db.from('wa_contacts').select('id, opted_in, opted_out_at').eq('phone', r.phone).maybeSingle()
    const vars: Record<string, string> = { ...r.vars }

    // Fee reminders: only what is still owed today, from the latest payments
    if (c.kind === 'fee_reminder' && vars._students) {
      const ids = vars._students.split(',')
      const [{ data: studs }, { data: pays }] = await Promise.all([
        db.from('students').select('id, program, academic_year').in('id', ids),
        db.from('fee_payments').select('student_id, component_id, amount').in('student_id', ids),
      ])
      let owed = 0
      for (const s of studs ?? []) {
        const { data: comps } = await db.from('fee_components').select('*').eq('program', s.program).eq('academic_year', s.academic_year)
        const d = studentDues((comps ?? []) as FeeComponent[], (pays ?? []).filter((p) => p.student_id === s.id), today)
        // Same rule as when the list was built (wa-campaigns): overdue now, or falling due within the window
        owed += c.audience?.fee === 'upcoming'
          ? d.lines.filter((l) => l.balance > 0 && !l.overdue && l.due_date && l.due_date <= istDate(new Date(), Number(c.audience?.upcoming_days ?? 7))).reduce((t, l) => t + l.balance, 0)
          : d.overdue
      }
      if (owed <= 0) { await finish('skipped', { reason: 'Paid before sending' }); continue }
      vars.amount = owed.toLocaleString('en-IN')
    }

    const reason = ineligible(ct ?? undefined, t.body, vars)
    if (reason) { await finish('skipped', { reason }); continue }
    if (!c.dry_run && t.meta_status !== 'approved') { await finish('failed', { reason: `Template not approved (${t.meta_status})` }); continue }
    if (!c.dry_run && cfg.mode === 'live' && t.approval_simulated) { await finish('failed', { reason: 'Template only approved in mock mode' }); continue }
    if (!c.dry_run && cfg.mode === 'off') { await finish('pending', { attempts: r.attempts - 1, next_attempt_at: new Date(Date.now() + 600_000).toISOString(), reason: 'WhatsApp sending is off' }); continue }

    const body = fillTemplate(t.body, vars)
    if (c.dry_run) { await finish('dry_run', { body, reason: 'Dry run: not sent' }); continue }

    // One message row per attempt; the key makes a repeated worker run a no-op
    const { data: claimed } = await db.from('wa_messages').upsert({
      contact_id: ct!.id, direction: 'out', sender: 'system', kind: 'template', body, template: t.name,
      idempotency_key: `camp:${r.id}:${r.attempts}`, status: 'queued', simulated: cfg.mode === 'mock',
    }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id')
    if (!claimed?.length) { await finish('failed', { reason: 'Duplicate attempt blocked' }); continue }

    const out = await deliver(cfg, { phone: r.phone, body, meta_template: t.meta_template, lang: t.lang, params: placeholders(t.body).map((k) => String(vars[k] ?? '')) })
    await db.from('wa_messages').update({ status: out.status, error: out.error, wamid: out.wamid }).eq('id', claimed[0].id)
    if (out.status === 'sent') {
      await finish('sent', { body, wa_message_id: claimed[0].id, sent_at: new Date().toISOString(), reason: null })
      await db.from('wa_contacts').update({ last_message_at: new Date().toISOString(), last_message: body.slice(0, 200) }).eq('id', ct!.id)
    } else if (out.retryable && r.attempts < maxAttempts) {
      await finish('pending', { reason: `Retrying: ${out.error}`, wa_message_id: claimed[0].id, next_attempt_at: new Date(Date.now() + backoffSeconds(r.attempts) * 1000).toISOString() })
    } else {
      await finish('failed', { reason: out.error, wa_message_id: claimed[0].id })
    }
  }
  const { data: completed } = await db.rpc('wa_campaign_finish')
  return { mode: cfg.mode, claimed: batch?.length ?? 0, room, counts, completed }
}
