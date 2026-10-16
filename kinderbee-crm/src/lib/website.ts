import { supabase } from './supabase'
import { brand } from '../config/brand'

// Calls the live website's content API as the signed-in CRM user. The website asks this CRM whether the account
// is active and is the CEO or has the Website Content module before it allows any change.
export async function site<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(brand.websiteUrl + path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `The website returned an error (${res.status})`)
  return json as T
}

export type WebsiteFolder = 'gallery' | 'opportunities' | 'blog-uploads'

// Shrinks a photo to at most 1600px (JPEG, 85%) so uploads stay well under the website's 4 MB request limit,
// then stores it in the website's image storage and returns its public URL.
export async function uploadImage(file: File, folder: WebsiteFolder): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`)
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // transparent PNGs would otherwise turn black as JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('Could not read the image'))), 'image/jpeg', 0.85))
  const dataBase64 = await new Promise<string>((ok) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1])
    r.readAsDataURL(blob)
  })
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  const { url } = await site<{ url: string }>('/api/upload', 'POST', { name, contentType: 'image/jpeg', dataBase64, folder })
  return url
}

// Opens the file picker and resolves with the chosen images (empty if cancelled)
export function pickImages(multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = multiple
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.click()
  })
}

// "classroom-art_day.jpg" -> "Classroom art day"
export const titleFromFile = (name: string) => {
  const t = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : 'Photo'
}
