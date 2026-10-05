# Click2Client Media — website + SEO audit platform

The Click2Client Media agency website (Home, SEO Audit, Services, Enquire Now) with a built-in SEO audit product (free, ₹125 and ₹399 tiers), manual UPI payment verification, and a password-protected admin portal.

## Deploy to Vercel

1. **Push to GitHub.** Use a private repo. `.env`, `data/` and `node_modules/` are ignored by git.
2. **Import it on Vercel.** On vercel.com, choose **Add New → Project → Import** your repo. Leave the framework as *Other* and the build settings empty; `vercel.json` handles routing and sets a 300-second function limit.
3. **Add a database.** Open the project's **Storage** tab, choose **Create / Connect → Neon (Postgres)**, and connect it to all environments. The integration creates `database_POSTGRES_URL` (with the `database_` prefix), which the app uses automatically. The tables are created on the first request.
4. **Set environment variables** under **Settings → Environment Variables**:
   - `NODE_ENV` = `production`
   - `PUBLIC_URL` = your site address, e.g. `https://click2clientmedia.com` (your `*.vercel.app` address until the domain is connected)
   - `ADMIN_PASSWORD` = a long, unique password (the default `2004` is not safe on the internet)
   - `PAGESPEED_API_KEY` = recommended
   - Optional: `ANTHROPIC_API_KEY`, `RESEND_API_KEY` + `EMAIL_FROM`, `NOTIFY_EMAIL`, `LEAD_WEBHOOK_URL`
5. **Redeploy** so the variables take effect. Then open `/admin`, upload your UPI QR code, and run a test audit.
6. **Custom domain:** go to **Settings → Domains**, add your domain, then update `PUBLIC_URL`.

### How the app runs on Vercel

- **State lives in Postgres:** leads, orders, audits, admin sessions, login throttling, settings and the payment QR image. Nothing is written to disk, and nothing is kept in memory between requests.
- **Audits run inside the request:** each audit runs through `waitUntil()` with a 270-second budget. On very slow or very large sites the crawl stops early and the report says so. PageSpeed checks and AI analysis are skipped if time runs short.
- **Progress is polled:** each step is saved to the database, and the browser checks it every 2 seconds.
- **Form rate limits are per instance:** the limits on audits, orders and leads are held in memory, so on Vercel they are approximate. For stricter limits, add Vercel Firewall rules or a Redis-based limiter.

## Quick start (local)

```bash
npm install
cp .env.example .env      # set PUBLIC_URL, change ADMIN_PASSWORD, add PAGESPEED_API_KEY
npm start                 # http://localhost:3000  ·  admin: http://localhost:3000/admin
```

Requires Node 24 and a PostgreSQL database: set `DATABASE_URL` in `.env` (on Vercel, `database_POSTGRES_URL` from the Neon integration is used instead). A free Neon "dev" branch works well. The app never writes data to the local filesystem. Without a database the marketing pages still load, but audits, forms and the admin portal return a "being set up" message.

## Pages and routes

| Route | Purpose |
|---|---|
| `/` | Home: hero, about, testimonials (only when configured), SEO audit product, the problem, services, how we work, why us, CTA |
| `/seo-audit` | Free 10-page audit form + the three plans |
| `/services` | Interactive Marketing / SEO / Technology explorer. All content is in the HTML for search engines |
| `/enquire` | Consultation form, WhatsApp, phone, email |
| `/privacy-policy`, `/terms`, `/cookie-policy` | Legal pages |
| `/audit/:token` | Customer's live progress + audit dashboard (private, unguessable link, `noindex`) |
| `/report/:token` | Printable report → "Download PDF" |
| `/order/:token` | Paid-audit payment page: QR → WhatsApp screenshot → status |
| `/admin` | Admin portal (not linked anywhere public) |
| `/app` | Internal audit workspace (admin session required) |
| `/sitemap.xml`, `/robots.txt` | Generated automatically |

Public pages are rendered on the server from `views/*.html`, so headings, copy, contact details, canonical tags and JSON-LD (Organization/ProfessionalService, WebSite, Breadcrumb, Service offers) reach search engines without JavaScript.

## Audit tiers

| | Free | ₹125 | ₹399 |
|---|---|---|---|
| Pages crawled | 10 | 25 | 50 |
| Score, issues, evidence, why it matters, affected pages | ✓ | ✓ | ✓ |
| Recommendation, impact, platform-specific fix steps | — | ✓ | ✓ |
| Difficulty, 4-week roadmap, quick wins / long-term grouping | — | — | ✓ |
| Consultant notes (if `ANTHROPIC_API_KEY` is set) | — | ✓ | ✓ |

Tier limits are enforced on the server (`server/commerce/plans.js → shapeAudit`). Locked content is never sent to the browser.

### Optional: route AI calls through OmniRoute

[OmniRoute](https://www.omniroute.online/) is a self-hosted AI gateway. Vercel can't run it, so host it yourself (e.g. `docker run … diegosouzapw/omniroute` on a VPS behind HTTPS), then set in Vercel:

- `ANTHROPIC_BASE_URL` = your gateway's public URL
- `ANTHROPIC_API_KEY` = an API key created in the OmniRoute dashboard

No code change is needed; the Anthropic SDK reads `ANTHROPIC_BASE_URL` automatically. Remove the variable to go back to Anthropic directly. Customer site data in AI prompts passes through the gateway, so use API-key providers only.

### Paid audit flow (manual UPI)

1. Visitor picks ₹125 or ₹399 and enters their details. The **server** sets the amount.
2. `/order/:token` shows your QR code (upload it in **Admin → Settings**) and the UPI ID.
3. "Send Payment Screenshot on WhatsApp" opens WhatsApp with their name, business, website, email and order reference filled in. The order becomes *Screenshot Received*. It is **never** marked paid automatically.
4. In **Admin → Payment Verification**, check the screenshot against your UPI app, then click **Verify Payment**. Only this starts the audit.
5. The customer's order page updates by itself. They open the dashboard and download the PDF. If Resend is configured, they also get an email.

Statuses: Payment Pending · Screenshot Received · Payment Under Verification · Payment Verified · Payment Rejected.

## Admin portal

- **Overview:** revenue from verified payments, leads, new leads, payments waiting for verification, free and paid audits, free-to-paid conversion, average score, top services, sources and industries.
- **Payment Verification:** customer, business, website, plan, amount, status, UPI reference, audit status, WhatsApp link.
- **Leads:** every form, free audit and order, with statuses (New, Contacted, Qualified, Proposal Sent, Won, Lost) and CSV export.
- **SEO Audits:** filter by Free, Paid, 25-page, 50-page or Internal, and open the customer view or the full data.
- **Settings:** phone, WhatsApp, email, Instagram/Facebook, UPI ID, payment QR upload, testimonials, report footer. Changes apply site-wide immediately.

### Security

- The password is hashed with scrypt. Sessions are stored hashed in Postgres.
- The session cookie is `HttpOnly` and `SameSite=Strict` (plus `Secure` when `NODE_ENV=production`).
- Every admin write needs a CSRF token header.
- Logins are limited to 5 failed attempts per 15 minutes. All inputs are validated on the server, with rate limits on forms.
- Outbound audit requests are blocked from reaching private networks (SSRF protection).
- No secrets are sent to the browser. UPI PINs, OTPs and card details are never requested or stored.

**Before going live:** change the default password `2004` (it is a 4-digit code and easy to guess). Use a long `ADMIN_PASSWORD`, or better `ADMIN_PASSWORD_HASH`, and serve the site over HTTPS.

## Data model (PostgreSQL)

`customers`, `leads`, `audits` (the id doubles as the private report token), `audit_findings` (one row per issue per URL), `orders` (payments), `sessions`, `projects`, `settings`. All database access goes through `server/store/db.js`. Tables are created and upgraded automatically on the first request after each deploy. The migrations are idempotent and protected by a Postgres advisory lock, so parallel serverless cold starts are safe. The connection string is read from `database_POSTGRES_URL` (set by the Vercel Neon integration), falling back to `DATABASE_URL` (for local development).

## Payment gateway later

`server/commerce/payments.js` defines the adapter interface: `createCheckout` and `verifyWebhook`. To add Razorpay, Cashfree, PayU or Stripe, implement it, keep the keys in env vars, verify the webhook signature, then mark the order *verified*. The rest of the flow stays as it is.

## Honesty rules built in

- Audit numbers come only from real crawls and real APIs. Anything unverifiable is labelled "unavailable" and left out of the score.
- There are no invented testimonials, client logos, ratings or statistics. The testimonials section stays hidden until you add real ones in Settings.
- The site makes no ranking guarantees anywhere.
