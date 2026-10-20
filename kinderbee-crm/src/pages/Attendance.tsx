import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, CheckCheck, Download, Lock, Upload } from 'lucide-react'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { exportExcel } from '../lib/excel'
import { fmtDate, monthLabel, today } from '../lib/util'
import { Button, Card, cx, Empty, inputCls, Label, Loading, PageHeader, Select, Table, Tabs, toast, useRows } from '../ui'
import { importStudents, type Student } from './Admissions'

const CYCLE: Record<string, string> = { '': 'P', P: 'A', A: 'L', L: '' }
const CELL: Record<string, string> = {
  P: 'bg-mint text-mint-ink', A: 'bg-rose text-rose-ink', L: 'bg-peach text-peach-ink', H: 'bg-sky text-sky-ink',
}

/** All dates of a month as YYYY-MM-DD. */
function daysOf(month: string) {
  const [y, m] = month.split('-').map(Number)
  return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)
}
const isSunday = (d: string) => new Date(d + 'T00:00').getDay() === 0

export default function Attendance() {
  const [tab, setTab] = useState<'students' | 'staff'>('students')
  return (
    <>
      <PageHeader icon={CalendarCheck} accent="attendance" title="Attendance" subtitle="Tap to mark — it saves instantly" />
      <Tabs value={tab} onChange={setTab} tabs={[{ key: 'students', label: 'Students' }, { key: 'staff', label: 'Teachers & staff' }]} />
      {tab === 'students' ? <Students /> : <Staff />}
    </>
  )
}

function Students() {
  const { settings } = useAuth()
  const [program, setProgram] = useState(settings.programs[0])
  const [month, setMonth] = useState(today().slice(0, 7))
  const [marks, setMarks] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const students = useRows<Student>(() => supabase.from('students').select('*').eq('active', true).eq('program', program).order('name'), [program])
  const days = daysOf(month)
  const holidays = new Map(settings.holidays.map((h) => [h.date, h.name]))
  const off = (d: string) => isSunday(d) || holidays.has(d)
  const t = today()

  useEffect(() => {
    const ids = students.rows.map((s) => s.id)
    if (!ids.length) { setMarks({}); return }
    supabase.from('student_attendance').select('student_id, day, status').in('student_id', ids).gte('day', days[0]).lte('day', days.at(-1)!)
      .then(({ data, error }) => {
        if (error) return toast(error.message, 'error')
        setMarks(Object.fromEntries((data ?? []).map((r) => [`${r.student_id}|${r.day}`, r.status])))
      })
  }, [students.rows, month]) // eslint-disable-line react-hooks/exhaustive-deps

  // Open the grid scrolled to today
  useEffect(() => {
    const g = gridRef.current, th = g?.querySelector<HTMLElement>('[data-today]')
    if (g && th) g.scrollLeft = th.offsetLeft - g.clientWidth / 2
  }, [students.rows, month])

  async function set(sid: string, day: string, status: string) {
    const k = `${sid}|${day}`
    const prev = marks[k] ?? ''
    setMarks((m) => ({ ...m, [k]: status }))
    const { error } = status
      ? await supabase.from('student_attendance').upsert({ student_id: sid, day, status })
      : await supabase.from('student_attendance').delete().eq('student_id', sid).eq('day', day)
    if (error) { setMarks((m) => ({ ...m, [k]: prev })); toast(error.message, 'error') }
  }

  async function allPresent(day: string) {
    if (off(day)) return toast('That day is a Sunday or holiday', 'error')
    const rows = students.rows.map((s) => ({ student_id: s.id, day, status: 'P' }))
    const { error } = await supabase.from('student_attendance').upsert(rows)
    if (error) return toast(error.message, 'error')
    setMarks((m) => ({ ...m, ...Object.fromEntries(rows.map((r) => [`${r.student_id}|${day}`, 'P'])) }))
    toast(`Everyone marked present on ${fmtDate(day)}`)
  }

  const stat = (sid: string) => {
    const vals = days.map((d) => marks[`${sid}|${d}`]).filter(Boolean)
    const p = vals.filter((v) => v === 'P').length
    return { p, a: vals.filter((v) => v === 'A').length, l: vals.filter((v) => v === 'L').length, pct: vals.length ? Math.round((p / vals.length) * 100) : null }
  }

  function exportMonth() {
    const cols = [{ key: 'name', label: 'Student' }, ...days.map((d) => ({ key: d, label: d.slice(8) })),
      { key: 'p', label: 'Present' }, { key: 'a', label: 'Absent' }, { key: 'l', label: 'Leave' }, { key: 'pct', label: 'Present %' }]
    exportExcel(`attendance-${program}-${month}`, cols, students.rows.map((s) => ({
      name: s.name, ...Object.fromEntries(days.map((d) => [d, off(d) ? (isSunday(d) ? 'S' : 'H') : marks[`${s.id}|${d}`] ?? ''])), ...stat(s.id),
    })))
  }

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Label label="Class"><Select value={program} onChange={setProgram} options={settings.programs} className="!w-44" /></Label>
        <Label label="Month"><input type="month" className={cx(inputCls, 'w-44 py-2')} value={month} onChange={(e) => setMonth(e.target.value)} /></Label>
        <div className="ml-auto flex flex-wrap gap-2">
          {month === t.slice(0, 7) && <Button icon={CheckCheck} onClick={() => allPresent(t)}>Mark all present today</Button>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (f) importStudents(f, settings).then(students.reload)
          }} />
          <Button variant="soft" icon={Upload} onClick={() => fileRef.current?.click()} title="Columns: Student Name, Program/Class, Parent Name, Parent WhatsApp No">Import students</Button>
          <Button variant="soft" icon={Download} onClick={exportMonth}>Export month</Button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {[['P', 'Present'], ['A', 'Absent'], ['L', 'Leave']].map(([k, l]) => <span key={k} className="flex items-center gap-1"><span className={cx('grid h-5 w-5 place-items-center rounded-md font-bold', CELL[k])}>{k}</span>{l}</span>)}
        <span className="flex items-center gap-1"><span className="h-5 w-5 rounded-md bg-charcoal/10 dark:bg-white/10" />Sunday / holiday</span>
        <span className="opacity-60">Tap a date header to mark everyone present that day.</span>
      </div>
      {students.loading ? <Loading /> : !students.rows.length ? (
        <Empty title={`No students in ${program}`} text="Import an Excel sheet with Student Name, Program/Class, Parent Name and Parent WhatsApp No." />
      ) : (
        <div ref={gridRef} className="-mx-4 overflow-x-auto sm:-mx-5">
          <table className="border-separate border-spacing-0.5 text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-40 bg-white px-3 text-left text-sm dark:bg-card">{monthLabel(month)}</th>
                {days.map((d) => (
                  <th key={d} data-today={d === t || undefined} title={holidays.get(d) ?? (isSunday(d) ? 'Sunday' : 'Mark all present')}>
                    <button disabled={off(d)} onClick={() => allPresent(d)}
                      className={cx('w-8 rounded-md py-1 font-bold', d === t ? 'bg-honey text-charcoal' : off(d) ? 'opacity-30' : 'hover:bg-honey/30')}>
                      {d.slice(8)}<br /><span className="font-normal opacity-60">{'SMTWTFS'[new Date(d + 'T00:00').getDay()]}</span>
                    </button>
                  </th>
                ))}
                <th className="px-2">%</th>
              </tr>
            </thead>
            <tbody>
              {students.rows.map((s) => {
                const st = stat(s.id)
                return (
                  <tr key={s.id}>
                    <td className="sticky left-0 z-10 truncate bg-white px-3 py-1 text-sm font-semibold dark:bg-card">{s.name}</td>
                    {days.map((d) => {
                      const v = marks[`${s.id}|${d}`] ?? ''
                      return (
                        <td key={d}>
                          {off(d) ? <div className="h-8 w-8 rounded-md bg-charcoal/10 dark:bg-white/10" /> : (
                            <button onClick={() => set(s.id, d, CYCLE[v])} aria-label={`${s.name} ${fmtDate(d)}: ${v || 'unmarked'}`}
                              className={cx('h-8 w-8 rounded-md font-bold transition active:scale-90', v ? CELL[v] : 'bg-charcoal/[0.03] hover:bg-honey/20 dark:bg-white/5')}>
                              {v}
                            </button>
                          )}
                        </td>
                      )
                    })}
                    <td className={cx('px-2 text-sm font-bold', st.pct != null && st.pct < 75 && 'text-rose-ink')}>{st.pct ?? '—'}</td>
                  </tr>
                )
              })}
              <tr>
                <td className="sticky left-0 z-10 bg-white px-3 py-1 text-xs font-bold uppercase opacity-60 dark:bg-card">Present</td>
                {days.map((d) => <td key={d} className="text-center font-bold opacity-70">{off(d) ? '' : students.rows.filter((s) => marks[`${s.id}|${d}`] === 'P').length || ''}</td>)}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

type StaffRow = { id: string; name: string; role: string | null; active: boolean }
type StaffMark = { staff_id: string; day: string; status: string; check_in: string | null; locked_at?: string | null }

// Staff attendance is saved once a day and then locked: the database refuses later changes from anyone but the CEO.
function Staff() {
  const { isCeo } = useAuth()
  const [day, setDay] = useState(today())
  const [saving, setSaving] = useState(false)
  const [month, setMonth] = useState(today().slice(0, 7))
  const staff = useRows<StaffRow>(() => supabase.from('staff').select('id, name, role, active').eq('active', true).order('name'))
  const marks = useRows<StaffMark>(() => supabase.from('staff_attendance').select('staff_id, day, status, check_in').gte('day', `${month}-01`).lte('day', daysOf(month).at(-1)!), [month])
  const [todayMarks, setTodayMarks] = useState<Record<string, StaffMark>>({})

  useEffect(() => {
    supabase.from('staff_attendance').select('staff_id, day, status, check_in, locked_at').eq('day', day)
      .then(({ data }) => setTodayMarks(Object.fromEntries((data ?? []).map((r) => [r.staff_id, r]))))
  }, [day])

  const lockedAt = Object.values(todayMarks).find((m) => m.locked_at)?.locked_at
  const readOnly = !isCeo && (!!lockedAt || day !== today())

  async function mark(id: string, patch: Partial<StaffMark>) {
    if (readOnly) return
    const { locked_at: _, ...prev } = todayMarks[id] ?? { status: 'P', check_in: null }
    const row: StaffMark = { ...prev, ...patch, staff_id: id, day }
    if (row.status === 'P' && !row.check_in && !patch.check_in && day === today()) row.check_in = new Date().toTimeString().slice(0, 5)
    setTodayMarks((m) => ({ ...m, [id]: { ...row, locked_at: todayMarks[id]?.locked_at } }))
    const { error } = await supabase.from('staff_attendance').upsert(row)
    if (error) toast(error.message, 'error')
    else if (day.startsWith(month)) marks.reload()
  }

  async function saveDay() {
    const missing = staff.rows.filter((s) => !todayMarks[s.id]).length
    if (missing) return toast(`Mark all staff first (${missing} not marked)`, 'error')
    if (!confirm(`Save attendance for ${fmtDate(day)}? After saving it can't be changed${isCeo ? '' : ' (only the CEO can correct it)'}.`)) return
    setSaving(true)
    const { data, error } = await supabase.from('staff_attendance').update({ locked_at: new Date().toISOString() })
      .eq('day', day).is('locked_at', null).select('staff_id, day, status, check_in, locked_at')
    setSaving(false)
    if (error) return toast(error.message, 'error')
    setTodayMarks((m) => ({ ...m, ...Object.fromEntries((data ?? []).map((r) => [r.staff_id, r])) }))
    toast('Attendance saved and locked')
  }

  const summary = useMemo(() => staff.rows.map((s) => {
    const mine = marks.rows.filter((m) => m.staff_id === s.id)
    const c = (k: string) => mine.filter((m) => m.status === k).length
    const present = c('P') + c('H') * 0.5
    return { id: s.id, name: s.name, role: s.role ?? '', P: c('P'), A: c('A'), H: c('H'), L: c('L'), pct: mine.length ? Math.round((present / mine.length) * 100) : null }
  }), [staff.rows, marks.rows])

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg">Daily register</h2>
            {lockedAt
              ? <p className="flex items-center gap-1 text-xs font-semibold text-mint-ink"><Lock className="h-3 w-3" />Saved {new Date(lockedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{isCeo && ' · CEO can still correct'}</p>
              : <p className="text-xs opacity-60">{readOnly ? 'Not saved. Only today can be marked.' : 'Mark everyone, then save. Saved days are locked.'}</p>}
          </div>
          <input type="date" className={cx(inputCls, 'w-44 py-2')} value={day} max={today()} onChange={(e) => setDay(e.target.value)} aria-label="Day" />
        </div>
        {staff.loading ? <Loading /> : !staff.rows.length ? <Empty title="No staff yet" text="Add staff under Payments → Staff salary." /> : (
          <ul className="divide-y divide-charcoal/5 dark:divide-white/5">
            {staff.rows.map((s) => {
              const m = todayMarks[s.id]
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1"><p className="font-semibold">{s.name}</p><p className="text-xs opacity-60">{s.role}</p></div>
                  <div className="flex gap-1">
                    {[['P', 'Present'], ['A', 'Absent'], ['H', 'Half-day'], ['L', 'Leave']].map(([k, label]) => (
                      <button key={k} title={label} disabled={readOnly} onClick={() => mark(s.id, { status: k })}
                        className={cx('h-9 w-9 rounded-xl font-bold transition active:scale-90 disabled:cursor-not-allowed', m?.status === k ? CELL[k] : 'bg-charcoal/5 opacity-60 hover:opacity-100 dark:bg-white/10')}>{k}</button>
                    ))}
                  </div>
                  <input type="time" aria-label={`${s.name} check-in`} className={cx(inputCls, 'w-32 py-1.5')} value={m?.check_in?.slice(0, 5) ?? ''}
                    disabled={readOnly || !m || m.status === 'A' || m.status === 'L'} onChange={(e) => mark(s.id, { check_in: e.target.value || null })} />
                </li>
              )
            })}
          </ul>
        )}
        {!lockedAt && !readOnly && staff.rows.length > 0 && (
          <div className="mt-3 flex justify-end">
            <Button icon={Lock} loading={saving} onClick={saveDay}>Save {day === today() ? "today's" : fmtDate(day)} attendance</Button>
          </div>
        )}
      </Card>
      <Card>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-lg">Monthly summary</h2>
          <div className="flex gap-2">
            <input type="month" className={cx(inputCls, 'w-44 py-2')} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />
            <Button variant="soft" icon={Download} onClick={() => exportExcel(`staff-attendance-${month}`,
              [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'P', label: 'Present' }, { key: 'H', label: 'Half-day' }, { key: 'L', label: 'Leave' }, { key: 'A', label: 'Absent' }, { key: 'pct', label: 'Attendance %' }], summary)}>Export</Button>
          </div>
        </div>
        <Table rows={summary} rowKey={(r) => r.id} cols={[
          { label: 'Name', render: (r) => <b>{r.name}</b> },
          { label: 'P', render: (r) => r.P }, { label: 'H', render: (r) => r.H }, { label: 'L', render: (r) => r.L }, { label: 'A', render: (r) => r.A },
          { label: '%', render: (r) => <b className={cx(r.pct != null && r.pct < 85 && 'text-rose-ink')}>{r.pct ?? '—'}</b> },
        ]} />
      </Card>
    </div>
  )
}
