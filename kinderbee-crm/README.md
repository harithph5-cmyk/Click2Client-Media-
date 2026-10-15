# KinderBee CRM

A CRM for KinderBee Preschool (Bengaluru) that can be white-labelled and sold to other schools.
**Stack:** React + TypeScript + Vite + Tailwind 4 + Supabase (Auth, Postgres with RLS, Storage).

Modules: Dashboard · Admissions & Students · Website Inquiries · Fees · Payments (salary + service payment verification) · Attendance · WhatsApp Centre · Team (CEO only) · Settings · global search.

## Setup (new school)

1. **Create a Supabase project.**
2. **SQL Editor → New query:** paste all of `supabase/setup.sql` (schema, team and lead functions, demo data) and click **Run**. It ends with a `KinderBee CRM ready | 20 | 2` row. Run it once only.
3. **Authentication → Sign In / Providers → Email:** turn **off** "Allow new users to sign up". Only the CEO creates accounts, from the Team page.
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

- **Default:** every send produces wa.me click-to-send links with the message prefilled. This needs no setup.
- **Automatic sending (WhatsApp Business Cloud API):** run `npx supabase login`, link the project, then `supabase functions deploy send-whatsapp`. In Settings, enter the Phone Number ID and permanent token, and tick "Send automatically". Give each template the name of an approved Meta template; its `{{1}}, {{2}}…` are filled from the placeholders in order.
- **Delivery status:** run `supabase functions deploy whatsapp-webhook --no-verify-jwt` and `supabase secrets set WHATSAPP_VERIFY_TOKEN=…`, then point Meta's webhook at `https://YOUR-REF.supabase.co/functions/v1/whatsapp-webhook`.

## White-label

Edit `src/config/brand.ts` (name, school, contact, colours, login domain) and drop the logo at `public/logo.png`.

## Tests

`npm test` runs the fee, phone and template maths. The SQL was checked in PGlite and on the live project: logins, RLS denials, the audit trail, team functions and lead intake.
