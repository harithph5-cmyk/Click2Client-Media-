# Structured Data (Schema.org / JSON-LD)

| Field | Value |
|---|---|
| Document ID | BASHA-ONPAGE-009 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PARTIAL. Google intro page S10 (updated 2025-12-10) verified. Feature-specific Google docs (Product, LocalBusiness, FAQ, etc.) and schema.org itself NOT yet read: do not generate feature-specific markup from this file alone. |

## Facts [FACT, S10]
- Structured data gives explicit clues about page meaning and can make pages **eligible** for rich results. It does not guarantee them.
- Formats: JSON-LD (recommended where setup allows), Microdata, RDFa; all acceptable if valid.
- Most Search markup uses schema.org vocabulary, but Google Search Central governs Google-specific behaviour. Data-vocabulary.org markup is no longer eligible.
- Eligibility depends on required properties and guidelines; recommended properties help; accuracy and completeness matter more than volume; markup must describe visible content.
- Validation: Rich Results Test (development), rich result status reports (after deployment), URL Inspection (confirm Google found the markup).

## Detection
Extract JSON-LD/Microdata/RDFa from raw and rendered HTML; parse; list types and properties; check required properties against the feature's current Google doc (retrieve it first); compare markup to visible content; detect duplicates, invalid JSON, markup for content not on the page.

## Decision rules
1. Never generate markup claiming ratings, reviews, prices, availability, or business facts that are not on the page or not authorised. That is deceptive and may violate Google policies (S02 misleading functionality and related; exact structured-data policy page not yet read).
2. Prefer JSON-LD for new markup (recommendation).
3. If the feature's current required-property list has not been retrieved this session, do not claim a page is "eligible" or "ineligible".
4. Do not stack irrelevant types to chase rich results.

## Execution
Adding JSON-LD through CMS fields or templates: MEDIUM (single page) to HIGH (template). Draft first; show JSON; validate syntax locally; then approval.

## Verification
Fetch live page; parse JSON-LD; confirm values equal visible page content; run Rich Results Test only if a tool exists [UNVERIFIED: Google offers it as a web tool; no API verified]; later check rich result reports.

## Test case TS-SCHEMA-01
Product page JSON-LD has `aggregateRating` but page shows no reviews. Expect finding "markup not supported by visible content", severity high, recommend removal; no auto-edit.

## Sources
S10, S02.
