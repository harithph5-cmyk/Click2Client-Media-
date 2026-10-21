import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export const MODULES = {
  admissions: 'Admissions',
  inquiries: 'Website Inquiries',
  fees: 'Fees',
  payments: 'Payments',
  attendance: 'Attendance',
  whatsapp: 'WhatsApp',
  website: 'Website Content',
} as const
export type ModuleKey = keyof typeof MODULES

export type Profile = {
  id: string; full_name: string; phone: string | null; username: string | null
  role: 'ceo' | 'coordinator'; modules: ModuleKey[]; can_verify: boolean; active: boolean
}

export type Settings = {
  programs: string[]
  holidays: { date: string; name: string }[]
  academic_year: string
  // off = wa.me links, mock = simulated sends (nothing leaves the CRM), live = Cloud API
  whatsapp: { phone_number_id: string; enabled?: boolean; mode?: 'off' | 'mock' | 'live'; business_account_id?: string }
}

export const waMode = (s: Settings) => s.whatsapp.mode ?? (s.whatsapp.enabled ? 'live' : 'off')

const defaults: Settings = {
  programs: ['Playgroup', 'Nursery', 'Junior KG / LKG', 'Senior KG / UKG', 'Daycare & Extended Care'],
  holidays: [],
  academic_year: '2026-27',
  whatsapp: { phone_number_id: '', mode: 'off' },
}

type Auth = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  settings: Settings
  isCeo: boolean
  can: (m: ModuleKey) => boolean
  canVerify: boolean
  reloadSettings: () => Promise<void>
  setProfile: (p: Profile) => void
  signIn: (email: string, password: string, role: Profile['role']) => Promise<void>
  authError: string
  signOut: () => Promise<void>
}

const Ctx = createContext<Auth>(null!)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [settings, setSettings] = useState<Settings>(defaults)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const expectedRole = useRef<Profile['role'] | null>(null) // which login tab was used

  const reloadSettings = useCallback(async () => {
    const { data } = await supabase.from('settings').select('key, value')
    if (data) setSettings({ ...defaults, ...Object.fromEntries(data.map((r) => [r.key, r.value])) })
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) { setProfile(null); return }
    setLoading(true)
    Promise.all([supabase.from('profiles').select('*').eq('id', uid).single(), reloadSettings()]).then(async ([{ data }]) => {
      const want = expectedRole.current
      expectedRole.current = null
      const error = !data?.active ? 'This account is deactivated.'
        : want && data.role !== want ? `This is not a ${want === 'ceo' ? 'CEO' : 'coordinator'} account. Use the other tab.` : ''
      if (error) { setAuthError(error); await supabase.auth.signOut() }
      setProfile(error ? null : data)
      setLoading(false)
    })
  }, [uid, reloadSettings])

  const isCeo = profile?.role === 'ceo'
  const value: Auth = {
    session, profile, loading, settings, isCeo, reloadSettings, setProfile,
    can: (m) => isCeo || !!profile?.modules.includes(m),
    canVerify: isCeo || (!!profile?.can_verify && !!profile?.modules.includes('payments')),
    authError,
    signIn: async (email, password, role) => {
      setAuthError('')
      expectedRole.current = role
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        expectedRole.current = null
        setAuthError(error.message === 'Invalid login credentials' ? 'Wrong username or password.' : error.message)
      }
    },
    signOut: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
