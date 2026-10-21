import { Component, lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { supabase } from './lib/supabase'
import {
  Bell, CalendarCheck, Contact, CreditCard, GraduationCap, Globe, LayoutDashboard, LogOut, Menu, MessageCircle, Moon,
  Settings as SettingsIcon, Sun, Users, Wallet, X, Lock, Image as ImageIcon, type LucideIcon,
} from 'lucide-react'
import { brand } from './config/brand'
import { useAuth, type ModuleKey } from './auth'
import { cx, Empty, Logo, Splash, Toaster, ACCENT, type Accent } from './ui'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Admissions = lazy(() => import('./pages/Admissions'))
const Inquiries = lazy(() => import('./pages/Inquiries'))
const Fees = lazy(() => import('./pages/Fees'))
const Payments = lazy(() => import('./pages/Payments'))
const StaffPage = lazy(() => import('./pages/Staff'))
const Attendance = lazy(() => import('./pages/Attendance'))
const WhatsApp = lazy(() => import('./pages/WhatsApp'))
const Team = lazy(() => import('./pages/Team'))
const Settings = lazy(() => import('./pages/Settings'))
const WebsiteContent = lazy(() => import('./pages/WebsiteContent'))

type Nav = { to: string; label: string; icon: LucideIcon; accent: Accent; module?: ModuleKey; ceo?: boolean }
const NAV: Nav[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, accent: 'honey' },
  { to: '/admissions', label: 'Student Registration', icon: GraduationCap, accent: 'admissions', module: 'admissions' },
  { to: '/inquiries', label: 'Website', icon: Globe, accent: 'inquiries', module: 'inquiries' },
  { to: '/fees', label: 'Fees', icon: Wallet, accent: 'fees', module: 'fees' },
  { to: '/staff', label: 'Teachers & Staff', icon: Contact, accent: 'payments', module: 'payments' },
  { to: '/payments', label: 'Payments', icon: CreditCard, accent: 'payments', module: 'payments' },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck, accent: 'attendance', module: 'attendance' },
  { to: '/whatsapp', label: 'WhatsApp', icon: MessageCircle, accent: 'whatsapp', module: 'whatsapp' },
  { to: '/website', label: 'Website Content', icon: ImageIcon, accent: 'inquiries', module: 'website' },
  { to: '/team', label: 'Team', icon: Users, accent: 'honey', ceo: true },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, accent: 'honey' },
]

export default function App() {
  const { session, profile, loading } = useAuth()
  const [intro, setIntro] = useState(true)
  useEffect(() => { const t = setTimeout(() => setIntro(false), 1200); return () => clearTimeout(t) }, [])

  if (intro || loading) return <Splash />
  return (
    <>
      <Suspense fallback={<Splash />}>
        {session && profile ? <Shell /> : <Login />}
      </Suspense>
      <Toaster />
    </>
  )
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    return this.state.error
      ? <Empty title="Oops, this page tripped over" text={this.state.error.message} />
      : this.props.children
  }
}

function Guard({ m, ceo, children }: { m?: ModuleKey; ceo?: boolean; children: ReactNode }) {
  const { can, isCeo } = useAuth()
  if ((m && !can(m)) || (ceo && !isCeo))
    return <Empty title="This hive is locked" text="You don't have access to this module. Ask the CEO to enable it for you." />
  return <>{children}</>
}

type Note = { id: number; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string }

// Follow-up tasks, escalations and AI hand-offs land here. ponytail: polls every minute; Realtime if that feels slow
function Notifications() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<Note[]>([])
  const load = useCallback(() => {
    supabase.from('notifications').select('*').eq('user_id', profile!.id).order('created_at', { ascending: false }).limit(30)
      .then(({ data }) => setRows(data ?? []))
  }, [profile])
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [load])
  const unread = rows.filter((r) => !r.read_at)
  async function go(n: Note) {
    setOpen(false)
    if (!n.read_at) await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    load()
    if (n.link) nav(n.link)
  }
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative rounded-xl p-2 hover:bg-charcoal/5 dark:hover:bg-white/10" aria-label={`Notifications (${unread.length} unread)`}>
        <Bell className="h-5 w-5" />
        {unread.length > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{unread.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-3xl border border-charcoal/10 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-card">
          <div className="flex items-center justify-between px-2 py-1">
            <p className="font-display">Notifications</p>
            {unread.length > 0 && (
              <button className="text-xs font-semibold opacity-60" onClick={async () => {
                await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', unread.map((n) => n.id)); load()
              }}>Mark all read</button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {rows.map((n) => (
              <li key={n.id}>
                <button onClick={() => go(n)} className={cx('w-full rounded-2xl p-2 text-left text-sm hover:bg-charcoal/5 dark:hover:bg-white/5', !n.read_at && 'font-semibold')}>
                  <p>{n.title}</p>
                  {n.body && <p className="text-xs font-normal opacity-60">{n.body}</p>}
                  <p className="text-[11px] font-normal opacity-40">{new Date(n.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                </button>
              </li>
            ))}
            {!rows.length && <li className="p-3 text-sm opacity-50">Nothing yet.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}

function Shell() {
  const { profile, can, isCeo, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch { /* storage blocked */ }
  }
  const items = NAV.filter((n) => (!n.module || can(n.module)) && (!n.ceo || isCeo))

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-4">
      <div className="mb-6 flex items-center gap-3 px-2">
        <Logo size={40} />
        <div>
          <p className="font-display text-lg leading-none">{brand.name}</p>
          <p className="text-xs text-charcoal/50 dark:text-cream/50">{brand.city}</p>
        </div>
      </div>
      {items.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.to === '/'}
          className={({ isActive }) => cx('group flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold transition',
            isActive ? 'bg-honey text-charcoal shadow-sm' : 'text-charcoal/70 hover:bg-charcoal/5 dark:text-cream/70 dark:hover:bg-white/5')}>
          {({ isActive }) => (
            <>
              <span className={cx('hex grid h-8 w-8 place-items-center', isActive ? 'bg-white/60 text-charcoal' : ACCENT[n.accent])}>
                <n.icon className="h-4 w-4" />
              </span>
              {n.label}
              {n.ceo && <Lock className="ml-auto h-3.5 w-3.5 opacity-40" />}
            </>
          )}
        </NavLink>
      ))}
      <div className="mt-auto rounded-2xl bg-charcoal/5 p-3 dark:bg-white/5">
        <p className="truncate font-semibold">{profile!.full_name || profile!.username}</p>
        <p className="text-xs uppercase tracking-wide text-charcoal/50 dark:text-cream/50">{isCeo ? 'CEO' : 'Coordinator'}</p>
        <button onClick={signOut} className="mt-2 flex items-center gap-2 text-sm font-semibold text-red-500"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen lg:pl-72">
      <aside className="honeycomb fixed inset-y-0 left-0 hidden w-72 border-r border-charcoal/5 bg-white/70 backdrop-blur lg:block dark:border-white/5 dark:bg-card/70">
        {sidebar}
      </aside>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-30 bg-charcoal/40 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.aside initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }} transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
              className="honeycomb h-full w-72 bg-cream dark:bg-night" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setOpen(false)} className="absolute right-3 top-3 p-2" aria-label="Close menu"><X /></button>
              {sidebar}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-charcoal/5 bg-cream/80 px-4 py-3 backdrop-blur sm:px-6 dark:border-white/5 dark:bg-night/80">
        <button onClick={() => setOpen(true)} className="rounded-xl p-2 lg:hidden" aria-label="Open menu"><Menu /></button>
        <div className="ml-auto" />
        <Notifications />
        <button onClick={toggleTheme} className="rounded-xl p-2 hover:bg-charcoal/5 dark:hover:bg-white/10" aria-label="Toggle dark mode">
          {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <Suspense fallback={<Splash />}>
          <motion.div key={loc.pathname + loc.search} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Boundary key={loc.pathname + loc.search}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/admissions" element={<Guard m="admissions"><Admissions /></Guard>} />
              <Route path="/inquiries" element={<Guard m="inquiries"><Inquiries /></Guard>} />
              <Route path="/fees" element={<Guard m="fees"><Fees /></Guard>} />
              <Route path="/staff" element={<Guard m="payments"><StaffPage /></Guard>} />
              <Route path="/payments" element={<Guard m="payments"><Payments /></Guard>} />
              <Route path="/attendance" element={<Guard m="attendance"><Attendance /></Guard>} />
              <Route path="/whatsapp" element={<Guard m="whatsapp"><WhatsApp /></Guard>} />
              <Route path="/website" element={<Guard m="website"><WebsiteContent /></Guard>} />
              <Route path="/team" element={<Guard ceo><Team /></Guard>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
            </Boundary>
          </motion.div>
        </Suspense>
      </main>
    </div>
  )
}
