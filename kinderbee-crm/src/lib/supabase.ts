import { createClient } from '@supabase/supabase-js'
import { fillTemplate, placeholders, waLink } from './util'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const configured = !!(url && key)
export const supabase = createClient(url || 'http://localhost:54321', key || 'not-configured')

/** Throw on Supabase errors so callers can just await. */
export async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<NonNullable<T>> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as NonNullable<T>
}

/** Upload to the private `docs` bucket. First path segment must be the module key (RLS checks it). */
export async function upload(module: string, file: File | Blob, name?: string) {
  const ext = file instanceof File ? file.name.split('.').pop() : 'pdf'
  const path = `${module}/${name ?? `${crypto.randomUUID()}.${ext}`}`
  const { error } = await supabase.storage.from('docs').upload(path, file, { upsert: true })
  if (error) throw new Error(error.message)
  return path
}

export async function openFile(path: string) {
  const { data, error } = await supabase.storage.from('docs').createSignedUrl(path, 300)
  if (error) throw new Error(error.message)
  window.open(data.signedUrl, '_blank')
}

export async function callFn<T = any>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    const detail = await (error as any).context?.json?.().catch(() => null)
    throw new Error(detail?.error ?? error.message)
  }
  return data
}

export type WaMessage = {
  phone: string
  vars: Record<string, unknown>
  template: { name: string; body: string; meta_template?: string | null; lang?: string }
}
export type WaResult = { phone: string; status: string; error: string | null; simulated?: boolean }

/** Manual inbox reply. `key` stops a double-click from sending twice. Throws if it wasn't sent. */
export async function replyWhatsApp(phone: string, body: string, key: string) {
  const res = await callFn<{ configured: boolean; results?: WaResult[] }>('send-whatsapp', { messages: [{ phone, body, key, reply: true }] })
  if (!res.configured) throw new Error('WhatsApp sending is off. Choose Mock or Live in Settings.')
  const r = res.results![0]
  if (r.status !== 'sent' && r.status !== 'duplicate') throw new Error(r.error ?? 'Not sent')
  return r
}

/**
 * Sends WhatsApp messages through the Cloud API edge function.
 * If the API isn't configured, returns wa.me click-to-send links instead (and logs them).
 */
export async function sendWhatsApp(messages: WaMessage[]) {
  const payload = messages.map((m) => ({
    phone: m.phone,
    body: fillTemplate(m.template.body, m.vars),
    template: m.template.name,
    meta_template: m.template.meta_template || undefined,
    lang: m.template.lang,
    params: placeholders(m.template.body).map((k) => String(m.vars[k] ?? '')),
  }))
  let res: { configured: boolean; results?: WaResult[] }
  try {
    res = await callFn('send-whatsapp', { messages: payload })
  } catch {
    res = { configured: false } // function not deployed yet → links still work
  }
  if (res.configured) return { mode: 'api' as const, results: res.results! }
  await supabase.from('message_log').insert(payload.map((p) => ({ phone: p.phone, template: p.template, body: p.body, status: 'link' })))
  return { mode: 'links' as const, links: payload.map((p) => ({ phone: p.phone, body: p.body, url: waLink(p.phone, p.body) })) }
}
