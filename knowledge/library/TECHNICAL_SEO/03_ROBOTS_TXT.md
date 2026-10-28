# robots.txt

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-003 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S03 (Google, updated 2025-12-10) and S27 (RFC 9309). Google's page did not state file location or detailed syntax in the fetched content; those come from the RFC. |

## Purpose
Let Basha read robots.txt correctly and avoid harmful edits.

## Core facts
- **[FACT, S03]** robots.txt tells crawlers which URLs they may access; mainly for managing crawler traffic. It is **not** a way to keep a page out of Google. A blocked URL can still appear in results without a description. To keep a page out, use `noindex` or password protection.
- **[FACT, S03]** It does not enforce behaviour; well-behaved crawlers follow it, others may not. It is not a security measure.
- **[FACT, S03]** Blocking scripts/styles is only acceptable if the page still works for Google's crawler without them.
- **[FACT, S27 RFC 9309]** The file must be at the top-level path `/robots.txt`, UTF-8, media type `text/plain`. Crawlers may cache it but should not use a cached copy for more than 24 hours unless it is unreachable. Crawlers must parse at least 500 KiB.
- **[FACT, S27]** HTTP 4xx for robots.txt = "unavailable": crawler may access anything. HTTP 5xx = "unreachable": crawler must assume complete disallow; if undefined for a long period (e.g. 30 days) it may treat as unavailable or use a cached copy.
- CMS note: some hosted platforms (Wix, Blogger) may not allow direct editing (S03).

## Detection
`inspect_robots_txt`: fetch with status and bytes; record final URL after redirects; parse per RFC 9309; list disallow rules for Googlebot and `*`; test the tenant's key URLs (home, top landing pages, CSS/JS, sitemap) against the rules.

## Decision rules
1. `Disallow: /` for all agents on a production site: critical finding; confirm intent (staging copies often should be blocked, but with authentication, not robots.txt).
2. Disallowed URL that is indexed: recommend removing the disallow temporarily and adding `noindex` (a crawler cannot see noindex on a blocked page). Do not auto-apply.
3. A 5xx on robots.txt is a crawl-availability incident, not a content issue; recommend fixing the server first.
4. Never rewrite robots.txt without approval, a backup of the current file, a dry-run of rule tests, and an owner-confirmed list of URLs that must stay crawlable.

## Execution
Writes are HIGH risk (see AGENT_OPERATING_RULES/02). Tool: `update_site_config` is UNAVAILABLE until backup and rollback exist; until then Basha only proposes a diff.

## Verification
Re-fetch /robots.txt; byte-compare to the approved version; re-test the URL list; confirm HTTP 200 and `text/plain`. Check in Search Console later if authorised.

## Errors
Redirects on /robots.txt, wrong content type, huge file over 500 KiB, BOM/encoding problems: report as findings with the exact response.

## Test case TS-ROBOTS-01 (illustrative)
Initial state: robots.txt contains `User-agent: *` / `Disallow: /private/` and the site's checkout lives under `/private/`. Expect: Basha reports that `/private/` is excluded from crawling, does **not** claim it is hidden from search, and recommends `noindex` or authentication if exclusion from results is the goal.

## Limitations
Googlebot-specific parsing quirks beyond RFC 9309 not verified here (Google's robots.txt specification page was not read).

## Sources
S03, S27.
