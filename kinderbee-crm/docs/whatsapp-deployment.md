# WhatsApp AI & Campaigns: setup, deployment and operations

Everything runs inside the existing KinderBee CRM: React on Vercel, with Supabase for Postgres, auth and edge functions.
There's no second database, queue server or backend. The queue is a Postgres table that pg_cron works through every minute.

## 1. What you need from Meta and Anthropic

| Item | Where it goes | Used by |
|---|---|---|
| WhatsApp Business Account ID | Settings → WhatsApp | template submit/sync |
| Phone Number ID | Settings → WhatsApp | all sending |
| Permanent System User access token (`whatsapp_business_messaging`, `whatsapp_business_management`) | Settings → WhatsApp (write-only) or `WHATSAPP_TOKEN` | all sending, templates |
| Meta app secret | Settings → WhatsApp or `WHATSAPP_APP_SECRET` | webhook signature checks |
| Webhook verify token (any random string) | Settings → WhatsApp or `WHATSAPP_VERIFY_TOKEN` | webhook subscription |
| Facebook Page access token with `leads_retrieval` | Settings → WhatsApp or `META_PAGE_TOKEN` | Meta Lead Ads |
| Anthropic API key | Settings → WhatsApp or `ANTHROPIC_API_KEY` | AI assistant |

Secrets saved in Settings go to the CEO-write-only `app_secrets` table. A Supabase function secret with the same name in upper case
(`npx supabase secrets set WHATSAPP_APP_SECRET=…`) takes priority. The frontend never sees any of them, only whether each one is set.

Optional overrides: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WORKER_SECRET`. The worker secret is generated automatically by migration 0009.

### Your existing WhatsApp number

Don't change the live number until you've chosen one of these supported options:

1. **Coexistence** (recommended if the number is on the WhatsApp Business app today). Keep using the app on the phone
   and connect the same number to the Cloud API through Meta's Embedded Signup, using a Tech Provider or a Solution Partner.
   Chats stay on the phone, and the API sends and receives too. Check that coexistence is available for your country and account before relying on it.
2. **Migrate the number to the Cloud API.** Delete the WhatsApp account on the phone, then register the number in
   Meta Business → WhatsApp Manager. The app stops working on that number, and chat history on the phone isn't carried over.
3. **A new dedicated number** for the API. This is the lowest-risk option: the current number keeps working as it is.

Whichever you choose, start in **Mock** mode, then go **Live** with a test recipient who has given consent.

## 2. Deploy (in this order)

1. **Database.** In Supabase → SQL Editor, run each file once and in order:
   `0007_whatsapp_inbox.sql`, `0008_ai_assistant.sql`, `0009_campaigns.sql`.
   - All three only add tables, columns and functions. 0008 renames two lead statuses (Contacted → Contacted by Team, Follow-up → Follow-up Pending).
   - If a notice says pg_cron or pg_net isn't available, enable both under Database → Extensions and run the `cron.schedule(...)` lines the notice prints.
2. **Functions.** Run these from `kinderbee-crm/`:
   ```
   npx supabase login
   npx supabase link --project-ref YOUR-REF
   npx supabase functions deploy send-whatsapp
   npx supabase functions deploy wa-ai
   npx supabase functions deploy wa-campaigns
   npx supabase functions deploy wa-templates
   npx supabase functions deploy whatsapp-webhook --no-verify-jwt
   npx supabase functions deploy wa-worker --no-verify-jwt
   npx supabase functions deploy meta-leads --no-verify-jwt
   ```
3. **App.** Run `npm run build` and deploy `dist/` to Vercel as usual. No new `VITE_` variables are needed.
4. **Settings → WhatsApp** (CEO):
   - Enter the IDs and secrets and pick **Mock**, then save. Saving also stores the functions URL that the campaign queue uses.
   - Set the per-minute and per-day campaign limits. Keep them within your number's Meta messaging tier.
5. **Meta webhooks.**
   - WhatsApp: set the callback to `https://YOUR-REF.supabase.co/functions/v1/whatsapp-webhook` with your verify token, and subscribe to `messages` and `message_template_status_update`.
   - Lead Ads: subscribe the Page's `leadgen` field to `/functions/v1/meta-leads`.
6. **WhatsApp → AI Assistant:**
   - write the knowledge base (verified facts only),
   - set lead routing and the SLA,
   - map Meta form IDs to enquiry types,
   - then turn on automatic replies.
7. **WhatsApp → Contacts:** record consent you actually hold, with its source (for example, the admission form clause).

## 3. Go-live checklist

- [ ] `npm test` and `npm run test:sql` pass. They run every migration in PGlite and check webhooks, AI hand-off, follow-ups, campaigns and access rules.
- [ ] In Mock mode, test each of these:
  - [ ] Simulate an inbound message: it's stored, the AI replies (or hands off), a lead and a follow-up appear, and the owner is notified.
  - [ ] Send STOP: the contact is opted out and their enquiries are marked Opted Out.
  - [ ] Submit a template: it's approved, marked "simulated".
  - [ ] Run a dry-run campaign: it builds, previews and processes without sending.
  - [ ] Run a mock campaign: delivery report counts add up, and pause and cancel work.
  - [ ] Record a fee payment for a reminder recipient before the batch runs: they're skipped as "Paid before sending".
- [ ] Switch to **Live**. Submit the real templates to Meta, wait for approval, then press **Sync from Meta**. Simulated approvals don't count in Live.
- [ ] Use an authorised test phone that has given consent:
  - [ ] Send it a WhatsApp message. Check the webhook is received, the AI replies, and delivered/read ticks appear.
- [ ] Run a one-recipient live campaign (record consent for the test number only) and check the delivery report against the phone.
- [ ] Check Overview: webhook failures 0, AI failures 0. Check Supabase → Edge Functions logs for errors.
- [ ] Check the Supabase cron jobs: `escalate-follow-ups` (15 min), `wa-worker` (1 min), `wa-retention` (daily).

## 4. Operations

- **Stop everything quickly:**
  - Settings → WhatsApp → mode **Off** (sending stops; campaigns wait).
  - AI Assistant → untick automatic replies.
  - Pause or cancel campaigns from their detail screen.
- **Token expired:** sends fail with "WhatsApp access token expired or invalid". Paste a new token in Settings.
- **Failed sends:**
  - Throttling and Meta-side errors retry with backoff (1, 2, 4… minutes, up to 5 tries).
  - Permanent errors (not on WhatsApp, template rejected) are marked failed with the reason.
  - A send interrupted mid-flight is marked failed and never resent, to avoid duplicates.
- **Retention (daily):**
  - webhook event records: 30 days
  - AI logs: 180 days
  - read notifications: 90 days

  Change these in the `retention` setting.
- **Data access:**
  - Contacts and conversations are visible to staff with the WhatsApp module.
  - Only the CEO can record consent, approve campaigns, submit templates or change secrets.
  - Every change to campaigns, contacts' consent and assignment, follow-ups, templates and the knowledge base is in `audit_log`.

## 5. Rollback

- **App:** redeploy the previous Vercel deployment. The new database objects are unused by the old app.
- **Functions:** redeploy the previous `send-whatsapp` and `whatsapp-webhook` from git (`git checkout <commit> -- supabase/functions`).
  Undeploy the new ones with `npx supabase functions delete wa-ai` (and the same for `wa-campaigns`, `wa-templates`, `wa-worker` and `meta-leads`).
- **Background jobs:** `select cron.unschedule('wa-worker'); select cron.unschedule('wa-retention'); select cron.unschedule('escalate-follow-ups');`
- **Database:** the migrations only add things, so leaving them in place is safe. The lead status renames can be reversed with
  `update leads set status = 'Contacted' where status = 'Contacted by Team'` (and the same for Follow-up), then restoring the old check constraint.
  Don't drop tables that hold messages or consent records without a backup.

## 6. Files

| Area | Files |
|---|---|
| Database | `supabase/migrations/0007_whatsapp_inbox.sql`, `0008_ai_assistant.sql`, `0009_campaigns.sql` |
| Edge functions | `whatsapp-webhook`, `send-whatsapp`, `wa-ai`, `wa-campaigns`, `wa-worker`, `wa-templates`, `meta-leads` |
| Shared server code | `_shared/meta.ts` (signatures, 24-hour window), `wa.ts` (sending), `assistant.ts`, `assistant-core.ts` (AI), `campaign-core.ts`, `fees.ts` (also used by the CRM) |
| CRM | `src/pages/WhatsApp.tsx` (inbox), `WhatsAppAssistant.tsx` (follow-ups, AI), `WhatsAppCampaigns.tsx` (overview, contacts, templates, campaigns), `Settings.tsx`, `Inquiries.tsx`, `App.tsx` (notifications) |
| Tests | `src/lib/lib.test.ts` (`npm test`), `supabase/tests/whatsapp.test.mjs` (`npm run test:sql`) |
