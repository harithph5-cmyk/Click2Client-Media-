# HTTP Status Codes

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-006 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S37 (Google, updated 2026-02-04) and S47 (MDN reference, modified 2026-09-17). RFC 9110 itself NOT read. |

## Google's treatment [FACT, S37]
| Class | What Google does |
|---|---|
| 2xx | passes content to indexing; not a guarantee of indexing. 202: waits a limited time; 204: no content to process |
| 3xx | follows up to about 10 hops; ignores the redirecting URL's content; 301/308 strong signal, 302/303/307 weak; 304 means unchanged since last crawl |
| 4xx (except 429) | content ignored; all treated alike (404 and 410 included); indexed URLs removed over time; crawl rate not affected; do **not** use 401/403 to limit crawling |
| 429 | treated like a server overload (as 5xx) |
| 5xx | content ignored; crawling slows; indexed URLs kept at first but eventually dropped if persistent; recovery after 2xx is gradual |
| soft 404 | a 2xx page with empty content or error message is reported in Search Console as "soft 404" |

## Meanings [FACT, S47]
200 OK; 301/308 permanent (308 keeps the method); 302/307 temporary (307 keeps the method); 404 not found (may also hide resources); 410 gone (permanent deletion, no forwarding address); 429 too many requests; 500 generic server error; 503 temporarily unavailable, ideally with `Retry-After`.

## Detection
For each URL store the exact code (not just class). Cross-check: soft-404 patterns (200 plus "not found", "no results", empty main content), error pages served as 200, 200 for unknown URLs (wildcard 200), 5xx under load, differing codes for HEAD vs GET, codes differing by user-agent.

## Decision rules
1. 404/410 for removed pages is correct. Do not recommend redirecting every 404 to the home page. (REC; soft-404 treatment of such redirects not verified here.)
2. If a page was moved: 301/308 to the closest equivalent; if there is no equivalent: leave 404/410.
3. Use 503 (with `Retry-After`) for planned downtime rather than 200 error pages or 404. (REC based on S47 meaning; Google handling of 503 duration limits not verified.)
4. Never recommend 401/403 as a crawl-limiting tool (S37).
5. 429/5xx during Basha's own crawl: slow down and report; these also signal a server problem that real crawlers will see.

## Execution
Status-code changes happen at the server/CDN/CMS: HIGH risk when site-wide (see AGENT_OPERATING_RULES/03). Basha only proposes unless a connector with backup exists.

## Verification
Re-request the URL with a clean client; confirm exact code and, for redirects, target; confirm no content leak for 410/404 pages.

## Test cases
TS-STATUS-01 soft 404; TS-STATUS-02 removed page returns 404 (expect `info`, not an error); TS-STATUS-03 server returns 503 during crawl (expect backoff and partial status).

## Sources
S37, S47.
