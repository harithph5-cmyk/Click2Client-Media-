# Title Tags

| Field | Value |
|---|---|
| Document ID | BASHA-ONPAGE-001 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S08 (Google title links, updated 2025-12-10). |

## Facts [FACT, S08]
- Google may rewrite title links; it builds them from the `<title>` element, the main visual title, headings, `og:title`, anchor text and other sources, and does not manually change titles for individual sites.
- **No official character limit.** "There's no limit on how long a `<title>` element can be." Display is truncated to fit device width.
- Best practice (recommendation): every page has a `<title>`; descriptive and concise; no vague labels; no keyword stuffing; no repeated boilerplate across pages; site name added with a delimiter without awkward repetition; main visible title prominent (first `<h1>`); same language as the content.
- Changes can take days to weeks to appear; recrawl can be requested.
- Titles are not a way to block indexing; use `noindex`.

## Detection
Per URL: title present, count (0, 1, many), text, length in characters and estimated pixel width, duplicates across pages, mismatch with H1/main topic, boilerplate-only titles, unrendered vs rendered difference (S07).

## Decision rules
1. Missing or multiple `<title>`: **high** for important indexable pages.
2. Duplicate titles across pages with different content: **medium**; group by template.
3. Length: **not an error by itself**. Treat 50-60 characters or pixel limits as display-risk heuristics (EXPERT GUIDANCE, not verified here), never as a rule. Never auto-shorten a title solely for length.
4. Do not rewrite a title that already matches the page's topic and intent only to insert a keyword.
5. Keep brand and product names exact; do not invent claims (prices, ratings, "best").

## Execution
`update_wordpress_metadata` (PROPOSED), MEDIUM risk, per approved page. Store previous title. Dry run shows before/after.

## Verification
Fetch live page: `<title>` equals approved text exactly; one title element; page still 200. Note that Google may display a different title (S08); do not call the change failed if the SERP differs, report that Google chose a different title.

## Explaining to a business owner
"Your page title is what people see in the browser tab and often in Google. Yours is the same on 14 pages, so Google can't tell them apart. I've drafted distinct titles for the 14 pages; nothing changes until you approve."

## Test case TS-TITLE-01
Input: 3 pages sharing "Home | Acme". Expect finding "duplicate titles", severity medium, three proposed titles with evidence from each page's H1, no auto-apply in ASSISTED mode.

## Limitations
Pixel width estimation depends on font assumptions; mark as estimate.

## Sources
S08, S07.
