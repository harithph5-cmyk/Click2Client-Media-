// WhatsApp → Overview, Contacts, Templates and Campaigns tabs.
import { useEffect, useMemo, useState } from 'react'
import { BarChart3, CheckCircle2, Download, Megaphone, Pause, Play, Plus, RefreshCw, Send, ShieldCheck, Upload, Users, X } from 'lucide-react'
import { useAuth, waMode } from '../auth'
import { callFn, must, supabase } from '../lib/supabase'
import { exportExcel } from '../lib/excel'
import { fillTemplate, LEAD_CATEGORIES, placeholders } from '../lib/util'
import { Button, Card, cx, Empty, FormModal, inputCls, Kpi, Label, Loading, Modal, Pill, Select, Table, toast, useRows } from '../ui'

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const err = (e: any) => toast(e.message ?? String(e), 'error')

// ───────── Overview ─────────
type Overview = {
  active_conversations: number; new_enquiries: number; enquiries_by_source: Record<string, number>; awaiting_follow_up: number
  overdue_follow_ups: number; conversations_by_owner: Record<string, number>; ai_handled: number; human_handled: number
  campaigns: Record<string, number>; messages: Record<string, number>; simulated_messages: number; ai_failures: number
  ai_replies: number; webhook_failures: number
}

export function Overview() {
  const [days, setDays] = useState('7')
  const [source, setSource] = useState('')
  const [owner, setOwner] = useState('')
  const [o, setO] = useState<Overview | null>(null)
  const { rows: team } = useRows<{ id: string; full_name: string }>(() => supabase.from('profiles').select('id, full_name').eq('active', true))
  useEffect(() => {
    const to = new Date(), from = new Date()
    if (days === '0') from.setHours(0, 0, 0, 0); else from.setDate(from.getDate() - Number(days))
    supabase.rpc('wa_overview', { p_from: from.toISOString(), p_to: to.toISOString(), p_source: source || null, p_assignee: owner || null })
      .then(({ data, error }) => error ? err(error) : setO(data))
  }, [days, source, owner])
  if (!o) return <Loading />
  const list = (rec: Record<string, number>) => Object.entries(rec).sort((a, b) => b[1] - a[1])
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={days} onChange={setDays} className="!w-40" options={[{ value: '0', label: 'Today' }, { value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
        <Select value={source} onChange={setSource} placeholder="All sources" className="!w-48"
          options={['website', 'Meta Lead Ads', 'WhatsApp Organic', 'Franchise Campaign', 'Teacher Training Campaign', 'call', 'walk-in', 'referral']} />
        <Select value={owner} onChange={setOwner} placeholder="Everyone" className="!w-44" options={team.map((t) => ({ value: t.id, label: t.full_name }))} />
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Active conversations (7 days)" value={o.active_conversations} icon={Users} accent="whatsapp" />
        <Kpi label="New enquiries" value={o.new_enquiries} icon={Megaphone} accent="inquiries" />
        <Kpi label="Awaiting follow-up" value={o.awaiting_follow_up} icon={CheckCircle2} accent="honey" hint={`${o.overdue_follow_ups} overdue`} />
        <Kpi label="AI / human handled (open)" value={`${o.ai_handled} / ${o.human_handled}`} icon={BarChart3} accent="payments" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <h3 className="mb-2 font-display">Messages sent</h3>
          {list(o.messages).map(([k, v]) => <p key={k} className="flex justify-between text-sm"><Pill s={k} /> <b>{v}</b></p>)}
          {!Object.keys(o.messages).length && <p className="text-sm opacity-50">None in this period.</p>}
          {o.simulated_messages > 0 && <p className="mt-2 text-xs text-peach-ink">{o.simulated_messages} of these were simulated (mock mode) and never reached WhatsApp.</p>}
        </Card>
        <Card>
          <h3 className="mb-2 font-display">Enquiries by source</h3>
          {list(o.enquiries_by_source).map(([k, v]) => <p key={k} className="flex justify-between text-sm"><span>{k}</span><b>{v}</b></p>)}
          {!Object.keys(o.enquiries_by_source).length && <p className="text-sm opacity-50">None in this period.</p>}
        </Card>
        <Card>
          <h3 className="mb-2 font-display">Open conversations by owner</h3>
          {list(o.conversations_by_owner).map(([k, v]) => <p key={k} className="flex justify-between text-sm"><span>{k}</span><b>{v}</b></p>)}
        </Card>
        <Card>
          <h3 className="mb-2 font-display">Campaigns</h3>
          {list(o.campaigns).map(([k, v]) => <p key={k} className="flex justify-between text-sm"><span>{k}</span><b>{v}</b></p>)}
          {!Object.keys(o.campaigns).length && <p className="text-sm opacity-50">No campaigns yet.</p>}
        </Card>
        <Card>
          <h3 className="mb-2 font-display">Automation health</h3>
          <p className="flex justify-between text-sm"><span>AI replies sent</span><b>{o.ai_replies}</b></p>
          <p className={cx('flex justify-between text-sm', o.ai_failures > 0 && 'text-rose-ink')}><span>AI failures</span><b>{o.ai_failures}</b></p>
          <p className={cx('flex justify-between text-sm', o.webhook_failures > 0 && 'text-rose-ink')}><span>Webhook processing failures</span><b>{o.webhook_failures}</b></p>
        </Card>
      </div>
    </>
  )
}

// ───────── Contacts & consent ─────────
type WaContact = { id: string; phone: string; name: string | null; opted_in: boolean; opted_in_at: string | null; opted_in_source: string | null; opted_out_at: string | null; student_id: string | null; lead_id: string | null; last_message_at: string | null }

export function Contacts() {
  const { isCeo } = useAuth()
  const [filter, setFilter] = useState('')
  const [q, setQ] = useState('')
  const [consent, setConsent] = useState<null | { phones: string; source: string; optIn: boolean }>(null)
  const [busy, setBusy] = useState(false)
  const { rows, loading, reload } = useRows<WaContact>(() => {
    let x = supabase.from('wa_contacts').select('id, phone, name, opted_in, opted_in_at, opted_in_source, opted_out_at, student_id, lead_id, last_message_at')
      .order('created_at', { ascending: false }).limit(1000)
    if (filter === 'in') x = x.eq('opted_in', true).is('opted_out_at', null)
    if (filter === 'none') x = x.eq('opted_in', false).is('opted_out_at', null)
    if (filter === 'out') x = x.not('opted_out_at', 'is', null)
    return x
  }, [filter])
  const shown = rows.filter((r) => !q || `${r.name} ${r.phone}`.toLowerCase().includes(q.toLowerCase()))

  async function guardians() {
    const { data } = await supabase.from('students').select('parent_phone, parent2_phone').eq('active', true)
    setConsent((c) => c && { ...c, phones: [...new Set((data ?? []).flatMap((s) => [s.parent_phone, s.parent2_phone]).filter(Boolean))].join('\n') })
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={cx(inputCls, 'max-w-xs py-2')} placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={filter} onChange={setFilter} placeholder="All contacts" className="!w-48"
          options={[{ value: 'in', label: 'Consent recorded' }, { value: 'none', label: 'No consent yet' }, { value: 'out', label: 'Opted out' }]} />
        {isCeo && (
          <div className="ml-auto flex gap-2">
            <Button variant="soft" icon={ShieldCheck} onClick={() => setConsent({ phones: '', source: '', optIn: true })}>Record consent</Button>
            <Button variant="ghost" icon={X} onClick={() => setConsent({ phones: '', source: '', optIn: false })}>Record opt-out</Button>
          </div>
        )}
      </div>
      <p className="mb-3 text-sm opacity-60">Campaigns only go to contacts with recorded WhatsApp consent who haven't opted out. Anyone who sends STOP is opted out automatically.</p>
      {loading ? <Loading /> : (
        <Table rows={shown} rowKey={(r) => r.id} empty={<Empty title="No contacts" />} cols={[
          { label: 'Contact', render: (r) => <><p className="font-semibold">{r.name ?? '—'}</p><p className="text-xs opacity-60">{r.phone}{r.student_id && ' · parent'}{r.lead_id && ' · enquiry'}</p></> },
          { label: 'Consent', render: (r) => r.opted_out_at ? <Pill s="Opted out" />
            : r.opted_in ? <span className="text-sm"><Pill s="opted in" /> <span className="text-xs opacity-60">{r.opted_in_source} · {when(r.opted_in_at)}</span></span>
            : <span className="text-sm opacity-50">None recorded</span> },
          { label: 'Last message', render: (r) => <span className="text-sm">{when(r.last_message_at)}</span> },
        ]} />
      )}
      <Modal open={!!consent} onClose={() => setConsent(null)} title={consent?.optIn ? 'Record WhatsApp consent' : 'Record opt-out'}>
        {consent && (
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              const phones = consent.phones.split(/[\n,;]+/).map((p) => p.trim()).filter(Boolean)
              const r = await must(supabase.rpc('record_consent', { p_phones: phones, p_source: consent.source, p_opt_in: consent.optIn }))
              toast(`Updated ${r.updated}${r.invalid ? `, ${r.invalid} invalid numbers skipped` : ''}`)
              setConsent(null); reload()
            } catch (x) { err(x) } finally { setBusy(false) }
          }}>
            <Label label="Numbers (one per line)">
              <textarea className={inputCls} rows={6} value={consent.phones} onChange={(e) => setConsent({ ...consent, phones: e.target.value })} required />
            </Label>
            {consent.optIn && <Button type="button" size="sm" variant="ghost" icon={Users} onClick={guardians}>Fill with all current students' guardians</Button>}
            <Label label={consent.optIn ? 'Where the consent came from (kept on record)' : 'Reason'}>
              <input className={inputCls} required value={consent.source} onChange={(e) => setConsent({ ...consent, source: e.target.value })}
                placeholder={consent.optIn ? 'e.g. Admission form 2026-27, WhatsApp consent clause signed' : 'e.g. Asked on a call not to be messaged'} />
            </Label>
            {consent.optIn && <p className="text-xs opacity-60">Only record consent you actually hold. Meta requires opt-in before business-initiated messages.</p>}
            <div className="flex justify-end"><Button type="submit" loading={busy}>Save</Button></div>
          </form>
        )}
      </Modal>
    </Card>
  )
}

// ───────── Templates ─────────
export type Template = {
  id: string; name: string; body: string; meta_template: string | null; lang: string; category: string; header: string | null
  footer: string | null; buttons: { type: string; text: string; url?: string; phone_number?: string }[]; examples: Record<string, string>
  meta_status: string; meta_reason: string | null; approval_simulated: boolean; updated_at: string
}

export function Templates({ rows, loading, reload }: { rows: Template[]; loading: boolean; reload: () => void }) {
  const { isCeo } = useAuth()
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
  const [busy, setBusy] = useState('')
  const current = editing && editing !== 'new' ? editing : null
  async function act(action: 'submit' | 'sync', id?: string) {
    setBusy(id ?? action)
    try {
      const r = await callFn('wa-templates', { action, template_id: id })
      toast(action === 'sync' ? `Synced ${r.updated} templates from Meta` : r.simulated ? 'Approved (simulated: mock mode only)' : `Submitted to Meta: ${r.status}`)
      reload()
    } catch (e) { err(e) } finally { setBusy('') }
  }
  if (loading) return <Loading />
  return (
    <Card>
      <div className="mb-3 flex flex-wrap justify-between gap-2">
        <p className="max-w-2xl text-sm opacity-60">
          Placeholders like {'{parent_name}'} become Meta's {'{{1}}, {{2}}…'} in order. A template can be used for campaigns only after Meta approves it,
          and any edit sends it back for approval. Use <b>utility</b> for fee reminders and school notices, <b>marketing</b> for promotions and follow-ups.
        </p>
        <div className="flex gap-2">
          {isCeo && <Button variant="soft" icon={RefreshCw} loading={busy === 'sync'} onClick={() => act('sync')}>Sync from Meta</Button>}
          <Button icon={Plus} onClick={() => setEditing('new')}>New template</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((t) => (
          <div key={t.id} className="rounded-3xl bg-leaf/40 p-4 dark:bg-leaf/10">
            <div className="flex items-start gap-2">
              <button onClick={() => setEditing(t)} className="flex-1 text-left font-display text-lg">{t.name}</button>
              <Pill s={t.meta_status} className='capitalize' />
            </div>
            <p className="text-xs opacity-60">{t.category} · {t.lang}{t.meta_template && ` · ${t.meta_template}`}{t.approval_simulated && ' · approval simulated'}</p>
            {t.header && <p className="mt-1 text-sm font-bold">{t.header}</p>}
            <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{t.body}</p>
            {t.footer && <p className="mt-1 text-xs opacity-60">{t.footer}</p>}
            {t.meta_reason && <p className="mt-1 text-xs text-rose-ink">Meta: {t.meta_reason}</p>}
            {isCeo && ['draft', 'rejected'].includes(t.meta_status) && t.meta_template && (
              <Button size="sm" variant="soft" className="mt-2" icon={Upload} loading={busy === t.id} onClick={() => act('submit', t.id)}>Submit to Meta</Button>
            )}
          </div>
        ))}
        {!rows.length && <Empty title="No templates yet" />}
      </div>
      <FormModal open={!!editing} onClose={() => setEditing(null)} title={current ? `Edit ${current.name}` : 'New template'} wide
        initial={current ? {
          ...current,
          examples: Object.entries(current.examples ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
          buttons: (current.buttons ?? []).map((b) => [b.type, b.text, b.url ?? b.phone_number].filter(Boolean).join(' | ')).join('\n'),
        } : { lang: 'en', category: 'utility' }}
        fields={[
          { key: 'name', label: 'Name (in the CRM)', required: true },
          { key: 'meta_template', label: 'Meta template name', placeholder: 'fee_reminder_v1' },
          { key: 'category', label: 'Category', type: 'select', required: true, options: ['utility', 'marketing', 'authentication'] },
          { key: 'lang', label: 'Language code', placeholder: 'en, ta, en_US' },
          { key: 'header', label: 'Header (optional, no placeholders)' },
          { key: 'footer', label: 'Footer (optional)', placeholder: 'Reply STOP to opt out' },
          { key: 'body', label: 'Message', type: 'textarea', required: true },
          { key: 'examples', label: 'Sample value per placeholder, one per line (placeholder: sample)', type: 'textarea', placeholder: 'parent_name: Asha\namount: 5,000' },
          { key: 'buttons', label: 'Buttons, one per line (QUICK_REPLY | Text, or URL | Text | https://…, or PHONE_NUMBER | Text | +91…)', type: 'textarea' },
        ]}
        onSubmit={async (v) => {
          const meta = (v.meta_template || '').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || null
          const examples = Object.fromEntries(String(v.examples ?? '').split('\n').map((l) => l.split(':')).filter((p) => p.length > 1)
            .map(([k, ...rest]) => [k.trim().replace(/[{}]/g, ''), rest.join(':').trim()]))
          const unknown = placeholders(v.body).filter((k) => !(k in examples))
          if (meta && unknown.length) toast(`Add samples for {${unknown.join('}, {')}} before submitting to Meta`, 'error')
          const buttons = String(v.buttons ?? '').split('\n').map((l) => l.split('|').map((s) => s.trim())).filter((p) => p[0] && p[1]).map(([type, text, extra]) => ({
            type: type.toUpperCase(), text, ...(type.toUpperCase() === 'URL' ? { url: extra } : type.toUpperCase() === 'PHONE_NUMBER' ? { phone_number: extra } : {}),
          }))
          const row = { name: v.name, body: v.body, meta_template: meta, lang: v.lang || 'en', category: v.category, header: v.header || null, footer: v.footer || null, examples, buttons }
          if (current) await must(supabase.from('message_templates').update(row).eq('id', current.id))
          else await must(supabase.from('message_templates').insert(row))
          reload()
        }} />
    </Card>
  )
}

// ───────── Campaigns ─────────
type Campaign = {
  id: string; name: string; purpose: string | null; kind: string; template_id: string; audience: Record<string, any>; vars: Record<string, string>
  status: string; dry_run: boolean; scheduled_at: string | null; started_at: string | null; completed_at: string | null; built_at: string | null; created_at: string
}
type Recipient = { id: string; phone: string; name: string | null; status: string; reason: string | null; attempts: number; body: string | null; sent_at: string | null; wa_messages: { status: string; error: string | null } | null }
const KINDS = [
  { value: 'fee_reminder', label: 'Fee reminder (utility)' }, { value: 'reopening', label: 'School reopening (utility)' },
  { value: 'holiday', label: 'Holiday / school leave (utility)' }, { value: 'admission_followup', label: 'Admission follow-up (marketing)' },
  { value: 'franchise_followup', label: 'Franchise enquiry follow-up (marketing)' }, { value: 'announcement', label: 'Other announcement' },
]

export function Campaigns({ templates }: { templates: Template[] }) {
  const { settings } = useAuth()
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null)
  const [open, setOpen] = useState<Campaign | null>(null)
  const { rows, loading, reload } = useRows<Campaign>(() => supabase.from('campaigns').select('*').order('created_at', { ascending: false }))
  const current = editing && editing !== 'new' ? editing : null
  const kindTemplates = templates.map((t) => ({ value: t.id, label: `${t.name} (${t.category}, ${t.meta_status}${t.approval_simulated ? ', simulated' : ''})` }))

  const fields = [
    { key: 'name', label: 'Campaign name', required: true },
    { key: 'kind', label: 'Type', type: 'select' as const, required: true, options: KINDS },
    { key: 'purpose', label: 'Purpose (for the record)', type: 'textarea' as const },
    { key: 'template_id', label: 'Approved template', type: 'select' as const, required: true, options: kindTemplates },
    { key: 'source', label: 'Audience', type: 'select' as const, required: true, options: [
      { value: 'students', label: "Current students' guardians" }, { value: 'leads', label: 'Enquiries (leads)' }, { value: 'contacts', label: 'All contacts with consent' }] },
    { key: 'fee', label: 'Fee filter (guardians)', type: 'select' as const, options: [{ value: 'any', label: 'Everyone' }, { value: 'overdue', label: 'Overdue fees' }, { value: 'upcoming', label: 'Fees falling due soon' }] },
    { key: 'upcoming_days', label: 'Falling due within (days)', type: 'number' as const },
    ...settings.programs.map((p) => ({ key: `p:${p}`, label: `Class: ${p}`, type: 'checkbox' as const })),
    ...LEAD_CATEGORIES.map((c) => ({ key: `c:${c.key}`, label: `Enquiry: ${c.label}`, type: 'checkbox' as const })),
    { key: 'since', label: 'Enquiries since', type: 'date' as const },
    { key: 'vars', label: 'Values for every message, one per line (e.g. reopening_date: 2 June 2027)', type: 'textarea' as const },
    { key: 'dry_run', label: 'Dry run: build and check everything, send nothing', type: 'checkbox' as const },
  ]

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm opacity-60">
          Build a campaign, check the recipients and preview, then the CEO approves and schedules it. Messages go out from a background queue
          within the sending limits, and every recipient is re-checked just before sending (consent, opt-out, fees already paid).
        </p>
        <Button icon={Plus} onClick={() => setEditing('new')}>New campaign</Button>
      </div>
      {loading ? <Loading /> : (
        <Table rows={rows} rowKey={(r) => r.id} onRow={setOpen} empty={<Empty title="No campaigns yet" />} cols={[
          { label: 'Campaign', render: (r) => <><p className="font-semibold">{r.name}{r.dry_run && <span className="ml-1 text-xs opacity-60">(dry run)</span>}</p><p className="text-xs opacity-60">{KINDS.find((k) => k.value === r.kind)?.label}</p></> },
          { label: 'Status', render: (r) => <Pill s={r.status} className="capitalize" /> },
          { label: 'Scheduled', render: (r) => <span className="text-sm">{when(r.scheduled_at)}</span> },
          { label: 'Created', render: (r) => <span className="text-sm">{when(r.created_at)}</span> },
        ]} />
      )}
      <FormModal open={!!editing} onClose={() => setEditing(null)} wide title={current ? `Edit ${current.name}` : 'New campaign'} fields={fields}
        initial={current ? {
          ...current, ...current.audience, ...Object.fromEntries((current.audience.programs ?? []).map((p: string) => [`p:${p}`, true])),
          ...Object.fromEntries((current.audience.categories ?? []).map((c: string) => [`c:${c}`, true])),
          vars: Object.entries(current.vars ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n'),
        } : { kind: 'fee_reminder', source: 'students', fee: 'overdue', upcoming_days: 7 }}
        onSubmit={async (v) => {
          const audience = {
            source: v.kind === 'fee_reminder' ? 'students' : v.source, fee: v.kind === 'fee_reminder' && v.fee === 'any' ? 'overdue' : v.fee || 'any',
            upcoming_days: Number(v.upcoming_days) || 7,
            programs: settings.programs.filter((p) => v[`p:${p}`]), categories: LEAD_CATEGORIES.map((c) => c.key).filter((k) => v[`c:${k}`]),
            since: v.since || null,
          }
          const vars = Object.fromEntries(String(v.vars ?? '').split('\n').map((l) => l.split(':')).filter((p) => p.length > 1)
            .map(([k, ...rest]) => [k.trim().replace(/[{}]/g, ''), rest.join(':').trim()]))
          const row = { name: v.name, kind: v.kind, purpose: v.purpose || null, template_id: v.template_id, audience, vars, dry_run: !!v.dry_run, built_at: null }
          if (current) await must(supabase.from('campaigns').update(row).eq('id', current.id))
          else await must(supabase.from('campaigns').insert(row))
          reload()
        }} />
      {open && <CampaignDetail c={rows.find((r) => r.id === open.id) ?? open} template={templates.find((t) => t.id === open.template_id)}
        onClose={() => setOpen(null)} onEdit={() => { setEditing(open); setOpen(null) }} onChange={reload} />}
    </Card>
  )
}

function CampaignDetail({ c, template, onClose, onEdit, onChange }: { c: Campaign; template?: Template; onClose: () => void; onEdit: () => void; onChange: () => void }) {
  const { isCeo, settings } = useAuth()
  const [build, setBuild] = useState<null | { eligible: number; skipped: number; invalid_numbers: number; reasons: Record<string, number>; samples: { name: string; phone: string; body: string }[] }>(null)
  const [busy, setBusy] = useState('')
  const [at, setAt] = useState('')
  const [filter, setFilter] = useState('')
  const recips = useRows<Recipient>(() => supabase.from('campaign_recipients').select('id, phone, name, status, reason, attempts, body, sent_at, wa_messages(status, error)')
    .eq('campaign_id', c.id).order('status').limit(5000).returns<Recipient[]>(), [c.id, c.status, c.built_at])
  useEffect(() => {
    if (!['running', 'scheduled'].includes(c.status)) return
    const t = setInterval(() => { recips.reload(); onChange() }, 15000)
    return () => clearInterval(t)
  }, [c.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const r of recips.rows) {
      const k = r.status === 'sent' ? (r.wa_messages?.status ?? 'sent') : r.status // delivered / read come from Meta's status webhooks
      out[k] = (out[k] ?? 0) + 1
    }
    return out
  }, [recips.rows])
  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key)
    try { await fn(); if (ok) toast(ok); onChange(); recips.reload() } catch (e) { err(e) } finally { setBusy('') }
  }
  const shown = recips.rows.filter((r) => !filter || r.status === filter || r.wa_messages?.status === filter)
  const mode = waMode(settings)

  return (
    <Modal open onClose={onClose} title={c.name} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pill s={c.status} className="capitalize" />
          <span className="opacity-60">· {KINDS.find((k) => k.value === c.kind)?.label} · template “{template?.name}” ({template?.meta_status}{template?.approval_simulated ? ', simulated' : ''})</span>
          {c.dry_run && <Pill s="SIMULATED" />}
          {mode === 'mock' && !c.dry_run && <span className="text-xs text-peach-ink">Mock mode: sends are simulated.</span>}
        </div>
        {c.purpose && <p className="text-sm opacity-70">{c.purpose}</p>}

        {c.status === 'draft' && (
          <div className="flex flex-wrap gap-2">
            <Button variant="soft" onClick={onEdit}>Edit</Button>
            <Button icon={Users} loading={busy === 'build'} onClick={() => run('build', async () => setBuild(await callFn('wa-campaigns', { action: 'build', campaign_id: c.id })))}>
              {c.built_at ? 'Rebuild recipients' : 'Build recipients'}
            </Button>
            <Button variant="ghost" className="text-rose-ink" onClick={() => run('del', async () => { if (confirm('Delete this draft?')) { await must(supabase.from('campaigns').delete().eq('id', c.id)); onClose() } })}>Delete draft</Button>
          </div>
        )}

        {build && (
          <div className="rounded-2xl bg-mint/40 p-3 text-sm dark:bg-mint/10">
            <p><b>{build.eligible}</b> eligible · {build.skipped} skipped{build.invalid_numbers ? ` · ${build.invalid_numbers} without a valid number` : ''}</p>
            {Object.entries(build.reasons).map(([k, v]) => <p key={k} className="text-xs opacity-70">{v} × {k}</p>)}
            {build.samples.map((s) => (
              <div key={s.phone} className="mt-2 rounded-xl bg-white/70 p-2 dark:bg-white/5">
                <p className="text-xs opacity-60">Preview for {s.name} ({s.phone})</p>
                <p className="whitespace-pre-wrap">{s.body}</p>
              </div>
            ))}
          </div>
        )}
        {!build && template && c.status === 'draft' && (
          <p className="rounded-2xl bg-leaf/40 p-3 text-sm dark:bg-leaf/10"><span className="text-xs opacity-60">Template preview: </span>{fillTemplate(template.body, c.vars ?? {})}</p>
        )}

        {isCeo && ['draft', 'paused'].includes(c.status) && c.built_at && (
          <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-honey p-3">
            <Label label="Send at (leave empty to send now)"><input type="datetime-local" className={inputCls} value={at} onChange={(e) => setAt(e.target.value)} /></Label>
            <Button icon={Send} loading={busy === 'schedule'} onClick={() => run('schedule', async () => {
              const n = recips.rows.filter((r) => r.status === 'pending').length
              if (!confirm(`${c.dry_run ? 'Dry-run' : 'Send'} “${template?.name}” to ${n} recipients${at ? ` on ${new Date(at).toLocaleString('en-IN')}` : ' now'}?`)) return
              await must(supabase.rpc('campaign_schedule', { p_id: c.id, p_at: at ? new Date(at).toISOString() : null }))
            }, 'Campaign approved')}>{at ? 'Approve & schedule' : 'Approve & send now'}</Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {['scheduled', 'running'].includes(c.status) && <Button variant="soft" icon={Pause} loading={busy === 'pause'} onClick={() => run('pause', () => must(supabase.rpc('campaign_control', { p_id: c.id, p_action: 'pause' })), 'Paused')}>Pause</Button>}
          {c.status === 'paused' && isCeo && <Button variant="soft" icon={Play} loading={busy === 'resume'} onClick={() => run('resume', () => must(supabase.rpc('campaign_control', { p_id: c.id, p_action: 'resume' })), 'Resumed')}>Resume</Button>}
          {['draft', 'scheduled', 'running', 'paused'].includes(c.status) && c.built_at && (
            <Button variant="ghost" className="text-rose-ink" icon={X} loading={busy === 'cancel'} onClick={() => run('cancel', async () => {
              if (confirm('Cancel this campaign? Messages not yet sent will not go out.')) await must(supabase.rpc('campaign_control', { p_id: c.id, p_action: 'cancel' }))
            }, 'Cancelled')}>Cancel unsent</Button>
          )}
          {isCeo && c.status === 'running' && (
            <Button variant="ghost" icon={RefreshCw} loading={busy === 'kick'} onClick={() => run('kick', async () => {
              const r = await callFn('wa-worker', {})
              toast(`Processed ${r.claimed} (${Object.entries(r.counts ?? {}).map(([k, v]) => `${v} ${k}`).join(', ') || 'nothing due'})`)
            })}>Send next batch now</Button>
          )}
        </div>

        {recips.rows.length > 0 && (
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h3 className="font-display">Delivery report</h3>
              {Object.entries(counts).map(([k, v]) => (
                <button key={k} onClick={() => setFilter(filter === k ? '' : k)} className={cx('rounded-full', filter === k && 'ring-2 ring-honey')}><Pill s={k} className="capitalize" /> <b className="text-sm">{v}</b></button>
              ))}
              <Button size="sm" variant="ghost" icon={Download} className="ml-auto" onClick={() => exportExcel(`campaign-${c.name}`,
                [{ key: 'name', label: 'Name' }, { key: 'phone', label: 'Number' }, { key: 'status', label: 'Status' }, { key: 'delivery', label: 'Delivery' }, { key: 'reason', label: 'Reason' }, { key: 'sent', label: 'Sent at' }],
                recips.rows.map((r) => ({ ...r, delivery: r.wa_messages?.status ?? '', sent: when(r.sent_at) })))}>Export</Button>
            </div>
            <Table rows={shown.slice(0, 300)} rowKey={(r) => r.id} cols={[
              { label: 'Recipient', render: (r) => <><p className="text-sm font-semibold">{r.name ?? '—'}</p><p className="text-xs opacity-60">{r.phone}</p></> },
              { label: 'Status', render: (r) => <Pill s={r.status === 'sent' ? (r.wa_messages?.status ?? 'sent') : r.status} className="capitalize" /> },
              { label: 'Detail', render: (r) => <span className="text-xs opacity-70">{r.wa_messages?.error ?? r.reason ?? ''}{r.attempts > 1 && ` · ${r.attempts} attempts`}</span> },
            ]} />
            {shown.length > 300 && <p className="mt-2 text-xs opacity-60">Showing 300 of {shown.length}. Export for the full list.</p>}
          </div>
        )}
      </div>
    </Modal>
  )
}
