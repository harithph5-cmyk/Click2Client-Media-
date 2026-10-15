import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Download, FileText, GraduationCap, Plus, Upload, UserCheck } from 'lucide-react'
import { useAuth } from '../auth'
import { must, openFile, supabase, upload } from '../lib/supabase'
import { exportExcel, importExcel } from '../lib/excel'
import { fmtDate, normPhone } from '../lib/util'
import { Button, Card, clean, cx, Empty, FormModal, inputCls, Loading, PageHeader, Pill, Select, Table, Tabs, toast, useRows, type Field } from '../ui'

export const ADMISSION_STATUS = ['New', 'Contacted', 'Visit Scheduled', 'Admitted', 'Not Interested'] as const
const SOURCES = ['walk-in', 'call', 'website', 'referral']

type Admission = {
  id: string; child_name: string; dob: string | null; gender: string | null; program: string; parent_name: string
  parent_phone: string; email: string | null; address: string | null; previous_school: string | null; source: string | null
  notes: string | null; status: string; documents: Record<string, string>; student_id: string | null; created_at: string
}
export type Student = {
  id: string; name: string; dob: string | null; gender: string | null; program: string; parent_name: string | null
  parent_phone: string | null; email: string | null; address: string | null; academic_year: string; active: boolean
}

export const STUDENT_EXCEL = [
  { key: 'name', label: 'Student Name' }, { key: 'program', label: 'Program/Class', aliases: ['class', 'program'] },
  { key: 'parent_name', label: 'Parent Name' }, { key: 'parent_phone', label: 'Parent WhatsApp No', aliases: ['whatsapp', 'phone', 'parent phone'] },
  { key: 'dob', label: 'DOB' }, { key: 'email', label: 'Email' },
]

/** Excel → students (Student Name, Program/Class, Parent Name, Parent WhatsApp No). Toasts the result. */
export async function importStudents(f: File, settings: { programs: string[]; academic_year: string }) {
  try {
    const data = (await importExcel(f, STUDENT_EXCEL)).filter((r) => r.name)
    const match = (p: string) => settings.programs.find((x) => x.toLowerCase() === p?.toLowerCase()) ?? (p || settings.programs[0])
    if (data.length) await must(supabase.from('students').insert(data.map((r) => ({
      ...clean(r, ['name', 'parent_name', 'email', 'dob']), program: match(r.program),
      parent_phone: normPhone(r.parent_phone), academic_year: settings.academic_year,
    }))))
    toast(`Imported ${data.length} students`)
  } catch (x: any) { toast(x.message, 'error') }
}

const ADM_KEYS =['child_name', 'dob', 'gender', 'program', 'parent_name', 'parent_phone', 'email', 'address', 'previous_school', 'source', 'notes', 'status']
const STU_KEYS = ['name', 'dob', 'gender', 'program', 'parent_name', 'parent_phone', 'email', 'address', 'academic_year']

export default function Admissions() {
  const [tab, setTab] = useState<'inquiries' | 'students'>('inquiries')
  return (
    <>
      <PageHeader icon={GraduationCap} accent="admissions" title="Admissions" subtitle="KinderBee Bengaluru — inquiries to enrolled students" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'inquiries', label: 'Admission inquiries' }, { key: 'students', label: 'Students' }]} />
      {tab === 'inquiries' ? <Inquiries /> : <Students />}
    </>
  )
}

function Inquiries() {
  const { settings } = useAuth()
  const { rows, loading, reload } = useRows<Admission>(() => supabase.from('admissions').select('*').order('created_at', { ascending: false }))
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<Admission | 'new' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fields: Field[] = [
    { key: 'child_name', label: 'Child name', required: true },
    { key: 'dob', label: 'Date of birth', type: 'date' },
    { key: 'gender', label: 'Gender', type: 'select', options: ['Girl', 'Boy', 'Other'] },
    { key: 'program', label: 'Program', type: 'select', options: settings.programs, required: true },
    { key: 'parent_name', label: 'Parent name', required: true },
    { key: 'parent_phone', label: 'Parent WhatsApp no.', type: 'tel', required: true, placeholder: '+91 98450 12345' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'previous_school', label: 'Previous school' },
    { key: 'address', label: 'Address', full: true },
    { key: 'source', label: 'Source', type: 'select', options: SOURCES },
    { key: 'status', label: 'Status', type: 'select', options: [...ADMISSION_STATUS] },
    { key: 'birth_certificate', label: 'Birth certificate', type: 'file' },
    { key: 'photo', label: 'Child photo', type: 'file', accept: 'image/*' },
    { key: 'notes', label: 'Notes', type: 'textarea' },
  ]

  const shown = rows.filter((r) => (!status || r.status === status) &&
    (!q || `${r.child_name} ${r.parent_name} ${r.parent_phone}`.toLowerCase().includes(q.toLowerCase())))
  const current = editing && editing !== 'new' ? editing : null

  async function save(v: Record<string, any>) {
    const phone = normPhone(v.parent_phone)
    if (!phone) throw new Error('Enter a valid 10-digit Indian mobile number')
    const documents = { ...(current?.documents ?? {}) }
    for (const k of ['birth_certificate', 'photo']) if (v[k] instanceof File) documents[k] = await upload('admissions', v[k])
    const row = { ...clean(v, ADM_KEYS), parent_phone: phone, status: v.status || 'New', documents }
    if (current) await must(supabase.from('admissions').update(row).eq('id', current.id))
    else await must(supabase.from('admissions').insert(row))
    toast(current ? 'Inquiry updated' : 'Inquiry added')
    reload()
  }

  async function convert(a: Admission) {
    const s = await must(supabase.from('students').insert({
      name: a.child_name, dob: a.dob, gender: a.gender, program: a.program, parent_name: a.parent_name,
      parent_phone: a.parent_phone, email: a.email, address: a.address, academic_year: settings.academic_year,
    }).select('id').single())
    await must(supabase.from('admissions').update({ student_id: s.id, status: 'Admitted' }).eq('id', a.id))
    toast(`${a.child_name} is now a student 🎉`)
    setEditing(null)
    reload()
  }

  async function setRowStatus(a: Admission, s: string) {
    const { error } = await supabase.from('admissions').update({ status: s }).eq('id', a.id)
    if (error) return toast(error.message, 'error')
    reload()
  }

  async function doImport(f: File) {
    const data = await importExcel(f, fields.filter((x) => x.type !== 'file'))
    const bad = data.filter((r) => !r.child_name || !r.parent_name || !normPhone(r.parent_phone))
    const good = data.filter((r) => !bad.includes(r)).map((r) => ({
      ...clean(r, ADM_KEYS), parent_phone: normPhone(r.parent_phone), program: r.program || settings.programs[0],
      status: (ADMISSION_STATUS as readonly string[]).includes(r.status) ? r.status : 'New',
    }))
    if (good.length) await must(supabase.from('admissions').insert(good))
    toast(`Imported ${good.length}${bad.length ? `, skipped ${bad.length} without name/valid phone` : ''}`)
    reload()
  }

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {ADMISSION_STATUS.map((s, i) => {
          const n = rows.filter((r) => r.status === s).length
          return (
            <motion.button key={s} whileHover={{ y: -2 }} onClick={() => setStatus(status === s ? '' : s)}
              className={cx('rounded-3xl border-2 p-3 text-left transition', status === s ? 'border-honey bg-honey/15' : 'border-transparent bg-white dark:bg-card')}>
              <p className="text-xs font-bold uppercase tracking-wide opacity-50">{i + 1}. {s}</p>
              <p className="font-display text-2xl">{n}</p>
            </motion.button>
          )
        })}
      </div>
      <Card>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className={cx(inputCls, 'max-w-xs py-2')} placeholder="Search child, parent, phone" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ml-auto flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doImport(f).catch((x) => toast(x.message, 'error')); e.target.value = '' }} />
            <Button variant="soft" icon={Upload} onClick={() => fileRef.current?.click()}>Import</Button>
            <Button variant="soft" icon={Download} onClick={() => exportExcel('admission-inquiries', fields.filter((f) => f.type !== 'file').map((f) => ({ key: f.key, label: f.label })), shown)}>Export</Button>
            <Button icon={Plus} onClick={() => setEditing('new')}>New inquiry</Button>
          </div>
        </div>
        {loading ? <Loading /> : (
          <Table rows={shown} rowKey={(r) => r.id} onRow={setEditing}
            empty={<Empty title="No admission inquiries yet" text="When a parent walks in or calls, add them here." action={<Button icon={Plus} onClick={() => setEditing('new')}>Add the first one</Button>} />}
            cols={[
              { label: 'Child', render: (r) => <><p className="font-semibold">{r.child_name}</p><p className="text-xs opacity-60">{r.program}</p></> },
              { label: 'Parent', render: (r) => <><p>{r.parent_name}</p><p className="text-xs opacity-60">{r.parent_phone}</p></> },
              { label: 'Source', render: (r) => <span className="capitalize">{r.source ?? '—'}</span> },
              { label: 'Received', render: (r) => fmtDate(r.created_at) },
              { label: 'Status', render: (r) => (
                <span onClick={(e) => e.stopPropagation()}>
                  {r.student_id ? <Pill s="Admitted" /> : <Select value={r.status} onChange={(s) => setRowStatus(r, s)} options={[...ADMISSION_STATUS]} className="!w-40 !rounded-full !py-1 text-sm" />}
                </span>
              ) },
            ]} />
        )}
      </Card>

      <FormModal open={!!editing} onClose={() => setEditing(null)} wide title={current ? current.child_name : 'New admission inquiry'}
        fields={fields} initial={current ?? { status: 'New', source: 'walk-in' }} onSubmit={save}>
        {current && (
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-mint/40 p-3 dark:bg-mint/10">
            {Object.entries(current.documents).map(([k, p]) => (
              <Button key={k} type="button" size="sm" variant="soft" icon={FileText} onClick={() => openFile(p).catch((e) => toast(e.message, 'error'))}>
                {k === 'photo' ? 'Photo' : 'Birth certificate'}
              </Button>
            ))}
            <span className="ml-auto" />
            {current.student_id ? <Pill s="Admitted" /> : (
              <Button type="button" size="sm" icon={UserCheck} onClick={() => convert(current).catch((e) => toast(e.message, 'error'))}>Convert to student</Button>
            )}
          </div>
        )}
      </FormModal>
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
    { key: 'parent_name', label: 'Parent name' },
    { key: 'parent_phone', label: 'Parent WhatsApp no.', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'academic_year', label: 'Academic year', required: true },
    { key: 'address', label: 'Address', full: true },
  ]
  async function save(v: Record<string, any>) {
    const phone = v.parent_phone ? normPhone(v.parent_phone) : null
    if (v.parent_phone && !phone) throw new Error('Enter a valid 10-digit Indian mobile number')
    const row = { ...clean(v, STU_KEYS), parent_phone: phone }
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
          <Button icon={Plus} onClick={() => setEditing('new')}>Add student</Button>
        </div>
        {loading ? <Loading /> : (
          <Table rows={shown} rowKey={(r) => r.id} onRow={setEditing}
            empty={<Empty title="No students here yet" text="Convert an admission inquiry, add one by hand, or import an Excel sheet." />}
            cols={[
              { label: 'Student', render: (r) => <p className="font-semibold">{r.name}</p> },
              { label: 'Program', render: (r) => r.program },
              { label: 'Parent', render: (r) => <><p>{r.parent_name ?? '—'}</p><p className="text-xs opacity-60">{r.parent_phone}</p></> },
              { label: 'DOB', render: (r) => fmtDate(r.dob) },
              { label: 'Year', render: (r) => r.academic_year },
            ]} />
        )}
      </Card>
      <FormModal open={!!editing} onClose={() => setEditing(null)} wide title={current ? current.name : 'New student'}
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
