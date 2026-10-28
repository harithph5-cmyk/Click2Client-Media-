---
id: crawlability-check
name: Crawlability and indexing check
description: Check whether search engines can crawl and index a page or site: robots.txt, sitemap, canonical, redirects, noindex and broken links.
triggers: [not indexed, indexing, robots.txt, sitemap, canonical, redirect, noindex, broken links, crawl errors, google cannot find]
tools: [run_seo_tool, audit_site, search_knowledge]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# Crawlability and indexing check

## Scope and non-goals
Find technical reasons a page may not be crawled or indexed. It cannot see Google's index: only Search Console can say whether a page is indexed, and that integration is not built yet. Never say a page "is indexed" or "will be indexed".

## Required inputs
The page or site URL from the user.

## Prerequisites
`run_seo_tool` with `robots-checker`, `sitemap-checker`, `canonical-checker`, `redirect-checker`, `broken-link-checker`, `https-security-checker`.

## Procedure
1. `robots-checker` on the URL: is the path allowed for Googlebot? Is a sitemap declared?
2. `sitemap-checker`: found, valid, URL count.
3. `canonical-checker` and `redirect-checker` on the URL: where does it end up, and does the canonical agree?
4. For indexability details use `search_knowledge` ("noindex robots meta", "canonical", "redirects") and explain the interplay: a page blocked in robots.txt cannot show its noindex tag.
5. `broken-link-checker` if links are in question.
6. Summarise as "can be crawled / may be blocked / cannot tell", with the evidence for each.

## Approval and permissions
LOW risk. Changing robots.txt, redirects, canonicals or noindex is HIGH risk and is not available; recommend and explain only, and tell the owner to confirm intent first.

## Verification
Report the exact status codes, redirect hops and directives the tools returned. For uncertain cases say what extra evidence is needed (for example the URL Inspection tool in Search Console).

## Failure handling
Timeouts and 429/5xx are not proof a page is broken; say so and suggest a recheck.

## Output format
Verdict per check, evidence, recommended next step, what could not be verified.

## Test cases
- Disallowed and noindex page: explain that noindex is not seen.
- Redirect chain of two hops: optimisation, not an error.
- Valid 404 on a removed page: informational only.

## Sources
knowledge/library/TECHNICAL_SEO/03_ROBOTS_TXT.md, 05_CANONICAL_TAGS.md, 07_REDIRECTS.md, 08_INDEXABILITY.md, 17_BROKEN_LINKS.md.
