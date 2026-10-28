# Technical Audit Framework

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-001 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Module | Technical SEO · Users: audit tools, runtime agent |
| Research status | Framework is PROPOSED BASHA AI BEHAVIOUR. Every rule cites the verified source that supports its premise (S01-S47 in SOURCE_REGISTER). Rules whose premise is only a recommendation are marked REC. |

## Purpose
One consistent way to turn crawl evidence into findings, so audits are repeatable, evidence-backed and honest about what is an **error** and what is an **optional optimisation**.

## Audit pipeline
1. **Scope and permission:** domain(s), allowed paths, crawl cap, mode (AUDIT is read-only). Verify the tenant controls the domain before a large crawl.
2. **Collect** (TECHNICAL_SEO/02): URL inventory with raw response data: final URL, redirect hops, status, headers, content type, robots directives (meta + `X-Robots-Tag`), canonical, title, headings, links, images, structured data, size, timing.
3. **Normalise:** one record per URL; never judge from a partial fetch; store fetch errors as data.
4. **Run rules** (below) over the records. Each rule produces findings or `not_applicable`.
5. **Deduplicate and group** by template/pattern (e.g. 300 product pages with one cause = one finding with a sample and count).
6. **Prioritise** by severity, then page importance (traffic, links, business value if known).
7. **Recommend** with a proposed fix, side effects and rollback.
8. **Report** in the finding format (AGENT_OPERATING_RULES/07).

## Severity model
- **critical:** blocks crawling/indexing of important pages or site-wide (e.g. `Disallow: /`, noindex on money pages, 5xx on robots.txt, site-wide redirect loop).
- **high:** likely to prevent a specific important URL from being crawled/indexed as intended or sends conflicting signals (canonical to non-200, noindex + sitemap inclusion, non-reciprocal hreflang set).
- **medium:** weakens signals or wastes crawling at scale (redirect chains, duplicate titles on distinct pages, orphan important pages).
- **low:** minor quality issues (missing optional meta description, heading level skip).
- **info:** observations, not problems (valid 404/410 on removed pages; no sitemap on a small well-linked site).
Severity describes technical impact. It is **not a ranking prediction**.

## Error vs optimisation
| Situation | Class |
|---|---|
| Valid 404/410 for a genuinely removed URL | NOT an error (S37: Google treats all 4xx alike; removed pages drop out over time) |
| Redirect chain of 2 to 10 hops that resolves | optimisation (REC: collapse); Googlebot generally follows up to 10 hops (S37) |
| Redirect loop, or redirect to a 4xx/5xx | error |
| Missing meta description | optimisation (Google can generate snippets, S09) |
| Title/description longer than a display heuristic | NOT an error (no official limit, S08, S09) |
| Heading levels skipped, or multiple H1 | accessibility/UX recommendation; Google lists heading order as not a focus (S01); W3C says avoid skipping ranks (S43) |
| Missing sitemap on a small, well-linked site | NOT an error (S04) |
| Noindex page listed in sitemap | error (conflicting signals; S44, S04) |
| Robots.txt blocking a URL that must be indexed | error; blocking also prevents `noindex` from being seen (S44) |

## Rule register (IDs used in findings and tests)
| Rule ID | Check | Premise (source) | Default severity |
|---|---|---|---|
| TECH-ROBOTS-001 | robots.txt unreachable (5xx) | RFC 9309: 5xx = assume complete disallow (S27) | critical |
| TECH-ROBOTS-002 | `Disallow` blocks important URLs or CSS/JS needed for rendering | S03 | high |
| TECH-STATUS-001 | important URL returns 4xx/5xx | S37 | high |
| TECH-STATUS-002 | soft 404 (2xx with error/empty content) | S37 | medium |
| TECH-STATUS-003 | 429/5xx on crawl (server overload signal) | S37, S40 | high |
| TECH-REDIR-001 | chain length > 1 | S06, S37, S40 | medium (REC) |
| TECH-REDIR-002 | loop or redirect to error | S06 | high |
| TECH-REDIR-003 | temporary redirect used for permanent move | S06, S37 (302/303/307 weak signal) | medium |
| TECH-CANON-001 | canonical target not 200/indexable | S05 | high |
| TECH-CANON-002 | multiple or conflicting canonicals (HTML vs header vs JS) | S05, S07 | high |
| TECH-INDEX-001 | noindex on page present in sitemap or internal nav | S44, S04 | high |
| TECH-INDEX-002 | URL blocked in robots.txt but needs noindex | S44, S38 | high |
| TECH-INDEX-003 | `nosnippet`/restrictive snippet directives on pages meant to be visible | S38, S09 | medium (confirm intent) |
| TECH-SITEMAP-001 | sitemap lists non-200, redirecting, noindex or non-canonical URLs | S04, S05 | medium |
| TECH-LINK-001 | internal link to 4xx/5xx | S37 | medium |
| TECH-LINK-002 | important page with zero internal links (orphan) | S36 | medium |
| TECH-LINK-003 | non-crawlable link (no `href`, `javascript:` href, JS-only navigation) | S36, S07 | high for navigation, else medium |
| TECH-JS-001 | critical content/directives only after rendering | S07 | medium-high |
| TECH-HREFLANG-001 | non-reciprocal or invalid hreflang | S28 | high |
| ONPAGE-TITLE-001/002 | missing or duplicate title | S08 | high / medium |
| ONPAGE-META-001 | missing meta description | S09 | low |
| ONPAGE-H-001 | no H1, heading skips | S43, S01 | low |
| ONPAGE-IMG-001 | missing `alt` on informative images | S39, S42 | medium |
| ONPAGE-IMG-002 | informative image only as CSS background | S39 | medium |
| SEC-HTTPS-001 | mixed or non-HTTPS pages | not yet researched | UNVERIFIED |

## Verification
Re-crawl the affected URLs after a fix and compare with the stored "before" record (AGENT_OPERATING_RULES/05).

## Errors
Fetch failures are findings about the crawl, not about the site, until retried within limits. Never report "broken" from a single timeout.

## Security and permissions
Crawl only the tenant's verified scope; use the SSRF-safe fetcher; respect robots.txt and crawl-delay-style limits (S27, S40); never log credentials in URLs.

## Limitations
Rules reflect Google's documentation only. Other engines may differ. Mixed-content/HTTPS rules and Core Web Vitals thresholds are covered elsewhere or not yet researched.

## Sources
S01, S03-S09, S27, S28, S36-S45.
