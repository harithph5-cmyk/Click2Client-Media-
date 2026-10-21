import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, CalendarPlus, CheckCircle2, ExternalLink, FileSpreadsheet, MessageCircle, Plus, Send, StickyNote, Wallet } from 'lucide-react'
import { useAuth, waMode } from '../auth'
import { must, replyWhatsApp, runAi, sendWhatsApp, supabase, type WaResult } from '../lib/supabase'
import { importExcel } from '../lib/excel'
import { allDues, fillTemplate, fmtDate, inr, LEAD_CATEGORIES, normPhone, type FeeComponent } from '../lib/util'
import { Assistant, FollowUps } from './WhatsAppAssistant'
import { Button, Card, cx, Empty, FormModal, inputCls, Label, Loading, PageHeader, Pill, Select, Table, Tabs, toast, useRows } from '../ui'

type Template = { id: string; name: string; body: string; meta_template: string | null; lang: string }
type Recipient = { phone: string | null; raw: string; vars: Record<string, string> }
type Log = { id: string; phone: string; template: string | null; body: string | null; status: string; error: string | null; simulated?: boolean; created_at: string }
type Result = { mode: 'api'; results: WaResult[] } | { mode: 'links'; links: { phone: string; body: string; url: string }[] }

const UPLOAD_COLS = [
  { key: 'student_name', label: 'Student Name' }, { key: 'parent_name', label: 'Parent Name' },
  { key: 'phone', label: 'WhatsApp Number', aliases: ['whatsapp', 'phone', 'mobile', 'parent whatsapp no'] },
  { key: 'class', label: 'Class', aliases: ['program', 'program/class'] }, { key: 'amount', label: 'Due Amount', aliases: ['amount'] },
  { key: 'due_date', label: 'Due Date' },
]

type Tab = 'inbox' | 'followups' | 'ai' | 'send' | 'templates' | 'log'

export default function WhatsApp() {
  const { settings } = useAuth()
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get('tab') as Tab) || 'inbox')
  const [chat, setChat] = useState<string | null>(null)
  const templates = useRows<Template>(() => supabase.from('message_templates').select('*').order('name'))
  const mode = waMode(settings)
  return (
    <>
      <PageHeader icon={MessageCircle} accent="whatsapp" title="WhatsApp Centre" subtitle="Conversations with parents, the AI assistant, follow-ups and bulk reminders"
        actions={mode === 'mock' ? <Pill s="SIMULATED" className="!text-sm" /> : undefined} />
      {mode === 'mock' && (
        <p className="mb-3 rounded-2xl bg-peach/60 p-3 text-sm text-peach-ink">
          Mock mode: messages are recorded in the CRM but nothing is sent to WhatsApp. Switch to Live in Settings once Meta is connected.
        </p>
      )}
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'inbox', label: 'Inbox' }, { key: 'followups', label: 'Follow-ups' }, { key: 'ai', label: 'AI Assistant' },
        { key: 'send', label: 'Bulk reminders' }, { key: 'templates', label: 'Templates' }, { key: 'log', label: 'Message log' },
      ]} />
      {tab === 'inbox' ? <Inbox initial={chat} />
        : tab === 'followups' ? <FollowUps onOpenChat={(id) => { setChat(id); setTab('inbox') }} />
        : tab === 'ai' ? <Assistant />
        : tab === 'send' ? <Bulk templates={templates.rows} /> : tab === 'templates' ? <Templates {...templates} /> : <MessageLog />}
    </>
  )
}

type Contact = {
  id: string; phone: string; name: string | null; status: 'open' | 'resolved'; assigned_to: string | null; ai_paused: boolean
  unread: number; last_message_at: string | null; last_message: string | null; last_inbound_at: string | null
  opted_in: boolean; opted_out_at: string | null; lead_id: string | null; student_id: string | null
}
type WaMsg = {
  id: string; direction: 'in' | 'out' | 'note'; sender: string; kind: string; body: string | null; status: string
  error: string | null; simulated: boolean; created_at: string; sent_by: string | null
}
type ThreadLead = { id: string; name: string; category: string; status: string; priority: string; intent: string | null; ai_summary: string | null; source: string | null }
const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''
const inWindow = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 24 * 3600 * 1000
const SENDER: Record<string, string> = { ai: 'AI', staff: 'Team', system: 'System' }

function Inbox({ initial }: { initial: string | null }) {
  const { profile, settings } = useAuth()
  const [filter, setFilter] = useState<'open' | 'mine' | 'resolved'>('open')
  const [sel, setSel] = useState<string | null>(initial)
  const [sim, setSim] = useState(false)
  const contacts = useRows<Contact>(() => {
    let q = supabase.from('wa_contacts').select('*').order('last_message_at', { ascending: false, nullsFirst: false }).limit(200)
    q = filter === 'mine' ? q.eq('status', 'open').eq('assigned_to', profile!.id) : q.eq('status', filter)
    return q
  }, [filter])
  // A conversation opened from elsewhere (e.g. Follow-ups) may not be in the current filter
  const [outside, setOutside] = useState<Contact | null>(null)
  useEffect(() => {
    if (sel && !contacts.loading && !contacts.rows.some((c) => c.id === sel))
      supabase.from('wa_contacts').select('*').eq('id', sel).single().then(({ data }) => setOutside(data))
  }, [sel, contacts.loading, contacts.rows])
  const { rows: team } = useRows<{ id: string; full_name: string }>(() => supabase.from('profiles').select('id, full_name').eq('active', true))
  // ponytail: polling; switch to Supabase Realtime if 15s feels slow
  useEffect(() => { const t = setInterval(contacts.reload, 15000); return () => clearInterval(t) }, [contacts.reload])
  const current = contacts.rows.find((c) => c.id === sel) ?? (outside?.id === sel ? outside : null)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className={cx('space-y-3', current && 'hidden lg:block')}>
        <div className="flex items-center gap-2">
          <Select value={filter} onChange={(v) => setFilter(v as typeof filter)} className="flex-1"
            options={[{ value: 'open', label: 'Open' }, { value: 'mine', label: 'Assigned to me' }, { value: 'resolved', label: 'Resolved' }]} />
          {waMode(settings) === 'mock' && <Button size="sm" variant="soft" icon={Plus} onClick={() => setSim(true)}>Simulate</Button>}
        </div>
        {contacts.loading && !contacts.rows.length ? <Loading /> : !contacts.rows.length ? (
          <Empty title="No conversations" text="Messages parents send to your WhatsApp number appear here." />
        ) : (
          <ul className="space-y-1">
            {contacts.rows.map((c) => (
              <li key={c.id}>
                <button onClick={() => setSel(c.id)}
                  className={cx('w-full rounded-2xl p-3 text-left transition', sel === c.id ? 'bg-honey/25' : 'hover:bg-charcoal/5 dark:hover:bg-white/5')}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold">{c.name || c.phone}</p>
                    {c.ai_paused && <span className="text-[10px] font-bold uppercase opacity-50">human</span>}
                    {c.unread > 0 && <span className="rounded-full bg-[#25D366] px-2 text-xs font-bold text-white">{c.unread}</span>}
                  </div>
                  <p className="truncate text-xs opacity-60">{c.last_message ?? '—'}</p>
                  <p className="text-[11px] opacity-40">{when(c.last_message_at)}{c.assigned_to && ` · ${team.find((t) => t.id === c.assigned_to)?.full_name ?? ''}`}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className={cx('lg:col-span-2', !current && 'hidden lg:block')}>
        {current ? <Thread key={current.id} c={current} team={team} onBack={() => setSel(null)} onChange={contacts.reload} />
          : <Empty title="Pick a conversation" text="Choose one on the left to read and reply." />}
      </Card>
      <FormModal open={sim} onClose={() => setSim(false)} title="Simulate an incoming message" initial={{ phone: '9845012345', name: 'Test Parent' }}
        fields={[
          { key: 'phone', label: 'From (WhatsApp number)', type: 'tel', required: true },
          { key: 'name', label: 'Profile name' },
          { key: 'text', label: 'Message', type: 'textarea', required: true },
        ]}
        submitLabel="Simulate"
        onSubmit={async (v) => {
          const r = await must(supabase.rpc('wa_simulate_inbound', { p_phone: v.phone, p_name: v.name ?? '', p_text: v.text }))
          setFilter('open')
          contacts.reload()
          if (settings.ai.enabled && r.inbound?.length) {
            try {
              const ai = await runAi(r.inbound)
              toast(`AI: ${ai.results.map((x) => x.outcome).join(', ')}`)
            } catch (e: any) { toast(`AI did not run: ${e.message}`, 'error') }
            contacts.reload()
          }
        }}>
        <p className="mt-2 text-xs opacity-60">Only in mock mode. It goes through the same processing as a real webhook, then the AI assistant (if it's on). Send STOP to test opting out.</p>
      </FormModal>
    </div>
  )
}

function Thread({ c, team, onBack, onChange }: { c: Contact; team: { id: string; full_name: string }[]; onBack: () => void; onChange: () => void }) {
  const { profile, settings } = useAuth()
  const msgs = useRows<WaMsg>(() => supabase.from('wa_messages').select('*').eq('contact_id', c.id).order('created_at').limit(500), [c.id])
  const lead = useRows<ThreadLead>(() => c.lead_id
    ? supabase.from('leads').select('id, name, category, status, priority, intent, ai_summary, source').eq('id', c.lead_id)
    : Promise.resolve({ data: [], error: null }), [c.lead_id]).rows[0]
  const [text, setText] = useState('')
  const [note, setNote] = useState(false)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [sending, setSending] = useState(false)
  const [task, setTask] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { const t = setInterval(msgs.reload, 10000); return () => clearInterval(t) }, [msgs.reload])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [msgs.rows.length])
  useEffect(() => { if (c.unread) supabase.from('wa_contacts').update({ unread: 0 }).eq('id', c.id).then(onChange) }, [c.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const canText = inWindow(c.last_inbound_at) && !c.opted_out_at
  const update = async (patch: Partial<Contact>) => {
    try { await must(supabase.from('wa_contacts').update(patch).eq('id', c.id)); onChange() } catch (e: any) { toast(e.message, 'error') }
  }
  async function send() {
    if (!text.trim()) return
    setSending(true)
    try {
      if (note) {
        await must(supabase.from('wa_messages').insert({ contact_id: c.id, direction: 'note', sender: 'staff', sent_by: profile!.id, kind: 'note', body: text.trim(), status: 'received' }))
      } else {
        const r = await replyWhatsApp(c.phone, text.trim(), key)
        if (r.simulated) toast('Recorded (simulated, not sent to WhatsApp)')
        setKey(crypto.randomUUID())
      }
      setText('')
      msgs.reload(); onChange()
    } catch (e: any) { toast(e.message, 'error') } finally { setSending(false) }
  }

  return (
    <div className="flex h-[75vh] flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-charcoal/5 pb-3 dark:border-white/5">
        <button onClick={onBack} className="rounded-xl px-2 py-1 text-sm font-semibold lg:hidden">← Back</button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg">{c.name || c.phone}</p>
          <p className="text-xs opacity-60">{c.phone}{c.student_id && ' · parent of a student'}{c.opted_in && ' · opted in'}</p>
        </div>
        {c.opted_out_at && <Pill s="Opted out" />}
        {settings.ai.enabled && (
          <Button size="sm" variant={c.ai_paused ? 'soft' : 'ghost'} icon={Bot} onClick={() => update({ ai_paused: !c.ai_paused })}
            title={c.ai_paused ? 'A person is handling this conversation' : 'The AI answers new messages here'}>
            {c.ai_paused ? 'Resume AI' : 'Pause AI'}
          </Button>
        )}
        <Select value={c.assigned_to ?? ''} onChange={(v) => update({ assigned_to: v || null })} placeholder="Unassigned" className="!w-40"
          options={team.map((t) => ({ value: t.id, label: t.full_name }))} />
        <Button size="sm" variant="ghost" icon={CalendarPlus} onClick={() => setTask(true)}>Follow-up</Button>
        <Button size="sm" variant="soft" onClick={() => update({ status: c.status === 'open' ? 'resolved' : 'open' })}>
          {c.status === 'open' ? 'Mark resolved' : 'Reopen'}
        </Button>
      </div>
      {lead && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-2xl bg-sky/30 px-3 py-2 text-sm dark:bg-sky/10">
          <span className="font-semibold">{LEAD_CATEGORIES.find((x) => x.key === lead.category)?.label ?? lead.category} enquiry</span>
          <span className="opacity-60">· {lead.source}</span>
          {lead.priority === 'high' && <Pill s="High priority" />}
          <Select value={lead.status} options={settings.lead_statuses} className="!w-44 !rounded-full !py-1 text-sm" onChange={async (s) => {
            const { error } = await supabase.from('leads').update({ status: s }).eq('id', lead.id)
            if (error) toast(error.message, 'error'); else toast(`Lead marked ${s}`)
          }} />
          {lead.ai_summary && <p className="w-full text-xs opacity-70">AI summary: {lead.ai_summary}</p>}
        </div>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {msgs.loading && !msgs.rows.length ? <Loading /> : msgs.rows.map((m) => m.direction === 'note' ? (
          <div key={m.id} className="mx-auto max-w-[85%] rounded-2xl border border-dashed border-honey bg-honey/10 px-3 py-2 text-sm">
            <p className="text-[11px] font-bold uppercase opacity-60">Internal note · {team.find((t) => t.id === m.sent_by)?.full_name ?? 'Team'} · {when(m.created_at)}</p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ) : (
          <div key={m.id} className={cx('flex', m.direction === 'out' && 'justify-end')}>
            <div className={cx('max-w-[80%] rounded-2xl px-3 py-2 text-sm',
              m.direction === 'in' ? 'bg-charcoal/5 dark:bg-white/5' : m.sender === 'ai' ? 'bg-lav/60 dark:bg-lav/15' : 'bg-leaf/60 dark:bg-leaf/15')}>
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] opacity-60">
                {when(m.created_at)}
                {m.direction === 'out' && <> · {SENDER[m.sender] ?? m.sender} · <span title={m.error ?? undefined}>{m.status}</span></>}
                {m.simulated && <Pill s="SIMULATED" className="!px-1.5 !py-0 !text-[10px]" />}
              </p>
              {m.status === 'failed' && m.error && <p className="text-xs text-rose-ink">{m.error}</p>}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="mt-3 flex gap-1 text-xs font-semibold">
        {(['Reply', 'Internal note'] as const).map((l, i) => (
          <button key={l} onClick={() => setNote(i === 1)} className={cx('rounded-full px-3 py-1', note === (i === 1) ? 'bg-honey text-charcoal' : 'bg-charcoal/5 dark:bg-white/5')}>{l}</button>
        ))}
        {!note && c.ai_paused === false && settings.ai.enabled && <span className="ml-auto self-center opacity-50">Replying pauses the AI on this conversation</span>}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send() }}>
        <textarea className={inputCls + ' min-h-[44px] flex-1 resize-none'} rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000}
          disabled={!note && !canText} placeholder={note ? 'Note for the team. The contact never sees it.' : c.opted_out_at ? 'This contact opted out of WhatsApp messages'
            : canText ? 'Type a reply…' : 'More than 24 hours since their last message. Only an approved template can be sent.'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <Button type="submit" icon={note ? StickyNote : Send} loading={sending} disabled={(!note && !canText) || !text.trim()}>{note ? 'Add note' : 'Send'}</Button>
      </form>
      <FormModal open={task} onClose={() => setTask(false)} title="New follow-up" submitLabel="Create"
        initial={{ title: `Call ${c.name || c.phone}`, hours: String(settings.lead_routing.sla_hours), assignee: c.assigned_to ?? profile!.id }}
        fields={[
          { key: 'title', label: 'Task', required: true },
          { key: 'hours', label: 'Due within (hours)', type: 'number', required: true },
          { key: 'assignee', label: 'Assign to', type: 'select', required: true, options: team.map((t) => ({ value: t.id, label: t.full_name })) },
        ]}
        onSubmit={async (v) => {
          await must(supabase.rpc('add_follow_up', { p_lead: c.lead_id, p_contact: c.id, p_assignee: v.assignee, p_title: v.title, p_hours: Number(v.hours) }))
          toast('Follow-up created (or an open one already exists)')
        }} />
    </div>
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
      toast(res.mode === 'api'
        ? `${res.results[0]?.simulated ? 'Simulated' : 'Sent'} ${res.results.filter((x) => x.status === 'sent').length} of ${res.results.length}`
        : 'API not configured — tap each link to send')
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
          {waMode(settings) === 'off' && <p className="mt-2 text-xs opacity-60">API is off — you'll get tap-to-send wa.me links.</p>}
          {waMode(settings) !== 'off' && !tpl?.meta_template && <p className="mt-2 text-xs text-rose-ink">No approved Meta template set: only parents who messaged you in the last 24 hours will receive this.</p>}
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
                { label: 'Number', render: (r) => r.phone }, { label: 'Status', render: (r) => <><Pill s={r.status} />{r.simulated && <Pill s="SIMULATED" className="ml-1" />}</> },
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
          { label: 'Status', render: (r) => <span title={r.error ?? undefined}><Pill s={r.status} />{r.simulated && <Pill s="SIMULATED" className="ml-1" />}</span> },
        ]} />
      )}
    </Card>
  )
}
