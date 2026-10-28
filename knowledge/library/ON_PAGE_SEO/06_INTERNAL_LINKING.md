# Internal Linking

| Field | Value |
|---|---|
| Document ID | BASHA-ONPAGE-006 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S36 (crawlable links, 2025-12-10), S45 (qualify outbound links, 2025-12-10), S07, S41. Link-equity or "PageRank sculpting" claims: no source read: not used. |

## Facts [FACT]
- Google generally follows only `<a>` elements with an `href`; `<span>` pseudo-links, `routerLink`, `javascript:` hrefs are not recommended; extra attributes like `onclick` are fine if a real `href` exists (S36).
- **Anchor text** should be descriptive, reasonably concise, and relevant to the current and linked page; "click here"/"read more" give little context; test a link by reading its text alone; for image links Google uses the image `alt`; avoid keyword stuffing and back-to-back links (S36).
- Every page you care about should be linked from at least one other page, ideally in context. **There is no ideal number of links per page** (S36).
- JavaScript-inserted anchor text must appear in rendered HTML (S36, S07).
- Google discovers new URLs by following links (S41).
- Outbound link `rel`: `sponsored` (paid), `ugc` (user-generated), `nofollow` (when others do not apply); values can be combined; linked pages may still be crawled via other routes (S45). For links within your own site, S45 recommends a robots.txt disallow rather than nofollow if you want to stop crawling.

## Detection (`analyse_internal_links`, PROPOSED)
From crawl data: build a directed graph; compute inbound internal link count per URL; depth from home (clicks); orphans (important pages with zero inbound links, or found only via sitemap); links without `href`; generic anchors share; links to redirecting or error URLs; anchor-text diversity for a target; nofollow on internal links; navigation and footer vs in-content links; pages with excessive links relative to site norm (report the distribution, no fixed limit).

## Decision rules
1. **Orphan important pages** (known value from analytics/Search Console or owner list): `medium`; recommend contextual links from topically related pages. Do not link-stuff.
2. **Non-crawlable navigation** (JS-only, no `href`): `high` (S36).
3. **Generic anchors** ("click here") on important internal links: `low`; propose descriptive anchors using the destination's real topic.
4. **Links to redirecting URLs:** update to final URL (optimisation).
5. **Depth:** do not set a "3-click rule". No verified source gives one; report depth as information and flag only unimportant-vs-important mismatches.
6. Suggestions need a human reason: each added link must help users, not only crawlers. Do not suggest adding dozens of links to a page.
7. Never put hidden links (S02 hidden text and link abuse).

## Execution
Link additions/edits in body content: MEDIUM (named pages). Navigation/template changes: HIGH. Provide exact source page, anchor text and target, with surrounding sentence context, as a diff.

## Verification
Re-crawl: the target now has the inbound link; link is an `<a href>` in raw HTML; anchor text equals the approved text; no new broken links.

## Explaining to a business owner
"Your 'Services > Boiler repair' page isn't linked from anywhere, so visitors and Google have no easy path to it. I've drafted 3 natural links from related pages; each is one sentence you can approve."

## Test cases
TS-ILINK-01 orphan page, TS-ILINK-02 JS-only navigation, TS-ILINK-03 generic anchors.

## Limitations
Sitewide link-graph metrics (centrality etc.) are proposed analytics, not verified Google signals; present them as diagnostics only.

## Sources
S02, S07, S36, S41, S45.
