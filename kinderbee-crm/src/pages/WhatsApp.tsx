import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ExternalLink, FileSpreadsheet, MessageCircle, Plus, Send, Wallet } from 'lucide-react'
import { useAuth } from '../auth'
import { must, sendWhatsApp, supabase } from '../lib/supabase'
import { importExcel } from '../lib/excel'
import { allDues, fillTemplate, fmtDate, inr, normPhone, type FeeComponent } from '../lib/util'
import { Button, Card, cx, Empty, FormModal, Label, Loading, PageHeader, Pill, Select, Table, Tabs, toast, useRows } from '../ui'

type Template = { id: string; name: string; body: string; meta_template: string | null; lang: string }
type Recipient = { phone: string | null; raw: string; vars: Record<string, string> }
type Log = { id: string; phone: string; template: string | null; body: string | null; status: string; error: string | null; created_at: string }
type Result = { mode: 'api'; results: { phone: string; status: string; error: string | null }[] } | { mode: 'links'; links: { phone: string; body: string; url: string }[] }

const UPLOAD_COLS = [
  { key: 'student_name', label: 'Student Name' }, { key: 'parent_name', label: 'Parent Name' },
  { key: 'phone', label: 'WhatsApp Number', aliases: ['whatsapp', 'phone', 'mobile', 'parent whatsapp no'] },
  { key: 'class', label: 'Class', aliases: ['program', 'program/class'] }, { key: 'amount', label: 'Due Amount', aliases: ['amount'] },
  { key: 'due_date', label: 'Due Date' },
]

export default function WhatsApp() {
  const [tab, setTab] = useState<'send' | 'templates' | 'log'>('send')
  const templates = useRows<Template>(() => supabase.from('message_templates').select('*').order('name'))
  return (
    <>
      <PageHeader icon={MessageCircle} accent="whatsapp" title="WhatsApp Centre" subtitle="Personalised bulk reminders, sent automatically or with one tap" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'send', label: 'Bulk reminders' }, { key: 'templates', label: 'Templates' }, { key: 'log', label: 'Message log' }]} />
      {tab === 'send' ? <Bulk templates={templates.rows} /> : tab === 'templates' ? <Templates {...templates} /> : <MessageLog />}
    </>
  )
}

function Bulk({ templates }: { templates: Template[] }) {
  const { can, settings } = useAuth()
  const [source, setSource] = useState<'fees' | 'upload'>(can('fees') || can('whatsapp') ? 'fees' : 'upload')
  const [raw, setRaw] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(false)
  const [tid, setTid] = useState('')
  const [skip, setSkip] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)
  const tpl = templates.find((t) => t.id === tid) ?? templates.find((t) => t.name === 'Fee reminder') ?? templates[0]

  async function loadPending() {
    setLoading(true)
    const [{ data: students }, { data: comps }, { data: pays }] = await Promise.all([
      supabase.from('students').select('id, name, program, academic_year, parent_name, parent_phone').eq('active', true).order('name'),
      supabase.from('fee_components').select('*'),
      supabase.from('fee_payments').select('student_id, component_id, amount'),
    ])
    setRaw(allDues(students ?? [], (comps ?? []) as FeeComponent[], pays ?? []).filter((d) => d.overdue > 0).map((d) => ({
      raw: d.student.parent_phone ?? '', phone: normPhone(d.student.parent_phone),
      vars: {
        parent_name: d.student.parent_name ?? 'Parent', student_name: d.student.name, class: d.student.program,
        amount: d.overdue.toLocaleString('en-IN'), due_date: fmtDate(d.firstOverdue),
      },
    })))
    setLoading(false)
  }
  useEffect(() => { setResult(null); setSkip(new Set()); if (source === 'fees') loadPending(); else setRaw([]) }, [source]) // eslint-disable-line react-hooks/exhaustive-deps

  // Normalise, drop invalid numbers and duplicates (first occurrence wins)
  const { valid, invalid, dupes } = useMemo(() => {
    const seen = new Set<string>(), valid: Recipient[] = [], invalid: Recipient[] = [], dupes: Recipient[] = []
    for (const r of raw) {
      if (!r.phone) invalid.push(r)
      else if (seen.has(r.phone)) dupes.push(r)
      else { seen.add(r.phone); valid.push(r) }
    }
    return { valid, invalid, dupes }
  }, [raw])
  const toSend = valid.filter((r) => !skip.has(r.phone!))

  async function send() {
    if (!tpl || !toSend.length) return
    if (!confirm(`Send ${toSend.length} WhatsApp messages using "${tpl.name}"?`)) return
    setSending(true)
    try {
      const res = await sendWhatsApp(toSend.map((r) => ({ phone: r.phone!, vars: r.vars, template: tpl })))
      setResult(res)
      setOpened(new Set())
      toast(res.mode === 'api' ? `Sent ${res.results.filter((x) => x.status === 'sent').length} of ${res.results.length}` : 'API not configured — tap each link to send')
    } catch (e: any) { toast(e.message, 'error') } finally { setSending(false) }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-60">1 · Who</p>
          <div className="grid grid-cols-2 gap-2">
            {([['fees', Wallet, 'Pending fees'], ['upload', FileSpreadsheet, 'Upload Excel/CSV']] as const).map(([k, Icon, label]) => (
              <button key={k} onClick={() => setSource(k)}
                className={cx('flex flex-col items-center gap-1 rounded-2xl border-2 p-3 text-sm font-semibold transition', source === k ? 'border-honey bg-honey/15' : 'border-charcoal/10 dark:border-white/10')}>
                <Icon className="h-5 w-5" />{label}
              </button>
            ))}
          </div>
          {source === 'upload' && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = ''
                if (!f) return
                const rows = await importExcel(f, UPLOAD_COLS)
                setRaw(rows.map((r) => ({ raw: r.phone ?? '', phone: normPhone(r.phone), vars: { ...r, due_date: r.due_date?.includes('-') && r.due_date.length === 10 && r.due_date[4] === '-' ? fmtDate(r.due_date) : r.due_date } })))
                setResult(null)
              }} />
              <Button variant="soft" className="mt-2 w-full" icon={FileSpreadsheet} onClick={() => fileRef.current?.click()}>Choose file</Button>
              <p className="mt-1 text-xs opacity-60">Columns: Student Name, Parent Name, WhatsApp Number, Class, Due Amount, Due Date</p>
            </>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-60">2 · Message</p>
          <Select value={tpl?.id ?? ''} onChange={setTid} options={templates.map((t) => ({ value: t.id, label: t.name }))} />
          <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-leaf/50 p-3 text-sm dark:bg-leaf/10">{tpl?.body}</p>
          {tpl?.meta_template && <p className="mt-1 text-xs opacity-60">Sends as approved Meta template “{tpl.meta_template}”.</p>}
          {!settings.whatsapp.enabled && <p className="mt-2 text-xs opacity-60">API is off — you'll get tap-to-send wa.me links.</p>}
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide opacity-60">3 · Check & send</p>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-2xl bg-mint p-2 text-mint-ink"><b className="block text-lg">{toSend.length}</b>to send</div>
            <div className="rounded-2xl bg-rose p-2 text-rose-ink"><b className="block text-lg">{invalid.length}</b>invalid</div>
            <div className="rounded-2xl bg-peach p-2 text-peach-ink"><b className="block text-lg">{dupes.length}</b>duplicates</div>
          </div>
          <Button className="mt-3 w-full" icon={Send} loading={sending} disabled={!toSend.length || !tpl} onClick={send}>Send {toSend.length} messages</Button>
        </div>
      </Card>

      <Card className="lg:col-span-2">
        {result ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg">{result.mode === 'api' ? 'Delivery report' : 'Tap each to send on WhatsApp'}</h2>
              <Button size="sm" variant="ghost" onClick={() => setResult(null)}>Back to preview</Button>
            </div>
            {result.mode === 'api' ? (
              <Table rows={result.results} rowKey={(r) => r.phone} cols={[
                { label: 'Number', render: (r) => r.phone }, { label: 'Status', render: (r) => <Pill s={r.status} /> },
                { label: 'Error', render: (r) => <span className="text-xs text-rose-ink">{r.error}</span> },
              ]} />
            ) : (
              <ul className="space-y-2">
                {result.links.map((l) => (
                  <li key={l.phone} className={cx('flex items-center gap-3 rounded-2xl p-3', opened.has(l.phone) ? 'bg-mint/40 dark:bg-mint/10' : 'bg-charcoal/[0.03] dark:bg-white/5')}>
                    <div className="min-w-0 flex-1"><p className="font-semibold">{l.phone}</p><p className="truncate text-xs opacity-60">{l.body}</p></div>
                    <a href={l.url} target="_blank" rel="noreferrer" onClick={() => setOpened((s) => new Set(s).add(l.phone))}
                      className="inline-flex items-center gap-1 rounded-2xl bg-[#25D366] px-3 py-2 text-sm font-semibold text-white">
                      {opened.has(l.phone) ? <CheckCircle2 className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />}{opened.has(l.phone) ? 'Opened' : 'Send'}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : loading ? <Loading /> : !raw.length ? (
          <Empty title={source === 'fees' ? 'No overdue fees 🎉' : 'Upload a list to preview'} text={source === 'fees' ? 'Every student is paid up to date.' : 'Each parent gets a personalised message — you can check them all here first.'} />
        ) : (
          <>
            <h2 className="mb-3 font-display text-lg">Preview ({valid.length})</h2>
            <ul className="space-y-2">
              {valid.map((r) => (
                <li key={r.phone} className={cx('flex gap-3 rounded-2xl p-3', skip.has(r.phone!) ? 'opacity-40' : 'bg-leaf/30 dark:bg-leaf/5')}>
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-honey" checked={!skip.has(r.phone!)} aria-label={`Include ${r.phone}`}
                    onChange={(e) => setSkip((s) => { const n = new Set(s); e.target.checked ? n.delete(r.phone!) : n.add(r.phone!); return n })} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{r.phone} <span className="font-normal opacity-60">· {r.vars.student_name} {r.vars.amount && `· ${inr(r.vars.amount.replace(/,/g, ''))}`}</span></p>
                    <p className="whitespace-pre-wrap text-sm opacity-80">{tpl ? fillTemplate(tpl.body, r.vars) : ''}</p>
                  </div>
                </li>
              ))}
            </ul>
            {(invalid.length > 0 || dupes.length > 0) && (
              <div className="mt-4 rounded-2xl bg-rose/40 p-3 text-sm dark:bg-rose/10">
                <p className="font-semibold">Removed</p>
                {invalid.map((r, i) => <p key={'i' + i}>✗ {r.vars.student_name ?? ''} — “{r.raw || 'no number'}” is not a valid mobile</p>)}
                {dupes.map((r, i) => <p key={'d' + i}>⧉ {r.vars.student_name ?? ''} — duplicate of {r.phone}</p>)}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}

function Templates({ rows, loading, reload }: { rows: Template[]; loading: boolean; reload: () => void }) {
  const [editing, setEditing] = useState<Template | 'new' | null>(null)
  const current = editing && editing !== 'new' ? editing : null
  if (loading) return <Loading />
  return (
    <Card>
      <div className="mb-3 flex justify-between gap-2">
        <p className="text-sm opacity-60">Placeholders: {'{parent_name} {student_name} {amount} {due_date} {class}'} — payment receipts use {'{name} {amount} {service} {date} {ref}'}.</p>
        <Button icon={Plus} onClick={() => setEditing('new')}>New template</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((t) => (
          <button key={t.id} onClick={() => setEditing(t)} className="rounded-3xl bg-leaf/40 p-4 text-left transition hover:-translate-y-0.5 dark:bg-leaf/10">
            <p className="font-display text-lg">{t.name}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{t.body}</p>
            {t.meta_template && <p className="mt-2 text-xs opacity-60">Meta template: {t.meta_template} ({t.lang})</p>}
          </button>
        ))}
        {!rows.length && <Empty title="No templates yet" />}
      </div>
      <FormModal open={!!editing} onClose={() => setEditing(null)} title={current ? `Edit ${current.name}` : 'New template'} wide
        initial={current ?? { lang: 'en' }}
        fields={[
          { key: 'name', label: 'Name', required: true },
          { key: 'meta_template', label: 'Approved Meta template name (for API sending)', placeholder: 'fee_reminder' },
          { key: 'lang', label: 'Template language code', placeholder: 'en' },
          { key: 'body', label: 'Message', type: 'textarea', required: true },
        ]}
        onSubmit={async (v) => {
          const row = { name: v.name, body: v.body, meta_template: v.meta_template || null, lang: v.lang || 'en' }
          if (current) await must(supabase.from('message_templates').update(row).eq('id', current.id))
          else await must(supabase.from('message_templates').insert(row))
          reload()
        }}>
        <p className="mt-2 text-xs opacity-60">With the API on, a Meta template's {'{{1}}, {{2}}…'} are filled with this message's placeholders in the order they appear.</p>
      </FormModal>
    </Card>
  )
}

function MessageLog() {
  const [status, setStatus] = useState('')
  const { rows, loading } = useRows<Log>(() => {
    let q = supabase.from('message_log').select('*').order('created_at', { ascending: false }).limit(500)
    if (status) q = q.eq('status', status)
    return q
  }, [status])
  return (
    <Card>
      <div className="mb-3"><Label label="Status"><Select value={status} onChange={setStatus} options={['sent', 'delivered', 'read', 'failed', 'link']} placeholder="All" className="!w-40" /></Label></div>
      {loading ? <Loading /> : (
        <Table rows={rows} rowKey={(r) => r.id} empty={<Empty title="No messages yet" text="Everything you send shows up here." />} cols={[
          { label: 'Date', render: (r) => new Date(r.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) },
          { label: 'Number', render: (r) => r.phone },
          { label: 'Template', render: (r) => r.template ?? '—' },
          { label: 'Message', render: (r) => <p className="max-w-sm truncate text-xs opacity-70" title={r.body ?? ''}>{r.body}</p> },
          { label: 'Status', render: (r) => <span title={r.error ?? undefined}><Pill s={r.status === 'link' ? 'link' : r.status} /></span> },
        ]} />
      )}
    </Card>
  )
}
