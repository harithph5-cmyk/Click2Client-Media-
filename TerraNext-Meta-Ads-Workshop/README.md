# Master Meta Ads Workshop: registration + manual UPI verification

Express + SQLite (`node:sqlite`, Node >= 22.13) + plain HTML/CSS/JS. No build step.
Flow: landing → `/register` → server saves registration → `/payment/<token>` (QR) → `/payment-status/<token>` (UTR form, then WhatsApp handoff) → admin verifies → `/registration-confirmed/<token>`.

## Run locally
```bash
npm install
ADMIN_PASSWORD='choose-a-12+char-password' npm run create-admin -- you@example.com "Your Name"
npm start            # http://localhost:3000
npm test             # 5 end-to-end tests on a throwaway DB, no real payments
```
Admin: `/admin/login`. Re-running `create-admin` for an email resets that password.

## Configure (Admin → Workshop Settings)
- **Official QR**: first boot seeds `seed/official-qr.png` (cropped from the supplied poster, payee "Suji Tharan"). Upload a replacement any time. **Scan it from a second phone and confirm the payee before launch.**
- Price, original price, date, duration, offer expiry (display only), seat capacity (blank = no seat claim shown), WhatsApp/contact number (`9940411837`), recipient name, certificate text, and the three policy pages.
- Changing the price only affects *new* registrations; each registration stores its own fee.

## Deploy
1. Node >= 22.13 host with a persistent disk. Set `NODE_ENV=production` and `DATA_DIR` (outside `public/`); optional `GA4_MEASUREMENT_ID`, `META_PIXEL_ID`. See `.env.example`.
2. `npm ci --omit=dev && npm start` behind HTTPS (host's free SSL / reverse proxy). `trust proxy` is on, so Secure cookies work.
3. Create the admin account on the server, log in, check the QR, fill the policies.
4. **Backups**: copy `DATA_DIR` (`app.db*` + `private/`) daily, e.g. `sqlite3 app.db ".backup b.db"`. Restore = put the files back.
5. Retention: delete registrations/screenshots you no longer need after the event (privacy policy promises deletion on request).

## Security model (what is and isn't claimed)
- Fee, registration ID, status, and WhatsApp text are all server-side; the browser's values are ignored.
- Payment session: 256-bit random token in the URL path (spec-required route), only its SHA-256 stored, 72 h expiry, revoked when recovered. QR is streamed only to a valid session. **A QR is still not a secret and never proof of payment.**
- Recovering a pending registration needs the same phone **and** email.
- Admin: scrypt passwords, 8 h HttpOnly + SameSite=Strict cookie, custom-header CSRF check, login rate limit, audit log for every decision.
- Verify = one transaction; repeating is a no-op; a UTR can be verified for only one registration (DB unique index). PAID/REJECTED are final.
- Screenshots: magic-byte checked, 3 MB cap, stored outside `public/`, served only to a logged-in admin.

## Deliberate gaps
- **No automatic confirmation message**: after verifying, the admin dialog offers a prefilled WhatsApp link to the participant. Hook email/WhatsApp API there when you have credentials.
- No payment-gateway/webhook integration (manual flow only, as agreed); add a gateway later by writing `PAID` through the same `transition()` guard.
- SQLite, single server. Move to Postgres if you need multiple app instances.
- Admin screenshot links are authenticated, not time-signed.
- "Payment reported" and "Verification pending" are one status (`VERIFICATION_PENDING`).
- Refund policy ships as a "not yet published" notice. **The organiser must write it before launch.**

## Launch checklist
- [ ] Real QR scanned from another phone, payee name matches
- [ ] Admin created, default dev passwords not used anywhere
- [ ] Refund/Privacy/Terms texts approved
- [ ] HTTPS live, custom domain, `NODE_ENV=production`
- [ ] Test registration end-to-end on a phone (₹499 real payment, then verify/reject)
- [ ] Backup job running
- [ ] Optional: GA4/Pixel IDs set and consent banner checked
