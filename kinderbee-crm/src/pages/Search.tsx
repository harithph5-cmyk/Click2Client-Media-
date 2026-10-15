import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CreditCard, Globe, GraduationCap, Search as SearchIcon, UserRound } from 'lucide-react'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { fmtDate, inr, LEAD_CATEGORIES } from '../lib/util'
import { Card, Empty, Loading, PageHeader, Pill } from '../ui'

type Hit = { id: string; to: string; icon: typeof SearchIcon; title: string; sub: string; pill?: string; group: string }

export default function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').replace(/[,()%*\\]/g, ' ').trim()
  const { can } = useAuth()
  const [hits, setHits] = useState<Hit[] | null>(null)

  useEffect(() => {
    if (!q) return setHits([])
    setHits(null)
    const like = `%${q}%`
    const jobs: PromiseLike<Hit[]>[] = []
    if (can('admissions') || can('fees') || can('attendance'))
      jobs.push(supabase.from('students').select('id, name, program, parent_name, parent_phone').or(`name.ilike.${like},parent_name.ilike.${like},parent_phone.ilike.${like}`).limit(20)
        .then(({ data }) => (data ?? []).map((s) => ({ id: s.id, group: 'Students', to: can('fees') ? '/fees' : '/admissions', icon: UserRound, title: s.name, sub: `${s.program} · ${s.parent_name ?? ''} ${s.parent_phone ?? ''}` }))))
    if (can('admissions'))
      jobs.push(supabase.from('admissions').select('id, child_name, parent_name, parent_phone, status, program').or(`child_name.ilike.${like},parent_name.ilike.${like},parent_phone.ilike.${like}`).limit(20)
        .then(({ data }) => (data ?? []).map((a) => ({ id: a.id, group: 'Admission inquiries', to: '/admissions', icon: GraduationCap, title: a.child_name, sub: `${a.program} · ${a.parent_name} ${a.parent_phone}`, pill: a.status }))))
    if (can('inquiries'))
      jobs.push(supabase.from('leads').select('id, name, phone, email, city, category, status').or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like},city.ilike.${like}`).limit(20)
        .then(({ data }) => (data ?? []).map((l) => ({ id: l.id, group: 'Website leads', to: '/inquiries', icon: Globe, title: l.name, sub: `${LEAD_CATEGORIES.find((c) => c.key === l.category)?.label} · ${l.phone ?? ''} ${l.city ?? ''}`, pill: l.status }))))
    if (can('payments'))
      jobs.push(supabase.from('service_payments').select('id, payer_name, phone, service, amount, reference, paid_on, status').or(`payer_name.ilike.${like},phone.ilike.${like},reference.ilike.${like}`).limit(20)
        .then(({ data }) => (data ?? []).map((p) => ({ id: p.id, group: 'Payments', to: '/payments', icon: CreditCard, title: `${p.payer_name} · ${inr(p.amount)}`, sub: `${p.service} · ${fmtDate(p.paid_on)} · ${p.reference ?? ''}`, pill: p.status }))))
    Promise.all(jobs).then((r) => setHits(r.flat()))
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const groups = [...new Set((hits ?? []).map((h) => h.group))]
  return (
    <>
      <PageHeader icon={SearchIcon} title={`Results for “${q}”`} subtitle="Across students, leads and payments you can access" />
      {hits === null ? <Loading /> : !hits.length ? <Card><Empty title="No matches" text="Try a shorter name or the last digits of a phone number." /></Card> : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g}>
              <h2 className="mb-2 font-display text-lg">{g}</h2>
              <ul className="divide-y divide-charcoal/5 dark:divide-white/5">
                {hits.filter((h) => h.group === g).map((h) => (
                  <li key={h.id}>
                    <Link to={h.to} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 hover:bg-honey/10">
                      <span className="hex grid h-9 w-9 shrink-0 place-items-center bg-honey/25"><h.icon className="h-4 w-4" /></span>
                      <span className="min-w-0 flex-1"><b className="block truncate">{h.title}</b><span className="block truncate text-xs opacity-60">{h.sub}</span></span>
                      {h.pill && <Pill s={h.pill} />}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
