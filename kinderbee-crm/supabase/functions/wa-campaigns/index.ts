// POST { action: 'build', campaign_id } — resolves a draft campaign's audience into recipients, applying every
// eligibility rule (consent, opt-out, valid number, one message per number, required values, outstanding fees).
// Returns the counts and a few rendered samples for the review screen. Nothing is sent here.
import { admin, caller, cors, json } from '../_shared/util.ts'
import { allDues, type FeeComponent } from '../_shared/fees.ts'
import { e164, fillTemplate, ineligible, istDate, mergeByPhone, type Candidate } from '../_shared/campaign-core.ts'

const OPEN = ['New', 'AI Replied', 'Follow-up Pending', 'Contacted by Team', 'Qualified', 'Escalated', 'Unreachable']
const fmt = (iso: string | null) => (iso ? iso.split('-').reverse().join('-') : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const me = await caller(req)
  if (!me || !(me.role === 'ceo' || me.modules.includes('whatsapp'))) return json({ error: 'Not allowed' }, 403)
  const { action, campaign_id } = await req.json().catch(() => ({}))
  if (action !== 'build' || !campaign_id) return json({ error: 'action "build" and campaign_id required' }, 400)

  const db = admin()
  const { data: c } = await db.from('campaigns').select('*, message_templates(*)').eq('id', campaign_id).single()
  if (!c) return json({ error: 'Campaign not found' }, 404)
  if (c.status !== 'draft') return json({ error: 'Only draft campaigns can be rebuilt' }, 400)
  const body: string = c.message_templates.body
  const a = c.audience ?? {}
  const today = istDate()
  let list: Candidate[] = []

  if (a.source === 'students' || c.kind === 'fee_reminder') {
    let q = db.from('students').select('id, name, program, academic_year, parent_name, parent_phone, parent2_name, parent2_phone').eq('active', true)
    if (a.programs?.length) q = q.in('program', a.programs)
    const { data: students } = await q
    let dues: ReturnType<typeof allDues> = []
    const fee = c.kind === 'fee_reminder' ? (a.fee === 'upcoming' ? 'upcoming' : 'overdue') : a.fee
    if (fee === 'overdue' || fee === 'upcoming') {
      const [{ data: comps }, { data: pays }] = await Promise.all([
        db.from('fee_components').select('*'), db.from('fee_payments').select('student_id, component_id, amount'),
      ])
      dues = allDues(students ?? [], (comps ?? []) as FeeComponent[], pays ?? [], today)
    }
    const until = istDate(new Date(), Number(a.upcoming_days ?? 7))
    for (const s of students ?? []) {
      let amount = 0, due: string | null = null
      if (fee === 'overdue' || fee === 'upcoming') {
        const d = dues.find((x) => x.student.id === s.id)!
        const lines = fee === 'overdue' ? d.lines.filter((l) => l.overdue)
          : d.lines.filter((l) => l.balance > 0 && !l.overdue && l.due_date && l.due_date <= until)
        amount = lines.reduce((t, l) => t + l.balance, 0)
        due = lines.map((l) => l.due_date).filter(Boolean).sort()[0] ?? null
        if (amount <= 0) continue // nothing owed → no reminder
      }
      const base = { student_name: s.name, class: s.program, ...(amount ? { amount: amount.toLocaleString('en-IN'), _amount: String(amount), due_date: fmt(due), _due: due ?? '' } : {}) }
      for (const [phone, name] of [[s.parent_phone, s.parent_name], [s.parent2_phone, s.parent2_name]]) {
        if (phone) list.push({ phone: e164(phone), name: name ?? 'Parent', vars: { ...base, parent_name: name ?? 'Parent', name: name ?? 'Parent' }, student_ids: [s.id] })
      }
    }
    list = mergeByPhone(list)
  } else if (a.source === 'leads') {
    let q = db.from('leads').select('id, name, phone, category, status').in('status', a.statuses?.length ? a.statuses : OPEN)
    if (a.categories?.length) q = q.in('category', a.categories)
    if (a.since) q = q.gte('created_at', a.since)
    const { data: leads } = await q.order('created_at', { ascending: false }).limit(5000)
    list = mergeByPhone((leads ?? []).map((l) => ({ phone: e164(l.phone), name: l.name, vars: { name: l.name }, lead_id: l.id })))
  } else if (a.source === 'contacts') {
    const { data: cs } = await db.from('wa_contacts').select('phone, name').eq('opted_in', true).is('opted_out_at', null).limit(5000)
    list = (cs ?? []).map((x) => ({ phone: x.phone, name: x.name ?? '', vars: { name: x.name ?? 'there', parent_name: x.name ?? 'Parent' } }))
  } else return json({ error: 'Choose an audience' }, 400)

  // Consent and opt-out come from the WhatsApp contact record
  const phones = list.map((x) => x.phone!).filter(Boolean)
  const contacts = new Map<string, { id: string; opted_in: boolean; opted_out_at: string | null }>()
  for (let i = 0; i < phones.length; i += 300) {
    const { data } = await db.from('wa_contacts').select('id, phone, opted_in, opted_out_at').in('phone', phones.slice(i, i + 300))
    for (const x of data ?? []) contacts.set(x.phone, x)
  }

  const rows = list.map((x) => {
    const vars = { ...x.vars, ...(c.vars ?? {}) } // campaign values (e.g. reopening_date) fill every message
    const ct = contacts.get(x.phone!)
    const reason = ineligible(ct, body, vars)
    return {
      campaign_id, phone: x.phone!, name: x.name, contact_id: ct?.id ?? null,
      student_id: x.student_ids?.[0] ?? null, lead_id: x.lead_id ?? null,
      vars: { ...vars, ...(x.student_ids?.length ? { _students: x.student_ids.join(',') } : {}) },
      status: reason ? 'skipped' : 'pending', reason, body: fillTemplate(body, vars),
    }
  })
  const invalid = list.length - phones.length

  await db.from('campaign_recipients').delete().eq('campaign_id', campaign_id)
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('campaign_recipients').insert(rows.slice(i, i + 500))
    if (error) return json({ error: error.message }, 500)
  }
  await db.from('campaigns').update({ built_at: new Date().toISOString() }).eq('id', campaign_id)

  const reasons: Record<string, number> = {}
  for (const r of rows) if (r.reason) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1
  return json({
    eligible: rows.filter((r) => r.status === 'pending').length,
    skipped: rows.length - rows.filter((r) => r.status === 'pending').length,
    invalid_numbers: invalid, reasons,
    samples: rows.filter((r) => r.status === 'pending').slice(0, 3).map((r) => ({ name: r.name, phone: r.phone, body: r.body })),
  })
})
