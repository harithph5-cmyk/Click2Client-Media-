import { useCallback, useEffect, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, X, type LucideIcon } from 'lucide-react'
import { brand } from './config/brand'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// Per-module pastel accents
export const ACCENT = {
  honey: 'bg-honey/25 text-amber-800 dark:text-honey',
  admissions: 'bg-mint text-mint-ink dark:bg-mint/15 dark:text-mint',
  inquiries: 'bg-lav text-lav-ink dark:bg-lav/15 dark:text-lav',
  fees: 'bg-peach text-peach-ink dark:bg-peach/15 dark:text-peach',
  payments: 'bg-sky text-sky-ink dark:bg-sky/15 dark:text-sky',
  attendance: 'bg-rose text-rose-ink dark:bg-rose/15 dark:text-rose',
  whatsapp: 'bg-leaf text-leaf-ink dark:bg-leaf/15 dark:text-leaf',
} as const
export type Accent = keyof typeof ACCENT

// ───────── Brand ─────────
function BeeMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M32 3 57 17.5v29L32 61 7 46.5v-29Z" fill={brand.colors.primary} />
      <ellipse cx="24" cy="22" rx="8" ry="5" fill="#fff" opacity=".85" transform="rotate(-25 24 22)" />
      <ellipse cx="40" cy="22" rx="8" ry="5" fill="#fff" opacity=".85" transform="rotate(25 40 22)" />
      <ellipse cx="32" cy="36" rx="11" ry="13" fill={brand.colors.primary} stroke={brand.colors.charcoal} strokeWidth="2.5" />
      <path d="M22 32h20M21.5 38h21M24 44h16" stroke={brand.colors.charcoal} strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="32" cy="22" r="5" fill={brand.colors.charcoal} />
    </svg>
  )
}

export function Logo({ size = 40 }: { size?: number }) {
  const [broken, setBroken] = useState(false)
  if (broken) return <BeeMark size={size} />
  return <img src={brand.logo} alt={brand.school} width={size} height={size} className="object-contain" onError={() => setBroken(true)} />
}

/** Seven hexagons lighting up like a honeycomb filling, with a bee circling. */
export function BeeLoader({ size = 72 }: { size?: number }) {
  const hexes = [[0, 0], [1, 0], [0.5, 0.87], [-0.5, 0.87], [-1, 0], [-0.5, -0.87], [0.5, -0.87]]
  return (
    <div className="relative" style={{ width: size * 1.6, height: size * 1.6 }}>
      <svg viewBox="-1.8 -1.8 3.6 3.6" className="absolute inset-0 h-full w-full">
        {hexes.map(([x, y], i) => (
          <motion.path
            key={i}
            d="M0-.5.43-.25v.5L0 .5-.43.25v-.5Z"
            transform={`translate(${x} ${y})`}
            fill={brand.colors.primary}
            stroke={brand.colors.charcoal}
            strokeWidth=".04"
            initial={{ opacity: 0.15 }}
            animate={{ opacity: [0.15, 1, 0.15] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.12 }}
          />
        ))}
      </svg>
      <motion.div
        className="absolute inset-0"
        animate={{ rotate: 360 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}
      >
        <motion.span
          className="absolute -top-1 left-1/2 -translate-x-1/2 text-xl"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.4, repeat: Infinity }}
        >
          🐝
        </motion.span>
      </motion.div>
    </div>
  )
}

export function Splash({ label }: { label?: string }) {
  return (
    <div className="honeycomb fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-cream dark:bg-night">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }}>
        <Logo size={96} />
      </motion.div>
      <BeeLoader />
      <p className="font-display text-lg text-charcoal/70 dark:text-cream/70">{label ?? brand.name}</p>
    </div>
  )
}

// ───────── Basics ─────────
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'soft' | 'ghost' | 'danger'
  icon?: LucideIcon
  loading?: boolean
  size?: 'sm' | 'md'
}
export function Button({ variant = 'primary', icon: Icon, loading, size = 'md', className, children, disabled, ...p }: BtnProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5',
        variant === 'primary' && 'bg-honey text-charcoal shadow-[0_4px_0_0_rgba(0,0,0,0.12)] hover:brightness-105',
        variant === 'soft' && 'bg-charcoal/5 text-charcoal hover:bg-charcoal/10 dark:bg-white/10 dark:text-cream dark:hover:bg-white/15',
        variant === 'ghost' && 'text-charcoal/70 hover:bg-charcoal/5 dark:text-cream/70 dark:hover:bg-white/10',
        variant === 'danger' && 'bg-red-500 text-white hover:bg-red-600',
        className,
      )}
      {...(p as any)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className="h-4 w-4" />}
      {children}
    </motion.button>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('min-w-0 rounded-3xl border border-charcoal/5 bg-white p-4 shadow-sm sm:p-5 dark:border-white/5 dark:bg-card', className)}>
      {children}
    </div>
  )
}

export const inputCls =
  'w-full rounded-2xl border border-charcoal/10 bg-cream/40 px-3.5 py-2.5 outline-none transition focus:border-honey focus:ring-4 focus:ring-honey/25 dark:border-white/10 dark:bg-white/5'

export function Label({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-charcoal/60 dark:text-cream/60">{label}</span>
      {children}
    </label>
  )
}

export function Select({ value, onChange, options, className, placeholder }: {
  value: string; onChange: (v: string) => void; options: (string | { value: string; label: string })[]
  className?: string; placeholder?: string
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputCls, 'py-2', className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => typeof o === 'string'
        ? <option key={o}>{o}</option>
        : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Modal({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', esc)
    return () => removeEventListener('keydown', esc)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-40 flex items-end justify-center bg-charcoal/40 backdrop-blur-sm sm:items-center sm:p-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
          <motion.div
            role="dialog" aria-modal aria-label={title}
            onMouseDown={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
            className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl dark:bg-card', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="font-display text-xl">{title}</h2>
              <button onClick={onClose} className="rounded-full p-1.5 hover:bg-charcoal/5 dark:hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <motion.div animate={{ y: [0, -8, 0] }} transition={{ duration: 2.5, repeat: Infinity }} className="relative mb-4">
        <svg width="96" height="84" viewBox="0 0 96 84" aria-hidden>
          <path d="M24 2h24l12 21-12 21H24L12 23Z" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="2" />
          <path d="M60 23h24l12 21-12 21H60L48 44Z" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="2" />
          <path d="M24 44h24l12 21-12 19H24L12 65Z" fill={brand.colors.primary} fillOpacity=".35" />
        </svg>
        <span className="absolute left-9 top-10 text-3xl">🐝</span>
      </motion.div>
      <p className="font-display text-lg">{title}</p>
      {text && <p className="mt-1 max-w-sm text-sm text-charcoal/60 dark:text-cream/60">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

const PILL: Record<string, string> = {
  New: 'bg-sky text-sky-ink', Contacted: 'bg-lav text-lav-ink', 'Visit Scheduled': 'bg-peach text-peach-ink',
  'Follow-up': 'bg-peach text-peach-ink', Admitted: 'bg-mint text-mint-ink', Converted: 'bg-mint text-mint-ink',
  'Not Interested': 'bg-charcoal/10 text-charcoal/60', Closed: 'bg-charcoal/10 text-charcoal/60',
  Pending: 'bg-honey/30 text-amber-800', Verified: 'bg-mint text-mint-ink', Rejected: 'bg-rose text-rose-ink',
  sent: 'bg-sky text-sky-ink', delivered: 'bg-mint text-mint-ink', read: 'bg-mint text-mint-ink',
  failed: 'bg-rose text-rose-ink', link: 'bg-leaf text-leaf-ink', queued: 'bg-honey/30 text-amber-800',
  Overdue: 'bg-rose text-rose-ink', Paid: 'bg-mint text-mint-ink', Due: 'bg-honey/30 text-amber-800',
  open: 'bg-sky text-sky-ink', resolved: 'bg-charcoal/10 text-charcoal/60', received: 'bg-lav text-lav-ink',
  SIMULATED: 'bg-peach text-peach-ink', 'Opted out': 'bg-rose text-rose-ink',
}
export const Pill = ({ s, className }: { s: string; className?: string }) => (
  <span className={cx('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold', PILL[s] ?? 'bg-charcoal/10', className)}>{s}</span>
)

export function PageHeader({ icon: Icon, title, subtitle, accent = 'honey', actions }: {
  icon: LucideIcon; title: string; subtitle?: string; accent?: Accent; actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className={cx('hex grid h-12 w-12 place-items-center', ACCENT[accent])}><Icon className="h-6 w-6" /></div>
        <div>
          <h1 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h1>
          {subtitle && <p className="text-sm text-charcoal/60 dark:text-cream/60">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Tabs<K extends string>({ tabs, value, onChange }: {
  tabs: { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void
}) {
  return (
    <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={cx('relative whitespace-nowrap rounded-2xl px-3.5 py-2 text-sm font-semibold transition',
            value === t.key ? 'text-charcoal' : 'text-charcoal/60 hover:bg-charcoal/5 dark:text-cream/60 dark:hover:bg-white/5')}>
          {value === t.key && <motion.span layoutId={`tab-${tabs[0].key}`} className="absolute inset-0 rounded-2xl bg-honey" />}
          <span className="relative">{t.label}{t.count != null && <span className="ml-1.5 opacity-60">{t.count}</span>}</span>
        </button>
      ))}
    </div>
  )
}

export function Kpi({ label, value, icon: Icon, accent = 'honey', hint }: {
  label: string; value: ReactNode; icon: LucideIcon; accent?: Accent; hint?: string
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="relative overflow-hidden">
        <div className={cx('hex absolute -right-4 -top-4 h-20 w-20 opacity-60', ACCENT[accent])} />
        <Icon className={cx('relative mb-3 h-6 w-6', ACCENT[accent].split(' ').find((c) => c.startsWith('text-')))} />
        <p className="relative font-display text-2xl sm:text-3xl">{value}</p>
        <p className="relative text-sm text-charcoal/60 dark:text-cream/60">{label}</p>
        {hint && <p className="relative mt-1 text-xs text-charcoal/40 dark:text-cream/40">{hint}</p>}
      </Card>
    </motion.div>
  )
}

export type Column<T> = { label: string; render: (r: T) => ReactNode; className?: string }
export function Table<T>({ cols, rows, onRow, empty, rowKey }: {
  cols: Column<T>[]; rows: T[]; onRow?: (r: T) => void; empty?: ReactNode; rowKey: (r: T) => string
}) {
  if (!rows.length) return <>{empty ?? <Empty title="Nothing here yet" />}</>
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-charcoal/5 text-left text-xs uppercase tracking-wide text-charcoal/50 dark:border-white/5 dark:text-cream/50">
            {cols.map((c) => <th key={c.label} className={cx('px-4 py-2 font-semibold first:pl-4 sm:first:pl-5', c.className)}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRow && (() => onRow(r))}
              className={cx('border-b border-charcoal/5 last:border-0 dark:border-white/5', onRow && 'cursor-pointer hover:bg-honey/5')}>
              {cols.map((c) => <td key={c.label} className={cx('px-4 py-3 first:pl-4 sm:first:pl-5', c.className)}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ───────── Forms ─────────
export type Field = {
  key: string; label: string; required?: boolean; full?: boolean; placeholder?: string; accept?: string
  type?: 'text' | 'tel' | 'email' | 'date' | 'time' | 'number' | 'select' | 'textarea' | 'file' | 'checkbox'
  options?: (string | { value: string; label: string })[]
}
export type FormValues = Record<string, any>

export function FormFields({ fields, values, set }: { fields: Field[]; values: FormValues; set: (k: string, v: any) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const common = { required: f.required, placeholder: f.placeholder, className: inputCls }
        const label = f.label + (f.required ? ' *' : '')
        const span = f.full || f.type === 'textarea' ? 'sm:col-span-2' : ''
        if (f.type === 'checkbox')
          return (
            <label key={f.key} className={cx('flex items-center gap-2 py-2', span)}>
              <input type="checkbox" checked={!!values[f.key]} onChange={(e) => set(f.key, e.target.checked)} className="h-4 w-4 accent-honey" />
              <span className="text-sm">{f.label}</span>
            </label>
          )
        return (
          <Label key={f.key} label={label} className={span}>
            {f.type === 'select' ? (
              <select {...common} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}>
                <option value="">Select…</option>
                {f.options!.map((o) => typeof o === 'string'
                  ? <option key={o}>{o}</option>
                  : <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === 'textarea' ? (
              <textarea {...common} rows={3} value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            ) : f.type === 'file' ? (
              <input type="file" accept={f.accept ?? 'image/*,application/pdf'} className={cx(inputCls, 'py-2 text-sm')}
                onChange={(e) => set(f.key, e.target.files?.[0] ?? null)} />
            ) : (
              <input {...common} type={f.type ?? 'text'} step={f.type === 'number' ? 'any' : undefined}
                value={values[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </Label>
        )
      })}
    </div>
  )
}

/** Generic add/edit dialog driven by field definitions. */
export function FormModal({ open, onClose, title, fields, initial, onSubmit, submitLabel = 'Save', wide, children }: {
  open: boolean; onClose: () => void; title: string; fields: Field[]; initial?: FormValues
  onSubmit: (v: FormValues) => Promise<void>; submitLabel?: string; wide?: boolean; children?: ReactNode
}) {
  const [values, setValues] = useState<FormValues>({})
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setValues(initial ?? {}) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- reset only when opened
  return (
    <Modal open={open} onClose={onClose} title={title} wide={wide}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try { await onSubmit(values); onClose() } catch (err: any) { toast(err.message, 'error') } finally { setBusy(false) }
        }}
      >
        <FormFields fields={fields} values={values} set={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={busy}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}

/** Blank strings → null so optional DB columns (dates, numbers) accept them. */
export const clean = (v: FormValues, keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, v[k] === '' || v[k] === undefined ? null : v[k]]))

// ───────── Data loading ─────────
export function useRows<T>(load: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, deps: unknown[] = []) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const reload = useCallback(async () => {
    setLoading(true)
    const { data, error } = await load()
    if (error) toast(error.message, 'error')
    setRows(data ?? [])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { reload() }, [reload])
  return { rows, loading, reload, setRows }
}

export const Loading = () => <div className="grid place-items-center py-16"><BeeLoader size={48} /></div>

// ───────── Toasts ─────────
type Toast = { id: number; msg: string; kind: 'ok' | 'error' }
const listeners = new Set<(t: Toast) => void>()
export const toast = (msg: string, kind: Toast['kind'] = 'ok') => listeners.forEach((l) => l({ id: Date.now() + Math.random(), msg, kind }))

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const l = (t: Toast) => {
      setItems((s) => [...s, t])
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 4000)
    }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div key={t.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={cx('rounded-2xl px-4 py-2.5 text-sm font-semibold shadow-lg', t.kind === 'error' ? 'bg-red-500 text-white' : 'bg-charcoal text-cream')}>
            {t.kind === 'ok' ? '🐝 ' : ''}{t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
