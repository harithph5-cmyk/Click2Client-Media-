# International SEO (hreflang)

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-013 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S28 (Google localized versions, updated 2026-09-21). Geo-targeting and ccTLD guidance not yet read. |

## Facts [FACT, S28]
- Three equivalent methods: HTML `<link rel="alternate" hreflang>` in `<head>`, HTTP `Link` headers (non-HTML files), XML sitemap `xhtml:link`. Using all three gives no added benefit.
- **Reciprocal links required:** each version must reference itself and all others. If X points to Y but Y does not point back, Google ignores the annotations. Alternate URLs must be fully qualified.
- `x-default` marks a fallback (e.g. language selector).
- Codes: ISO 639-1 language, optional ISO 3166-1 Alpha 2 region (`en-GB`); region alone is invalid; `es-419` unsupported; script codes like `zh-Hant` supported; `EU`, `UN`, `UK` as region have no effect.
- Google does not use hreflang or the HTML `lang` attribute to detect a page's language.

## Detection
Collect hreflang from all three sources per URL; build a graph; test reciprocity, self-reference, code validity, canonical consistency (an hreflang URL should be the canonical of its language version), 200 status of every alternate.

## Decision rules
1. Missing return link: **high** for affected set; recommend fixing the set as a unit.
2. Invalid code (e.g. `en-UK`): medium; correct is `en-GB`.
3. Do not add hreflang to sites with a single language/region: not needed.
4. Bulk template changes: HIGH risk; propose diff and approve.

## Verification
Re-crawl set; confirm all pairs reciprocal; sample in Search Console international targeting reports if authorised [UNVERIFIED: current report availability].

## Test case TS-HREFLANG-01
EN page lists FR alternate; FR page lacks EN return tag. Expect finding "non-reciprocal annotation (ignored by Google per S28)".

## Sources
S28.
