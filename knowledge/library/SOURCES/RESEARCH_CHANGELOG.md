# Research Changelog

## 0.1.0 (2026-10-28), batch 1
- Created 40 Markdown files (including the index, the five SOURCES files and QUALITY_REPORT) grounded in 35 sources read on 2026-10-28 (see SOURCE_REGISTER).
- Added operating rules (modes, permission matrix, risk classes, approval, verification, error reporting, output formats), master system instructions and tool registry.
- Findings worth knowing: Google states **no length limit** for titles or meta descriptions (S08, S09); sitemap size limits were **not** on the fetched page, so they are unrecorded; the Google robots.txt intro page does not state file location, which comes from RFC 9309 (S27); Instagram and YouTube pages contain internally inconsistent limit/quota statements (S26, S25); Pinterest docs URL returned 404.
- Not done in this batch: the files listed in 00_MASTER_INDEX under "Planned".

## 0.2.0 (2026-10-28), batch 2: crawling, links, headings, images, audit framework
- Read 12 more sources (S36-S47) and wrote 10 files: TECHNICAL_SEO/01, 02, 06, 08, 17; ON_PAGE_SEO/03, 06, 07; SEO_FUNDAMENTALS/02; TESTING_AND_EVALUATION/02 (33 specified test cases).
- New verified facts: Googlebot generally follows up to about 10 redirect hops; 301/308 are strong and 302/303/307 weak signals; Google treats all 4xx (404 and 410 included) alike except 429, and says not to use 401/403 to limit crawling (S37). `noindex` is only seen if crawlers can fetch the page; `noindex` in robots.txt is unsupported (S44). Crawl budget is relevant only to very large or fast-changing sites and `noindex` does not save it (S40). CSS background images are not indexed; alt text is the most important image metadata (S39). Google lists heading order as a non-focus (S01); W3C heading advice is accessibility-based and dated 2017 (S43).
- Corrections made: test IDs de-conflicted (TS-ROBOTS-01/03, TS-CANON-01/02); redirects file now cites S37 for the 10-hop behaviour; limitation L4 updated.
- Still unread: the sources listed under "Required sources NOT yet read" in SOURCE_REGISTER (unchanged except none newly read).

## Update procedure
1. Re-open each source in the register on its "check by" date.
2. If the page date changed, re-read and diff against the document's facts.
3. Update document version, `Last reviewed`, and add an entry here.
4. Re-run retrieval and test-case checks affected by the change.
