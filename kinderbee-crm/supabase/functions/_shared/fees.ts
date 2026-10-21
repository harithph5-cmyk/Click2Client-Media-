// Fee maths shared by the CRM (src/lib/util.ts re-exports it) and the campaign worker. No imports.

const today = () => new Date().toLocaleDateString('en-CA')

export type FeeComponent = {
  id: string; program: string; academic_year: string; name: string
  amount: number; due_date: string | null; monthly: boolean; sort: number; optional?: boolean
}
export type FeePayment = { student_id: string; component_id: string | null; amount: number }

/** Months of a monthly fee that have fallen due by `asOf` (inclusive), capped at 12. */
export function monthsDue(start: string | null, asOf: string) {
  if (!start) return 1
  if (asOf < start) return 0
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = asOf.split('-').map(Number)
  return Math.min(12, (y2 - y1) * 12 + (m2 - m1) + (d2 >= d1 ? 1 : 0))
}

/** Per-component due / paid / balance for one student. `comps` = that student's program + year. */
export function studentDues(comps: FeeComponent[], pays: FeePayment[], asOf = today()) {
  const lines = [...comps].sort((a, b) => a.sort - b.sort).map((c) => {
    const paid = pays.filter((p) => p.component_id === c.id).reduce((s, p) => s + Number(p.amount), 0)
    // Optional items (e.g. books) are only owed once a parent starts paying for them.
    const due = c.optional ? Math.min(paid, Number(c.amount)) : Number(c.amount) * (c.monthly ? monthsDue(c.due_date, asOf) : 1)
    const balance = Math.max(0, due - paid)
    return { ...c, due, paid, balance, overdue: balance > 0 && (!c.due_date || c.due_date <= asOf) }
  })
  const overdueLines = lines.filter((l) => l.overdue)
  return {
    lines,
    due: lines.reduce((s, l) => s + l.due, 0),
    paid: lines.reduce((s, l) => s + l.paid, 0),
    balance: lines.reduce((s, l) => s + l.balance, 0),
    overdue: overdueLines.reduce((s, l) => s + l.balance, 0),
    firstOverdue: overdueLines.map((l) => l.due_date).filter(Boolean).sort()[0] ?? null,
  }
}

/** Dues for every student. Students carry program + academic_year. */
export function allDues<S extends { id: string; program: string; academic_year: string }>(
  students: S[], comps: FeeComponent[], pays: FeePayment[], asOf = today(),
) {
  return students.map((s) => ({
    student: s,
    ...studentDues(
      comps.filter((c) => c.program === s.program && c.academic_year === s.academic_year),
      pays.filter((p) => p.student_id === s.id),
      asOf,
    ),
  }))
}
