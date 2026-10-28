# BASHA AI Knowledge Base: Master Index

Version 0.2.0 · Created 2026-10-28 · Status: **batches 1 and 2 of the library. Partial by design; see "Planned".**

## How to read this library
- Each file has metadata, official requirements, detection, decision rules, execution, verification, errors, security, examples/tests, limitations, sources. Sources use IDs from `SOURCES/SOURCE_REGISTER.md` (S01 to S47).
- Label set used in text: **FACT / REQ (official platform requirement) / REC (recommendation) / EXPERT GUIDANCE / PROPOSED BASHA AI BEHAVIOUR / EXPERIMENTAL / UNVERIFIED / DEPRECATED**. Files use inline tags `[FACT]`, `[REQ]`, `[REC]`, `[PROPOSED]`, `[UNVERIFIED]`.
- A document marked "PARTIAL" has verified parts only; the unverified parts are listed in its status line and must not be used as the basis for an executable procedure.
- A knowledge file is not an integration. Tool status lives in `02_BASHA_TOOL_REGISTRY.md`.

## Written files
**Core:** `01_MASTER_SYSTEM_INSTRUCTIONS.md`, `02_BASHA_TOOL_REGISTRY.md`, `04_KNOWLEDGE_RETRIEVAL_AND_RAG.md`
**Agent operating rules:** AGENT_OPERATING_RULES/02 permission matrix, 03 risk classification, 04 approval policy, 05 verification policy, 06 error reporting, 07 output formats
**SEO fundamentals:** SEO_FUNDAMENTALS/01 fundamentals, 02 crawling/indexing/serving, 05 guidelines and spam policies
**On-page:** ON_PAGE_SEO/01 titles, 02 meta descriptions, 03 headings, 06 internal linking, 07 image SEO, 08 content quality, 09 structured data
**Technical:** TECHNICAL_SEO/01 audit framework (rule register), 02 website crawling, 03 robots.txt, 04 sitemaps, 05 canonical, 06 HTTP status codes, 07 redirects, 08 indexability, 09 JavaScript SEO, 10 Core Web Vitals, 13 international (hreflang), 17 broken links (added file)
**Analytics:** ANALYTICS_AND_REPORTING/01 Search Console, 02 GA4
**Website automation:** WEBSITE_AUTOMATION/02 WordPress REST API
**Local:** LOCAL_SEO/02 Google Business Profile
**Content/marketing:** CONTENT_AND_MARKETING/06 social media publishing
**AI automation:** AI_AUTOMATION/03 function calling
**Security:** SECURITY_AND_COMPLIANCE/01 authn/authz, 04 prompt injection, 06 SSRF
**Testing:** TESTING_AND_EVALUATION/01 framework, 02 SEO test case specifications (33 cases), 07 known limitations
**Sources:** SOURCES/SOURCE_REGISTER, API_REFERENCE_INDEX, PLATFORM_POLICY_INDEX, SECURITY_STANDARDS_INDEX, RESEARCH_CHANGELOG
**Report:** `QUALITY_REPORT.md`

## Task to document map
| Task | Read first |
|---|---|
| Audit a site end to end | TECHNICAL_SEO/01, 02, 06, 08; TESTING/02 |
| Audit a page's title/description/headings/images | ON_PAGE_SEO/01, 02, 03, 07 |
| Diagnose "page not indexed" | SEO_FUNDAMENTALS/02; TECHNICAL_SEO/03, 05, 07, 08, 09 |
| Review robots.txt / sitemap | TECHNICAL_SEO/03, 04 |
| Check redirects, canonicals, status codes | TECHNICAL_SEO/07, 05, 06 |
| Broken or orphan links | TECHNICAL_SEO/17; ON_PAGE_SEO/06 |
| JavaScript site problems | TECHNICAL_SEO/09 |
| Speed / Core Web Vitals | TECHNICAL_SEO/10 |
| Multi-language site | TECHNICAL_SEO/13 |
| Structured data | ON_PAGE_SEO/09 |
| Write or refresh content | ON_PAGE_SEO/08 |
| Traffic reports | ANALYTICS/01, 02; AGENT_OPERATING_RULES/07 |
| Change a WordPress site | WEBSITE_AUTOMATION/02; AGENT_OPERATING_RULES/02-05 |
| Local business profile | LOCAL_SEO/02 |
| Social posts | CONTENT_AND_MARKETING/06 |
| Anything risky | AGENT_OPERATING_RULES/02, 03, 04; SECURITY/04 |

## Planned (not written; do not treat as existing)
SEO_FUNDAMENTALS 03-04; ON_PAGE_SEO 04-05, 10-11; TECHNICAL_SEO 11-12, 14-16; all of OFF_PAGE_SEO; LOCAL_SEO 01, 03-09; CONTENT_AND_MARKETING 01-05, 07-09; all of ECOMMERCE_SEO; ANALYTICS 03-09; WEBSITE_AUTOMATION 01, 03-07; AI_AUTOMATION 01-02, 04-11; all of BUSINESS_AUTOMATION; SECURITY 02-03, 05, 07-11; root 01_BASHA_IDENTITY_AND_MISSION, 02_AI_AGENT_ARCHITECTURE, 03_AI_REASONING_AND_TOOL_USE, 05_AGENT_MEMORY_AND_TASK_STATE; AGENT_OPERATING_RULES/01 (root `01_MASTER_SYSTEM_INSTRUCTIONS.md` serves as canonical); TESTING 03-06. Each needs the sources listed as unread in the register.
