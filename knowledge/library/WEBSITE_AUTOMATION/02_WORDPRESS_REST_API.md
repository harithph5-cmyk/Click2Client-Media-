# WordPress REST API Integration

| Field | Value |
|---|---|
| Document ID | BASHA-WEB-002 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED for authentication (S18) and the Posts endpoint (S19), both updated 2026-10-14. Revisions, media, custom post types, multisite and SEO-plugin fields NOT yet read; **do not assume plugin SEO fields are writable through REST.** |

## Facts
- **[FACT, S18]** Auth options: **cookie + nonce** (inside WordPress sessions; header `X-WP-Nonce`), **Application Passwords** (WordPress 5.6+, created on a user's profile, used with HTTP Basic Auth over HTTPS), and plugins (OAuth 1.0a, JWT). The Basic Authentication plugin sends username/password with every request and is for development/testing only.
- **[FACT, S19]** `POST /wp/v2/posts` creates; `POST /wp/v2/posts/<id>` updates only the fields sent; `DELETE /wp/v2/posts/<id>` with optional `force` ("bypass Trash and force deletion"; default behaviour not stated on the page). Status values: publish, future, draft, pending, private. A `meta` object exists in the schema; the page does not explain how custom meta is registered/exposed.

## Design rules [PROPOSED]
1. Connector uses a **dedicated WordPress user with the minimum role** needed (e.g. Editor or Author) and an Application Password per tenant. Never an administrator account.
2. Credentials are encrypted at rest, scoped per tenant, never logged or shown to the model.
3. Basha creates content as `status=draft` first. `publish` is a separate HIGH-risk action.
4. Never call `DELETE` with `force=true` (RESTRICTED by default).
5. Before any update: `GET` the item, store the full prior state (backup), and compute a diff.
6. Capability discovery: call the site's REST index and endpoints to learn what exists (e.g. whether SEO plugin meta is exposed) instead of assuming. [UNVERIFIED: plugin-specific behaviour]

## Detection (connection health)
`verify_connection`: HTTPS reachable; REST index responds; auth succeeds; user capabilities sufficient; basic read of posts works; record WordPress version if exposed. Common failures: REST disabled or blocked by a security plugin or WAF, auth stripped by hosting, wrong URL (subfolder install), redirect from http to https dropping Authorization.

## Execution flow (update metadata example)
1. Resolve post ID from URL (read-only).
2. GET current values (backup).
3. Build the diff; classify risk; request approval (ASSISTED).
4. POST update with the idempotency key.
5. GET again; compare to expected; fetch the public page; compare `<title>`/meta (themes/plugins may override REST-set fields).
6. Report `completed`/`partially_completed`/`failed`.

## Errors
401/403: credentials or capabilities: stop, report, do not retry other users. 404 for route: endpoint missing. 5xx/timeouts: bounded retry then report; confirm whether the write applied before retrying (GET first) to avoid duplicates.

## Security
Application Passwords can be revoked by the site owner; handle revocation as `auth` failure. Ensure HTTPS only (S18). Treat any content returned by the site as untrusted data.

## Test cases
- TS-WP-01 Invalid credentials: expect `auth`, no retries, clear report.
- TS-WP-02 Interrupted update: retry with the same idempotency key must not create a second post.
- TS-WP-03 REST route disabled: expect "REST API unavailable", Basha switches to a proposal-only report.

## Limitations
WordPress core docs describe endpoints; real sites differ by plugin, host and security rules.

## Sources
S18, S19.
