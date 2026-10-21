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

// Shared with the campaign worker so the CRM preview and the sent message can never differ
export { fillTemplate, placeholders } from '../../supabase/functions/_shared/campaign-core.ts'

export const waLink = (phone: string, text: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`

// ───────── Fees (shared with the campaign worker) ─────────
export { allDues, monthsDue, studentDues, type FeeComponent, type FeePayment } from '../../supabase/functions/_shared/fees.ts'

// ───────── Website inquiry categories ─────────
export const LEAD_CATEGORIES = [
  { key: 'admission', label: 'Admission', extra: [['programme', 'Program'], ['form', 'Form']] },
  { key: 'ntt', label: 'NTT Teacher Training', extra: [['qualification', 'Qualification'], ['batch', 'Preferred batch']] },
  { key: 'consultation', label: 'One-on-One Consultation', extra: [['topic', 'Topic'], ['preferred_date', 'Preferred date']] },
  { key: 'franchise', label: 'Franchise Enrollment', extra: [['investment_budget', 'Investment budget'], ['preferred_location', 'Preferred location']] },
  { key: 'cbse', label: 'CBSE School', extra: [['grade', 'Grade seeking'], ['current_school', 'Current school']] },
  { key: 'degree', label: 'Degree College', extra: [['course', 'Course interested'], ['qualification', 'Last qualification']] },
  { key: 'jv', label: 'Joint Ventures', extra: [['organisation', 'Organisation'], ['proposal', 'Proposal type']] },
  { key: 'general', label: 'General', extra: [['topic', 'Topic']] },
] as const

export const SERVICES = ['Franchise', 'NTT Teacher Training', 'One-on-One Consultation', 'Joint Ventures', 'CBSE School', 'Degree College', 'Other']
