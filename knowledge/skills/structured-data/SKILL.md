---
id: structured-data
name: Structured data review
description: Validate a page's JSON-LD and check that markup matches visible content, using the schema validator and AEO/GEO checks.
triggers: [schema, structured data, json-ld, rich results, markup]
tools: [run_seo_tool, aeo_analyze, geo_analyze, search_knowledge]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# Structured data review

## Scope and non-goals
Review of existing markup on one page. Generating or publishing markup is not available; drafts are proposals only.

## Required inputs
The page URL.

## Prerequisites
The tools named above are implemented and read-only.

## Procedure
1. Run `schema-validator` on the URL.
2. Run `aeo_analyze` to compare FAQ markup with visible text and `geo_analyze` for entity markup.
3. Use `search_knowledge` (ON_PAGE_SEO/09) for the rules; markup must describe visible content and does not guarantee rich results.
4. Propose corrections as text only.

## Approval and permissions
All steps are LOW risk and run without approval. Changing a website is not available; never say you changed anything.

## Verification
Quote the validator output and the evidence strings.

## Failure handling
If a tool fails or is skipped, say so, do not retry an identical failing call, and mark any report preliminary.

## Output format
Findings with evidence, then what was not measured, then next steps in plain language.

## Test cases
- Markup claiming ratings that are not on the page: flagged for removal.

## Sources
knowledge/library/ON_PAGE_SEO/09_SCHEMA_AND_STRUCTURED_DATA.md.
