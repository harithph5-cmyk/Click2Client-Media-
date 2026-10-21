// Campaign rules with no imports, so `npm test` runs them under plain Node.

/** Placeholder names in order of first appearance: the {{1}}, {{2}}… order of the Meta template. */
export const placeholders = (body: string) => [...new Set([...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))]

export const fillTemplate = (body: string, vars: Record<string, unknown>) =>
  body.replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])))

/** CRM body "Hi {name}, ₹{amount}" → Meta body "Hi {{1}}, ₹{{2}}" */
export function toMetaBody(body: string) {
  const order = placeholders(body)
  return body.replace(/\{(\w+)\}/g, (_, k) => `{{${order.indexOf(k) + 1}}}`)
}

/** Any phone → E.164 (+91 for bare Indian mobiles), or null. Matches wa_contact() in SQL. */
export function e164(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10 && /^[6-9]/.test(d)) d = '91' + d
  return d.length >= 8 && d.length <= 15 ? '+' + d : null
}

/** Graph API failures worth retrying: throttling, Meta-side trouble, network. Everything else is permanent. */
export function retryable(httpStatus: number | null, code?: number) {
  if (httpStatus == null) return true // network error
  if (httpStatus === 429 || httpStatus >= 500) return true
  return [1, 2, 4, 17, 341, 80007, 130429, 131000, 131016, 133004].includes(code ?? -1)
}

/** 1 min, 2, 4, 8 … capped at 1 hour */
export const backoffSeconds = (attempt: number) => Math.min(60 * 2 ** Math.max(0, attempt - 1), 3600)

/** Today's date in India (YYYY-MM-DD), whatever the server's clock zone */
export const istDate = (now = new Date(), addDays = 0) =>
  new Date(now.getTime() + 330 * 60_000 + addDays * 86_400_000).toISOString().slice(0, 10)

export type Candidate = { phone: string | null; name: string; vars: Record<string, string>; student_ids?: string[]; lead_id?: string }

/** Several students under one parent number → one message: names joined, amounts added, earliest due date. */
export function mergeByPhone(list: Candidate[]) {
  const by = new Map<string, Candidate>()
  for (const c of list) {
    if (!c.phone) continue
    const prev = by.get(c.phone)
    if (!prev) { by.set(c.phone, { ...c, vars: { ...c.vars }, student_ids: [...(c.student_ids ?? [])] }); continue }
    if (c.vars.student_name && !prev.vars.student_name?.split(' & ').includes(c.vars.student_name))
      prev.vars.student_name = [prev.vars.student_name, c.vars.student_name].filter(Boolean).join(' & ')
    if (c.vars.class && !prev.vars.class?.split(' & ').includes(c.vars.class))
      prev.vars.class = [prev.vars.class, c.vars.class].filter(Boolean).join(' & ')
    if (c.vars._amount) {
      const sum = Number(prev.vars._amount ?? 0) + Number(c.vars._amount)
      prev.vars._amount = String(sum)
      prev.vars.amount = sum.toLocaleString('en-IN')
    }
    if (c.vars._due && (!prev.vars._due || c.vars._due < prev.vars._due)) { prev.vars._due = c.vars._due; prev.vars.due_date = c.vars.due_date }
    prev.student_ids = [...new Set([...(prev.student_ids ?? []), ...(c.student_ids ?? [])])]
  }
  return [...by.values()]
}

/** Why a recipient can't get this message, or null if they can. */
export function ineligible(
  c: { opted_in?: boolean; opted_out_at?: string | null } | undefined, body: string, vars: Record<string, unknown>,
) {
  if (!c || !c.opted_in) return 'No WhatsApp consent recorded'
  if (c.opted_out_at) return 'Opted out'
  const missing = placeholders(body).filter((k) => vars[k] == null || String(vars[k]).trim() === '')
  return missing.length ? `Missing value for {${missing.join('}, {')}}` : null
}
