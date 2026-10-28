# SEO Fundamentals

| Field | Value |
|---|---|
| Document ID | BASHA-SEO-001 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Module | SEO fundamentals · Users: runtime agent, engineers |
| Research status | Partly verified (Google official pages S01, S35, S12, S02 read on 2026-10-28). Bing, W3C and academic AI-search sources NOT yet researched (see SOURCES). |

Labels: **[FACT]** verified fact from a source, **[REQ]** official platform requirement, **[REC]** recommendation, **[PROPOSED]** Basha behaviour, **[UNVERIFIED]**.

## Purpose
Give Basha an accurate base model of how Google Search treats a site, so it does not present folklore as rules.

## Core concepts
- **Crawling, rendering, indexing, serving** are different stages. A page can be crawled but not indexed, and indexed pages are not guaranteed to rank. [FACT, S07 describes crawl, render, index for JavaScript pages; S35: meeting guidelines "doesn't guarantee" crawling, indexing or serving]
- Google's crawlers find pages automatically; "usually you only need to publish your site". [FACT, S01]
- Results can take hours to months to appear; wait a few weeks before judging. [FACT, S01]
- **No ranking guarantees:** "There are no secrets here that'll automatically rank your site first." [FACT, S01]
- Search Essentials has three parts: technical requirements (the bare minimum), spam policies, key best practices. [FACT, S35]
- Helpful, people-first content is the stated direction; trust is weighed most heavily among E-E-A-T qualities in Google's self-assessment guidance. [FACT, S12]

## What Google says not to focus on [FACT as summarised from S01; re-read exact wording before quoting]
Meta keywords, keyword stuffing, keywords in domain names, TLD choice (unless country targeting), content-length targets, subdomain vs subdirectory, a "duplicate content penalty", heading order. The summary also listed E-E-A-T as "not a ranking factor" in that section; treat as needing re-verification because S12 discusses E-E-A-T in content self-assessment.

## Official requirements vs recommendations
- [REQ] Pages must meet Search Essentials technical requirements and avoid spam policies to be eligible for good visibility (S35, S02).
- [REC] Almost everything else in S01 is advice: descriptive URLs, unique titles, concise descriptions, alt text, sitemaps ("this isn't required"), canonicalisation (Google picks one if you do not).

## Detection (what Basha gathers)
Crawl results, status codes, robots/meta robots/X-Robots-Tag, canonical declarations, titles/headings, internal links, sitemap coverage, Search Console coverage and performance (when authorised).

## Decision rules
1. Diagnose from evidence, never from a checklist alone.
2. Separate "blocks eligibility" (crawl/index problems, spam) from "could be better" (wording).
3. Do not recommend content length targets, keyword density, or fixed heading orders as rules.
4. Treat GEO/AEO (AI-search optimisation) ideas as **experimental**; no verified source in this library yet shows guaranteed effects. [UNVERIFIED]

## Execution and verification
Fundamentals do not execute anything; they feed audit and recommendation tools. Verification follows AGENT_OPERATING_RULES/05.

## Examples (illustrative)
Owner: "Why did my traffic drop last week?" Basha must check data freshness (Search Console data typically 2-3 days old, S13), compare like-for-like periods, check for technical changes, and avoid blaming an algorithm update without evidence.

## Limitations
No exact algorithm knowledge. Bing and other engines differ and are not covered yet.

## Sources
S01 (updated 2025-12-10), S35 (2025-12-10), S12 (2026-10-05), S02 (2026-08-28), S07, S13. Maintenance: re-read S01/S35 quarterly; Google edits these pages without notice.
