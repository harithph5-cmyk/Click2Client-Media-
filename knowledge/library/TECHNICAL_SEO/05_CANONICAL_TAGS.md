# Canonical Tags and Duplicate URLs

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-005 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S05 (Google "consolidate duplicate URLs", updated 2026-07-10), S06, S07. |

## Facts
- **[FACT, S05]** Methods, strongest to weakest: permanent redirects and `rel="canonical"` (both described as "a strong signal"), then sitemap inclusion (weaker). Methods can be combined; none is required. If you specify none, Google chooses a canonical itself.
- **[FACT, S05]** `rel=canonical` may be in HTML `<head>` or an HTTP header (header suits PDFs). Use absolute URLs; add a self-referencing canonical on the canonical page. Do not use robots.txt or `noindex` for canonicalisation.
- The page describes signals of varying strength, not a hard directive. Treat canonical as **a strong signal that Google may override** based on content similarity. [FACT-based framing]
- **[FACT, S07]** For JavaScript sites, set canonical in HTML when possible; if set by JavaScript it must match the original HTML and only one canonical tag should exist.

## Detection
For each crawled URL record: declared canonical (HTML, header), whether it is absolute, self-referential, status of the canonical target, whether target is indexable, and whether the declared canonical equals the final URL after redirects. Flag: canonical pointing to 404/redirect/noindex; multiple canonicals; canonical to a different topic; canonical loops; HTML vs rendered mismatch.

## Decision rules
1. Canonical to a non-200 or noindex target: **high** (signals conflict).
2. Parameter and tracking variants with canonical to the clean URL: expected, not an error.
3. Never change canonicals site-wide automatically. Changing them is HIGH risk (AGENT_OPERATING_RULES/03, indexing effect).
4. When Google has chosen a different canonical than declared (visible in URL Inspection), investigate duplication and signal conflicts rather than "forcing" it.

## Execution
Per-page canonical changes: MEDIUM when scoped to named pages in a CMS field; template changes: HIGH. Always store previous value for rollback.

## Verification
Re-fetch raw and rendered HTML; confirm exactly one canonical equal to the intended URL; later check Google's selected canonical in URL Inspection (needs authorisation; the URL Inspection API quota is 600 QPM and 2,000 QPD per site per S14).

## Test case TS-CANON-01 (illustrative)
`/shoes?color=red` declares canonical `/shoes?color=red` while `/shoes` is the intended listing. Expect finding "variant self-canonicalises"; severity medium; recommendation with diff; no auto-apply.

## Limitations
Google's selected canonical is only observable through Search Console tools.

## Sources
S05, S06, S07, S14.
