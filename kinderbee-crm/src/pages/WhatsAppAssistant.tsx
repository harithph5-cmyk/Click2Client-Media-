// WhatsApp → Follow-ups and AI Assistant tabs.
import { useEffect, useState } from 'react'
import { BellRing, BookOpen, Bot, CheckCircle2, Plus, Route, Save, Trash2 } from 'lucide-react'
import { useAuth, type Settings } from '../auth'
import { must, supabase } from '../lib/supabase'
import { LEAD_CATEGORIES } from '../lib/util'
import { Button, Card, cx, Empty, FormModal, inputCls, Label, Loading, Pill, Select, Table, toast, useRows } from '../ui'

const when = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
type Member = { id: string; full_name: string }
const useTeam = () => useRows<Member>(() => supabase.from('profiles').select('id, full_name').eq('active', true).order('full_name')).rows

// ───────── Follow-ups ─────────
type FollowUp = {
  id: string; title: string; due_at: string; status: string; escalated_at: string | null; assigned_to: string | null
  outcome: string | null; done_at: string | null; lead_id: string | null; contact_id: string | null
  leads: { name: string; phone: string | null; category: string; status: string; ai_summary: string | null } | null
  wa_contacts: { name: string | null; phone: string } | null
}

export function FollowUps({ onOpenChat }: { onOpenChat: (contactId: string) => void }) {
  const { profile } = useAuth()
  const team = useTeam()
  const [view, setView] = useState<'mine' | 'open' | 'overdue' | 'done'>('mine')
  const [completing, setCompleting] = useState<FollowUp | null>(null)
  const { rows, loading, reload } = useRows<FollowUp>(() => {
    let q = supabase.from('follow_ups').select('*, leads(name, phone, category, status, ai_summary), wa_contacts(name, phone)')
    if (view === 'done') q = q.eq('status', 'done').order('done_at', { ascending: false }).limit(100)
    else {
      q = q.eq('status', 'open').order('due_at')
      if (view === 'mine') q = q.eq('assigned_to', profile!.id)
      if (view === 'overdue') q = q.lt('due_at', new Date().toISOString())
    }
    return q
  }, [view])
  const now = Date.now()

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={view} onChange={(v) => setView(v as typeof view)} className="!w-48"
          options={[{ value: 'mine', label: 'My open tasks' }, { value: 'open', label: 'All open' }, { value: 'overdue', label: 'Overdue' }, { value: 'done', label: 'Completed' }]} />
        <p className="text-sm opacity-60">New enquiries and AI hand-offs create a task here. Overdue tasks alert the CEO.</p>
      </div>
      {loading ? <Loading /> : (
        <Table rows={rows} rowKey={(r) => r.id} empty={<Empty title="Nothing to follow up" text="You're all caught up 🐝" />} cols={[
          { label: 'Task', render: (r) => (
            <>
              <p className="font-semibold">{r.title}</p>
              {r.leads?.ai_summary && <p className="max-w-md text-xs opacity-60">{r.leads.ai_summary}</p>}
            </>
          ) },
          { label: 'Contact', render: (r) => <span className="text-sm">{r.leads?.phone ?? r.wa_contacts?.phone ?? '—'}</span> },
          { label: 'Owner', render: (r) => team.find((t) => t.id === r.assigned_to)?.full_name ?? <span className="opacity-40">Unassigned</span> },
          { label: 'Due', render: (r) => r.status === 'done' ? <span className="text-sm">Done {when(r.done_at)}</span> : (
            <span className={cx('inline-flex items-center gap-1 text-sm', new Date(r.due_at).getTime() < now && 'font-bold text-rose-ink')}>
              {new Date(r.due_at).getTime() < now && <BellRing className="h-3.5 w-3.5" />}{when(r.due_at)}
              {r.escalated_at && <Pill s="Escalated" className="ml-1" />}
            </span>
          ) },
          { label: '', render: (r) => (
            <span className="flex gap-1">
              {r.contact_id && <Button size="sm" variant="ghost" onClick={() => onOpenChat(r.contact_id!)}>Chat</Button>}
              {r.status === 'open' && <Button size="sm" variant="soft" icon={CheckCircle2} onClick={() => setCompleting(r)}>Done</Button>}
            </span>
          ) },
        ]} />
      )}
      <FormModal open={!!completing} onClose={() => setCompleting(null)} title="Mark follow-up done" submitLabel="Mark done"
        fields={[{ key: 'outcome', label: 'What happened? (called, visit booked, not reachable…)', type: 'textarea', required: true }]}
        onSubmit={async (v) => {
          await must(supabase.rpc('complete_follow_up', { p_id: completing!.id, p_outcome: v.outcome }))
          toast('Follow-up done; the lead is marked Contacted by Team')
          reload()
        }} />
    </Card>
  )
}

// ───────── AI Assistant: settings, routing, knowledge base, activity ─────────
type Article = { id: string; title: string; topic: string; body: string; active: boolean; updated_at: string }
type AiLog = {
  id: number; created_at: string; outcome: string; intent: string | null; category: string | null; priority: string | null
  model: string | null; needs_human: boolean | null; error: string | null; input_tokens: number | null; output_tokens: number | null; ms: number | null
}
const TOPICS = ['admissions', 'kips', 'franchise', 'teacher_training', 'curriculum', 'centres', 'fees', 'timings', 'faq', 'escalation', 'general']
const MODELS = [
  { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5: fastest, lowest cost' },
  { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5: more careful' },
  { value: 'claude-opus-5-5', label: 'Claude Opus 5.5: most capable, highest cost' },
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function Assistant() {
  const { isCeo, settings, reloadSettings } = useAuth()
  const team = useTeam()
  const [ai, setAi] = useState(settings.ai)
  const [routing, setRouting] = useState(settings.lead_routing)
  const [forms, setForms] = useState(Object.entries(settings.meta_forms))
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState<Article | 'new' | null>(null)
  const kb = useRows<Article>(() => supabase.from('kb_articles').select('*').order('topic').order('title'))
  const logs = useRows<AiLog>(() => supabase.from('ai_logs').select('*').order('created_at', { ascending: false }).limit(100))
  useEffect(() => { if (isCeo) supabase.rpc('has_secret', { k: 'anthropic_api_key' }).then(({ data }) => setHasKey(!!data)) }, [isCeo])
  const ro = !isCeo

  async function save<K extends keyof Settings>(key: K, value: Settings[K]) {
    setBusy(key)
    const { error } = await supabase.from('settings').upsert({ key, value })
    setBusy('')
    if (error) return toast(error.message, 'error')
    await reloadSettings()
    toast('Saved')
  }
  const current = editing && editing !== 'new' ? editing : null

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-lg"><Bot className="h-5 w-5 text-leaf-ink" />Automatic replies</h2>
        <p className="text-sm opacity-60">
          The assistant answers only from the knowledge base, never confirms admissions, fees or visits, and hands
          anything it can't answer to a person (pausing itself on that conversation).
          {isCeo && hasKey === false && <b className="text-rose-ink"> No Anthropic API key is saved (Settings → WhatsApp), so a rule-based mock replies with a hand-off message.</b>}
        </p>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-honey" disabled={ro} checked={ai.enabled} onChange={(e) => setAi({ ...ai, enabled: e.target.checked })} />
          Reply to WhatsApp enquiries automatically
        </label>
        <Label label="Model"><Select value={ai.model} onChange={(v) => setAi({ ...ai, model: v })} options={MODELS} /></Label>
        <Label label="When to reply">
          <Select value={ai.reply_when} onChange={(v) => setAi({ ...ai, reply_when: v as typeof ai.reply_when })}
            options={[{ value: 'always', label: 'Always' }, { value: 'after_hours', label: 'Only outside working hours (staff reply during hours)' }]} />
        </Label>
        <div className="flex flex-wrap items-end gap-2">
          <Label label="Working hours from"><input type="time" className={inputCls} value={ai.hours.start} disabled={ro} onChange={(e) => setAi({ ...ai, hours: { ...ai.hours, start: e.target.value } })} /></Label>
          <Label label="to"><input type="time" className={inputCls} value={ai.hours.end} disabled={ro} onChange={(e) => setAi({ ...ai, hours: { ...ai.hours, end: e.target.value } })} /></Label>
        </div>
        <div className="flex flex-wrap gap-1">
          {DAYS.map((d, i) => (
            <button key={d} disabled={ro} onClick={() => setAi({ ...ai, hours: { ...ai.hours, days: ai.hours.days.includes(i) ? ai.hours.days.filter((x) => x !== i) : [...ai.hours.days, i].sort() } })}
              className={cx('rounded-full px-3 py-1 text-xs font-semibold', ai.hours.days.includes(i) ? 'bg-honey text-charcoal' : 'bg-charcoal/5 dark:bg-white/5')}>{d}</button>
          ))}
        </div>
        {!ro && <Button icon={Save} loading={busy === 'ai'} onClick={() => save('ai', ai)}>Save</Button>}
      </Card>

      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-lg"><Route className="h-5 w-5 text-lav-ink" />Lead routing & follow-up SLA</h2>
        <p className="text-sm opacity-60">Every new enquiry (website, Meta Lead Ads, WhatsApp) is assigned here and gets a follow-up task. If it isn't done in time, the CEO and manager are alerted.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label label="Default assignee">
            <Select value={routing.default_assignee ?? ''} onChange={(v) => setRouting({ ...routing, default_assignee: v || null })} placeholder="CEO" options={team.map((t) => ({ value: t.id, label: t.full_name }))} />
          </Label>
          <Label label="Manager (gets escalations)">
            <Select value={routing.manager ?? ''} onChange={(v) => setRouting({ ...routing, manager: v || null })} placeholder="CEO only" options={team.map((t) => ({ value: t.id, label: t.full_name }))} />
          </Label>
          <Label label="Follow-up within (hours)">
            <input type="number" min={1} max={168} className={inputCls} disabled={ro} value={routing.sla_hours} onChange={(e) => setRouting({ ...routing, sla_hours: Number(e.target.value) || 4 })} />
          </Label>
        </div>
        <p className="text-xs font-bold uppercase tracking-wide opacity-60">By enquiry type</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LEAD_CATEGORIES.map((c) => (
            <Label key={c.key} label={c.label}>
              <Select value={routing.by_category[c.key] ?? ''} placeholder="Default"
                onChange={(v) => { const by = { ...routing.by_category }; if (v) by[c.key] = v; else delete by[c.key]; setRouting({ ...routing, by_category: by }) }}
                options={team.map((t) => ({ value: t.id, label: t.full_name }))} />
            </Label>
          ))}
        </div>
        {!ro && <Button icon={Save} loading={busy === 'lead_routing'} onClick={() => save('lead_routing', routing)}>Save routing</Button>}
        <p className="pt-2 text-xs font-bold uppercase tracking-wide opacity-60">Meta Lead Ads forms</p>
        <p className="text-xs opacity-60">Map each lead form ID to an enquiry type. Unlisted forms are saved as admission enquiries.</p>
        {forms.map(([id, cat], i) => (
          <div key={i} className="flex gap-2">
            <input className={inputCls} placeholder="Form ID" value={id} disabled={ro} onChange={(e) => setForms(forms.map((f, j) => j === i ? [e.target.value.trim(), f[1]] : f))} />
            <Select value={cat} onChange={(v) => setForms(forms.map((f, j) => j === i ? [f[0], v] : f))} options={LEAD_CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} />
            {!ro && <button onClick={() => setForms(forms.filter((_, j) => j !== i))} aria-label="Remove form"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
        {!ro && (
          <div className="flex gap-2">
            <Button variant="soft" size="sm" icon={Plus} onClick={() => setForms([...forms, ['', 'admission']])}>Add form</Button>
            <Button size="sm" icon={Save} loading={busy === 'meta_forms'} onClick={() => save('meta_forms', Object.fromEntries(forms.filter(([id]) => id)))}>Save forms</Button>
          </div>
        )}
      </Card>

      <Card className="lg:col-span-2">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-lg"><BookOpen className="h-5 w-5 text-honey" />Knowledge base</h2>
          {!ro && <Button icon={Plus} onClick={() => setEditing('new')}>New article</Button>}
        </div>
        <p className="mb-3 text-sm opacity-60">
          The only facts the assistant may use. Add verified information only: fees, centres, timings, admissions process, KIPS and franchise steps,
          teacher training, curriculum, FAQs and how complaints are escalated. Turn an article off to hide it from the AI.
        </p>
        {kb.loading ? <Loading /> : !kb.rows.length ? (
          <Empty title="The knowledge base is empty" text="Until you add articles, the assistant acknowledges every enquiry and hands it to the team." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {kb.rows.map((a) => (
              <button key={a.id} disabled={ro} onClick={() => setEditing(a)}
                className={cx('rounded-3xl p-4 text-left transition hover:-translate-y-0.5', a.active ? 'bg-leaf/40 dark:bg-leaf/10' : 'bg-charcoal/5 opacity-60 dark:bg-white/5')}>
                <p className="font-display text-lg">{a.title}</p>
                <p className="text-xs opacity-60">{a.topic}{!a.active && ' · off'} · updated {when(a.updated_at)}</p>
                <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm opacity-80">{a.body}</p>
              </button>
            ))}
          </div>
        )}
        <FormModal open={!!editing} onClose={() => setEditing(null)} wide title={current ? `Edit ${current.title}` : 'New article'}
          initial={current ?? { topic: 'faq', active: true }}
          fields={[
            { key: 'title', label: 'Title', required: true },
            { key: 'topic', label: 'Topic', type: 'select', options: TOPICS, required: true },
            { key: 'body', label: 'Content (verified facts only)', type: 'textarea', required: true },
            { key: 'active', label: 'Use this article in AI replies', type: 'checkbox' },
          ]}
          onSubmit={async (v) => {
            const row = { title: v.title.trim(), topic: v.topic, body: v.body.trim(), active: !!v.active, updated_at: new Date().toISOString() }
            if (current) await must(supabase.from('kb_articles').update(row).eq('id', current.id))
            else await must(supabase.from('kb_articles').insert(row))
            kb.reload()
          }}>
          {current && (
            <Button type="button" variant="ghost" icon={Trash2} className="mt-3 text-rose-ink" onClick={async () => {
              if (!confirm(`Delete "${current.title}"?`)) return
              try { await must(supabase.from('kb_articles').delete().eq('id', current.id)); setEditing(null); kb.reload() } catch (e: any) { toast(e.message, 'error') }
            }}>Delete article</Button>
          )}
        </FormModal>
      </Card>

      <Card className="lg:col-span-2">
        <h2 className="mb-3 font-display text-lg">AI activity (last 100)</h2>
        {logs.loading ? <Loading /> : (
          <Table rows={logs.rows} rowKey={(r) => String(r.id)} empty={<Empty title="No AI activity yet" />} cols={[
            { label: 'When', render: (r) => <span className="text-sm">{when(r.created_at)}</span> },
            { label: 'Outcome', render: (r) => <span className={cx('text-sm font-semibold', r.outcome === 'error' && 'text-rose-ink')} title={r.error ?? undefined}>{r.outcome}{r.error && ` (${r.error})`}</span> },
            { label: 'Intent', render: (r) => <span className="text-sm">{[r.intent, r.category].filter(Boolean).join(' · ') || '—'}</span> },
            { label: 'Priority', render: (r) => r.priority ? <span className={cx('text-sm', r.priority === 'high' && 'font-bold text-rose-ink')}>{r.priority}</span> : '—' },
            { label: 'Model', render: (r) => <span className="text-xs opacity-60">{r.model ?? '—'}{r.input_tokens != null && ` · ${r.input_tokens}+${r.output_tokens} tok`}{r.ms != null && ` · ${(r.ms / 1000).toFixed(1)}s`}</span> },
          ]} />
        )}
      </Card>
    </div>
  )
}
