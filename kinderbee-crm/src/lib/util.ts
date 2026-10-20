// Pure helpers (no imports) so `npm test` can run them under plain Node.

export const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD, local time

/** Any ISO date or timestamp → DD-MM-YYYY (local). */
export function fmtDate(v?: string | null) {
  if (!v) return '—'
  const iso = v.length > 10 ? new Date(v).toLocaleDateString('en-CA') : v
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

export const inr = (n: number | string | null | undefined) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const monthStart = (iso: string) => iso.slice(0, 7) + '-01'
export const monthLabel = (iso: string) =>
  new Date(iso.slice(0, 7) + '-01T00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

/** Indian mobile → +91XXXXXXXXXX, or null if it isn't one. */
export function normPhone(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  return d.length === 10 && /^[6-9]/.test(d) ? '+91' + d : null
}

export const fillTemplate = (body: string, vars: Record<string, unknown>) =>
  body.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])))

/** Placeholder names in order of first appearance — the param order for Meta templates. */
export const placeholders = (body: string) => [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))]

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`

// ───────── Fees ─────────
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

// ───────── Website inquiry categories ─────────
export const LEAD_CATEGORIES = [
  { key: 'ntt', label: 'NTT Teacher Training', extra: [['qualification', 'Qualification'], ['batch', 'Preferred batch']] },
  { key: 'consultation', label: 'One-on-One Consultation', extra: [['topic', 'Topic'], ['preferred_date', 'Preferred date']] },
  { key: 'franchise', label: 'Franchise Enrollment', extra: [['investment_budget', 'Investment budget'], ['preferred_location', 'Preferred location']] },
  { key: 'cbse', label: 'CBSE School', extra: [['grade', 'Grade seeking'], ['current_school', 'Current school']] },
  { key: 'degree', label: 'Degree College', extra: [['course', 'Course interested'], ['qualification', 'Last qualification']] },
  { key: 'jv', label: 'Joint Ventures', extra: [['organisation', 'Organisation'], ['proposal', 'Proposal type']] },
] as const

export const SERVICES = ['Franchise', 'NTT Teacher Training', 'One-on-One Consultation', 'Joint Ventures', 'CBSE School', 'Degree College', 'Other']
