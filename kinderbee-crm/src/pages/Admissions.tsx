import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, GraduationCap, Plus, Upload } from 'lucide-react'
import { useAuth } from '../auth'
import { must, supabase } from '../lib/supabase'
import { exportExcel, importExcel } from '../lib/excel'
import { fmtDate, normPhone } from '../lib/util'
import { Button, Card, clean, cx, Empty, FormModal, Loading, PageHeader, Table, toast, useRows, type Field } from '../ui'

export type Student = {
  id: string; name: string; dob: string | null; gender: string | null; program: string; parent_name: string | null
  parent_phone: string | null; parent2_name: string | null; parent2_phone: string | null
  email: string | null; address: string | null; academic_year: string; active: boolean
}

export const STUDENT_EXCEL = [
  { key: 'name', label: 'Student Name' }, { key: 'program', label: 'Program/Class', aliases: ['class', 'program'] },
  { key: 'parent_name', label: 'Father Name', aliases: ['parent name'] }, { key: 'parent_phone', label: 'Father Mobile No', aliases: ['parent whatsapp no', 'whatsapp', 'phone', 'parent phone'] },
  { key: 'parent2_name', label: 'Mother Name' }, { key: 'parent2_phone', label: 'Mother Mobile No' },
  { key: 'dob', label: 'DOB' }, { key: 'email', label: 'Email' },
]

/** Excel → students (Student Name, Program/Class, Father/Mother Name + Mobile No). Toasts the result. */
export async function importStudents(f: File, settings: { programs: string[]; academic_year: string }) {
  try {
    const data = (await importExcel(f, STUDENT_EXCEL)).filter((r) => r.name)
    const match = (p: string) => settings.programs.find((x) => x.toLowerCase() === p?.toLowerCase()) ?? (p || settings.programs[0])
    if (data.length) await must(supabase.from('students').insert(data.map((r) => ({
      ...clean(r, ['name', 'parent_name', 'parent2_name', 'email', 'dob']), program: match(r.program),
      parent_phone: normPhone(r.parent_phone), parent2_phone: normPhone(r.parent2_phone), academic_year: settings.academic_year,
    }))))
    toast(`Imported ${data.length} students`)
  } catch (x: any) { toast(x.message, 'error') }
}

const STU_KEYS = ['name', 'dob', 'gender', 'program', 'parent_name', 'parent2_name', 'email', 'address', 'academic_year']

export default function Admissions() {
  return (
    <>
      <PageHeader icon={GraduationCap} accent="admissions" title="Student Registration" subtitle="Kinderbee Bengaluru — registered students by program" />
      <Students />
    </>
  )
}

function Students() {
  const { settings } = useAuth()
  const { rows, loading, reload } = useRows<Student>(() => supabase.from('students').select('*').eq('active', true).order('name'))
  const [program, setProgram] = useState('')
  const [editing, setEditing] = useState<Student | 'new' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const counts = useMemo(() => Object.fromEntries(settings.programs.map((p) => [p, rows.filter((r) => r.program === p).length])), [rows, settings.programs])
  const shown = rows.filter((r) => !program || r.program === program)
  const current = editing && editing !== 'new' ? editing : null

  const fields: Field[] = [
    { key: 'name', label: 'Student name', required: true },
    { key: 'program', label: 'Program / class', type: 'select', options: settings.programs, required: true },
    { key: 'dob', label: 'Date of birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Girl', 'Boy', 'Other'] },
    { key: 'parent_name', label: "Father's name" },
    { key: 'parent_phone', label: "Father's mobile no.", type: 'tel' },
    { key: 'parent2_name', label: "Mother's name" },
    { key: 'parent2_phone', label: "Mother's mobile no.", type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'academic_year', label: 'Academic year', required: true },
    { key: 'address', label: 'Address', full: true },
  ]
  async function save(v: Record<string, any>) {
    const phone = v.parent_phone ? normPhone(v.parent_phone) : null
    const phone2 = v.parent2_phone ? normPhone(v.parent2_phone) : null
    if ((v.parent_phone && !phone) || (v.parent2_phone && !phone2)) throw new Error('Enter a valid 10-digit Indian mobile number')
    const row = { ...clean(v, STU_KEYS), parent_phone: phone, parent2_phone: phone2 }
    if (current) await must(supabase.from('students').update(row).eq('id', current.id))
    else await must(supabase.from('students').insert(row))
    toast('Student saved')
    reload()
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <ProgramCard label="All programs" n={rows.length} active={!program} onClick={() => setProgram('')} />
        {settings.programs.map((p) => <ProgramCard key={p} label={p} n={counts[p] ?? 0} active={program === p} onClick={() => setProgram(p)} />)}
      </div>
      <Card>
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (!f) return
            importStudents(f, settings).then(reload)
          }} />
          <Button variant="soft" icon={Upload} onClick={() => fileRef.current?.click()}>Import</Button>
          <Button variant="soft" icon={Download} onClick={() => exportExcel(`students${program ? '-' + program : ''}`, [...STUDENT_EXCEL, { key: 'academic_year', label: 'Academic Year' }], shown)}>Export</Button>
          <Button icon={Plus} onClick={() => setEditing('new')}>Register student</Button>
        </div>
        {loading ? <Loading /> : (
          <Table rows={shown} rowKey={(r) => r.id} onRow={setEditing}
            empty={<Empty title="No students here yet" text="Register a student by hand, or import an Excel sheet." />}
            cols={[
              { label: 'Student', render: (r) => <p className="font-semibold">{r.name}</p> },
              { label: 'Program', render: (r) => r.program },
              { label: 'Father', render: (r) => <><p>{r.parent_name ?? '—'}</p><p className="text-xs opacity-60">{r.parent_phone}</p></> },
              { label: 'Mother', render: (r) => <><p>{r.parent2_name ?? '—'}</p><p className="text-xs opacity-60">{r.parent2_phone}</p></> },
              { label: 'DOB', render: (r) => fmtDate(r.dob) },
              { label: 'Year', render: (r) => r.academic_year },
            ]} />
        )}
      </Card>
      <FormModal open={!!editing} onClose={() => setEditing(null)} wide title={current ? current.name : 'Student registration'}
        fields={fields} initial={current ?? { academic_year: settings.academic_year }} onSubmit={save}>
        {current && (
          <div className="mt-4 flex justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={async () => {
              if (!confirm(`Mark ${current.name} as left? They'll be hidden from lists but their records stay.`)) return
              await supabase.from('students').update({ active: false }).eq('id', current.id)
              setEditing(null); reload()
            }}>Mark as left school</Button>
          </div>
        )}
      </FormModal>
    </>
  )
}

function ProgramCard({ label, n, active, onClick }: { label: string; n: number; active: boolean; onClick: () => void }) {
  return (
    <motion.button whileHover={{ y: -2 }} onClick={onClick}
      className={cx('relative overflow-hidden rounded-3xl p-3 text-left transition', active ? 'bg-honey text-charcoal' : 'bg-white dark:bg-card')}>
      <span className="hex absolute -right-3 -top-3 h-12 w-12 bg-mint/70 dark:bg-mint/20" />
      <p className="relative font-display text-2xl">{n}</p>
      <p className="relative truncate text-xs font-semibold opacity-70">{label}</p>
    </motion.button>
  )
}
