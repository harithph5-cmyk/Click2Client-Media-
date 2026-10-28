# Indexability

| Field | Value |
|---|---|
| Document ID | BASHA-TECH-008 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S38 (robots meta tag / X-Robots-Tag, updated 2026-03-24), S44 (block indexing, 2025-12-10), S03, S05, S37, S41. Other engines' directive support NOT verified. |

## Facts [FACT]
- `noindex` (meta tag or `X-Robots-Tag`) keeps a page or resource out of Google Search, **but only if crawlers can see it**; if robots.txt blocks the URL the directive is never seen and the page can still appear via links (S44, S38). Google does not support `noindex` in robots.txt (S44).
- Directives (S38): `all` (default), `noindex`, `nofollow`, `none`, `nosnippet`, `max-snippet`, `max-image-preview`, `max-video-preview`, `notranslate`, `noimageindex`, `unavailable_after`, `indexifembedded` (only with `noindex`). `noarchive`, `nocache` and similar historical rules are ignored. When rules conflict, the **more restrictive** applies; for different crawler-specific tags Google combines the negative rules. The header form suits non-HTML files.
- JavaScript: Google may skip rendering when it sees `noindex`, so removing it via JS may not work (S07).
- Indexing is never guaranteed even for eligible pages (S41, S35); canonical choice is separate (S05).

## Detection
For every URL gather, in this order: robots.txt allow/disallow (for Googlebot token), HTTP status, `X-Robots-Tag` headers (all of them), meta robots in raw HTML and rendered DOM, canonical (HTML/header), presence in sitemap, internal links, and (if authorised) URL Inspection data.

## Decision matrix
| State | Meaning | Finding |
|---|---|---|
| 200, no directives, allowed in robots | indexable (not guaranteed to be indexed) | none |
| noindex + allowed | will be excluded after recrawl | `info` if intended; `high` if the page should rank, or if listed in sitemap/internal nav (TECH-INDEX-001) |
| noindex + disallowed in robots.txt | noindex not seen | `high` (TECH-INDEX-002): to deindex, allow crawling and keep noindex until dropped |
| disallowed, no noindex, indexed anyway | can appear without description | `medium`/`high` depending on intent |
| canonical to another URL | consolidation signal | per TECHNICAL_SEO/05 |
| `nosnippet` or `max-snippet:0` | no text snippet | `medium`, confirm intent (TECH-INDEX-003) |
| 404/410/5xx | not indexable as content | per status doc |
| password protected | not crawled | `info` |

## Rules for Basha
1. Never recommend removing `noindex` or editing robots.txt without confirming the owner's intent. Many noindex pages are deliberate (thank-you pages, internal search, staging).
2. Never claim a page "is indexed" or "will be indexed" without Search Console/URL Inspection evidence; say "indexable".
3. Directive changes are HIGH risk, especially in templates or plugin settings; require approval, a backup and a dry run listing every affected URL.
4. After a deliberate change, allow time: indexing changes take days to weeks (S01, S08).

## Verification
Re-fetch raw and rendered pages; confirm the final directive set (headers + meta); check that robots.txt does not block URLs that rely on `noindex`; later confirm with URL Inspection if authorised (quota 600 QPM and 2,000 QPD per site, S14).

## Test cases
TS-INDEX-01 (noindex in sitemap), TS-INDEX-02 (noindex plus robots block), TS-INDEX-03 (X-Robots-Tag header vs meta conflict).

## Security
Do not expose draft/private URLs while debugging; treat robots.txt contents as public.

## Sources
S03, S05, S07, S14, S35, S37, S38, S41, S44.
