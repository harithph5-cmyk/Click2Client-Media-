# Broken Links (internal and external)

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-017 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | Behaviour of status codes VERIFIED (S37, S47); link markup facts from S36 and S45. Whether broken links affect rankings: **no official statement was read**: do not claim an effect. |

## Definitions
- **Broken internal link:** an `<a href>` on a crawled page whose target (after following redirects up to the cap) returns 4xx/5xx, times out, or fails DNS.
- **Broken external link:** same for other sites. Lower urgency; the target may be temporarily down.
- **Not broken:** a link to a URL that returns 200 (even if poor), or a valid redirect to a 200.

## Detection procedure (`detect_broken_links`, PROPOSED)
1. From crawl data build link records: source URL, target URL, `rel`, anchor text (or image `alt` for image links, S36), position (nav/footer/body).
2. Internal targets: use the crawl's own status results (no second request when already fetched).
3. External targets: request with HEAD (fallback to GET on 405/403 pattern), 10 s timeout, max 2 redirects tracked up to 10 hops total, domain-level rate limit (e.g. 1 request per second per host), identical targets requested once.
4. **Confirm before reporting:** re-test failed targets after a delay (at least once, different time) to rule out transient failures. 429 and 5xx are overload signals, not proof of a dead page (S37).
5. Distinguish: 404/410 (gone), 3xx chain/loop, 5xx/timeouts (unreliable), 401/403 (access restricted, maybe bot-blocking: `unknown`, not broken), DNS failure (domain gone or typo).

## Decision rules
1. Internal link to 404/410: fix the **link** (point to the right URL) or restore/redirect the target if the page should exist. Severity medium; high if in main navigation or on high-traffic pages.
2. If the target legitimately no longer exists and no replacement fits: remove the link; do not redirect to an unrelated page.
3. Links to redirecting URLs: update the link to the final URL (optimisation).
4. External: `unknown` (401/403/429/timeouts) is never reported as broken. For confirmed gone targets, suggest replacement or removal; do not link to unrelated pages.
5. Never mass-edit links without approval: bulk content edits are MEDIUM to HIGH.
6. Large numbers of broken URLs from one pattern (e.g. a changed permalink structure) = one finding with a count and sample, plus a redirect-mapping recommendation (HIGH risk to implement).

## Verification
After fixes: re-crawl the source pages and re-request targets; broken count decreases; no new 404s introduced.

## Errors
Blocked by WAF (403 with challenge page): `blocked`, not broken. Rate-limited: slow down.

## Security
External checks go through the SSRF-safe fetcher; never follow redirects into private ranges; never send cookies or credentials to external hosts.

## Test cases
TS-LINK-01 internal 404, TS-LINK-02 external flaky host, TS-LINK-03 403 bot-block (see TESTING_AND_EVALUATION/02).

## Limitations
No verified evidence on ranking impact; report user-experience and crawl-waste impact only.

## Sources
S36, S37, S45, S47.
