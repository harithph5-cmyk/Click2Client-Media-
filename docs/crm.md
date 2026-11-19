# Click2Client Media CRM (admin portal)

Open `/admin`. The founder signs in with the admin password; team members sign in with
email + password (Team Management → Add member). What each role sees is controlled in
Team Management → Roles & permissions, enforced on the server for every API route.

## What lives where
| Area | Data source |
|---|---|
| Payments | existing `orders` table (verification flow unchanged) |
| Invoices / subscriptions / expenses | new tables; revenue = verified orders + paid invoices (no double counting) |
| Leads | existing `leads` table + CRM columns (owner, follow-up, budget, location) |
| SEO audits / SEO Agent | existing engine, unchanged |
| Blog | existing blog store (settings JSON) — Blog Studio API keeps working; adds approval flag |
| Page content | `page_overrides` setting: per-page SEO title/description + exact-text replacements |
| Users, roles, audit log | `users`, `roles`, `audit_logs` |

All schema changes are additive (`server/crm/schema.js`, run automatically on first request).

## Honest limits
* Keyword ranks, backlinks, AEO and GEO checks are **manual entry** — no ranking/AI-visibility API is connected. Connect a provider before relying on them as automatic data.
* "PDF" for invoices and reports uses the browser's Print → Save as PDF.
* Payment proof upload is not built: customers still send the screenshot on WhatsApp and the admin verifies it (existing flow).
* Notifications are computed live from records (no push/email); "read" state is stored in the browser.
* Meta Lead Ads / WhatsApp need your app credentials — see `.env.example`.
