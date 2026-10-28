# XML Sitemaps

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-004 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PARTIAL. S04 (Google sitemaps overview, updated 2025-12-10) verified. **Sitemap size limits and exact formats were not stated in the fetched page and are NOT recorded here as facts.** The sitemaps.org protocol and Google's "build a sitemap" page still need to be read. |

## Purpose
Help Basha judge whether a sitemap is needed and whether an existing one is healthy.

## Facts from S04
- Helpful for: large sites, new sites with few external links, sites with substantial video/image content or in Google News.
- May not be needed for: small sites (roughly 500 pages or fewer of search-relevant pages), sites with thorough internal linking, few media/news pages.
- A sitemap does not guarantee every listed URL is crawled or indexed.
- S01: submitting a sitemap "isn't required". S05: a sitemap is a **weaker** canonical signal than redirects or rel=canonical.
- IndexNow (S29) is a separate notification protocol: up to 10,000 URLs per POST; a 200 only confirms receipt. Google's participation was not confirmed in the page read, so do not assume it.

## Detection
`inspect_xml_sitemap`: fetch, parse, count URLs, compare to crawl: URLs in sitemap that redirect, 404, are noindex, or canonicalise elsewhere; indexable pages missing from sitemap; last-modified values that are always "now" (low value).

## Decision rules
1. Sitemaps should list canonical, indexable, 200-status URLs. Findings for others are **medium** unless the sitemap is the only discovery path.
2. Small, well-linked site with no sitemap: **not an error**.
3. Never recommend adding noindex or blocked URLs to a sitemap.

## Execution and verification
Generating or replacing a sitemap file: HIGH risk if it changes site config; verify by re-fetching, re-parsing, sampling 20 URLs for status and canonical. Search Console submission is an external action needing tenant authorisation.

## Limitations
Per-sitemap size limits: [UNVERIFIED] until the official page is read.

## Sources
S04, S01, S05, S29.
