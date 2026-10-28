# Headings and Content Structure

| Field | Value |
|---|---|
| Document ID | BASHA-ONPAGE-003 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S01 (Google starter guide, 2025-12-10), S43 (W3C WAI headings tutorial, last updated 2017-05-04: **old**), S08 (title links). Google's own heading documentation was not found in this pass. |

## Facts
- **[FACT, S01, as summarised]** Google lists "heading order" among things it believes site owners should not focus on. Re-read the exact wording before quoting.
- **[FACT, S43]** Headings show how content is organised and are used by browsers and assistive technology for navigation. They nest from `<h1>` to `<h6>`; avoid skipping ranks where possible (an h2 followed directly by an h4); skipping when closing subsections is acceptable. The page does not state a one-H1 rule.
- **[FACT, S08]** Google may use headings (and the main visible title, often the first `<h1>`) as inputs when building a title link; a prominent main title helps.
- Do **not** state that every page must have exactly one H1 or an identical structure. No verified source says so.

## Purpose of the checks
Headings are mainly about **user comprehension and accessibility**. They are a minor, indirect input for search. Basha presents findings accordingly.

## Detection
Extract the heading outline from raw and rendered HTML: levels, text, order, empty headings, headings used only for styling (e.g. `<h3>` for a button), headings hidden from users, headings that repeat the title verbatim for every page of a template, missing main heading, text-in-image headings.

## Decision rules
1. **No H1 or an empty/hidden H1** on a content page: `low` (S08 notes the prominent main title is useful); raise to `medium` for key landing pages if the visible title is unclear.
2. **Multiple H1s:** not an error on its own (no verified source prohibits it); mention only if the visible structure is confusing.
3. **Level skips:** `low`, accessibility recommendation (S43).
4. **Headings that do not reflect the content** (generic "Welcome", "Section 1"): `low` content-clarity suggestion.
5. **Keyword-stuffed headings:** flag as quality risk (S01 lists keyword stuffing as against spam policy; S02).
6. Never rewrite headings to a fixed pattern or keyword formula. Improve clarity and match the user's intent and the page's real content.

## Execution
`update_wordpress_metadata` or content update tools (PROPOSED). Heading edits change visible content: MEDIUM for named pages; template changes HIGH. Draft first; keep exact brand/product wording.

## Verification
Re-extract the outline; confirm the intended hierarchy; confirm no content other than the targeted headings changed (diff).

## Explaining to a business owner
"Headings are the page's table of contents. Yours has no clear main heading, so visitors and screen readers can't tell what the page is about. I suggest a short, honest main heading; it's a small readability fix, not a ranking trick."

## Test cases
TS-HEAD-01 (no H1), TS-HEAD-02 (skipped levels), TS-HEAD-03 (multiple H1 treated as non-error) in TESTING_AND_EVALUATION/02.

## Limitations
Source for heading hierarchy is accessibility guidance dated 2017; confirm against current WCAG (not read).

## Sources
S01, S02, S08, S43.
