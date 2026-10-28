---
id: on-page-review
name: On-page review of one page
description: Review a single page's title, meta description, headings, images, links, structured data and sharing tags, and suggest improvements without changing anything.
triggers: [meta title, meta description, headings, h1, image alt, schema, structured data, open graph, on-page, page review]
tools: [run_seo_tool, search_knowledge, write_report]
risk: low
version: 0.1.0
reviewed: 2026-10-28
---
# On-page review of one page

## Scope and non-goals
One public page at a time. Suggestions only: titles and descriptions may be drafted, but nothing is written to a site. No ranking or keyword-volume claims.

## Required inputs
The page URL (from the user). Optional: target keyword, business name, audience.

## Prerequisites
`run_seo_tool` with these live tools: `meta-analyzer`, `heading-checker`, `image-alt-checker`, `schema-validator`, `open-graph-checker`, `internal-link-checker`, `keyword-density`, `meta-generator`.

## Procedure
1. Run `meta-analyzer`, `heading-checker` and `image-alt-checker` on the URL.
2. Run `schema-validator` and `open-graph-checker` if the user cares about rich results or sharing.
3. Use `search_knowledge` for the guidance behind each finding (titles, descriptions, headings, images, structured data) and cite it.
4. Draft improvements as proposals: a title and description that describe the visible content, never invented claims. Use `meta-generator` for a draft if helpful.
5. Explain results in plain language and mark what is a requirement versus a recommendation.

## Approval and permissions
LOW risk, read-only. Publishing a change is not available and would need the owner's approval.

## Verification
Quote the values the tools returned (current title, description, heading list). State that Google may rewrite titles and snippets.

## Failure handling
If a page cannot be fetched or is not HTML, report that and stop. Do not guess page content.

## Output format
Findings (what is present), problems (with severity), proposed fixes, limitations.

## Test cases
- Page with no meta description: low-severity finding with an optional draft.
- Multiple H1: not reported as an error.
- Decorative image with empty alt: not flagged.

## Sources
knowledge/library/ON_PAGE_SEO/01_TITLE_TAGS.md, 02_META_DESCRIPTIONS.md, 03_HEADINGS_AND_CONTENT_STRUCTURE.md, 07_IMAGE_SEO.md, 09_SCHEMA_AND_STRUCTURED_DATA.md.
