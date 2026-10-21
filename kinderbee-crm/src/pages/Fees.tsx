import { useMemo, useState } from 'react'
import { Download, FileDown, Pencil, Plus, Receipt, Trash2, Wallet } from 'lucide-react'
import { useAuth } from '../auth'
import { must, openFile, supabase, upload } from '../lib/supabase'
import { exportExcel } from '../lib/excel'
import { feeReceipt } from '../lib/pdf'
import { allDues, fmtDate, inr, studentDues, today, type FeeComponent } from '../lib/util'
import { Button, Card, cx, Empty, FormModal, inputCls, Kpi, Label, Loading, PageHeader, Pill, Select, Table, Tabs, toast, useRows } from '../ui'
import type { Student } from './Admissions'

type Payment = {
  id: string; receipt_no: number; student_id: string; component_id: string | null; amount: number; mode: string
  reference: string | null; paid_on: string; receipt_path: string | null; created_by: string | null
}
const MODES = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'bank', label: 'Bank transfer' }, { value: 'cheque', label: 'Cheque' }]
const DEFAULT_COMPONENTS = ['Term 1', 'Term 2', 'Term 3', 'Uniform Kit', 'Books (optional)']

export default function Fees() {
  const { isCeo } = useAuth()
  const [tab, setTab] = useState<'collect' | 'structure' | 'reports'>('collect')
  // ponytail: loads every student/payment client-side; fine for a few thousand rows, move dues into a SQL view beyond that
  const students = useRows<Student>(() => supabase.from('students').select('*').eq('active', true).order('name'))
  const comps = useRows<FeeComponent>(() => supabase.from('fee_components').select('*').order('sort'))
  const pays = useRows<Payment>(() => supabase.from('fee_payments').select('*').order('paid_on', { ascending: false }))
  const data = { students: students.rows, comps: comps.rows, pays: pays.rows, reload: () => { comps.reload(); pays.reload() } }
  const loading = students.loading || comps.loading || pays.loading

  return (
    <>
      <PageHeader icon={Wallet} accent="fees" title="Fees" subtitle="Collect, track and report school fees" />
      <Tabs value={tab} onChange={setTab} tabs={[
        { key: 'collect', label: 'Fee collection' },
        ...(isCeo ? [{ key: 'structure' as const, label: 'Fee structure' }] : []),
        { key: 'reports', label: 'Reports' },
      ]} />
      {loading ? <Loading /> : tab === 'collect' ? <Collect {...data} /> : tab === 'structure' ? <Structure {...data} /> : <Reports {...data} />}
    </>
  )
}

type Data = { students: Student[]; comps: FeeComponent[]; pays: Payment[]; reload: () => void }

function Collect({ students, comps, pays, reload }: Data) {
  const { profile } = useAuth()
  const [q, setQ] = useState('')
  const [sid, setSid] = useState('')
  const [paying, setPaying] = useState<string | null>(null) // component id
  const student = students.find((s) => s.id === sid)
  const myComps = comps.filter((c) => c.program === student?.program && c.academic_year === student?.academic_year)
  const myPays = pays.filter((p) => p.student_id === sid)
  const dues = studentDues(myComps, myPays)
  const matches = q ? students.filter((s) => `${s.name} ${s.parent_name} ${s.parent_phone}`.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : []

  async function receipt(p: Payment) {
    const c = comps.find((x) => x.id === p.component_id)
    const s = students.find((x) => x.id === p.student_id)!
    await feeReceipt({
      receipt_no: p.receipt_no, paid_on: p.paid_on, student: s.name, program: s.program, parent: s.parent_name,
      component: c?.name ?? 'Fee', amount: p.amount, mode: p.mode, reference: p.reference, collected_by: profile!.full_name,
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <Label label="Find student">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a name or phone" />
        </Label>
        <ul className="mt-2 space-y-1">
          {matches.map((s) => (
            <li key={s.id}>
              <button onClick={() => { setSid(s.id); setQ('') }} className="w-full rounded-2xl px-3 py-2 text-left hover:bg-peach/50 dark:hover:bg-peach/10">
                <b>{s.name}</b> <span className="text-xs opacity-60">· {s.program}</span>
              </button>
            </li>
          ))}
        </ul>
        {student && (
          <div className="mt-3 rounded-3xl bg-peach/50 p-4 dark:bg-peach/10">
            <p className="font-display text-xl">{student.name}</p>
            <p className="text-sm opacity-70">{student.program} · {student.academic_year}</p>
            <p className="text-sm opacity-70">{student.parent_name} · {student.parent_phone}</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div><p className="text-xs opacity-60">Due</p><p className="font-bold">{inr(dues.due)}</p></div>
              <div><p className="text-xs opacity-60">Paid</p><p className="font-bold text-mint-ink">{inr(dues.paid)}</p></div>
              <div><p className="text-xs opacity-60">Balance</p><p className="font-bold text-rose-ink">{inr(dues.balance)}</p></div>
            </div>
          </div>
        )}
      </Card>
      <Card className="lg:col-span-2">
        {!student ? <Empty title="Pick a student" text="Search on the left to see their fee breakdown and record a payment." /> : !myComps.length ? (
          <Empty title="No fee structure yet" text={`The CEO needs to set fees for ${student.program}, ${student.academic_year}.`} />
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg">Fee breakdown</h2>
              <Button icon={Plus} onClick={() => setPaying(dues.lines.find((l) => l.balance > 0)?.id ?? myComps[0].id)}>Record payment</Button>
            </div>
            <Table rows={dues.lines} rowKey={(r) => r.id} cols={[
              { label: 'Component', render: (r) => <><p className="font-semibold">{r.name}</p>{r.monthly && <p className="text-xs opacity-60">{inr(r.amount)}/month</p>}</> },
              { label: 'Due date', render: (r) => fmtDate(r.due_date) },
              { label: 'Due', render: (r) => inr(r.due) },
              { label: 'Paid', render: (r) => inr(r.paid) },
              { label: 'Balance', render: (r) => <b>{inr(r.balance)}</b> },
              { label: '', render: (r) => r.balance === 0 ? <Pill s="Paid" /> : r.overdue ? <Pill s="Overdue" /> : <Pill s="Due" /> },
            ]} />
            <h2 className="mb-2 mt-6 font-display text-lg">Payment history</h2>
            <Table rows={myPays} rowKey={(r) => r.id} empty={<p className="py-4 text-sm opacity-50">No payments yet.</p>} cols={[
              { label: 'Receipt', render: (r) => `KB-${String(r.receipt_no).padStart(6, '0')}` },
              { label: 'Date', render: (r) => fmtDate(r.paid_on) },
              { label: 'For', render: (r) => comps.find((c) => c.id === r.component_id)?.name ?? '—' },
              { label: 'Mode', render: (r) => <span className="uppercase">{r.mode}</span> },
              { label: 'Amount', render: (r) => <b>{inr(r.amount)}</b> },
              { label: '', className: 'text-right', render: (r) => (
                <div className="flex justify-end gap-1">
                  {r.receipt_path && <Button size="sm" variant="ghost" onClick={() => openFile(r.receipt_path!)}>Photo</Button>}
                  <Button size="sm" variant="soft" icon={FileDown} onClick={() => receipt(r)}>PDF</Button>
                </div>
              ) },
            ]} />
          </>
        )}
      </Card>
      <FormModal open={!!paying} onClose={() => setPaying(null)} title={`Record payment · ${student?.name}`} submitLabel="Save & download receipt"
        initial={{ component_id: paying, amount: dues.lines.find((l) => l.id === paying)?.balance || '', mode: 'cash', paid_on: today() }}
        fields={[
          { key: 'component_id', label: 'Component', type: 'select', required: true, options: myComps.map((c) => ({ value: c.id, label: c.name })) },
          { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
          { key: 'mode', label: 'Mode', type: 'select', options: MODES, required: true },
          { key: 'reference', label: 'Reference no.', placeholder: 'UPI / cheque / txn no.' },
          { key: 'paid_on', label: 'Date', type: 'date', required: true },
          { key: 'receipt', label: 'Receipt photo', type: 'file', accept: 'image/*,application/pdf' },
        ]}
        onSubmit={async (v) => {
          if (!(Number(v.amount) > 0)) throw new Error('Amount must be more than zero')
          const receipt_path = v.receipt instanceof File ? await upload('fees', v.receipt) : null
          const p = await must(supabase.from('fee_payments').insert({
            student_id: sid, component_id: v.component_id, amount: Number(v.amount), mode: v.mode,
            reference: v.reference || null, paid_on: v.paid_on, receipt_path,
          }).select('*').single())
          toast(`${inr(p.amount)} recorded`)
          reload()
          await receipt(p as Payment)
        }} />
    </div>
  )
}

function Structure({ comps, students, reload }: Data) {
  const { settings } = useAuth()
  const [program, setProgram] = useState(settings.programs[0])
  const [year, setYear] = useState(settings.academic_year)
  const [editing, setEditing] = useState<FeeComponent | 'new' | null>(null)
  const list = comps.filter((c) => c.program === program && c.academic_year === year).sort((a, b) => a.sort - b.sort)
  const current = editing && editing !== 'new' ? editing : null
  const years = [...new Set([settings.academic_year, ...comps.map((c) => c.academic_year)])].sort()
  const total = list.reduce((s, c) => s + Number(c.amount) * (c.monthly ? 12 : 1), 0)

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Label label="Program"><Select value={program} onChange={setProgram} options={settings.programs} className="!w-48" /></Label>
        <Label label="Academic year">
          <input className={cx(inputCls, 'w-32 py-2')} list="years" value={year} onChange={(e) => setYear(e.target.value)} />
          <datalist id="years">{years.map((y) => <option key={y} value={y} />)}</datalist>
        </Label>
        <div className="ml-auto flex gap-2">
          {!list.length && (
            <Button variant="soft" onClick={async () => {
              await must(supabase.from('fee_components').insert(DEFAULT_COMPONENTS.map((name, i) => ({
                program, academic_year: year, name, amount: 0, monthly: name.startsWith('Monthly'), sort: i + 1,
              }))))
              reload()
            }}>Add standard components</Button>
          )}
          <Button icon={Plus} onClick={() => setEditing('new')}>Custom component</Button>
        </div>
      </div>
      <Table rows={list} rowKey={(r) => r.id} onRow={setEditing}
        empty={<Empty title="No fees set for this program yet" text="Start with the standard components, then fill in the amounts." />}
        cols={[
          { label: 'Component', render: (r) => <b>{r.name}</b> },
          { label: 'Amount', render: (r) => <>{inr(r.amount)}{r.monthly && <span className="text-xs opacity-60"> / month</span>}{r.optional && <span className="text-xs opacity-60"> · optional</span>}</> },
          { label: 'Due date', render: (r) => fmtDate(r.due_date) + (r.monthly ? ' (first)' : '') },
          { label: '', className: 'text-right', render: (r) => (
            <span onClick={(e) => e.stopPropagation()} className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(r)} aria-label="Edit" />
              <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete" onClick={async () => {
                if (!confirm(`Delete ${r.name}? Payments already recorded against it are kept.`)) return
                const { error } = await supabase.from('fee_components').delete().eq('id', r.id)
                if (error) toast(error.message, 'error'); else reload()
              }} />
            </span>
          ) },
        ]} />
      {!!list.length && <p className="mt-3 text-right text-sm">Yearly total per student: <b>{inr(total)}</b> · {students.filter((s) => s.program === program && s.academic_year === year).length} students</p>}
      <FormModal open={!!editing} onClose={() => setEditing(null)} title={current ? `Edit ${current.name}` : 'New fee component'}
        initial={current ?? { sort: list.length + 1 }}
        fields={[
          { key: 'name', label: 'Name', required: true, full: true },
          { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
          { key: 'due_date', label: 'Due date', type: 'date' },
          { key: 'sort', label: 'Display order', type: 'number' },
          { key: 'monthly', label: 'Charged every month (amount is per month)', type: 'checkbox' },
          { key: 'optional', label: 'Optional (only owed if the parent buys it)', type: 'checkbox' },
        ]}
        onSubmit={async (v) => {
          const row = { name: v.name, amount: Number(v.amount), due_date: v.due_date || null, sort: Number(v.sort) || 0, monthly: !!v.monthly, optional: !!v.optional, program, academic_year: year }
          if (current) await must(supabase.from('fee_components').update(row).eq('id', current.id))
          else await must(supabase.from('fee_components').insert(row))
          reload()
        }} />
    </Card>
  )
}

function Reports({ students, comps, pays }: Data) {
  const [r, setR] = useState<'pending' | 'overdue' | 'collection'>('pending')
  const [program, setProgram] = useState('')
  const [from, setFrom] = useState(today().slice(0, 8) + '01')
  const [to, setTo] = useState(today())
  const { settings } = useAuth()
  const dues = useMemo(() => allDues(students.filter((s) => !program || s.program === program), comps, pays), [students, comps, pays, program])

  const pending = dues.filter((d) => d.balance > 0).map((d) => ({
    id: d.student.id, name: d.student.name, program: d.student.program, parent: d.student.parent_name, phone: d.student.parent_phone,
    due: d.due, paid: d.paid, balance: d.balance, overdue: d.overdue,
  }))
  const overdue = dues.flatMap((d) => d.lines.filter((l) => l.overdue).map((l) => ({
    id: d.student.id + l.id, name: d.student.name, program: d.student.program, phone: d.student.parent_phone,
    component: l.name, due_date: l.due_date, balance: l.balance, days: l.due_date ? Math.floor((Date.parse(today()) - Date.parse(l.due_date)) / 864e5) : 0,
  }))).sort((a, b) => b.days - a.days)
  const collection = pays.filter((p) => p.paid_on >= from && p.paid_on <= to).map((p) => {
    const s = students.find((x) => x.id === p.student_id)
    return {
      id: p.id, receipt: `KB-${String(p.receipt_no).padStart(6, '0')}`, date: fmtDate(p.paid_on), name: s?.name ?? '(left school)',
      program: s?.program ?? '', component: comps.find((c) => c.id === p.component_id)?.name ?? '', mode: p.mode.toUpperCase(),
      reference: p.reference ?? '', amount: Number(p.amount),
    }
  }).filter((p) => !program || p.program === program)
  const byMode = MODES.map((m) => ({ ...m, total: collection.filter((c) => c.mode === m.value.toUpperCase()).reduce((s, c) => s + c.amount, 0) }))

  const configs = {
    pending: { rows: pending, cols: [['name', 'Student'], ['program', 'Program'], ['parent', 'Parent'], ['phone', 'Phone'], ['due', 'Due to date'], ['paid', 'Paid'], ['balance', 'Balance'], ['overdue', 'Overdue']] },
    overdue: { rows: overdue, cols: [['name', 'Student'], ['program', 'Program'], ['phone', 'Phone'], ['component', 'Component'], ['due_date', 'Due date'], ['days', 'Days late'], ['balance', 'Balance']] },
    collection: { rows: collection, cols: [['receipt', 'Receipt'], ['date', 'Date'], ['name', 'Student'], ['program', 'Program'], ['component', 'Component'], ['mode', 'Mode'], ['reference', 'Reference'], ['amount', 'Amount']] },
  } as const
  const cfg = configs[r]
  const money = ['due', 'paid', 'balance', 'overdue', 'amount']

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Wallet} accent="fees" label="Pending balance" value={inr(pending.reduce((s, p) => s + p.balance, 0))} />
        <Kpi icon={Receipt} accent="attendance" label="Overdue now" value={inr(pending.reduce((s, p) => s + p.overdue, 0))} hint={`${new Set(overdue.map((o) => o.name)).size} students`} />
        <Kpi icon={Download} accent="admissions" label="Collected in range" value={inr(collection.reduce((s, c) => s + c.amount, 0))} hint={`${collection.length} payments`} />
        <Card><p className="mb-1 text-xs font-bold uppercase opacity-50">By mode (range)</p>{byMode.map((m) => <p key={m.value} className="flex justify-between text-sm"><span>{m.label}</span><b>{inr(m.total)}</b></p>)}</Card>
      </div>
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Tabs value={r} onChange={setR} tabs={[{ key: 'pending', label: 'Pending dues' }, { key: 'overdue', label: 'Overdue list' }, { key: 'collection', label: 'Collection by date' }]} />
          <Select value={program} onChange={setProgram} options={settings.programs} placeholder="All programs" className="!w-44" />
          {r === 'collection' && <>
            <input type="date" className={cx(inputCls, 'w-40 py-2')} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <input type="date" className={cx(inputCls, 'w-40 py-2')} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </>}
          <Button className="ml-auto" variant="soft" icon={Download}
            onClick={() => exportExcel(`fees-${r}-${today()}`, cfg.cols.map(([key, label]) => ({ key, label })), cfg.rows as any)}>Export</Button>
        </div>
        <Table rows={cfg.rows as any[]} rowKey={(x) => x.id} empty={<Empty title="Nothing to show" text="All clear for this filter 🎉" />}
          cols={cfg.cols.map(([key, label]) => ({
            label,
            render: (x: any) => money.includes(key) ? <span className={key === 'overdue' && x[key] > 0 ? 'font-bold text-rose-ink' : ''}>{inr(x[key])}</span>
              : key === 'due_date' ? fmtDate(x[key]) : x[key] ?? '—',
          }))} />
      </Card>
    </>
  )
}
