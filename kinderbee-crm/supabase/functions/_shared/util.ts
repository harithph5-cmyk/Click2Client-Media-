import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const admin = () =>
  createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

/** A secret from the function's env (e.g. WHATSAPP_APP_SECRET), else the CEO-set app_secrets row (whatsapp_app_secret). */
export async function secret(db: ReturnType<typeof admin>, key: string) {
  const env = Deno.env.get(key.toUpperCase())
  if (env) return env
  const { data } = await db.from('app_secrets').select('value').eq('key', key).maybeSingle()
  return data?.value as string | undefined
}

/** Active profile of the signed-in caller, or null. */
export async function caller(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data } = await db.from('profiles').select('*').eq('id', user.id).single()
  return data?.active ? data : null
}
