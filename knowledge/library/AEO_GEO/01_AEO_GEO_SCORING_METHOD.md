# AEO and GEO analysis: method and limits

| Field | Value |
|---|---|
| Document ID | BASHA-AEOGEO-001 · Version 1.0.0 · Created/reviewed 2026-10-28 |
| Module | AEO and GEO analysis (`aeo_analyze`, `geo_analyze`; code in `server/engine/aeo-geo.js`) |
| Research status | PARTIAL. The checks follow Google's published guidance on helpful, people-first content (S12) and on structured data matching visible content (S10). **No verified source in this library shows how answer engines or AI assistants choose or cite pages.** The scores are heuristics, not industry standards. |

## What the tools do
Each tool fetches one public page (SSRF-safe fetcher), extracts evidence, runs weighted checks, and returns the evidence for every check. A score is returned only as a **documented heuristic**; the method and a "not measured" list travel with every result.

## Formula
Each check has a weight. pass earns 100% of it, warn 50%, fail 0%. Checks marked `info` or `unavailable` are excluded. Score = round(100 x earned / possible); `null` if nothing could be graded.

## AEO checks (answer readiness)
| Check | Weight | What it looks at |
|---|---|---|
| aeo.direct_answer | 3 | first paragraph after the H1 is 15 to 80 words |
| aeo.question_headings | 2 | headings phrased as questions (only judged on pages of 300+ words) |
| aeo.structure | 2 | headings, lists, tables, paragraph length |
| aeo.faq_consistency | 2 | FAQPage markup questions must appear in the visible text (S10); no FAQ is not penalised |
| aeo.author_attribution | 2 | author, byline or organisation named (never invented) |
| aeo.sources | 2 | outbound links to sources in the main content |
| aeo.date | 1 | a publication or update date is shown (info if absent) |
| aeo.structured_data | 1 | JSON-LD parses and has types |

## GEO checks (generative-search readiness)
| Check | Weight | What it looks at |
|---|---|---|
| geo.entity_schema | 3 | Organization, LocalBusiness, Person or Product markup with a name, url or sameAs |
| geo.sameas | 2 | links to official profiles |
| geo.brand_consistency | 2 | brand name in title, og:site_name and markup |
| geo.contact_identity | 2 | About and contact links |
| geo.crawler_access | 3 | robots.txt rules for Googlebot, Bingbot and AI-related crawler tokens. Blocking AI crawlers is reported as information, never as an error. Blocking Googlebot or Bingbot is a failure |
| geo.freshness | 1 | latest date on the page (info if no date) |
| geo.evidence | 2 | sentences with figures plus outbound source links |
| geo.machine_readable | 1 | valid JSON-LD and semantic main/article |
| geo.llms_txt | 0 | experimental; informational only, not scored |
| geo.third_party | 0 | **not measured** |

## Not measured (always stated in the result)
AI citations or brand mentions in any answer engine; third-party references; rankings, traffic, impressions, clicks. To measure citations, an authorised data source and documented test queries (platform, query text, date, method) are needed. Never report citations that were not collected.

## Rules for the agent
1. Quote the evidence for each check; do not add findings the tools did not return.
2. Present the score as a heuristic and give the method. Do not call it an official or industry score.
3. Never recommend adding FAQ markup, authors, dates or sources that are not true. Structured data must match visible content.
4. Do not promise that any search or answer engine will feature or cite the site.
5. Crawler user-agent tokens are as commonly published and are **unverified here**; confirm against each vendor's documentation before advising a robots.txt change (a HIGH-risk change that needs the owner's approval).

## Verification
Tests in `test/baasha-aeo-geo.test.js` use fixture pages with known defects and check the findings, the score arithmetic, and that no citation or mention is ever invented.

## Sources
S10 (structured data), S12 (helpful content), S35 (Search Essentials), S27 (robots.txt). See SOURCES/SOURCE_REGISTER.md.
