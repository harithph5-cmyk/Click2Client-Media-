# Social Media Publishing (platform facts and rules)

| Field | Value |
|---|---|
| Document ID | BASHA-CONTENT-006 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PARTIAL. Instagram (S26, no date), LinkedIn Posts API (S33, updated 2026-05), YouTube Data API (S25, updated 2026-10-15) read. **Facebook Pages, Pinterest (docs URL returned 404 on 2026-10-28), Reddit, others: NOT researched, treat as UNAVAILABLE.** App-review/approval details for each platform NOT verified. |

## Instagram content publishing [FACT, S26]
Professional account required; if the connected Page requires Page Publishing Authorization, publishing is blocked until completed. Permissions (varies by login type): `instagram_basic` + `instagram_content_publish`, or `instagram_business_basic` + `instagram_business_content_publish`; access levels Standard/Advanced. Single images must be JPEG; videos, Reels, Stories, carousels (up to 20 items) supported; media must be on a publicly accessible server at publish time. Process: create container (`POST /<IG_ID>/media`), optional carousel/resumable upload, publish (`POST /<IG_ID>/media_publish`), poll `status_code` (about once a minute for up to 5 minutes). Limit stated as 100 API-published posts per 24 h (carousel counts as one), but the page also states 50 for carousels: **inconsistent: use the lower value until checked**; the endpoint `content_publishing_limit` reports usage.

## LinkedIn Posts API [FACT, S33]
Permissions `w_member_social` (member), `w_organization_social` (organisation; requires an eligible company-page role); `r_member_social` restricted to approved users. Headers `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0` required. Organic post types include text, images, video, documents, article, multi-image, poll; organic carousels not supported. Article posts require setting title/description/thumbnail yourself (no URL scraping). API versions are retired on a schedule (version 202511 sunsets 2026-11-16): pin and track versions.

## YouTube Data API [FACT, S25]
Insert/update/delete require OAuth user authorisation. Default quota 10,000 units/day. Quota cost for `videos.insert` is stated inconsistently (1 unit vs "write operations usually 50"): verify with the official quota calculator before planning uploads. Upload compliance-audit requirements were not stated on the page read.

## Basha rules [PROPOSED]
1. Basha **drafts** posts; publishing needs approval (HIGH). Scheduled publishing only through official APIs and only for accounts the tenant connected.
2. No scraping of private data, no fake engagement, no mass posting of promotional links to communities, no automation that evades platform limits.
3. Respect each platform's content and rate limits; stop on 429 and report.
4. Keep a per-platform capability table with a `last_checked` date; features not verified are not offered.
5. Store tokens per tenant, least scope, revoke on disconnect.

## Detection and verification
Before scheduling: confirm account type, permission scope, media format, remaining publishing allowance. After publishing: read back the post by ID; confirm text, media and visibility; record the permalink.

## Errors
Policy rejection, expired token, permission removal, media processing `ERROR`/`EXPIRED`: report; never retry blindly; ask the tenant to re-authorise.

## Test cases
TS-SOC-01 expired token => `auth`, ask re-consent. TS-SOC-02 PNG image to Instagram => preflight failure (JPEG only, S26). TS-SOC-03 LinkedIn org post without role => 403 `ACCESS_DENIED` handled.

## Sources
S25, S26, S33.
