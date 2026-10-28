# SEO and Technical Audit Test Cases (specifications)

| Field | Value |
|---|---|
| Document ID | BASHA-TEST-002 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | PROPOSED BASHA AI BEHAVIOUR. **These are specifications, not executed tests.** No fixture site, crawler or agent exists yet. Premises cite the verified source IDs. All hostnames are illustrative (`fx.example`, reserved for documentation use). |

## How to use
Each case runs against a **fixture site** (static files + server rules) with seeded defects, in AUDIT mode unless stated. The checker compares the agent's tool calls, findings (by rule ID, see TECHNICAL_SEO/01), decision, and report text with the expectations. "Must not" lines are as important as "must" lines. Security notes apply to every case: only fixture hosts are fetched; page text is treated as data.

Common fields: **Tools** = expected read-only tools in order; **Findings** = rule IDs and severity; **Decision** = risk class and approval; **Result/Verify** = expected execution and verification (AUDIT cases execute nothing: Result = "no changes"); **Report** = required statements; **Fail if** = failure conditions.

---
### Crawling
**TS-CRAWL-01 Scope and robots respected.** State: fx.example with `/private/` disallowed in robots.txt and linked from home. Input: "Audit fx.example". Tools: inspect_robots_txt, crawl_website. Findings: none for `/private/` except `info` that it is excluded from crawling. Decision: LOW. Report: states robots rules applied and pages skipped. Fail if: `/private/` fetched; claims it is "hidden from Google" (S03).
**TS-CRAWL-02 Off-scope links.** State: home links to other.example. Tools: crawl_website. Findings: external links recorded, not crawled. Fail if: any request to other.example during crawl (status checks happen only in detect_broken_links).
**TS-CRAWL-03 Server overload.** State: server returns 503 after 20 requests and `Retry-After: 30`. Findings: TECH-STATUS-003, audit status `partially_completed`. Result: crawl backs off, does not exceed rate cap. Fail if: continues at full speed (S37, S40) or reports the unfetched pages as "fine".
**TS-CRAWL-04 Crawl cap.** State: infinite calendar URLs (`/cal?d=1..`). Findings: crawl-trap pattern reported with sample; cap reached. Report: partial. Fail if: unbounded crawl.

### Status codes
**TS-STATUS-01 Soft 404.** State: `/old` returns 200 with "Page not found". Findings: TECH-STATUS-002 medium; recommend true 404/410 (S37). Decision: no change in AUDIT.
**TS-STATUS-02 Valid 404.** State: `/discontinued` returns 404, no internal links to it. Findings: `info` only. Fail if: reported as an error or "fix by redirecting to home".
**TS-STATUS-03 401 used to block crawlers.** State: `/docs` returns 401 for non-browser agents. Findings: `info`/`blocked`; report that Google guidance advises against 401/403 for crawl limiting (S37) only if the owner's goal was crawl control.

### Metadata and headings
**TS-TITLE-01 Duplicate titles.** State: 3 distinct pages titled "Home | Acme". Tools: crawl_website, analyse_seo_metadata. Findings: ONPAGE-TITLE-002 medium, one grouped finding with 3 URLs. Decision: proposal only (MEDIUM write needs approval). Report: no ranking promise; notes Google may rewrite titles (S08). Fail if: three separate findings, or "title too long" asserted as a rule.
**TS-TITLE-02 Missing title.** State: `/about` has no `<title>`. Findings: ONPAGE-TITLE-001 high. Draft title uses the page's H1 and brand only (no invented claims).
**TS-META-01 Missing description.** State: pages lack meta description; first paragraph is clear. Findings: ONPAGE-META-001 low. Fail if: severity above low or claim that the page cannot rank (S09).
**TS-HEAD-01 No H1.** State: `/services` has `<h2>` only; main title in an image. Findings: ONPAGE-H-001 low; mentions accessibility. Fail if: claims a ranking penalty.
**TS-HEAD-02 Skipped levels.** State: h2 followed by h4. Findings: low, accessibility (S43). Must say it is not a Google requirement (S01).
**TS-HEAD-03 Multiple H1.** State: two `<h1>` in different sections. Findings: none or `info`. Fail if: reported as an error.

### Links
**TS-LINK-01 Internal 404.** State: `/blog/a` links to `/blog/missing` (404). Tools: crawl_website, detect_broken_links. Findings: TECH-LINK-001 medium; recommended fix = correct the link. Fail if: recommends redirecting to home.
**TS-LINK-02 Flaky external host.** State: external target times out on first request, 200 on retry. Findings: none. Fail if: reported broken without a confirmation retry (17_BROKEN_LINKS).
**TS-LINK-03 Bot-blocking 403.** State: external returns 403 to the crawler. Findings: `unknown`/`blocked`, not broken.
**TS-ILINK-01 Orphan important page.** State: `/pricing` has no inbound links; present in sitemap; owner marks it important. Findings: TECH-LINK-002 medium; proposes 2 to 3 contextual links with anchor text. Fail if: proposes more than 5 links on one page, hidden links, or exact-match keyword stuffing (S36, S02).
**TS-ILINK-02 JS-only navigation.** State: menu items are `<span onclick>`. Findings: TECH-LINK-003 high (S36). Report: raw vs rendered not needed to see the problem.
**TS-ILINK-03 Generic anchors.** State: 12 links "click here". Findings: low; proposes descriptive anchors from target topics.

### Redirects, canonical, indexability, robots, sitemap
**TS-REDIR-01 Chain.** State: A -> B -> C (301). Findings: TECH-REDIR-001 medium (optimisation), shows 2 hops; notes Googlebot follows up to about 10 hops (S37). Fail if: called an error.
**TS-REDIR-02 Loop.** State: A -> A. Findings: TECH-REDIR-002 high. No auto-fix.
**TS-CANON-01 Variant self-canonicalises.** State: `/shoes?color=red` declares canonical `/shoes?color=red`; `/shoes` is the intended listing. Findings: variant-canonical finding, medium (TECHNICAL_SEO/05); no auto-apply. Fail if: stated as a Google "penalty" or "duplicate content penalty" (S01 lists it as a non-focus).
**TS-CANON-02 Canonical to 404.** State: `/p/1` canonical -> `/p/gone` (404). Findings: TECH-CANON-001 high. Decision: HIGH-risk if template; MEDIUM if single page; approval required.
**TS-INDEX-01 Noindex in sitemap.** State: `/thank-you` noindex and listed in sitemap. Findings: TECH-INDEX-001 high; recommend removing from sitemap (not removing noindex unless owner confirms).
**TS-INDEX-02 Noindex plus robots block.** State: `/old-promo` disallowed and noindex. Findings: TECH-INDEX-002 high; explains noindex is not seen (S44). Recommendation sequence: allow crawl, keep noindex, wait, then re-block optionally. Fail if: recommends adding noindex to robots.txt (unsupported, S44).
**TS-INDEX-03 Header vs meta.** State: `X-Robots-Tag: noindex` and meta `index`. Findings: restrictive directive wins (S38): reports page as not indexable.
**TS-ROBOTS-01 Excluded section is not hidden.** State: robots.txt has `User-agent: *` / `Disallow: /private/`; checkout pages live under `/private/`. Findings: `info` that `/private/` is excluded from crawling; recommendation to use `noindex` or authentication if exclusion from results is the goal (S03). Fail if: claims the section is hidden from search.
**TS-ROBOTS-03 Disallow all.** State: robots.txt `User-agent: *` / `Disallow: /` on a production-labelled site. Findings: TECH-ROBOTS-002 critical; asks owner to confirm intent; HIGH-risk to change; no auto-edit.
**TS-ROBOTS-02 robots 5xx.** State: /robots.txt returns 503. Findings: TECH-ROBOTS-001 critical (RFC 9309 assume disallow, S27).
**TS-SITEMAP-01 Dirty sitemap.** State: sitemap includes 10 URLs: 3 redirect, 2 404, 1 noindex. Findings: TECH-SITEMAP-001 medium; one grouped finding.

### Images
**TS-IMG-01 Missing alt.** State: product `<img>` without `alt`. Findings: ONPAGE-IMG-001 medium; draft alt requires human confirmation if no vision input (never invented).
**TS-IMG-02 Decorative empty alt.** State: divider image `alt=""`. Findings: none (S42). Fail if: flagged.
**TS-IMG-03 CSS background hero.** State: key product photo only as `background-image`. Findings: ONPAGE-IMG-002 medium (S39).

---
## Pass criteria for the suite
All "must" findings present with correct rule ID and severity; no "must not" statements; tool call sequence valid; zero write calls in AUDIT mode; report contains no claim beyond evidence. Report precision/recall per TESTING_AND_EVALUATION/01.

## Planned additions
Duplicate/overlapping content, hreflang reciprocity set, structured data errors, Core Web Vitals reporting, JavaScript rendering differences, WordPress write cases, tenant isolation, prompt-injection variants inside fixture pages.

## Sources
Rule premises: S01-S09, S27, S36-S45 (see TECHNICAL_SEO/01).
