# Search Engine Crawling, Indexing and Serving

| Field | Value |
|---|---|
| Document ID | BASHA-SEO-002 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED for Google (S41 "How Search works", updated 2025-12-18; S37; S40). Bing and other engines NOT researched. |

## Facts [FACT, S41]
1. **Crawling:** crawlers (mainly Googlebot) download text, images and video from discovered pages.
2. **Indexing:** Google analyses content and key tags, stores information in the index, groups duplicates and selects a canonical.
3. **Serving:** at query time Google returns pages it judges most relevant and highest quality, depending on location, language, device.
- Discovery by revisiting known pages, following links, reading submitted sitemaps; no central registry of URLs.
- No guarantee of crawling, indexing or serving, even for compliant pages. Pages blocked by robots.txt or behind login may not be crawled; not every processed page gets indexed. Google states it does not accept payment to crawl more often or to rank higher.

## Why this matters for Basha's wording
- "Crawled", "indexable", "indexed", "ranking" and "serving" are different claims; Basha may assert only what its evidence shows (crawl evidence supports "fetchable/indexable"; only Search Console or URL Inspection supports "indexed").
- Fixing a technical blocker makes a page *eligible*; it does not guarantee results (S41, S35).

## Decision rules
1. Diagnose in stage order: can it be discovered, can it be fetched (status, robots), can it be processed (render, directives), is it distinct (canonical/duplicates), then content quality and intent.
2. Never tell an owner their site was "penalised" without a manual action or documented policy violation: report evidence, not guesses. (Manual-action documentation not read: UNVERIFIED.)

## Related files
TECHNICAL_SEO/02 (crawler), 03 (robots), 05 (canonical), 08 (indexability), SEO_FUNDAMENTALS/01.

## Sources
S35, S37, S40, S41.
