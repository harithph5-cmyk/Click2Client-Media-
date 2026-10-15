import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, BadgeCheck, CalendarCheck, Globe, GraduationCap, LayoutDashboard, Users, Wallet, AlertCircle } from 'lucide-react'
import { useAuth } from '../auth'
import { supabase } from '../lib/supabase'
import { allDues, fmtDate, inr, LEAD_CATEGORIES, today, type FeeComponent } from '../lib/util'
import { Card, Empty, Kpi, PageHeader } from '../ui'
import { brand } from '../config/brand'

type Stats = Partial<{
  students: number; admissionsWeek: number; leadsWeek: number; leadsByCat: { name: string; count: number }[]
  collectedMonth: number; overdue: number; monthly: { month: string; amount: number }[]
  pendingVerify: number; staffPct: number | null; studentPct: number | null
}>
type Act = { id: number; action: string; entity: string; summary: string | null; at: string; profiles: { full_name: string } | null }

const weekAgo = () => new Date(Date.now() - 7 * 864e5).toISOString()
const pct = (rows: { status: string }[], present: string[]) =>
  rows.length ? Math.round((rows.filter((r) => present.includes(r.status)).length / rows.length) * 100) : null
const ENTITY: Record<string, string> = {
  admissions: 'admission inquiry', leads: 'website lead', students: 'student', fee_payments: 'fee payment',
  fee_components: 'fee structure', service_payments: 'service payment', salary_payments: 'salary', staff: 'staff member',
  profiles: 'team member', settings: 'setting', message_templates: 'message template',
}

export default function Dashboard() {
  const { can, profile } = useAuth()
  const [s, setS] = useState<Stats>({})
  const [acts, setActs] = useState<Act[]>([])

  useEffect(() => {
    const t = today()
    const jobs: Promise<void>[] = []
    const add = (f: () => Promise<Stats>) => jobs.push(f().then((r) => setS((p) => ({ ...p, ...r }))))

    if (can('admissions')) add(async () => {
      const [st, ad] = await Promise.all([
        supabase.from('students').select('id', { count: 'exact', head: true }).eq('active', true),
        supabase.from('admissions').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo()),
      ])
      return { students: st.count ?? 0, admissionsWeek: ad.count ?? 0 }
    })
    if (can('inquiries')) add(async () => {
      const { data } = await supabase.from('leads').select('category').gte('created_at', weekAgo())
      return {
        leadsWeek: data?.length ?? 0,
        leadsByCat: LEAD_CATEGORIES.map((c) => ({ name: c.label.split(' ')[0], count: data?.filter((l) => l.category === c.key).length ?? 0 })),
      }
    })
    if (can('fees')) add(async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1)
      const [{ data: students }, { data: comps }, { data: pays }] = await Promise.all([
        supabase.from('students').select('id, program, academic_year').eq('active', true),
        supabase.from('fee_components').select('*'),
        supabase.from('fee_payments').select('student_id, component_id, amount, paid_on'),
      ])
      const monthly = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(since); d.setMonth(since.getMonth() + i)
        const key = d.toLocaleDateString('en-CA').slice(0, 7)
        return {
          month: d.toLocaleDateString('en-IN', { month: 'short' }),
          amount: (pays ?? []).filter((p) => p.paid_on.startsWith(key)).reduce((a, p) => a + Number(p.amount), 0),
        }
      })
      const dues = allDues(students ?? [], (comps ?? []) as FeeComponent[], pays ?? [])
      return { collectedMonth: monthly[5].amount, overdue: dues.reduce((a, d) => a + d.overdue, 0), monthly }
    })
    if (can('payments')) add(async () => {
      const { count } = await supabase.from('service_payments').select('id', { count: 'exact', head: true }).eq('status', 'Pending')
      return { pendingVerify: count ?? 0 }
    })
    if (can('attendance')) add(async () => {
      const [a, b] = await Promise.all([
        supabase.from('staff_attendance').select('status').eq('day', t),
        supabase.from('student_attendance').select('status').eq('day', t),
      ])
      return { staffPct: pct(a.data ?? [], ['P', 'H']), studentPct: pct(b.data ?? [], ['P']) }
    })
    supabase.from('audit_log').select('id, action, entity, summary, at, profiles(full_name)').order('at', { ascending: false }).limit(12)
      .then(({ data }) => setActs((data ?? []) as unknown as Act[]))
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hour = new Date().getHours()
  return (
    <>
      <PageHeader icon={LayoutDashboard} title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${profile!.full_name.split(' ')[0] || 'there'}!`}
        subtitle={`Here's what's buzzing at ${brand.school} today · ${fmtDate(today())}`} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {can('admissions') && <Kpi icon={GraduationCap} accent="admissions" label="Active students" value={s.students ?? '…'} hint={`${s.admissionsWeek ?? 0} new inquiries this week`} />}
        {can('inquiries') && <Kpi icon={Globe} accent="inquiries" label="Website leads this week" value={s.leadsWeek ?? '…'} />}
        {can('fees') && <Kpi icon={Wallet} accent="fees" label="Fees collected this month" value={s.collectedMonth != null ? inr(s.collectedMonth) : '…'} />}
        {can('fees') && <Kpi icon={AlertCircle} accent="attendance" label="Fees overdue" value={s.overdue != null ? inr(s.overdue) : '…'} />}
        {can('payments') && <Kpi icon={BadgeCheck} accent="payments" label="Payments awaiting verification" value={s.pendingVerify ?? '…'} />}
        {can('attendance') && <Kpi icon={Users} accent="attendance" label="Teachers present today" value={s.staffPct == null ? '—' : `${s.staffPct}%`} hint={s.staffPct == null ? 'Not marked yet' : undefined} />}
        {can('attendance') && <Kpi icon={CalendarCheck} accent="admissions" label="Students present today" value={s.studentPct == null ? '—' : `${s.studentPct}%`} hint={s.studentPct == null ? 'Not marked yet' : undefined} />}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {can('inquiries') && (
            <Card>
              <h2 className="mb-3 font-display text-lg">New inquiries this week</h2>
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={s.leadsByCat ?? []}>
                    <CartesianGrid vertical={false} strokeOpacity={0.1} />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} width={28} />
                    <Tooltip cursor={{ fill: 'rgba(255,193,7,.1)' }} />
                    <Bar dataKey="count" name="Leads" fill={brand.colors.primary} radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
          {can('fees') && (
            <Card>
              <h2 className="mb-3 font-display text-lg">Monthly fee collection</h2>
              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={s.monthly ?? []}>
                    <CartesianGrid vertical={false} strokeOpacity={0.1} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={56} tickFormatter={(v) => `₹${v / 1000}k`} />
                    <Tooltip formatter={(v: number) => inr(v)} />
                    <Line dataKey="amount" name="Collected" stroke={brand.colors.primary} strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg"><Activity className="h-5 w-5 text-honey" />Recent activity</h2>
          {acts.length ? (
            <ol className="space-y-3">
              {acts.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="hex mt-0.5 h-3 w-3 shrink-0 bg-honey" />
                  <div>
                    <p><b>{a.profiles?.full_name ?? 'System'}</b> {a.action === 'insert' ? 'added' : a.action === 'delete' ? 'removed' : a.action === 'update' ? 'updated' : a.action} {ENTITY[a.entity] ?? a.entity}{a.summary && <> · <span className="text-charcoal/70 dark:text-cream/70">{a.summary}</span></>}</p>
                    <p className="text-xs text-charcoal/40 dark:text-cream/40">{new Date(a.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  </div>
                </li>
              ))}
            </ol>
          ) : <Empty title="All quiet" text="Activity from your team shows up here." />}
        </Card>
      </div>
    </>
  )
}
