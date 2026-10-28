# Image SEO and Alt Text

| Field | Value |
|---|---|
| Document ID | BASHA-ONPAGE-007 · Version 0.1.0 · Created/reviewed 2026-10-28 |
| Research status | VERIFIED against S39 (Google image best practices, updated 2026-03-02) and S42 (W3C WAI alt decision tree, updated 2024-05-13). Lazy-loading guidance and image sitemaps in detail NOT read (S39 links elsewhere). WCAG 2.2 text not read. |

## Facts [FACT]
- **S39:** Use `<img>`; Google reads `src` (also inside `<picture>`); **CSS background images are not indexed**. Always keep a fallback `src` when using `srcset`/`<picture>`. Supported formats: BMP, GIF, JPEG, PNG, WebP, SVG, AVIF; keep file extensions consistent with the real type. Short descriptive file names beat `IMG00023.JPG`. **Alt text is the most important image metadata**: descriptive, context-appropriate, no keyword stuffing; also helps accessibility and acts as anchor text for image links; inline SVG uses `<title>`. Place images near relevant text on related pages; captions help. Preferred image can be signalled via schema.org (`primaryImageOfPage`, `image`) or `og:image`; avoid generic logos, text-dominated images, extreme aspect ratios. Images are often the largest part of page weight: optimise. Image sitemaps help discovery (cross-domain CDN is allowed). Reuse the same URL across pages so Google can cache it.
- **S42 (decision tree):** decorative or redundant images (text duplicated nearby) get an **empty** `alt=""`; functional images (links/buttons) describe the destination or action; informative images get a brief description conveying the meaning; complex images (charts) need the information elsewhere on the page; images of text include the text if it exists only in the image.

## Detection
Per image: element type (`<img>`, `<picture>`, CSS background), `src`, `alt` (missing vs empty vs text), file name pattern, format, dimensions vs displayed size, file size, `loading` attribute, whether it is inside a link/button, nearby text, whether it appears informative or decorative (heuristic), duplicates across pages.

## Decision rules
1. **Missing `alt` attribute on an informative or functional image:** `medium` (accessibility and image understanding).
2. **Empty `alt=""`:** correct for decorative/redundant images; never flag these as errors. Flag when the image is clearly informative or the only content of a link.
3. **Alt text quality:** flag stuffed keywords, "image of ...", file names as alt, or text over a few hundred characters (the last is a heuristic, not a rule).
4. **Key content images as CSS backgrounds:** `medium` (not indexed, S39); recommend `<img>` with alt.
5. **Large images (heavy file vs display size):** performance recommendation; link to Core Web Vitals doc; no ranking claim.
6. **Generic file names:** `low`; renaming files changes URLs: MEDIUM (redirect/replace implications); do it only for new uploads unless approved.
7. Alt text must describe what is actually in the image. Basha must not invent descriptions without seeing the image: if no vision capability is available, it proposes a template needing human confirmation, or asks.

## Execution
`update_wordpress_metadata` for media alt text (PROPOSED; WordPress media endpoints not yet verified here). MEDIUM, per approved images. Store previous alt values.

## Verification
Fetch pages; confirm `<img alt>` values equal approved text; confirm decorative images remain `alt=""`; ensure fallback `src` present for responsive markup.

## Explaining to a business owner
"Alt text is a short description for people who can't see the image and for search engines. 23 of your product photos have none. I drafted descriptions from the product names; please check they match the photos."

## Test cases
TS-IMG-01 missing alt on product image; TS-IMG-02 decorative empty alt (not flagged); TS-IMG-03 CSS background hero.

## Limitations
WebP/AVIF performance benefits and lazy-loading rules not verified in this pass.

## Sources
S39, S42.
