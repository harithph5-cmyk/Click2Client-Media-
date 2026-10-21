// Meta helpers with no imports, so `npm test` can run them under plain Node as well as Deno.

/** Checks Meta's X-Hub-Signature-256 header (sha256=<hex HMAC of the raw body with the app secret>). */
export async function validSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  const sent = header?.startsWith('sha256=') ? header.slice(7).toLowerCase() : ''
  if (!/^[0-9a-f]{64}$/.test(sent) || !appSecret) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)))
  const want = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
  let diff = 0
  for (let i = 0; i < 64; i++) diff |= want.charCodeAt(i) ^ sent.charCodeAt(i) // constant time
  return diff === 0
}

/** Free-form (non-template) messages are only allowed within 24h of the contact's last message. */
export const inWindow = (lastInbound: string | null | undefined, now = Date.now()) =>
  !!lastInbound && now - new Date(lastInbound).getTime() < 24 * 3600 * 1000

/** A friendlier message for the Graph API errors staff will actually hit. */
export function graphError(err: { code?: number; message?: string; error_data?: { details?: string } } | undefined, httpStatus: number) {
  if (err?.code === 190) return 'WhatsApp access token expired or invalid. Update it in Settings.'
  if (err?.code === 131047) return 'Outside the 24-hour window. Use an approved template.'
  if (err?.code === 131026) return 'This number is not on WhatsApp or cannot receive messages.'
  return err?.error_data?.details ?? err?.message ?? `HTTP ${httpStatus}`
}
