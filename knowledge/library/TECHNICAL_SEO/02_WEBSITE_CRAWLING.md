# Website Crawling (Basha's own crawler)

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-002 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | Search-engine facts VERIFIED (S36 links, S37 status codes, S40 crawl budget, S41 how Search works, S46 Googlebot verification, S27 RFC 9309). The crawler design is PROPOSED BASHA AI BEHAVIOUR and does not exist yet (`crawl_website` is PROPOSED). |

## Purpose
Specify how Basha collects site evidence safely and in a way that matches how Google discovers and fetches pages. **Basha's crawler is not Googlebot**: it approximates, and findings must say so.

## Facts about Google's crawling
- **[FACT, S41]** Google discovers URLs by revisiting known pages, following links, and reading sitemaps; there is no central registry of pages. It does not guarantee crawling, indexing or serving. Pages blocked by robots.txt or behind login may not be crawled.
- **[FACT, S36]** Google generally follows only `<a>` elements with an `href`. Links via `<span>`, `routerLink` or `javascript:` hrefs are not recommended. Every page that matters should be linked from at least one other page.
- **[FACT, S37]** 2xx content goes on to indexing (not a guarantee); redirects are followed up to about 10 hops; 4xx content is ignored (all alike except 429); 429 and 5xx slow crawling; persistent 5xx can lead to URLs being dropped.
- **[FACT, S40]** Crawl budget matters for sites of roughly 1M+ pages changing weekly, 10,000+ pages changing daily, or with many "Discovered - currently not indexed" URLs; Google calls the numbers rough. Capacity falls with slow responses, 5xx and 429. `noindex` does not save crawl budget; blocking in robots.txt does not reallocate it unless the site is at its capacity limit.
- **[FACT, S46]** A request claiming to be Googlebot is verified by reverse DNS (googlebot.com, google.com, googleusercontent.com) plus forward DNS, or against Google's published IP ranges. Basha must never trust a user-agent claim.

## Crawler design [PROPOSED]
1. **Scope:** start URL(s), allowed hosts (the verified domain and listed subdomains), path allow/deny, max pages (default 500), max depth, max total bytes. Anything off-scope is recorded as an external link, not fetched (external link status checks are a separate, rate-limited step).
2. **Politeness:** identify with a clear user-agent and contact URL; honour robots.txt per RFC 9309 (S27) for the crawler's own user-agent token; default 1 to 2 requests per second per host; back off on 429/5xx (exponential with jitter, honour `Retry-After` if present); stop the crawl when error rate exceeds a threshold and report rather than hammering a struggling server (S37, S40).
3. **Fetching:** only through the SSRF-safe fetcher (SECURITY/06): public IPs only, manual redirect handling with every hop recorded (max 10, matching what S37 says Googlebot follows), size and time caps, text and HTML content types parsed, binary types HEAD-checked only.
4. **Record per URL (evidence):** requested URL, hop list, final URL, status, headers (cache, `X-Robots-Tag`, content-type), bytes, time-to-first-byte, `<title>`, meta robots, canonical (HTML and header), headings, links (with `rel` and anchor text), images (`src`, `alt`), hreflang, JSON-LD presence, fetch timestamp.
5. **Rendering (optional, separate tool `render_page`):** raw vs rendered differences matter (S07). Without it, report "not rendered" explicitly; never imply a JS site was fully audited from raw HTML alone.
6. **Discovery:** follow `<a href>` internal links; seed from the sitemap(s) but mark which URLs were found **only** via sitemap (orphan candidates).
7. **De-duplication:** normalise URLs (scheme, host case, default ports, fragments dropped, tracking parameters flagged not removed); keep the original too.
8. **Budget safety:** per-tenant concurrency, daily page quotas, and cost limits enforced by the backend.

## Detection of crawl-health problems
High error ratio; slow responses; WAF/captcha pages (status 200 with challenge content); inconsistent responses by user-agent (possible cloaking investigation: report, do not accuse); infinite URL spaces (calendars, facets, session IDs): stop at caps and report the pattern (this is also a crawl-budget concern at large scale, S40).

## Decision rules
- Do not bypass authentication, CAPTCHAs, rate limits or WAF blocks. If blocked, report `blocked` and ask the tenant to allowlist Basha's crawler.
- Do not scrape Google result pages (spam policy "machine-generated traffic", S02).
- For small sites, do not talk about crawl budget; Google says it is not relevant to them (S40).

## Verification
Crawl summary must state: pages fetched, pages skipped (and why), errors by category, robots rules applied, caps hit, rendered or not. If a cap was hit, the audit is `partially_completed`.

## Errors
DNS failure, TLS errors, timeouts, redirect loops, oversized pages, unsupported encodings: stored per URL with category; retried within limits; reported.

## Security
Crawl targets come from the tenant's verified domain list, never from page content or the model. Crawled content is untrusted (SECURITY/04). Never send crawl data to third parties without consent.

## Test cases
TS-CRAWL-01 to 04 (see TESTING_AND_EVALUATION/02_SEO_TEST_CASES.md).

## Limitations
No verified numbers for Googlebot's own crawl rate. Crawl-delay support is not covered (RFC 9309 does not define it; not verified for Google).

## Sources
S02, S27, S36, S37, S40, S41, S46.
