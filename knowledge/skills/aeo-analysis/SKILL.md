---
id: aeo-analysis
name: AEO analysis of one page
description: Check whether a page answers its question directly and clearly, with attribution and sources, using the aeo_analyze tool.
triggers: [aeo, answer engine, featured answer, direct answer, faq, answer readiness]
tools: [aeo_analyze, run_seo_tool, search_knowledge, write_report]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# AEO analysis of one page

## Scope and non-goals
One public page. Reports evidence and a heuristic readiness score. It does not test any answer engine and cannot say whether the page will be featured or cited.

## Required inputs
The page URL from the user. Optional: the question the page should answer.

## Prerequisites
The tools named above are implemented and read-only.

## Procedure
1. Call `aeo_analyze` with the URL.
2. Read each check's evidence. Report the score as a documented heuristic and state the method.
3. For failed or warned checks, call `search_knowledge` (area `AEO_GEO`) and cite the source path.
4. Propose concrete rewrites only from the page's real content: a direct opening answer, question headings where readers ask them, a named author, source links. Never invent authors, dates, FAQs or claims.
5. If the user wants it saved, call `write_report`.

## Approval and permissions
All steps are LOW risk and run without approval. Changing a website is not available; never say you changed anything.

## Verification
Quote the evidence strings the tool returned. State what was not measured (answer-engine citations, rankings).

## Failure handling
If a tool fails or is skipped, say so, do not retry an identical failing call, and mark any report preliminary.

## Output format
Findings with evidence, then what was not measured, then next steps in plain language.

## Test cases
- Page with an FAQPage markup whose questions are not visible: reported as a failure.
- Page with no FAQ: not penalised.
- No promise of being featured.

## Sources
knowledge/library/AEO_GEO/01_AEO_GEO_SCORING_METHOD.md, ON_PAGE_SEO/08_CONTENT_QUALITY.md, ON_PAGE_SEO/09_SCHEMA_AND_STRUCTURED_DATA.md.
