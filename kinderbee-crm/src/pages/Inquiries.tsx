import { useRef, useState } from 'react'
import { BellRing, Download, Globe, Plus, Upload } from 'lucide-react'
import { must, supabase } from '../lib/supabase'
import { exportExcel, importExcel } from '../lib/excel'
import { fmtDate, LEAD_CATEGORIES, normPhone, today } from '../lib/util'
import { Button, Card, clean, cx, Empty, FormModal, inputCls, Loading, PageHeader, Select, Table, Tabs, toast, useRows, type Field } from '../ui'

const STATUS = ['New', 'Contacted', 'Follow-up', 'Converted', 'Closed']
type Cat = (typeof LEAD_CATEGORIES)[number]['key']
type Lead = {
  id: string; category: Cat; name: string; phone: string | null; email: string | null; city: string | null; message: string | null
  source: string | null; assigned_to: string | null; follow_up: string | null; notes: string | null; status: string
  extra: Record<string, string | null>; created_at: string
}
const COMMON = ['name', 'phone', 'email', 'city', 'message', 'source', 'assigned_to', 'follow_up', 'notes', 'status']

export default function Inquiries() {
  const [cat, setCat] = useState<Cat>('ntt')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Lead | 'new' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { rows, loading, reload } = useRows<Lead>(() => supabase.from('leads').select('*').order('created_at', { ascending: false }))
  const { rows: team } = useRows<{ id: string; full_name: string }>(() => supabase.from('profiles').select('id, full_name').eq('active', true))

  const def = LEAD_CATEGORIES.find((c) => c.key === cat)!
  const t = today()
  const fields: Field[] = [
    { key: 'name', label: 'Name', required: true },
    { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+91' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'city', label: 'City' },
    ...def.extra.map(([key, label]) => ({ key: `x_${key}`, label })),
    { key: 'source', label: 'Source', type: 'select', options: ['website', 'call', 'walk-in', 'referral', 'social media', 'event'] },
    { key: 'status', label: 'Status', type: 'select', options: STATUS },
    { key: 'assigned_to', label: 'Assigned coordinator', type: 'select', options: team.map((p) => ({ value: p.id, label: p.full_name })) },
    { key: 'follow_up', label: 'Follow-up date', type: 'date' },
    { key: 'message', label: 'Message', type: 'textarea' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]
  const exportCols = [
    { key: 'date', label: 'Date' }, ...fields.filter((f) => f.key !== 'assigned_to').map((f) => ({ key: f.key, label: f.label })),
    { key: 'assigned', label: 'Assigned to' },
  ]

  const inCat = rows.filter((r) => r.category === cat)
  const shown = inCat.filter((r) => (!status || r.status === status) &&
    (!q || `${r.name} ${r.phone} ${r.city} ${r.email}`.toLowerCase().includes(q.toLowerCase())))
  const current = editing && editing !== 'new' ? editing : null
  const toRow = (v: Record<string, any>) => {
    const phone = v.phone ? normPhone(v.phone) ?? v.phone : null
    const extra = Object.fromEntries(def.extra.map(([k]) => [k, v[`x_${k}`] || null]))
    return { ...clean(v, COMMON), phone, category: cat, status: STATUS.includes(v.status) ? v.status : 'New', extra: { ...(current?.extra ?? {}), ...extra } }
  }
  const flat = (r: Lead) => ({
    ...r, ...Object.fromEntries(Object.entries(r.extra ?? {}).map(([k, v]) => [`x_${k}`, v])),
    date: fmtDate(r.created_at), assigned: team.find((p) => p.id === r.assigned_to)?.full_name ?? '',
  })

  return (
    <>
      <PageHeader icon={Globe} accent="inquiries" title="Website Inquiries" subtitle="Leads from your website forms and calls" />
      <Tabs value={cat} onChange={(k) => { setCat(k); setStatus('') }}
        tabs={LEAD_CATEGORIES.map((c) => ({ key: c.key, label: c.label, count: rows.filter((r) => r.category === c.key && r.status === 'New').length || undefined }))} />
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className={cx(inputCls, 'max-w-xs py-2')} placeholder="Search name, phone, city" value={q} onChange={(e) => setQ(e.target.value)} />
          <Select value={status} onChange={setStatus} options={STATUS} placeholder="All statuses" className="!w-40" />
          <div className="ml-auto flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ''
              if (!f) return
              try {
                const data = (await importExcel(f, fields.map((x) => ({ key: x.key, label: x.label })))).filter((r) => r.name)
                if (data.length) await must(supabase.from('leads').insert(data.map((r) => ({ ...toRow(r), assigned_to: null, source: r.source || 'import' }))))
                toast(`Imported ${data.length} leads into ${def.label}`)
                reload()
              } catch (x: any) { toast(x.message, 'error') }
            }} />
            <Button variant="soft" icon={Upload} onClick={() => fileRef.current?.click()}>Import</Button>
            <Button variant="soft" icon={Download} onClick={() => exportExcel(`leads-${cat}`, exportCols, shown.map(flat))}>Export</Button>
            <Button icon={Plus} onClick={() => setEditing('new')}>Add lead</Button>
          </div>
        </div>
        {loading ? <Loading /> : (
          <Table rows={shown} rowKey={(r) => r.id} onRow={setEditing}
            empty={<Empty title={`No ${def.label} leads yet`} text="Leads from your website land here automatically once the form endpoint is connected." />}
            cols={[
              { label: 'Lead', render: (r) => <><p className="font-semibold">{r.name}</p><p className="text-xs opacity-60">{[r.phone, r.city].filter(Boolean).join(' · ')}</p></> },
              { label: def.extra[0][1], render: (r) => r.extra?.[def.extra[0][0]] ?? '—' },
              { label: 'Assigned', render: (r) => team.find((p) => p.id === r.assigned_to)?.full_name ?? <span className="opacity-40">Unassigned</span> },
              { label: 'Follow-up', render: (r) => r.follow_up ? (
                <span className={cx('inline-flex items-center gap-1', r.follow_up <= t && !['Converted', 'Closed'].includes(r.status) && 'font-bold text-rose-ink')}>
                  {r.follow_up <= t && !['Converted', 'Closed'].includes(r.status) && <BellRing className="h-3.5 w-3.5" />}{fmtDate(r.follow_up)}
                </span>
              ) : '—' },
              { label: 'Received', render: (r) => fmtDate(r.created_at) },
              { label: 'Status', render: (r) => (
                <span onClick={(e) => e.stopPropagation()}>
                  <Select value={r.status} options={STATUS} className="!w-36 !rounded-full !py-1 text-sm" onChange={async (s) => {
                    const { error } = await supabase.from('leads').update({ status: s }).eq('id', r.id)
                    if (error) toast(error.message, 'error'); else reload()
                  }} />
                </span>
              ) },
            ]} />
        )}
      </Card>
      <FormModal open={!!editing} onClose={() => setEditing(null)} wide title={current ? current.name : `New ${def.label} lead`}
        fields={fields} initial={current ? flat(current) : { status: 'New', source: 'call' }}
        onSubmit={async (v) => {
          if (current) await must(supabase.from('leads').update(toRow(v)).eq('id', current.id))
          else await must(supabase.from('leads').insert(toRow(v)))
          toast('Lead saved')
          reload()
        }} />
    </>
  )
}
