import { useEffect, useState } from 'react'
import { CalendarOff, Code2, GraduationCap, MessageCircle, Plus, Save, Settings as SettingsIcon, Trash2, UserRound } from 'lucide-react'
import { useAuth } from '../auth'
import { must, supabase } from '../lib/supabase'
import { fmtDate } from '../lib/util'
import { Button, Card, inputCls, Label, PageHeader, Select, toast } from '../ui'

// Write-only secrets read by the edge functions (an env var of the same name in upper case wins)
const SECRETS = [
  ['whatsapp_token', 'Permanent access token', 'EAAG…'],
  ['whatsapp_app_secret', 'Meta app secret (checks webhook signatures)', 'App settings → Basic'],
  ['whatsapp_verify_token', 'Webhook verify token', 'Any long random string'],
  ['meta_page_token', 'Facebook Page access token (Meta Lead Ads)', 'Page token with leads_retrieval'],
  ['anthropic_api_key', 'Anthropic API key (AI assistant)', 'sk-ant-…'],
] as const

export default function Settings() {
  const { profile, isCeo, settings, reloadSettings, setProfile } = useAuth()
  const [name, setName] = useState(profile!.full_name)
  const [programs, setPrograms] = useState(settings.programs)
  const [newProgram, setNewProgram] = useState('')
  const [holidays, setHolidays] = useState(settings.holidays)
  const [hol, setHol] = useState({ date: '', name: '' })
  const [year, setYear] = useState(settings.academic_year)
  const [wa, setWa] = useState(settings.whatsapp)
  const [limits, setLimits] = useState(settings.campaign_limits)
  const [secrets, setSecrets] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState('')

  useEffect(() => {
    if (isCeo) Promise.all(SECRETS.map(([k]) => supabase.rpc('has_secret', { k }).then(({ data }) => [k, !!data] as const)))
      .then((r) => setSaved(Object.fromEntries(r)))
  }, [isCeo])

  async function save(key: string, value: unknown) {
    setBusy(key)
    const { error } = await supabase.from('settings').upsert({ key, value })
    setBusy('')
    if (error) return toast(error.message, 'error')
    await reloadSettings()
    toast('Saved')
  }

  async function saveWhatsApp() {
    for (const [k, v] of Object.entries(secrets)) {
      if (!v.trim()) continue
      const { error } = await supabase.rpc('set_secret', { k, v: v.trim() })
      if (error) return toast(error.message, 'error')
      setSaved((s) => ({ ...s, [k]: true }))
    }
    setSecrets({})
    // The campaign queue (pg_cron → wa-worker) calls the functions at this address
    await save('whatsapp', { ...wa, functions_url: `${import.meta.env.VITE_SUPABASE_URL ?? ''}/functions/v1` })
    await save('campaign_limits', limits)
  }

  const intakeUrl = `${import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co'}/rest/v1/rpc/submit_lead`
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'YOUR-ANON-KEY'
  const ro = !isCeo

  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" subtitle={isCeo ? 'Configure your school' : 'Only the CEO can change these'} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg"><UserRound className="h-5 w-5 text-honey" />Your account</h2>
          {isCeo ? (
            <form className="mb-2 flex gap-2" onSubmit={async (e) => {
              e.preventDefault()
              const full_name = name.trim()
              if (!full_name) return toast('Enter a name', 'error')
              setBusy('name')
              try {
                setProfile(await must(supabase.from('profiles').update({ full_name }).eq('id', profile!.id).select().single()))
                toast('Name updated')
              } catch (x: any) { toast(x.message, 'error') } finally { setBusy('') }
            }}>
              <Label label="CEO name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Label>
              <Button type="submit" icon={Save} loading={busy === 'name'} disabled={name.trim() === profile!.full_name} className="self-end">Save</Button>
            </form>
          ) : <p className="font-semibold">{profile!.full_name}</p>}
          <p className="text-sm opacity-60">@{profile!.username} · {isCeo ? 'CEO' : 'Coordinator'} · {profile!.phone ?? 'no phone'}</p>
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg"><GraduationCap className="h-5 w-5 text-mint-ink" />Programs & academic year</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            {programs.map((p) => (
              <span key={p} className="flex items-center gap-1 rounded-full bg-mint px-3 py-1 text-sm font-semibold text-mint-ink">
                {p}{!ro && <button onClick={() => setPrograms(programs.filter((x) => x !== p))} aria-label={`Remove ${p}`}><Trash2 className="h-3.5 w-3.5" /></button>}
              </span>
            ))}
          </div>
          {!ro && (
            <div className="flex gap-2">
              <input className={inputCls} value={newProgram} onChange={(e) => setNewProgram(e.target.value)} placeholder="Add a program" />
              <Button variant="soft" icon={Plus} onClick={() => { if (newProgram.trim()) { setPrograms([...programs, newProgram.trim()]); setNewProgram('') } }}>Add</Button>
            </div>
          )}
          <Label label="Current academic year" className="mt-3">
            <input className={inputCls} value={year} onChange={(e) => setYear(e.target.value)} disabled={ro} placeholder="2026-27" />
          </Label>
          {!ro && (
            <Button className="mt-3" icon={Save} loading={busy === 'programs'}
              onClick={async () => { await save('programs', programs); await save('academic_year', year) }}>Save</Button>
          )}
        </Card>

        <Card>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg"><CalendarOff className="h-5 w-5 text-rose-ink" />Holidays</h2>
          <p className="mb-3 text-sm opacity-60">Greyed out on the attendance grid, like Sundays.</p>
          <ul className="mb-3 space-y-1">
            {[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
              <li key={h.date} className="flex items-center justify-between rounded-2xl bg-rose/50 px-3 py-1.5 text-sm dark:bg-rose/10">
                <span><b>{fmtDate(h.date)}</b> · {h.name}</span>
                {!ro && <button onClick={() => setHolidays(holidays.filter((x) => x.date !== h.date))} aria-label="Remove holiday"><Trash2 className="h-4 w-4" /></button>}
              </li>
            ))}
            {!holidays.length && <li className="text-sm opacity-50">No holidays added.</li>}
          </ul>
          {!ro && (
            <>
              <div className="flex flex-wrap gap-2">
                <input type="date" className={inputCls + ' w-44'} value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} />
                <input className={inputCls + ' flex-1'} value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} placeholder="Holiday name" />
                <Button variant="soft" icon={Plus} onClick={() => {
                  if (!hol.date) return
                  setHolidays([...holidays.filter((x) => x.date !== hol.date), { date: hol.date, name: hol.name || 'Holiday' }])
                  setHol({ date: '', name: '' })
                }}>Add</Button>
              </div>
              <Button className="mt-3" icon={Save} loading={busy === 'holidays'} onClick={() => save('holidays', holidays)}>Save holidays</Button>
            </>
          )}
        </Card>

        {isCeo && (
          <Card>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg"><MessageCircle className="h-5 w-5 text-leaf-ink" />WhatsApp Business API</h2>
            <p className="mb-3 text-sm opacity-60">
              From Meta Business → WhatsApp → API setup. Secrets are write-only: once saved they're never shown again.
            </p>
            <div className="space-y-3">
              <Label label="Sending mode">
                <Select value={wa.mode ?? (wa.enabled ? 'live' : 'off')} onChange={(v) => setWa({ ...wa, mode: v as 'off' | 'mock' | 'live', enabled: v === 'live' })}
                  options={[
                    { value: 'off', label: 'Off: tap-to-send wa.me links' },
                    { value: 'mock', label: 'Mock: simulated, nothing is sent (for testing)' },
                    { value: 'live', label: 'Live: send through the Cloud API' },
                  ]} />
              </Label>
              <Label label="WhatsApp Business Account ID">
                <input className={inputCls} value={wa.business_account_id ?? ''} onChange={(e) => setWa({ ...wa, business_account_id: e.target.value.trim() })} />
              </Label>
              <Label label="Phone number ID">
                <input className={inputCls} value={wa.phone_number_id} onChange={(e) => setWa({ ...wa, phone_number_id: e.target.value.trim() })} />
              </Label>
              {SECRETS.map(([k, label, ph]) => (
                <Label key={k} label={`${label} ${saved[k] ? '(saved; leave blank to keep)' : ''}`}>
                  <input type="password" className={inputCls} value={secrets[k] ?? ''} onChange={(e) => setSecrets({ ...secrets, [k]: e.target.value })}
                    placeholder={saved[k] ? '••••••••' : ph} autoComplete="off" />
                </Label>
              ))}
              <p className="text-xs opacity-60">
                Webhook callback URL for Meta: <code className="break-all">{import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co'}/functions/v1/whatsapp-webhook</code>.
                Subscribe it to the <b>messages</b> field, using the verify token above.
                For Meta Lead Ads, subscribe your Facebook Page's <b>leadgen</b> field to <code className="break-all">{import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR-PROJECT.supabase.co'}/functions/v1/meta-leads</code> with the same verify token.
              </p>
              {wa.mode === 'live' && (!saved.whatsapp_token || !wa.phone_number_id) && (
                <p className="text-xs text-rose-ink">Live mode needs the phone number ID and access token. Until then sends fall back to wa.me links.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Label label="Campaign messages per minute"><input type="number" min={1} max={500} className={inputCls} value={limits.per_minute} onChange={(e) => setLimits({ ...limits, per_minute: Number(e.target.value) || 1 })} /></Label>
                <Label label="Campaign messages per day"><input type="number" min={1} className={inputCls} value={limits.daily_max} onChange={(e) => setLimits({ ...limits, daily_max: Number(e.target.value) || 1 })} /></Label>
              </div>
              <p className="text-xs opacity-60">Keep these within your number's Meta messaging limit tier; new numbers start low.</p>
              <Button icon={Save} loading={busy === 'whatsapp'} onClick={saveWhatsApp}>Save WhatsApp settings</Button>
            </div>
          </Card>
        )}

        {isCeo && (
          <Card className="lg:col-span-2">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg"><Code2 className="h-5 w-5 text-lav-ink" />Website lead endpoint</h2>
            <p className="mb-2 text-sm opacity-60">
              Point your website forms here. <code>category</code> is one of admission, ntt, consultation, franchise, cbse, degree, jv, general. Send <code>whatsapp_opt_in: true</code> only when the visitor ticked a WhatsApp consent box. Any extra fields (e.g. investment_budget) are saved too.
            </p>
            <pre className="overflow-x-auto rounded-2xl bg-charcoal p-4 text-xs text-cream">{`fetch('${intakeUrl}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: '${anonKey}' },
  body: JSON.stringify({ p: {
    category: 'franchise', name: 'Asha', phone: '9845012345', email: 'asha@example.com',
    city: 'Mysuru', message: 'Interested', investment_budget: '₹15 lakh', preferred_location: 'Mysuru'
  } })
})`}</pre>
          </Card>
        )}
      </div>
    </>
  )
}
