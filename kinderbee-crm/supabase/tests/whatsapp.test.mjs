// Runs the CRM migrations in PGlite with Supabase stubs, then checks 0007 (WhatsApp inbox). Run: npm run test:sql
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const dir = fileURLToPath(new URL('../migrations', import.meta.url))
const db = new PGlite({ extensions: { pgcrypto } })
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; create schema extensions;
create table auth.users(instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
  confirmation_token text, email_change text, email_change_token_new text, recovery_token text, banned_until timestamptz);
create table auth.identities(id uuid, user_id uuid, provider_id text, identity_data jsonb, provider text, last_sign_in_at timestamptz, created_at timestamptz, updated_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create schema storage; create table storage.buckets(id text primary key, name text, public bool); create table storage.objects(bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
`)
for (const f of ['0001_init', '0002_sql_functions', '0003_block_signups', '0004_kips_real_data', '0005_website_payments_registration', '0006_staff_attendance_lock', '0007_whatsapp_inbox']) {
  try { await db.exec(readFileSync(`${dir}/${f}.sql`, 'utf8')) } catch (e) { console.error('FAILED in', f, e.message); process.exit(1) }
}
await db.exec(`grant usage on schema public to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;`)

const one = async (sql, p) => (await db.query(sql, p)).rows[0]
const ceo = '00000000-0000-0000-0000-0000000000c0', coord = '00000000-0000-0000-0000-0000000000c1'
await db.exec(`set kb.allow_signup = 'on';
  insert into auth.users (id, email, raw_app_meta_data) values ('${ceo}', 'ceo@x', '{"role":"ceo"}'), ('${coord}', 'c@x', '{"modules":["fees"]}');
  set kb.allow_signup = 'off';`)

const asCeo = () => db.exec(`reset role; set test.uid = '${ceo}'`)
await asCeo()

// Migration set the mode from the old flag
assert.equal((await one(`select value->>'mode' m from settings where key = 'whatsapp'`)).m, 'off')

// Simulation refused unless mock mode
await assert.rejects(db.query(`select wa_simulate_inbound('9845012345', 'Asha', 'hi')`), /mock mode/)
await db.exec(`update settings set value = value || '{"mode":"mock"}' where key = 'whatsapp'`)

// Links to an existing enquiry and student by phone
await db.exec(`insert into leads (category, name, phone) values ('admission', 'Asha', '+919845012345');
  insert into students (name, program, parent_phone) values ('Kid', 'Nursery', '98450 12345');`)
const r1 = await one(`select wa_simulate_inbound('9845012345', 'Asha', 'Hi, admission for my son?') r`)
assert.equal(r1.r.messages, 1)
const c = await one(`select * from wa_contacts`)
assert.equal(c.phone, '+919845012345'); assert.equal(c.name, 'Asha'); assert.ok(c.lead_id); assert.ok(c.student_id)
assert.equal(c.unread, 1); assert.ok(c.last_inbound_at)

// Duplicate webhook delivery → ignored
const payload = { object: 'whatsapp_business_account', entry: [{ changes: [{ value: {
  contacts: [{ wa_id: '919845012345', profile: { name: 'Asha' } }],
  messages: [{ id: 'wamid.A', from: '919845012345', type: 'text', timestamp: '1760000000', text: { body: 'second' } }, { from: '91984' }],
} }] }] }
const first = await one(`select wa_ingest_webhook($1) r`, [payload])
const again = await one(`select wa_ingest_webhook($1) r`, [payload])
assert.deepEqual(first.r, { messages: 1, statuses: 0, duplicates: 0 }) // the id-less message is skipped
assert.deepEqual(again.r, { messages: 0, statuses: 0, duplicates: 1 })
assert.equal((await one(`select count(*)::int n from wa_messages`)).n, 2)
assert.equal((await one(`select count(*)::int n from wa_contacts`)).n, 1)

// Statuses never go backwards; failed wins; duplicates ignored
await db.exec(`insert into wa_messages (contact_id, direction, sender, body, wamid, status) values ('${c.id}', 'out', 'staff', 'hello', 'wamid.OUT', 'sent');
  insert into message_log (phone, body, status, provider_id) values ('+919845012345', 'hello', 'sent', 'wamid.OUT');`)
const st = (status) => one(`select wa_ingest_webhook($1) r`, [{ entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.OUT', status, errors: status === 'failed' ? [{ title: 'Re-engagement message' }] : undefined }] } }] }] }])
await st('read'); await st('delivered')
assert.equal((await one(`select status from wa_messages where wamid = 'wamid.OUT'`)).status, 'read')
assert.equal((await one(`select status from message_log where provider_id = 'wamid.OUT'`)).status, 'read')
assert.equal((await st('read')).r.duplicates, 1)
await st('failed')
const failed = await one(`select status, error from wa_messages where wamid = 'wamid.OUT'`)
assert.equal(failed.status, 'failed'); assert.equal(failed.error, 'Re-engagement message')

// STOP opts out, START opts back in
await db.query(`select wa_simulate_inbound('9845012345', 'Asha', 'Stop')`)
assert.ok((await one(`select opted_out_at from wa_contacts`)).opted_out_at)
await db.query(`select wa_simulate_inbound('+91 98450 12345', 'Asha', 'START')`)
const back = await one(`select opted_out_at, opted_in, opted_in_source from wa_contacts`)
assert.equal(back.opted_out_at, null); assert.equal(back.opted_in, true); assert.equal(back.opted_in_source, 'whatsapp START')

// Audit: consent changes logged, unread bumps not
const audits = (await db.query(`select action from audit_log where entity = 'wa_contacts' order by id`)).rows.map((r) => r.action)
assert.deepEqual(audits, ['insert', 'update', 'update']) // created, STOP, START

// Only the server can ingest; staff without the whatsapp module see nothing and can't simulate
assert.equal((await one(`select has_function_privilege('authenticated', 'wa_ingest_webhook(jsonb, boolean)', 'execute') ok`)).ok, false)
assert.equal((await one(`select has_function_privilege('anon', 'wa_simulate_inbound(text, text, text)', 'execute') ok`)).ok, false)
await db.exec(`set test.uid = '${coord}'; set role authenticated`)
assert.equal((await one(`select count(*)::int n from wa_contacts`)).n, 0)
assert.equal((await one(`select count(*)::int n from wa_messages`)).n, 0)
await assert.rejects(db.query(`select wa_simulate_inbound('9845012345', 'x', 'y')`), /Not allowed/)
await assert.rejects(db.query(`insert into wa_messages (contact_id, direction, sender) values ('${c.id}', 'out', 'staff')`))
await asCeo()

// Bad numbers rejected
await assert.rejects(db.query(`select wa_contact('123')`), /Invalid phone/)

console.log('0007 PGlite checks: all passed')
