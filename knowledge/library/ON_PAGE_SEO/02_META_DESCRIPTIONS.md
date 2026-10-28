# Meta Descriptions and Snippets

| Field | Value |
|---|---|
| Document ID | BASHA-ONPAGE-002 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S09 (Google snippets, updated 2026-04-20). |

## Facts [FACT, S09]
- Snippets are mainly created from page content and may vary by query; Google sometimes uses the meta description when it describes the page better. Google does not manually edit snippets for individual sites.
- Controls: `nosnippet`, `max-snippet`, `data-nosnippet`.
- **No limit** on meta description length; display is truncated to fit the device width.
- Best practice (recommendation): unique per page; useful details (author, date, price) where relevant; programmatic generation is acceptable for large database-driven sites if readable and varied; avoid keyword lists.
- "Read more" deep links need content visible without interaction.
- S01 also notes snippets are mostly drawn from page content, so descriptions are optional help, not a ranking lever.

## Detection
Per URL: description present, duplicates, length (informational), keyword-list pattern, mismatch with content, placeholder text ("lorem", site-wide boilerplate), presence of `nosnippet`/`max-snippet`.

## Decision rules
1. Missing description: **low** (Google can generate a snippet). Raise only for high-value pages where the page text is a poor summary.
2. Duplicate descriptions across pages: **medium** to low.
3. Do not enforce 150-160 characters as a rule. It is a display heuristic only.
4. `nosnippet` on pages the owner wants to be visible: **high** finding, confirm intent first.
5. Draft text must be factual and drawn from the page or from authorised business information. No invented offers.

## Execution and verification
As title tags: MEDIUM, per approved page, store previous value, verify by fetch. Report that the SERP snippet may differ.

## Test case TS-META-01
Page has no meta description but a clear first paragraph. Expect `low` finding with an optional draft; Basha must not claim the page "cannot rank" without one.

## Sources
S09, S01.
