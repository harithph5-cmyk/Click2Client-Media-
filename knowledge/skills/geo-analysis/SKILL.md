---
id: geo-analysis
name: GEO analysis of one page
description: Check entity clarity, official profile links, brand consistency, crawler access and evidence on a page with the geo_analyze tool, without inventing AI citations.
triggers: [geo, generative engine, ai search, ai citations, brand mentions, entity, llm visibility]
tools: [geo_analyze, run_seo_tool, search_knowledge, write_report]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# GEO analysis of one page

## Scope and non-goals
One public page plus its robots.txt. Reports evidence and a heuristic readiness score. It does **not** measure whether any AI assistant mentions or cites the brand.

## Required inputs
The page URL from the user.

## Prerequisites
The tools named above are implemented and read-only.

## Procedure
1. Call `geo_analyze` with the URL.
2. Report each check with its evidence. Present the score as a documented heuristic.
3. Always state the "not measured" list. If the user asks about AI citations or mentions, say this needs an authorised data source and documented test queries, which are not connected; do not guess.
4. For robots.txt findings, note that blocking AI-related crawlers is a business choice, and that crawler tokens are unverified here. Changing robots.txt is HIGH risk and not available.
5. Use `search_knowledge` (area `AEO_GEO`) for guidance, cite the source.

## Approval and permissions
All steps are LOW risk and run without approval. Changing a website is not available; never say you changed anything.

## Verification
Every claim comes from the tool result. Never report a citation, mention, ranking or third-party reference that no tool returned.

## Failure handling
If a tool fails or is skipped, say so, do not retry an identical failing call, and mark any report preliminary.

## Output format
Findings with evidence, then what was not measured, then next steps in plain language.

## Test cases
- Page with no Organization markup: failure with a truthful fix.
- robots.txt blocking an AI crawler: reported as information, not an error.
- Request for "my GEO ranking": answered with what was and was not measured.

## Sources
knowledge/library/AEO_GEO/01_AEO_GEO_SCORING_METHOD.md, TECHNICAL_SEO/03_ROBOTS_TXT.md.
