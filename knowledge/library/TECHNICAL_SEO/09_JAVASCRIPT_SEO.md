# JavaScript SEO

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-009 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S07 (updated 2026-03-04). Applies to Google; other engines not verified. |

## Facts [FACT, S07]
- Google processes JS apps in three phases: **crawl** (robots.txt check, parse links, queue; pages with HTTP 200 go to render queue), **render** (headless Chromium when resources allow; non-200 pages might skip rendering), **index** (rendered HTML).
- Titles and descriptions can be set with JavaScript; keep them unique and descriptive.
- Canonical: set in HTML when possible; JS-set canonical must match and be unique.
- Single-page apps: return meaningful status codes (redirect errors to a server-side 404 URL, or add `noindex` via JS).
- Use real `<a href>` links with the History API. Fragment URLs (`#/page`) are hard for Googlebot to resolve.
- Google may skip rendering when it sees `noindex`, so removing `noindex` with JavaScript may not work; do not put `noindex` on pages you want indexed.
- Use content fingerprinting in filenames (Googlebot caching may ignore cache headers).
- Server-side rendering is still recommended.

## Detection
Fetch raw HTML and rendered DOM (headless browser tool) and diff: title, meta robots, canonical, H1, main text, links, structured data, status code. Flag content present only after rendering, links without `href`, hash routing, soft-404 patterns (200 with "not found" message), JS-injected `noindex`.

## Decision rules
1. Critical content or canonical/robots directives that exist only after JS: recommend moving them into server HTML (medium to high depending on the page's importance).
2. If raw and rendered titles differ: report; not an error if both are good.
3. Do not recommend SSR migrations as a quick fix: it is a project; estimate scope and escalate to a human.

## Execution and verification
Basha has no JS rendering tool yet (`render_page` PROPOSED). Verify changes by fetching raw HTML after deployment and confirming directives appear without rendering; then use URL Inspection (tenant authorisation) for Google's rendered view.

## Real example from this project (VERIFIED internal)
The Baasha AI web app is a single-page app at `/baasha-ai`; its routes use `#/` fragments. That is fine for an app behind a product page, but not for content that should rank separately (S07 on fragments).

## Limitations
No rendering budget numbers or timeouts were verified.

## Sources
S07.
