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

`category` is one of `ntt`, `consultation`, `franchise`, `cbse`, `degree`, `jv`. Any other fields are stored with the lead. A non-empty `website` field is treated as a bot (honeypot). Settings shows the snippet with your real URL and key.

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
- **Inbox:** shows one conversation per number, linked to a matching website enquiry or student. Staff can assign, reply and resolve. A staff reply pauses AI on that conversation, ready for phase 3.

## White-label

Edit `src/config/brand.ts` (name, school, contact, colours, login domain) and drop the logo at `public/logo.png`.

## Tests

`npm test` runs the fee, phone and template maths, plus the WhatsApp signature and 24-hour window checks. `npm run test:sql` runs every migration in PGlite and checks the WhatsApp webhook processing: duplicates, status order, opt-out, access rules and the audit trail. The SQL was checked in PGlite and on the live project: logins, RLS denials, the audit trail, team functions and lead intake.
