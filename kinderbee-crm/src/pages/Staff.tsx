import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck, CreditCard, Pencil, UserPlus, Users } from 'lucide-react'
import { must, supabase } from '../lib/supabase'
import { fmtDate, inr, monthLabel, monthStart, normPhone, today } from '../lib/util'
import { Button, Card, clean, cx, Empty, FormModal, Loading, PageHeader, Pill, Table, toast, useRows, type Field } from '../ui'
import type { Staff } from './Payments'

// Teachers & staff: the one place to add and edit people. Attendance and Payroll use this same list.
const FIELDS: Field[] = [
  { key: 'name', label: 'Name', required: true }, { key: 'role', label: 'Designation', placeholder: 'Teacher, Nanny, Coordinator…' },
  { key: 'phone', label: 'Mobile no.', type: 'tel' }, { key: 'joining_date', label: 'Date of joining', type: 'date' },
  { key: 'qualification', label: 'Qualification' }, { key: 'experience', label: 'Experience', placeholder: '10 years, Fresher…' },
  { key: 'monthly_salary', label: 'Monthly salary (₹)', type: 'number', required: true },
  { key: 'bank_account_name', label: 'Bank account name' }, { key: 'account_no', label: 'Account no.' },
  { key: 'ifsc', label: 'IFSC' }, { key: 'upi', label: 'UPI ID' },
  { key: 'active', label: 'Currently working here (untick when someone leaves)', type: 'checkbox' },
]

export default function StaffPage() {
  const nav = useNavigate()
  const month = today().slice(0, 7)
  const staff = useRows<Staff>(() => supabase.from('staff').select('*').order('name'))
  const marks = useRows<{ staff_id: string; status: string }>(() =>
    supabase.from('staff_attendance').select('staff_id, status').gte('day', `${month}-01`).lte('day', today()))
  const paid = useRows<{ staff_id: string }>(() => supabase.from('salary_payments').select('staff_id').eq('month', monthStart(month)))
  const [editing, setEditing] = useState<Staff | 'new' | null>(null)
  const [showLeft, setShowLeft] = useState(false)
  const current = editing && editing !== 'new' ? editing : null

  const attendance = (id: string) => {
    const mine = marks.rows.filter((m) => m.staff_id === id)
    const present = mine.filter((m) => m.status === 'P').length + mine.filter((m) => m.status === 'H').length * 0.5
    return mine.length ? { days: mine.length, pct: Math.round((present / mine.length) * 100) } : null
  }
  const shown = staff.rows.filter((s) => showLeft || s.active)
  const left = staff.rows.length - staff.rows.filter((s) => s.active).length

  return (
    <>
      <PageHeader icon={Users} accent="payments" title="Teachers & Staff" subtitle="Add and edit teachers and staff. Mark their attendance and pay salaries from here."
        actions={<Button icon={UserPlus} onClick={() => setEditing('new')}>Add teacher / staff</Button>} />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <p className="text-sm opacity-60">{staff.rows.length - left} working · {inr(staff.rows.filter((s) => s.active).reduce((a, s) => a + Number(s.monthly_salary), 0))} monthly salaries</p>
          <div className="ml-auto flex flex-wrap gap-2">
            {left > 0 && <Button size="sm" variant="ghost" onClick={() => setShowLeft(!showLeft)}>{showLeft ? 'Hide' : 'Show'} {left} who left</Button>}
            <Button size="sm" variant="soft" icon={CalendarCheck} onClick={() => nav('/attendance?tab=staff')}>Mark attendance</Button>
            <Button size="sm" variant="soft" icon={CreditCard} onClick={() => nav('/payments')}>Pay salaries</Button>
          </div>
        </div>
        {staff.loading ? <Loading /> : (
          <Table rows={shown} rowKey={(r) => r.id} onRow={setEditing}
            empty={<Empty title="No teachers or staff yet" text="Add everyone who works at the school." action={<Button icon={UserPlus} onClick={() => setEditing('new')}>Add the first one</Button>} />}
            cols={[
              { label: 'Name', render: (r) => <><p className={cx('font-semibold', !r.active && 'line-through opacity-50')}>{r.name}</p><p className="text-xs opacity-60">{[r.role, r.qualification, r.experience].filter(Boolean).join(' · ')}</p></> },
              { label: 'Mobile', render: (r) => r.phone ?? '—' },
              { label: 'Joined', render: (r) => fmtDate(r.joining_date) },
              { label: 'Salary', render: (r) => inr(r.monthly_salary) },
              { label: `Attendance (${monthLabel(month)})`, render: (r) => { const a = attendance(r.id); return a ? <span className={cx(a.pct < 85 && 'font-bold text-rose-ink')}>{a.pct}% · {a.days} days</span> : <span className="opacity-40">Not marked</span> } },
              { label: `Salary (${monthLabel(month)})`, render: (r) => paid.rows.some((p) => p.staff_id === r.id) ? <Pill s="Paid" /> : r.active ? <Pill s="Due" /> : '—' },
              { label: '', className: 'text-right', render: (r) => <Button size="sm" variant="ghost" icon={Pencil} onClick={(e) => { e.stopPropagation(); setEditing(r) }} aria-label={`Edit ${r.name}`} /> },
            ]} />
        )}
      </Card>
      <FormModal open={!!editing} onClose={() => setEditing(null)} wide title={current ? `Edit ${current.name}` : 'New teacher / staff'}
        fields={FIELDS} initial={current ?? { active: true }}
        onSubmit={async (v) => {
          if (!(Number(v.monthly_salary) >= 0)) throw new Error('Enter the monthly salary')
          const phone = v.phone ? normPhone(v.phone) : null
          if (v.phone && !phone) throw new Error('Enter a valid 10-digit Indian mobile number')
          const row = { ...clean(v, ['name', 'role', 'qualification', 'experience', 'joining_date', 'bank_account_name', 'account_no', 'ifsc', 'upi']), phone, monthly_salary: Number(v.monthly_salary), active: !!v.active }
          if (current) await must(supabase.from('staff').update(row).eq('id', current.id))
          else await must(supabase.from('staff').insert(row))
          toast(current ? "Saved" : `${v.name} added`)
          staff.reload()
        }} />
    </>
  )
}
