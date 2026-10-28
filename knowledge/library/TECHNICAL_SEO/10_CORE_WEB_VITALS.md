# Core Web Vitals and Page Speed Data

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-010 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S11 (Google CWV, updated 2025-12-10) and S17 (PageSpeed Insights API v5, updated 2025-08-28). Thresholds can change: store in config. web.dev/Chrome docs not yet read. |

## Facts
- **[FACT, S11]** Metrics: **LCP** (loading; threshold 2.5 s), **INP** (responsiveness; target under 200 ms), **CLS** (visual stability; below 0.1). Google "highly recommend[s]" good CWV and says they align with what core ranking systems seek to reward; the page gives **no weight** for ranking.
- **[FACT, S17]** PSI API v5 endpoint `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` with `url` and optional `key` (recommended for frequent/automated use). Returns **lab** data (Lighthouse in `lighthouseResult`) and **field** data (`loadingExperience`, `originLoadingExperience`). Google plans to stop including field data in this API and recommends the CrUX API / CrUX History API.
- [UNVERIFIED] `strategy` and `category` parameter details were not on the fetched page.

## Detection
Run lab test per key template (home, category, product, article) on mobile and desktop settings; pull field data (CrUX) where available; compare to thresholds; identify the largest contributing resources (LCP element, long tasks, layout shifts).

## Decision rules
1. Field data beats lab data for "is there a user problem"; lab data is for diagnosis. Never present a single lab run as the site's score.
2. Lab results vary run to run: take multiple runs and report a range.
3. Do not promise ranking gains from speed improvements. Say what users gain and that Google recommends good CWV.
4. Pages without enough field data (low traffic) may have none: report "no field data", not "pass".

## Execution
Performance changes (image formats, caching, script loading) are MEDIUM to HIGH and mostly in themes/hosting; Basha proposes and a human or approved connector applies.

## Verification
Re-test lab after deployment; re-check field data after enough traffic (CrUX is aggregated over time, so it lags: [UNVERIFIED window]).

## Test case TS-CWV-01 (illustrative)
PSI returns lab LCP 4.1 s and no field data. Expect finding "lab LCP above 2.5 s threshold; no field data available", severity from page importance, no claim of ranking loss.

## Sources
S11, S17.
