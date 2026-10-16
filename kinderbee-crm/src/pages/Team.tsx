import { useState } from 'react'
import { KeyRound, Pencil, Power, UserPlus, Users } from 'lucide-react'
import { MODULES, useAuth, type ModuleKey, type Profile } from '../auth'
import { must, supabase } from '../lib/supabase'
import { brand } from '../config/brand'
import { Button, Card, cx, Empty, FormModal, Loading, PageHeader, Pill, Table, toast, useRows, type Field } from '../ui'

const moduleFields: Field[] = [
  ...Object.entries(MODULES).map(([k, label]) => ({ key: `m_${k}`, label: `Access: ${label}`, type: 'checkbox' as const })),
  { key: 'can_verify', label: 'Can verify service payments', type: 'checkbox' },
]
const pickModules = (v: Record<string, unknown>) => (Object.keys(MODULES) as ModuleKey[]).filter((k) => v[`m_${k}`])

// Position presets apply their modules; "Custom" uses the ticked boxes. Team management stays CEO-only.
const POSITIONS: Record<string, { modules: ModuleKey[]; verify: boolean }> = {
  'Technical Admin': { modules: Object.keys(MODULES) as ModuleKey[], verify: true },
  Coordinator: { modules: ['admissions', 'inquiries', 'fees', 'attendance', 'whatsapp'], verify: false },
  'Sales & Marketing': { modules: ['inquiries', 'whatsapp'], verify: false },
}
const CUSTOM = 'Custom (use the boxes below)'
const positionField: Field = { key: 'position', label: 'Position', required: true, full: true, type: 'select', options: [...Object.keys(POSITIONS), CUSTOM] }
const access = (v: Record<string, unknown>) => POSITIONS[v.position as string] ?? { modules: pickModules(v), verify: !!v.can_verify }
const positionOf = (p: Profile) => p.role === 'ceo' ? 'CEO' : Object.entries(POSITIONS).find(([, s]) =>
  s.verify === p.can_verify && s.modules.length === p.modules.length && s.modules.every((m) => p.modules.includes(m)))?.[0] ?? 'Custom access'

export default function Team() {
  const { profile: me } = useAuth()
  const { rows, loading, reload } = useRows<Profile>(() => supabase.from('profiles').select('*').order('role').order('full_name'))
  const [mode, setMode] = useState<null | 'create' | { edit: Profile } | { reset: Profile }>(null)

  async function toggleActive(p: Profile) {
    if (!confirm(`${p.active ? 'Deactivate' : 'Reactivate'} ${p.full_name}?`)) return
    try {
      await must(supabase.rpc('admin_set_active', { p_id: p.id, p_active: !p.active }))
      toast(p.active ? 'Account deactivated' : 'Account reactivated')
      reload()
    } catch (e: any) { toast(e.message, 'error') }
  }

  const edit = mode && typeof mode === 'object' && 'edit' in mode ? mode.edit : null
  const reset = mode && typeof mode === 'object' && 'reset' in mode ? mode.reset : null

  return (
    <>
      <PageHeader icon={Users} title="Team" subtitle="Team accounts and what each can access"
        actions={<Button icon={UserPlus} onClick={() => setMode('create')}>Add team member</Button>} />
      <Card>
        {loading ? <Loading /> : (
          <Table rows={rows} rowKey={(r) => r.id}
            empty={<Empty title="No team members yet" text="Add your Technical Admin, Coordinator and Sales & Marketing accounts." />}
            cols={[
              { label: 'Name', render: (r) => <><p className="font-semibold">{r.full_name}</p><p className="text-xs opacity-60">@{r.username} · {r.phone ?? '—'}</p></> },
              { label: 'Position', render: (r) => <Pill s={positionOf(r)} className={r.role === 'ceo' ? '!bg-honey' : ''} /> },
              { label: 'Modules', render: (r) => r.role === 'ceo' ? <span className="text-sm opacity-60">Everything</span> : (
                <div className="flex flex-wrap gap-1">
                  {r.modules.length ? r.modules.map((m) => <span key={m} className="rounded-full bg-charcoal/5 px-2 py-0.5 text-xs dark:bg-white/10">{MODULES[m]}</span>) : <span className="text-sm opacity-50">None</span>}
                  {r.can_verify && <span className="rounded-full bg-mint px-2 py-0.5 text-xs text-mint-ink">Verifier</span>}
                </div>
              ) },
              { label: 'Status', render: (r) => <span className={cx('text-sm font-semibold', r.active ? 'text-mint-ink' : 'text-red-500')}>{r.active ? 'Active' : 'Deactivated'}</span> },
              { label: '', className: 'text-right', render: (r) => r.id === me!.id ? null : (
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setMode({ edit: r })} aria-label="Edit access" />
                  <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setMode({ reset: r })} aria-label="Reset password" />
                  <Button size="sm" variant="ghost" icon={Power} onClick={() => toggleActive(r)} aria-label={r.active ? 'Deactivate' : 'Reactivate'} />
                </div>
              ) },
            ]} />
        )}
      </Card>

      <FormModal open={mode === 'create'} onClose={() => setMode(null)} title="New team member" submitLabel="Create account"
        fields={[
          { key: 'full_name', label: 'Full name', required: true },
          { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+91' },
          { key: 'username', label: 'Username or email', required: true, placeholder: `e.g. anita → anita@${brand.loginDomain}` },
          { key: 'password', label: 'Password', required: true, placeholder: 'At least 6 characters' },
          positionField,
          ...moduleFields,
        ]}
        onSubmit={async (v) => {
          const a = access(v)
          await must(supabase.rpc('admin_create_user', {
            p_username: v.username, p_password: v.password, p_full_name: v.full_name, p_phone: v.phone ?? null,
            p_modules: a.modules, p_can_verify: a.verify, p_domain: brand.loginDomain,
          }))
          toast('Account created — share their username and password with them')
          reload()
        }} />

      <FormModal open={!!edit} onClose={() => setMode(null)} title={`Access for ${edit?.full_name}`}
        initial={edit ? { full_name: edit.full_name, phone: edit.phone, can_verify: edit.can_verify, position: POSITIONS[positionOf(edit)] ? positionOf(edit) : CUSTOM, ...Object.fromEntries(edit.modules.map((m) => [`m_${m}`, true])) } : undefined}
        fields={[{ key: 'full_name', label: 'Full name', required: true }, { key: 'phone', label: 'Phone', type: 'tel' }, positionField, ...moduleFields]}
        onSubmit={async (v) => {
          const a = access(v)
          const { error } = await supabase.from('profiles').update({ full_name: v.full_name, phone: v.phone, modules: a.modules, can_verify: a.verify }).eq('id', edit!.id)
          if (error) throw error
          toast('Access updated')
          reload()
        }} />

      <FormModal open={!!reset} onClose={() => setMode(null)} title={`Reset password · ${reset?.full_name}`} submitLabel="Set password"
        fields={[{ key: 'password', label: 'New password', required: true, placeholder: 'At least 6 characters' }]}
        onSubmit={async (v) => {
          await must(supabase.rpc('admin_reset_password', { p_id: reset!.id, p_password: v.password }))
          toast('Password changed')
        }} />
    </>
  )
}
