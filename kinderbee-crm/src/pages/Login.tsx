import { useState } from 'react'
import { motion } from 'framer-motion'
import { Crown, LogIn, UserRound } from 'lucide-react'
import { brand } from '../config/brand'
import { configured } from '../lib/supabase'
import { useAuth } from '../auth'
import { Button, inputCls, Label, Logo, Tabs } from '../ui'

export default function Login() {
  const [tab, setTab] = useState<'ceo' | 'coordinator'>('ceo')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const { signIn, authError: error } = useAuth()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const email = login.includes('@') ? login.trim() : `${login.trim().toLowerCase()}@${brand.loginDomain}`
    await signIn(email, password, tab)
    setBusy(false)
  }

  return (
    <div className="honeycomb grid min-h-screen place-items-center bg-cream p-4 dark:bg-night">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <motion.div whileHover={{ rotate: [0, -8, 8, 0] }}><Logo size={88} /></motion.div>
          <h1 className="mt-3 font-display text-3xl">{brand.name}</h1>
          <p className="text-charcoal/60 dark:text-cream/60">Welcome back to the hive 🐝</p>
        </div>
        <div className="rounded-[2rem] border border-charcoal/5 bg-white p-6 shadow-xl shadow-honey/10 dark:border-white/5 dark:bg-card">
          <Tabs value={tab} onChange={setTab}
            tabs={[{ key: 'ceo', label: 'CEO Login' }, { key: 'coordinator', label: 'Coordinator Login' }]} />
          {!configured && (
            <p className="mb-4 rounded-2xl bg-peach p-3 text-sm text-peach-ink">
              Supabase isn't connected yet. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to <code>.env</code>.
            </p>
          )}
          <form onSubmit={submit} className="space-y-3">
            <Label label="Username or email">
              <div className="relative">
                {tab === 'ceo' ? <Crown className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-honey" /> : <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-40" />}
                <input className={inputCls + ' pl-9'} value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
              </div>
            </Label>
            <Label label="Password">
              <input type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Label>
            {error && <p className="text-sm font-semibold text-red-500" role="alert">{error}</p>}
            <Button type="submit" loading={busy} icon={LogIn} className="w-full">Sign in as {tab === 'ceo' ? 'CEO' : 'Coordinator'}</Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-charcoal/40 dark:text-cream/40">Forgot your password? Ask the CEO to reset it from the Team page.</p>
      </motion.div>
    </div>
  )
}
