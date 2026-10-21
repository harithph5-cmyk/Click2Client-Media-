# Kinderbee CRM

A CRM for Kinderbee Preschool (Bengaluru) that can be white-labelled and sold to other schools.
**Stack:** React + TypeScript + Vite + Tailwind 4 + Supabase (Auth, Postgres with RLS, Storage).

Modules: Dashboard · Admissions & Students · Website Inquiries · Fees · Payments (salary + service payment verification) · Attendance · WhatsApp Centre · Team (CEO only) · Settings · global search.

## Setup (new school)

1. **Create a Supabase project.**
2. **SQL Editor → New query:** paste all of `supabase/setup.sql` (schema, team and lead functions, demo data) and click **Run**. It ends with a `Kinderbee CRM ready | 20 | 2` row. Run it once only.
3. Public sign-ups are blocked in the database (`0003_block_signups.sql`), so only the CEO can create accounts, from the Team page. Turning off "Allow new users to sign up" in Authentication settings as well is optional.
4. **App:** copy `.env.example` to `.env` and fill in the project URL and the **anon public** key. Then `npm install` and `npm run dev`.
5. **Deploy:** `npm run build`, then deploy `dist/` (it includes `vercel.json` for SPA routing), or import this folder into Vercel with the two `VITE_` env vars.

## Demo logins (from seed.sql — change them before going live)

| Tab | Username | Password |
|---|---|---|
| CEO Login | `ceo` | `KinderBee@123` |
| Coordinator Login | `priya` | `Coord@123` |

A username signs in as `<username>@kinderbee.local`. Change `loginDomain` in `src/config/brand.ts` to change that.

## Security model

- Every table has row-level security. `has_module('fees')` and similar checks run in Postgres, so hiding a menu item is only cosmetic.
- A user's role and modules live in `profiles`, and only the CEO can change them. Coordinator accounts are created, reset and deactivated through CEO-only database functions (`admin_create_user`, `admin_reset_password`, `admin_set_active`).
- Service payments can only be verified through `verify_service_payment()`, which records who verified each payment and when.
- An audit trigger logs every insert, update and delete on business tables to `audit_log`.
- Files go to the private `docs` bucket, and the top folder (`admissions/`, `fees/`, `payments/`) must match a module the user has.

## Website forms

```js
fetch('https://YOUR-REF.supabase.co/rest/v1/rpc/submit_lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: 'YOUR-ANON-KEY' },
  body: JSON.stringify({ p: { category: 'franchise', name: 'Asha', phone: '9845012345', investment_budget: '₹15 lakh' } })
})
```

`category` is one of `admission`, `ntt`, `consultation`, `franchise`, `cbse`, `degree`, `jv`, `general`. Add `whatsapp_opt_in: true` when the visitor ticked a WhatsApp consent box. Any other fields (e.g. `utm_campaign`) are stored with the lead. A non-empty `website` field is treated as a bot (honeypot). Settings shows the snippet with your real URL and key.

## WhatsApp

Settings → WhatsApp → **Sending mode**:

- **Off (default):** every send produces wa.me click-to-send links with the message prefilled. This needs no setup.
- **Mock:** messages are recorded in the CRM and marked SIMULATED, but nothing reaches WhatsApp. The Inbox gets a **Simulate** button that feeds a fake incoming message through the same processing as a real webhook. Use it to test before Meta is connected.
- **Live:** sends through the WhatsApp Business Cloud API.

Setup for Mock and Live:

1. Run `supabase/migrations/0007_whatsapp_inbox.sql` in the SQL Editor. It only adds tables and columns.
2. Deploy the functions with `npx supabase login`, then `npx supabase link --project-ref YOUR-REF`, then:
   - `npx supabase functions deploy send-whatsapp`
   - `npx supabase functions deploy whatsapp-webhook --no-verify-jwt`
3. **Live only:** in Settings, enter the WhatsApp Business Account ID, Phone Number ID, permanent System User token, Meta **app secret** and a **verify token** you make up. Secrets are write-only. Each can be overridden with a function secret of the same name in upper case, for example `npx supabase secrets set WHATSAPP_APP_SECRET=…`.
4. **Live only:** in Meta → WhatsApp → Configuration, set the callback URL to `https://YOUR-REF.supabase.co/functions/v1/whatsapp-webhook` (Settings shows it), use the same verify token, and subscribe to **messages**.

How it behaves:

- **Signatures:** the webhook rejects any POST without a valid `X-Hub-Signature-256`. Without the app secret it rejects everything.
- **Duplicates:** repeated Meta deliveries are ignored, keyed by message ID and status in `wa_webhook_events`.
- **Delivery status:** statuses never go backwards, so a late "delivered" can't overwrite "read".
- **Opt-out:** a contact who sends STOP or UNSUBSCRIBE is opted out and no further messages go to them. START opts them back in.
- **24-hour window:** free-text messages and replies only go to contacts who messaged in the last 24 hours. Anyone else needs a template with an approved Meta template name; its `{{1}}, {{2}}…` are filled from the placeholders in order.
- **Inbox:** shows one conversation per number, linked to a matching enquiry or student. Staff can assign, reply, add internal notes, create follow-ups, pause or resume the AI, change the lead status and resolve. A staff reply pauses the AI on that conversation.

### AI assistant and lead follow-up

Setup:

1. Run `supabase/migrations/0008_ai_assistant.sql` in the SQL Editor. It renames two lead statuses (Contacted → Contacted by Team, Follow-up → Follow-up Pending) and adds the rest. It also schedules the SLA check with pg_cron; if pg_cron is off, enable it under Database → Extensions and run the `cron.schedule` line printed in the notice.
2. Deploy the functions: `npx supabase functions deploy wa-ai`, `npx supabase functions deploy whatsapp-webhook --no-verify-jwt` (again, as it now runs the AI) and, for Meta Lead Ads, `npx supabase functions deploy meta-leads --no-verify-jwt`.
3. In Settings → WhatsApp, save the **Anthropic API key**. Without it, a rule-based mock acknowledges every message and hands it to the team. Its activity is logged with model `mock`.
4. In WhatsApp → **AI Assistant**:
   - add the knowledge-base articles (verified facts only),
   - set lead routing and the follow-up SLA,
   - map Meta lead form IDs to enquiry types,
   - then tick "Reply to WhatsApp enquiries automatically".

How it works:

- **Every new enquiry** (website form, Meta Lead Ads, WhatsApp, or added by hand) is assigned by category, gets a follow-up task due within the SLA, and the assignee is notified (bell icon). Imported leads are left alone. If the task isn't done in time, the CEO and the manager set in routing are alerted, once. Marking a task done records that the team contacted the lead.
- **The AI** (Claude Haiku 5.5 by default) sees only active knowledge-base articles and the last 30 messages. It replies in English, Tamil or Tanglish and classifies the enquiry. It creates or updates the WhatsApp Organic lead: one per open need, and a returning contact with a different need gets a new one. Anything it isn't sure of, complaints and requests for a person are acknowledged and handed off: the AI pauses on that conversation, the lead becomes Escalated and the owner is notified.
- **What the AI can't do:** it never confirms admissions, fees, visits or payments, and never claims the team has called. It can only send one reply to the contact it is answering (`wa_claim_ai_reply`, which also stops it replying twice or after a staff reply) and update that contact's enquiry (`wa_apply_ai`). It has no SQL or other tools.
- **Website consent:** forms can send `whatsapp_opt_in: true` to record consent. Website and Meta leads are never messaged automatically yet. That needs an approved template and arrives with campaigns (phase 4).
- **AI activity** (outcome, intent, tokens, errors; no message text) is listed on the AI Assistant tab.

### Campaigns

The campaign flow:

1. Templates are tracked against Meta's approval. Submit them from **Templates**; approval arrives by webhook or **Sync from Meta**. Any edit sends a template back to draft.
2. A campaign picks a type, an approved template of the matching category, and an audience:
   - guardians, filtered by class and by overdue or upcoming fees,
   - enquiries, filtered by type, status and date,
   - or every contact with consent.
3. **Build recipients** applies the rules: consent, opt-out, valid number, one message per number (siblings merged), and required values. It shows the counts, the reasons for skips, and real previews.
4. The CEO approves and schedules it, or sends it now. pg_cron runs `wa-worker` every minute, which sends within the per-minute and daily limits.

While sending:

- Each recipient is re-checked just before sending. Fees already paid are skipped.
- Throttling errors retry with backoff; permanent errors fail with the reason.
- Pause, resume (CEO) and cancel stop anything not yet sent.
- The delivery report counts come from Meta's status webhooks.
- A dry run builds and processes without sending.

With the API on, bulk sends go only through campaigns. The send function accepts at most 20 messages per call. Tap-to-send wa.me reminders remain while the API is off.

Full setup, go-live checklist, operations and rollback: [docs/whatsapp-deployment.md](docs/whatsapp-deployment.md).

## White-label

Edit `src/config/brand.ts` (name, school, contact, colours, login domain) and drop the logo at `public/logo.png`.

## Tests

`npm test` runs the fee, phone and template maths, plus the WhatsApp signature and 24-hour window checks. `npm run test:sql` runs every migration in PGlite and checks the WhatsApp webhook processing: duplicates, status order, opt-out, access rules and the audit trail. The SQL was checked in PGlite and on the live project: logins, RLS denials, the audit trail, team functions and lead intake.
