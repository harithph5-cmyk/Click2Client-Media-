import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BadgeCheck, CheckCircle2, CreditCard, Download, FileDown, FileText, History, Plus, UserPlus, XCircle } from 'lucide-react'
import { useAuth } from '../auth'
import { brand } from '../config/brand'
import { must, openFile, sendWhatsApp, supabase, upload } from '../lib/supabase'
import { exportExcel } from '../lib/excel'
import { salarySlip } from '../lib/pdf'
import { fmtDate, inr, monthLabel, monthStart, normPhone, SERVICES, today } from '../lib/util'
import { Button, Card, cx, Empty, FormModal, inputCls, Label, Loading, Modal, PageHeader, Pill, Select, Table, toast, useRows } from '../ui'

export type Staff = {
  id: string; name: string; role: string | null; phone: string | null; joining_date: string | null; bank_account_name: string | null
  account_no: string | null; ifsc: string | null; upi: string | null; monthly_salary: number; active: boolean
  qualification: string | null; experience: string | null
}
type Salary = { id: string; staff_id: string; month: string; amount: number; deductions: number; bonus: number; paid_on: string; mode: string; slip_path: string | null }
export type ServicePayment = {
  id: string; payer_name: string; phone: string | null; service: string; amount: number; mode: string; reference: string | null
  paid_on: string; proof_path: string | null; status: string; reject_reason: string | null; verified_by: string | null; verified_at: string | null; created_at: string
  website_payment_id: string | null; extra: Record<string, string | null> | null
}
const MODES = ['upi', 'bank', 'cash', 'cheque', 'card']
const DEFAULT_RECEIVED = 'Hi {name}, we have received your payment of ₹{amount} for {service} on {date}. Ref: {ref}. Thank you – Team Kinderbee 🐝'

// Service payments and their verification live in the Website page (website payments arrive there).
export default function Payments() {
  return (
    <>
      <PageHeader icon={CreditCard} accent="payments" title="Payments" subtitle="Staff salaries and payslips" />
      <Salaries />
    </>
  )
}

function Salaries() {
  const nav = useNavigate()
  const staff = useRows<Staff>(() => supabase.from('staff').select('*').order('name'))
  const pay = useRows<Salary>(() => supabase.from('salary_payments').select('*').order('month', { ascending: false }))
  const [month, setMonth] = useState(today().slice(0, 7))
  const [paying, setPaying] = useState<Staff | null>(null)
  const [history, setHistory] = useState<Staff | null>(null)
  const m = monthStart(month)
  const active = staff.rows.filter((s) => s.active)
  const paidFor = (id: string) => pay.rows.find((p) => p.staff_id === id && p.month === m)
  const net = (p: Salary) => Number(p.amount) + Number(p.bonus) - Number(p.deductions)

  async function slip(s: Staff, p: Salary) {
    const blob = await salarySlip({ staff: s, ...p })
    const path = await upload('payments', blob, `slips/${s.id}/${p.month.slice(0, 7)}.pdf`)
    await must(supabase.from('salary_payments').update({ slip_path: path }).eq('id', p.id))
    return path
  }

  if (staff.loading || pay.loading) return <Loading />
  return (
    <>
      <Card>
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <Label label="Payroll month"><input type="month" className={cx(inputCls, 'w-48 py-2')} value={month} onChange={(e) => setMonth(e.target.value)} /></Label>
          <p className="pb-2 text-sm opacity-60">
            {active.filter((s) => paidFor(s.id)).length}/{active.length} paid · {inr(active.reduce((a, s) => a + (paidFor(s.id) ? net(paidFor(s.id)!) : 0), 0))} disbursed
          </p>
          <div className="ml-auto flex gap-2">
            <Button variant="soft" icon={Download} onClick={() => exportExcel(`payroll-${month}`,
              [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'salary', label: 'Salary' }, { key: 'bonus', label: 'Bonus' }, { key: 'deductions', label: 'Deductions' }, { key: 'net', label: 'Net' }, { key: 'paid_on', label: 'Paid on' }, { key: 'mode', label: 'Mode' }, { key: 'bank', label: 'Account' }, { key: 'ifsc', label: 'IFSC' }],
              active.map((s) => { const p = paidFor(s.id); return { ...s, salary: p?.amount ?? s.monthly_salary, bonus: p?.bonus ?? '', deductions: p?.deductions ?? '', net: p ? net(p) : '', paid_on: p ? fmtDate(p.paid_on) : 'UNPAID', mode: p?.mode ?? '', bank: s.account_no } }))}>Export</Button>
            <Button icon={UserPlus} onClick={() => nav('/staff')}>Add / edit staff</Button>
          </div>
        </div>
        <Table rows={staff.rows} rowKey={(r) => r.id}
          empty={<Empty title="No staff yet" text="Add teachers and staff under Teachers & Staff to run payroll." />}
          cols={[
            { label: 'Staff', render: (r) => <><p className={cx('font-semibold', !r.active && 'line-through opacity-50')}>{r.name}</p><p className="text-xs opacity-60">{[r.role, r.qualification, r.experience, r.phone].filter(Boolean).join(' · ')}</p></> },
            { label: 'Salary', render: (r) => inr(r.monthly_salary) },
            { label: monthLabel(m), render: (r) => { const p = paidFor(r.id); return p ? <><Pill s="Paid" /> <span className="text-xs opacity-60">{inr(net(p))} · {fmtDate(p.paid_on)}</span></> : r.active ? <Pill s="Due" /> : '—' } },
            { label: '', className: 'text-right', render: (r) => {
              const p = paidFor(r.id)
              return (
                <div className="flex justify-end gap-1">
                  {p ? <Button size="sm" variant="soft" icon={FileDown} onClick={async () => {
                    try { await openFile(p.slip_path ?? await slip(r, p)) } catch (e: any) { toast(e.message, 'error') }
                  }}>Slip</Button> : r.active && <Button size="sm" onClick={() => setPaying(r)}>Mark paid</Button>}
                  <Button size="sm" variant="ghost" icon={History} onClick={() => setHistory(r)} aria-label="Salary history" />
                </div>
              )
            } },
          ]} />
      </Card>

      <FormModal open={!!paying} onClose={() => setPaying(null)} title={`Pay ${paying?.name} · ${monthLabel(m)}`} submitLabel="Mark paid & create slip"
        initial={{ amount: paying?.monthly_salary, deductions: 0, bonus: 0, paid_on: today(), mode: 'bank' }}
        fields={[
          { key: 'amount', label: 'Gross salary (₹)', type: 'number', required: true },
          { key: 'paid_on', label: 'Paid on', type: 'date', required: true },
          { key: 'bonus', label: 'Bonus (₹)', type: 'number' },
          { key: 'deductions', label: 'Deductions (₹)', type: 'number' },
          { key: 'mode', label: 'Mode', type: 'select', options: ['bank', 'upi', 'cash', 'cheque'], required: true },
        ]}
        onSubmit={async (v) => {
          const p = await must(supabase.from('salary_payments').insert({
            staff_id: paying!.id, month: m, amount: Number(v.amount), bonus: Number(v.bonus) || 0,
            deductions: Number(v.deductions) || 0, paid_on: v.paid_on, mode: v.mode,
          }).select('*').single())
          await slip(paying!, p as Salary).catch((e) => toast('Saved, but slip upload failed: ' + e.message, 'error'))
          toast('Salary marked paid')
          pay.reload()
        }} />

      <Modal open={!!history} onClose={() => setHistory(null)} title={`Salary history · ${history?.name}`} wide>
        <Table rows={pay.rows.filter((p) => p.staff_id === history?.id)} rowKey={(r) => r.id}
          empty={<Empty title="No salary paid yet" />}
          cols={[
            { label: 'Month', render: (r) => monthLabel(r.month) },
            { label: 'Gross', render: (r) => inr(r.amount) },
            { label: '+ Bonus', render: (r) => inr(r.bonus) },
            { label: '− Deductions', render: (r) => inr(r.deductions) },
            { label: 'Net', render: (r) => <b>{inr(net(r))}</b> },
            { label: 'Paid on', render: (r) => fmtDate(r.paid_on) },
            { label: '', render: (r) => <Button size="sm" variant="soft" icon={FileDown} onClick={async () => {
              try { await openFile(r.slip_path ?? await slip(history!, r)) } catch (e: any) { toast(e.message, 'error') }
            }}>Slip</Button> },
          ]} />
      </Modal>
    </>
  )
}

export function Services({ rows, loading, reload }: { rows: ServicePayment[]; loading: boolean; reload: () => void }) {
  const [adding, setAdding] = useState(false)
  const [service, setService] = useState('')
  const [status, setStatus] = useState('')
  const shown = rows.filter((r) => (!service || r.service === service) && (!status || r.status === status))
  const cols = [['payer_name', 'Payer'], ['phone', 'Phone'], ['service', 'Service'], ['amount', 'Amount'], ['mode', 'Mode'], ['reference', 'Ref'], ['paid_on', 'Date'], ['status', 'Status'], ['reject_reason', 'Reject reason']]
  return (
    <Card>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={service} onChange={setService} options={SERVICES} placeholder="All services" className="!w-56" />
        <Select value={status} onChange={setStatus} options={['Pending', 'Verified', 'Rejected']} placeholder="All statuses" className="!w-40" />
        <div className="ml-auto flex gap-2">
          <Button variant="soft" icon={Download} onClick={() => exportExcel('service-payments', cols.map(([key, label]) => ({ key, label })), shown.map((r) => ({ ...r, paid_on: fmtDate(r.paid_on) })))}>Export</Button>
          <Button icon={Plus} onClick={() => setAdding(true)}>Record payment</Button>
        </div>
      </div>
      {loading ? <Loading /> : (
        <Table rows={shown} rowKey={(r) => r.id}
          empty={<Empty title="No service payments yet" text="Record franchise, NTT and consultation payments here for the CEO to verify." />}
          cols={[
            { label: 'Payer', render: (r) => <><p className="font-semibold">{r.payer_name}</p><p className="text-xs opacity-60">{r.phone}</p></> },
            { label: 'Service', render: (r) => <><p>{r.service}</p>{r.extra?.programme && <p className="text-xs opacity-60">{r.extra.programme}</p>}</> },
            { label: 'Amount', render: (r) => <b>{inr(r.amount)}</b> },
            { label: 'Mode / Ref', render: (r) => <span className="text-sm"><span className="uppercase">{r.mode}</span> · {r.reference ?? '—'}</span> },
            { label: 'Date', render: (r) => fmtDate(r.paid_on) },
            { label: 'Status', render: (r) => <span title={r.reject_reason ?? undefined}><Pill s={r.status} /></span> },
            { label: '', render: (r) => r.proof_path && <Button size="sm" variant="ghost" icon={FileText} onClick={() => openFile(r.proof_path!)}>Proof</Button> },
          ]} />
      )}
      <FormModal open={adding} onClose={() => setAdding(false)} title="Record service payment" submitLabel="Send for verification"
        initial={{ paid_on: today(), mode: 'upi' }}
        fields={[
          { key: 'payer_name', label: 'Payer name', required: true },
          { key: 'phone', label: 'WhatsApp no.', type: 'tel', required: true },
          { key: 'service', label: 'Service', type: 'select', options: SERVICES, required: true },
          { key: 'amount', label: 'Amount (₹)', type: 'number', required: true },
          { key: 'mode', label: 'Mode', type: 'select', options: MODES, required: true },
          { key: 'reference', label: 'Transaction ref.' },
          { key: 'paid_on', label: 'Date', type: 'date', required: true },
          { key: 'proof', label: 'Payment proof', type: 'file' },
        ]}
        onSubmit={async (v) => {
          const phone = normPhone(v.phone)
          if (!phone) throw new Error('Enter a valid 10-digit Indian mobile number')
          if (!(Number(v.amount) > 0)) throw new Error('Amount must be more than zero')
          const proof_path = v.proof instanceof File ? await upload('payments', v.proof) : null
          await must(supabase.from('service_payments').insert({
            payer_name: v.payer_name, phone, service: v.service, amount: Number(v.amount), mode: v.mode,
            reference: v.reference || null, paid_on: v.paid_on, proof_path,
          }))
          toast('Sent to the verification queue')
          reload()
        }} />
    </Card>
  )
}

// A payment that came from the website is also marked on the website, which unlocks the course or confirms the
// consultation booking there. A failure only warns: the CRM record is already verified.
async function syncWebsite(p: ServicePayment, status: 'verified' | 'rejected', notes?: string) {
  if (!p.website_payment_id) return
  try {
    const { data } = await supabase.auth.getSession()
    const r = await fetch(`${brand.websiteUrl}/api/payments/${encodeURIComponent(p.website_payment_id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token}` },
      body: JSON.stringify(notes ? { status, notes } : { status }),
    })
    if (!r.ok) throw new Error(`website replied ${r.status}`)
  } catch (e: any) {
    toast(`Saved here, but the website could not be updated (${e.message}). Update it in the website admin too.`, 'error')
  }
}

export function Verify({ rows, reload, loading }: { rows: ServicePayment[]; reload: () => void; loading: boolean }) {
  const { canVerify } = useAuth()
  const [rejecting, setRejecting] = useState<ServicePayment | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [wa, setWa] = useState<{ name: string; url: string } | null>(null) // click-to-send fallback

  async function verify(p: ServicePayment) {
    setBusy(p.id)
    try {
      await must(supabase.rpc('verify_service_payment', { p_id: p.id, p_ok: true }))
      await syncWebsite(p, 'verified')
      const { data: tpl } = await supabase.from('message_templates').select('*').eq('name', 'Payment received').maybeSingle()
      const res = await sendWhatsApp([{
        phone: p.phone!,
        template: tpl ?? { name: 'Payment received', body: DEFAULT_RECEIVED },
        vars: { name: p.payer_name, amount: Number(p.amount).toLocaleString('en-IN'), service: p.service, date: fmtDate(p.paid_on), ref: p.reference ?? '—' },
      }])
      if (res.mode === 'links') setWa({ name: p.payer_name, url: res.links[0].url })
      else if (res.results[0].status === 'failed') toast(`Verified, but WhatsApp failed: ${res.results[0].error}`, 'error')
      else toast('Verified · WhatsApp confirmation sent')
      reload()
    } catch (e: any) { toast(e.message, 'error') } finally { setBusy('') }
  }

  const waModal = (
    <Modal open={!!wa} onClose={() => setWa(null)} title="Payment verified ✅">
      <p className="mb-4 text-sm">The WhatsApp API isn't set up, so send {wa?.name}'s confirmation with one tap:</p>
      <a href={wa?.url} target="_blank" rel="noreferrer" onClick={() => setWa(null)}
        className="flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 font-semibold text-white">Open WhatsApp</a>
    </Modal>
  )
  if (loading) return <Loading />
  if (!rows.length) return <><Card><Empty title="Queue is clear" text="New service payments wait here until they're verified." /></Card>{waModal}</>
  return (
    <>
      {waModal}
      {!canVerify && <p className="mb-3 rounded-2xl bg-sky p-3 text-sm text-sky-ink">You can see the queue, but only the CEO or a coordinator with verify permission can approve payments.</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((p) => (
          <Card key={p.id} className="relative overflow-hidden">
            <span className="hex absolute -right-5 -top-5 h-20 w-20 bg-sky/70 dark:bg-sky/15" />
            <p className="relative text-xs font-bold uppercase tracking-wide opacity-50">{p.service}{p.website_payment_id && ' · from website'}</p>
            {p.extra?.programme && <p className="relative text-xs opacity-60">{p.extra.programme}</p>}
            <p className="relative font-display text-2xl">{inr(p.amount)}</p>
            <p className="font-semibold">{p.payer_name}</p>
            <p className="text-sm opacity-60">{p.phone} · <span className="uppercase">{p.mode}</span> · {p.reference ?? 'no ref'} · {fmtDate(p.paid_on)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {p.proof_path && <Button size="sm" variant="soft" icon={FileText} onClick={() => openFile(p.proof_path!)}>Proof</Button>}
              {canVerify && <>
                <Button size="sm" icon={CheckCircle2} loading={busy === p.id} onClick={() => verify(p)}>Verify</Button>
                <Button size="sm" variant="ghost" icon={XCircle} onClick={() => { setRejecting(p); setReason('') }}>Reject</Button>
              </>}
            </div>
          </Card>
        ))}
      </div>
      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title="Reject payment">
        <p className="mb-2 text-sm">{rejecting?.payer_name} · {inr(rejecting?.amount)} · {rejecting?.service}</p>
        <Label label="Reason *"><textarea className={inputCls} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Amount not received in bank" /></Label>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
          <Button variant="danger" icon={BadgeCheck} disabled={!reason.trim()} onClick={async () => {
            const { error } = await supabase.rpc('verify_service_payment', { p_id: rejecting!.id, p_ok: false, p_reason: reason.trim() })
            if (error) return toast(error.message, 'error')
            await syncWebsite(rejecting!, 'rejected', reason.trim())
            toast('Payment rejected')
            setRejecting(null)
            reload()
          }}>Reject payment</Button>
        </div>
      </Modal>
    </>
  )
}
