// Runs the CRM migrations in PGlite with Supabase stubs, then checks 0007 (WhatsApp inbox) and 0008 (AI assistant). Run: npm run test:sql
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
async function migrate(...files) {
  for (const f of files) {
    try { await db.exec(readFileSync(`${dir}/${f}.sql`, 'utf8')) } catch (e) { console.error('FAILED in', f, e.message); process.exit(1) }
  }
  // Supabase grants table access to the API roles by default; RLS does the real work
  await db.exec(`grant usage on schema public to authenticated; grant select, insert, update, delete on all tables in schema public to authenticated;`)
}
await migrate('0001_init', '0002_sql_functions', '0003_block_signups', '0004_kips_real_data', '0005_website_payments_registration',
  '0006_staff_attendance_lock', '0007_whatsapp_inbox')

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

// ═════════════ 0008: AI assistant, pipeline, follow-ups ═════════════
const legacy = await one(`insert into leads (category, name, phone, status, source) values ('ntt', 'Old', '+919000000001', 'Contacted', 'import') returning id`)
await migrate('0008_ai_assistant')
await asCeo()
const count = async (sql, p) => (await one(`select count(*)::int n from (${sql}) x`, p)).n

// Legacy statuses renamed; unknown statuses refused
assert.equal((await one(`select status from leads where id = $1`, [legacy.id])).status, 'Contacted by Team')
await assert.rejects(db.query(`update leads set status = 'Bogus' where id = $1`, [legacy.id]), /Unknown lead status/)

// Routing: franchise → CEO, everything else → coordinator (who also gets WhatsApp + enquiries for the rest of the test)
await db.exec(`update profiles set modules = '{fees,whatsapp,inquiries}' where id = '${coord}';
  update settings set value = jsonb_build_object('default_assignee', '${coord}', 'by_category', jsonb_build_object('franchise', '${ceo}'), 'sla_hours', 4, 'manager', null) where key = 'lead_routing';
  update settings set value = value || '{"enabled": true}' where key = 'ai';`)

// Website form, as the anonymous website: routed, task due in ~4h, assignee notified, WhatsApp consent recorded
await db.exec(`set test.uid = ''`)
await db.query(`select submit_lead($1)`, [{ category: 'admission', name: 'Meena', phone: '9876543210', whatsapp_opt_in: 'yes', utm_campaign: 'oct' }])
await db.query(`select submit_lead($1)`, [{ category: 'franchise', name: 'Ravi', phone: '9876500000' }])
await asCeo()
const meena = await one(`select * from leads where name = 'Meena'`)
assert.equal(meena.assigned_to, coord); assert.equal(meena.whatsapp_opt_in, true); assert.ok(meena.wa_contact_id); assert.equal(meena.extra.utm_campaign, 'oct')
const task = await one(`select * from follow_ups where lead_id = $1`, [meena.id])
assert.equal(task.assigned_to, coord)
const hours = (new Date(task.due_at) - Date.now()) / 3.6e6
assert.ok(hours > 3.9 && hours <= 4, `due in ${hours}h`)
assert.equal((await one(`select opted_in, opted_in_source from wa_contacts where id = $1`, [meena.wa_contact_id])).opted_in_source, 'website form')
assert.equal((await one(`select assigned_to from leads where name = 'Ravi'`)).assigned_to, ceo)
assert.equal(await count(`select 1 from wa_contacts where phone = '+919876500000'`), 0) // no opt-in → no WhatsApp contact
assert.equal(await count(`select 1 from notifications where user_id = $1 and title like 'New follow-up%'`, [coord]), 1)
assert.equal(await count(`select 1 from follow_ups where lead_id = $1`, [legacy.id]), 0) // imports don't create tasks

// Webhook now lists new inbound messages for the AI; STOP isn't one of them and opts the enquiry out
const hook = (id, from, body) => one(`select wa_ingest_webhook($1) r`, [{ entry: [{ changes: [{ value: {
  contacts: [{ wa_id: from, profile: { name: 'Kavya' } }], messages: [{ id, from, type: 'text', timestamp: String(Math.floor(Date.now() / 1000)), text: { body } }] } }] }] }])
const h1 = await hook('wamid.K1', '919811111111', 'Hi, LKG admission for my 4 year old?')
assert.equal(h1.r.inbound.length, 1)
const msg1 = h1.r.inbound[0]
const kavya = (await one(`select id from wa_contacts where phone = '+919811111111'`)).id

// AI may claim the reply once; a second run, or a run for an older message, is refused
const claim = (mid) => one(`select wa_claim_ai_reply($1, 'Hello from AI', false) r`, [mid])
const c1 = await claim(msg1)
assert.ok(c1.r.id); assert.equal(c1.r.phone, '+919811111111')
assert.equal((await claim(msg1)).r.skip, 'already answered')

// The AI's classification creates one WhatsApp enquiry, then keeps updating it for the same need
const apply = (cid, p) => one(`select wa_apply_ai($1, $2) id`, [cid, p])
const ai1 = await apply(kavya, { intent: 'admission', category: 'admission', priority: 'normal', summary: 'LKG, child is 4', needs_human: false, replied: true, name: 'Kavya', child_age: '4', preferred_centre: '' })
const l1 = await one(`select * from leads where id = $1`, [ai1.id])
assert.equal(l1.source, 'WhatsApp Organic'); assert.equal(l1.status, 'AI Replied'); assert.equal(l1.child_age, '4'); assert.equal(l1.assigned_to, coord)
assert.equal(l1.wa_contact_id, kavya)
const ai2 = await apply(kavya, { intent: 'admission', category: 'admission', priority: 'normal', summary: 'Asked about timings', needs_human: false, replied: true, name: '', child_age: '', preferred_centre: 'Hebbal' })
assert.equal(ai2.id, ai1.id)
const l2 = await one(`select child_age, preferred_centre, ai_summary from leads where id = $1`, [ai1.id])
assert.equal(l2.child_age, '4'); assert.equal(l2.preferred_centre, 'Hebbal'); assert.equal(l2.ai_summary, 'Asked about timings')
// A genuinely new need from the same contact → a separate enquiry
const ai3 = await apply(kavya, { intent: 'franchise', category: 'franchise', priority: 'normal', summary: 'Also wants a franchise', needs_human: false, replied: false })
assert.notEqual(ai3.id, ai1.id)
assert.equal(await count(`select 1 from leads where wa_contact_id = $1`, [kavya]), 2)

// Newer message waiting → the older one isn't answered; hand-off pauses the AI and alerts the owner
const h2 = await hook('wamid.K2', '919811111111', 'I want to speak to someone, nobody called me!')
const h3 = await hook('wamid.K3', '919811111111', 'Please call')
assert.equal((await claim(h2.r.inbound[0])).r.skip, 'newer message waiting')
await apply(kavya, { intent: 'complaint', category: 'admission', priority: 'high', summary: 'Upset, wants a call', needs_human: true, replied: true })
const kc = await one(`select ai_paused, assigned_to from wa_contacts where id = $1`, [kavya])
assert.equal(kc.ai_paused, true); assert.equal(kc.assigned_to, coord)
assert.equal((await one(`select status, priority from leads where id = $1`, [ai1.id])).status, 'Escalated')
assert.equal(await count(`select 1 from notifications where user_id = $1 and title like 'WhatsApp needs you%'`, [coord]), 1)
assert.equal((await claim(h3.r.inbound[0])).r.skip, 'AI paused')

// STOP: not sent to the AI, and open enquiries become Opted Out
const stop = await hook('wamid.K4', '919811111111', 'STOP')
assert.equal(stop.r.inbound.length, 0)
assert.equal(await count(`select 1 from leads where wa_contact_id = $1 and status = 'Opted Out'`, [kavya]), 2)

// SLA: overdue tasks are escalated once, to the CEO, and the lead is marked Escalated
await db.query(`update follow_ups set due_at = now() - interval '1 minute' where lead_id = $1`, [meena.id])
assert.ok((await one(`select escalate_follow_ups() n`)).n >= 1)
assert.equal((await one(`select escalate_follow_ups() n`)).n, 0)
assert.ok((await one(`select escalated_at from follow_ups where lead_id = $1`, [meena.id])).escalated_at)
assert.equal(await count(`select 1 from notifications where user_id = $1 and title like 'Overdue follow-up%'`, [ceo]), 1)
assert.equal((await one(`select status from leads where id = $1`, [meena.id])).status, 'Escalated')

// Completing the task records the contact
await db.query(`select complete_follow_up($1, 'Called, visit next week')`, [task.id])
const done = await one(`select status, done_by, outcome from follow_ups where id = $1`, [task.id])
assert.equal(done.status, 'done'); assert.equal(done.done_by, ceo)
assert.equal((await one(`select status from leads where id = $1`, [meena.id])).status, 'Contacted by Team')
await assert.rejects(db.query(`select complete_follow_up($1)`, [task.id]), /already closed/)

// Meta Lead Ads: mapped form, consent from the form, idempotent per lead id
await db.exec(`update settings set value = '{"F-NTT": "ntt"}' where key = 'meta_forms'`)
const metaLead = { leadgen_id: 'LG1', form_id: 'F-NTT', campaign_id: 'C1', adset_id: 'S1', ad_id: 'A1', field_data: [
  { name: 'full_name', values: ['Priya Raj'] }, { name: 'phone_number', values: ['+919822222222'] },
  { name: 'email', values: ['p@x.in'] }, { name: 'can_we_whatsapp_you', values: ['Yes'] }, { name: 'qualification', values: ['B.Ed'] }] }
const m1 = await one(`select submit_meta_lead($1) id`, [metaLead])
const m2 = await one(`select submit_meta_lead($1) id`, [metaLead])
assert.equal(m1.id, m2.id)
const ml = await one(`select * from leads where id = $1`, [m1.id])
assert.equal(ml.category, 'ntt'); assert.equal(ml.source, 'Meta Lead Ads'); assert.equal(ml.meta_campaign_id, 'C1')
assert.equal(ml.whatsapp_opt_in, true); assert.equal(ml.extra.qualification, 'B.Ed')
assert.equal(await count(`select 1 from leads where meta_leadgen_id = 'LG1'`), 1)

// Access: only the server runs the AI functions; notes and the knowledge base are guarded
const coordNotes = await count(`select 1 from notifications where user_id = $1`, [coord])
assert.ok(coordNotes >= 3 && coordNotes < await count(`select 1 from notifications`))
for (const fn of ['wa_claim_ai_reply(uuid, text, boolean)', 'wa_apply_ai(uuid, jsonb)', 'submit_meta_lead(jsonb)', 'escalate_follow_ups()'])
  assert.equal((await one(`select has_function_privilege('authenticated', '${fn}', 'execute') ok`)).ok, false, fn)
await db.exec(`set test.uid = '${coord}'; set role authenticated`)
await db.query(`insert into wa_messages (contact_id, direction, sender, sent_by, kind, body, status) values ($1, 'note', 'staff', $2, 'note', 'Called twice', 'received')`, [kavya, coord])
await assert.rejects(db.query(`insert into wa_messages (contact_id, direction, sender, sent_by, body) values ($1, 'out', 'staff', $2, 'sneaky send')`, [kavya, coord]))
await assert.rejects(db.query(`insert into kb_articles (title, body) values ('Fees', 'made up')`))
assert.equal(await count(`select 1 from notifications`), coordNotes) // only their own
await asCeo()
await db.query(`insert into kb_articles (title, topic, body) values ('Timings', 'timings', 'Mon–Sat 9am–6pm')`)

console.log('0008 PGlite checks: all passed')

// ═════════════ 0009: templates, consent, campaigns, queue ═════════════
const oldTpl = await one(`select id from message_templates where name = 'Fee reminder'`)
await migrate('0009_campaigns')
await asCeo()
assert.equal((await one(`select meta_status from message_templates where id = $1`, [oldTpl.id])).meta_status, 'draft') // never assumed approved

// Staff can't approve a template themselves; the server can; editing sends it back to draft
await db.exec(`update message_templates set meta_template = 'fee_reminder_v1', category = 'utility' where id = '${oldTpl.id}'`)
await assert.rejects(db.query(`update message_templates set meta_status = 'approved' where id = $1`, [oldTpl.id]), /approval comes from Meta/)
await db.exec(`reset role; set test.uid = ''`) // the server (service role) has no auth.uid()
await db.query(`select wa_template_status('fee_reminder_v1', 'en', 'APPROVED', '123', 'NONE')`)
assert.equal((await one(`select meta_status, meta_template_id, meta_reason from message_templates where id = $1`, [oldTpl.id])).meta_status, 'approved')
await asCeo()
await db.query(`update message_templates set body = body || ' ' where id = $1`, [oldTpl.id])
assert.equal((await one(`select meta_status from message_templates where id = $1`, [oldTpl.id])).meta_status, 'draft')
await db.exec(`set test.uid = ''`)
await db.query(`select wa_template_status('fee_reminder_v1', 'en', 'APPROVED', '123', null)`)
await asCeo()
const mkt = await one(`insert into message_templates (name, body, meta_template, category) values ('Admission offer', 'Hi {name}!', 'adm_offer', 'marketing') returning id`)

// Consent: CEO only, with a source; coordinators can't
await assert.rejects(db.query(`select record_consent(array['9845099999'], '')`), /where the consent came from/)
const rc = await one(`select record_consent(array['9845099999', '12', '+91 98450 88888'], 'Admission form 2026-27') r`)
assert.deepEqual(rc.r, { updated: 2, invalid: 1 })
assert.equal((await one(`select opted_in_source from wa_contacts where phone = '+919845099999'`)).opted_in_source, 'Admission form 2026-27')
await db.exec(`set test.uid = '${coord}'; set role authenticated`)
await assert.rejects(db.query(`select record_consent(array['9845077777'], 'x')`), /Only the CEO/)
// Coordinators draft campaigns but can't approve them or mark them scheduled directly
const camp = await one(`insert into campaigns (name, kind, template_id, audience) values ('Oct fees', 'fee_reminder', $1, '{"source":"students","fee":"overdue"}') returning id`, [oldTpl.id])
await assert.rejects(db.query(`insert into campaigns (name, kind, template_id, status) values ('sneaky', 'holiday', $1, 'running')`, [oldTpl.id]))
await assert.rejects(db.query(`select campaign_schedule($1)`, [camp.id]), /Only the CEO/)
await assert.rejects(db.query(`update campaigns set status = 'running' where id = $1`, [camp.id]), /row-level security/)
assert.equal((await one(`select status from campaigns where id = $1`, [camp.id])).status, 'draft')
await asCeo()

// Scheduling needs a built list, an approved template of the right category and sending switched on
await assert.rejects(db.query(`select campaign_schedule($1)`, [camp.id]), /Build the recipient list first/)
const addRecipients = async (cid, rows) => { for (const [phone, status] of rows) await db.query(`insert into campaign_recipients (campaign_id, phone, status, vars) values ($1, $2, $3, '{"parent_name":"A"}')`, [cid, phone, status]) }
await db.query(`update campaigns set built_at = now() where id = $1`, [camp.id])
await addRecipients(camp.id, [['+919845099999', 'pending'], ['+919845088888', 'pending'], ['+919800000000', 'skipped']])
await assert.rejects(db.query(`insert into campaign_recipients (campaign_id, phone) values ($1, '+919845099999')`, [camp.id])) // one per number
await db.exec(`update settings set value = value || '{"mode":"off"}' where key = 'whatsapp'`)
await assert.rejects(db.query(`select campaign_schedule($1)`, [camp.id]), /sending is off/)
await db.exec(`update settings set value = value || '{"mode":"mock"}' where key = 'whatsapp'`)
const wrong = await one(`insert into campaigns (name, kind, template_id, built_at) values ('Disguised', 'fee_reminder', $1, now()) returning id`, [mkt.id])
await db.exec(`set test.uid = ''`); await db.query(`select wa_template_status('adm_offer', 'en', 'APPROVED', '9', null)`); await asCeo()
await addRecipients(wrong.id, [['+919845099999', 'pending']])
await assert.rejects(db.query(`select campaign_schedule($1)`, [wrong.id]), /must use a utility template/)
await db.query(`update message_templates set approval_simulated = true where id = $1`, [oldTpl.id]).catch(() => {}) // staff can't touch approval
await db.exec(`set test.uid = ''`); await db.query(`update message_templates set approval_simulated = true where id = $1`, [oldTpl.id]); await asCeo()
await db.exec(`update settings set value = value || '{"mode":"live"}' where key = 'whatsapp'`)
await assert.rejects(db.query(`select campaign_schedule($1)`, [camp.id]), /only approved in mock mode/)
await db.exec(`update settings set value = value || '{"mode":"mock"}' where key = 'whatsapp'`)

// Future schedule → scheduled; the queue starts it once due and claims each pending row exactly once
await db.query(`select campaign_schedule($1, now() + interval '1 hour')`, [camp.id])
const sc = await one(`select status, approved_by from campaigns where id = $1`, [camp.id])
assert.equal(sc.status, 'scheduled'); assert.equal(sc.approved_by, ceo)
assert.equal((await db.query(`select * from wa_campaign_claim(10)`)).rows.length, 0) // not due yet
await db.query(`update campaigns set scheduled_at = now() - interval '1 minute' where id = $1`, [camp.id])
const b1 = (await db.query(`select * from wa_campaign_claim(1)`)).rows
assert.equal(b1.length, 1); assert.equal(b1[0].status, 'sending'); assert.equal(b1[0].attempts, 1)
assert.equal((await one(`select status from campaigns where id = $1`, [camp.id])).status, 'running')
const b2 = (await db.query(`select * from wa_campaign_claim(10)`)).rows
assert.equal(b2.length, 1); assert.notEqual(b2[0].id, b1[0].id) // never the same row twice
assert.equal((await db.query(`select * from wa_campaign_claim(10)`)).rows.length, 0)

// Pause stops claiming; cancel stops everything not yet sent
await db.query(`update campaign_recipients set status = 'pending' where id = $1`, [b2[0].id])
await db.query(`select campaign_control($1, 'pause')`, [camp.id])
assert.equal((await db.query(`select * from wa_campaign_claim(10)`)).rows.length, 0)
await db.query(`select campaign_control($1, 'cancel')`, [camp.id])
assert.equal((await one(`select status from campaign_recipients where id = $1`, [b2[0].id])).status, 'cancelled')
await assert.rejects(db.query(`select campaign_control($1, 'resume')`, [camp.id]), /Cannot resume a cancelled/)

// Sends interrupted mid-flight are failed, never resent; finished campaigns complete
const c2 = await one(`insert into campaigns (name, kind, template_id, built_at) values ('Holiday', 'holiday', $1, now()) returning id`, [oldTpl.id])
await addRecipients(c2.id, [['+919845099999', 'pending']])
await db.query(`select campaign_schedule($1)`, [c2.id])
const b3 = (await db.query(`select * from wa_campaign_claim(10)`)).rows
assert.equal(b3.length, 1)
await db.query(`update campaign_recipients set updated_at = now() - interval '20 minutes' where id = $1`, [b3[0].id])
await db.query(`select * from wa_campaign_claim(10)`)
assert.match((await one(`select status, reason from campaign_recipients where id = $1`, [b3[0].id])).reason, /not retried/)
assert.equal((await one(`select wa_campaign_finish() n`)).n, 1)
assert.equal((await one(`select status from campaigns where id = $1`, [c2.id])).status, 'completed')

// Server-only functions; overview works for WhatsApp staff and counts real rows
for (const fn of ['wa_campaign_claim(integer)', 'wa_campaign_finish()', 'wa_sent_today()', 'wa_template_status(text, text, text, text, text)', 'wa_kick_worker()', 'wa_retention()'])
  assert.equal((await one(`select has_function_privilege('authenticated', '${fn}', 'execute') ok`)).ok, false, fn)
const ov = (await one(`select wa_overview(now() - interval '1 day', now() + interval '1 minute') o`)).o
assert.equal(ov.new_enquiries, await count(`select 1 from leads where created_at >= now() - interval '1 day'`))
assert.equal(ov.campaigns.completed, 1)
assert.ok(ov.awaiting_follow_up >= 1)
const ret = (await one(`select wa_retention() r`)).r
assert.equal(typeof ret.webhook_events, 'number')

console.log('0009 PGlite checks: all passed')
