// The consultant rule library. Deterministic, reviewed explanations for every
// check. The AI layer may add context on top of this, but this library is
// what guarantees every issue has a sound "why / how" even with AI disabled.
//
// Tone rules: no ranking guarantees, no fear-mongering, platform-specific
// steps where we can detect the platform.
//
// type   → implementation type shown in the report
// effort → Quick (< 1 hr) | Moderate (half day) | Significant (multi-day)
// bucket → quick_wins | high_impact | technical | content | long_term

export const KB = {
  status_code: {
    why: 'Search engines only index pages that return a successful (200) response. Error responses tell them the page does not exist or is broken.',
    fix: 'Make sure the page loads normally and returns HTTP 200. If the page moved, use a 301 redirect to its new address.',
    type: 'Server/Hosting', effort: 'Moderate', bucket: 'high_impact',
    impact: 'Required for the page to be indexed at all.',
  },
  noindex: {
    why: 'A "noindex" directive explicitly asks search engines to keep this page out of their results. If it is unintentional, the page cannot rank.',
    fix: 'Remove the noindex directive from the meta robots tag or X-Robots-Tag header — only if the page is meant to appear in search.',
    platform: { WordPress: 'Settings → Reading → untick "Discourage search engines from indexing this site". In Yoast/Rank Math, check the page\'s Advanced tab → "Allow search engines to show this page".' },
    type: 'Configuration', effort: 'Quick', bucket: 'quick_wins',
    impact: 'Removing an accidental noindex allows the page to be indexed again.',
  },
  robots_blocks_site: {
    why: 'robots.txt is telling crawlers not to fetch the site. Blocked pages generally cannot be crawled or properly understood by search engines.',
    fix: 'Remove or narrow the "Disallow: /" rule so it only blocks private areas.',
    platform: { WordPress: 'Settings → Reading → untick "Discourage search engines". If a physical robots.txt file exists, edit it via your SEO plugin\'s file editor or hosting file manager.' },
    type: 'Configuration', effort: 'Quick', bucket: 'quick_wins',
    impact: 'Lets search engines crawl the site again.',
  },
  https: {
    why: 'HTTPS protects visitors and is a lightweight Google ranking signal. Browsers mark HTTP pages as "Not secure", which reduces trust and enquiries.',
    fix: 'Install an SSL certificate (free via Let\'s Encrypt on most hosts) and serve every page over HTTPS.',
    platform: { WordPress: 'Enable SSL in your hosting panel, then update Settings → General site addresses to https://.' },
    type: 'Server/Hosting', effort: 'Moderate', bucket: 'high_impact',
    impact: 'Removes "Not secure" warnings and meets a baseline expectation of search engines.',
  },
  ssl_valid: {
    why: 'An invalid or expiring certificate causes full-page browser warnings that stop most visitors and can stop crawlers.',
    fix: 'Renew the certificate and make sure it covers every hostname you use (with and without www). Enable auto-renewal.',
    type: 'Server/Hosting', effort: 'Quick', bucket: 'quick_wins',
    impact: 'Prevents browser security warnings.',
  },
  http_redirect: {
    why: 'If the http:// version does not permanently redirect to https://, search engines may see two versions of the site and split signals between them.',
    fix: 'Add a site-wide 301 redirect from http:// to https://.',
    platform: { WordPress: 'Most hosts offer a "Force HTTPS" toggle. Otherwise add a 301 rule in .htaccess (Apache/LiteSpeed) or the server block (Nginx).' },
    type: 'Server/Hosting', effort: 'Quick', bucket: 'technical',
    impact: 'Consolidates all signals on the secure version of each URL.',
  },
  host_canonicalization: {
    why: 'When both www and non-www versions load without redirecting, the same content exists at two addresses. This splits link signals and creates duplicate URLs.',
    fix: 'Choose one preferred host and 301-redirect the other to it.',
    type: 'Server/Hosting', effort: 'Quick', bucket: 'technical',
    impact: 'Consolidates duplicate host versions into one.',
  },
  redirect_chain: {
    why: 'Each extra redirect adds delay for visitors and crawlers. Long chains waste crawl time and can dilute signals.',
    fix: 'Point links and redirects straight at the final URL so there is a single hop at most.',
    type: 'Technical', effort: 'Quick', bucket: 'technical',
    impact: 'Slightly faster first load; cleaner crawling.',
  },
  hsts: {
    why: 'HSTS tells browsers to always use HTTPS for your domain, closing a small window where the first request could be made over HTTP.',
    fix: 'Add the header Strict-Transport-Security: max-age=31536000 once HTTPS works on every subdomain.',
    type: 'Server/Hosting', effort: 'Quick', bucket: 'long_term',
    impact: 'Security hardening; no direct ranking effect.',
  },
  mixed_content: {
    why: 'Loading http:// resources on an https:// page triggers browser warnings or blocked content, and can break images and scripts.',
    fix: 'Change each listed resource URL to https:// (or a relative URL).',
    platform: { WordPress: 'Run a search-and-replace of http://yourdomain with https://yourdomain using a plugin such as Better Search Replace (take a backup first).' },
    type: 'Technical', effort: 'Quick', bucket: 'quick_wins',
    impact: 'Restores the secure padlock and prevents blocked resources.',
  },
  title_present: {
    why: 'The title tag is usually the clickable headline in search results and one of the strongest on-page relevance signals.',
    fix: 'Add a unique <title> that names the page\'s main topic or service and the brand.',
    platform: { WordPress: 'Edit the page → SEO plugin box (Yoast/Rank Math) → "SEO title".', Shopify: 'Online Store → Preferences (homepage) or the page\'s "Search engine listing" section.', Wix: 'Page menu → SEO basics → Title tag.' },
    type: 'Content', effort: 'Quick', bucket: 'quick_wins',
    impact: 'Gives search engines a clear headline for the page.',
  },
  title_length: {
    why: 'Google shows roughly 50–60 characters of a title before truncating. Very short titles waste the space; very long ones get cut off or rewritten.',
    fix: 'Aim for about 30–60 characters: primary service or topic first, then location if relevant, then brand.',
    platform: { WordPress: 'Edit the page → SEO plugin → "SEO title" (the plugin shows a length bar).', Shopify: 'Page → "Search engine listing" → Page title.' },
    type: 'Content', effort: 'Quick', bucket: 'quick_wins',
    impact: 'More of the title is shown in results; can improve click-through.',
  },
  title_multiple: {
    why: 'More than one <title> tag means search engines must guess which one to use.',
    fix: 'Keep a single <title>. Duplicates usually come from a theme and an SEO plugin both printing one.',
    type: 'Technical', effort: 'Quick', bucket: 'technical', impact: 'Removes ambiguity.',
  },
  meta_desc_present: {
    why: 'The meta description is often used as the snippet under your title in search results. Without one, search engines pick text from the page that may not sell the click.',
    fix: 'Write a unique 120–160 character description that explains what the page offers and why to choose you.',
    platform: { WordPress: 'Edit the page → SEO plugin → "Meta description".', Shopify: 'Page → "Search engine listing" → Description.', Wix: 'Page menu → SEO basics → Meta description.' },
    type: 'Content', effort: 'Quick', bucket: 'quick_wins',
    impact: 'Better control of your search snippet; may improve click-through. Not a direct ranking factor.',
  },
  meta_desc_length: {
    why: 'Descriptions under ~70 characters leave snippet space unused; over ~160 characters are usually truncated.',
    fix: 'Rewrite to roughly 120–160 characters with a clear benefit and call to action.',
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Cleaner, more persuasive snippets.',
  },
  h1_present: {
    why: 'The H1 is the main visible headline. It helps visitors and search engines confirm what the page is about.',
    fix: 'Add one descriptive H1 near the top of the page that states the page\'s main topic or service.',
    platform: { WordPress: 'In the editor, set the main heading block to "H1" (many themes use the page title as H1 — check the theme settings if it is hidden).', Elementor: 'Select the main Heading widget → HTML Tag → H1.' },
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Clearer page topic for visitors and search engines.',
  },
  h1_single: {
    why: 'Multiple H1s are not an error for Google, but one clear H1 makes the page structure easier to understand and is better for accessibility.',
    fix: 'Keep one H1 for the main topic and change the others to H2/H3.',
    platform: { Elementor: 'Select each extra Heading widget → HTML Tag → H2.' },
    type: 'Content', effort: 'Quick', bucket: 'content', impact: 'Cleaner structure; minor SEO effect.',
  },
  heading_hierarchy: {
    why: 'Skipping heading levels (e.g. H1 straight to H4) makes the outline harder for screen readers and search engines to follow.',
    fix: 'Use headings in order: H1 → H2 → H3. Choose heading levels for structure, not for font size.',
    type: 'Content', effort: 'Quick', bucket: 'content', impact: 'Better accessibility and readability.',
  },
  content_length: {
    why: 'Very little text gives search engines little to understand and gives visitors little reason to trust you. There is no fixed word count Google requires — depth should match the topic.',
    fix: 'Expand the page with genuinely useful content: what you offer, who it is for, process, pricing cues, FAQs, proof (reviews, case studies).',
    type: 'Content', effort: 'Significant', bucket: 'content', impact: 'More topical coverage and more queries the page can match.',
  },
  text_html_ratio: {
    why: 'A very low text-to-code ratio usually means heavy markup or scripts relative to useful content. It is a diagnostic hint, not a ranking factor.',
    fix: 'Reduce unnecessary markup/inline code and make sure meaningful text content exists on the page.',
    type: 'Developer', effort: 'Moderate', bucket: 'long_term', impact: 'Indirect — leaner pages and clearer content.',
  },
  js_rendering: {
    why: 'Most content appears to be inserted by JavaScript. Google can render JavaScript, but it is slower and less reliable, and other search engines and AI crawlers often cannot.',
    fix: 'Use server-side rendering or static generation so the main content is present in the initial HTML.',
    type: 'Developer', effort: 'Significant', bucket: 'technical', impact: 'More reliable indexing across search engines.',
  },
  img_alt: {
    why: 'ALT text describes images to visually impaired visitors and to search engines, and helps images appear in image search.',
    fix: 'Add short, specific ALT text to each meaningful image. Purely decorative images should use an empty alt="" attribute.',
    platform: { WordPress: 'Media → Library → select the image → "Alternative Text". For images in Elementor, set it in the Media Library too.', Shopify: 'Products → image → "Add alt text".', Wix: 'Click the image → Settings → "What\'s in the image?".' },
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Better accessibility and image-search visibility.',
  },
  image_filenames: {
    why: 'Descriptive filenames (e.g. "chennai-office-interior.jpg") give a small extra hint about image content; camera names like "IMG_2041.jpg" give none.',
    fix: 'Rename images descriptively before uploading new ones. Renaming existing files needs redirects, so prioritise new uploads.',
    type: 'Content', effort: 'Moderate', bucket: 'long_term', impact: 'Minor image-search benefit.',
  },
  image_dimensions: {
    why: 'Images without width/height attributes can make the layout jump while loading (Cumulative Layout Shift), which hurts user experience.',
    fix: 'Add width and height attributes (or CSS aspect-ratio) to images.',
    type: 'Developer', effort: 'Moderate', bucket: 'technical', impact: 'More stable layout during loading.',
  },
  image_format: {
    why: 'WebP and AVIF images are typically 25–50% smaller than JPEG/PNG at similar quality, which speeds up pages.',
    fix: 'Serve modern formats. Most CDNs and image plugins can convert automatically.',
    platform: { WordPress: 'Use an image optimisation plugin (e.g. ShortPixel, Imagify, EWWW) with WebP/AVIF delivery enabled.' },
    type: 'Technical', effort: 'Moderate', bucket: 'technical', impact: 'Lighter pages, faster loading on mobile data.',
  },
  image_lazy: {
    why: 'Loading every image up front slows the first view. Lazy-loading below-the-fold images saves bandwidth.',
    fix: 'Add loading="lazy" to images below the fold (never to the main hero image).',
    type: 'Developer', effort: 'Quick', bucket: 'technical', impact: 'Faster initial load.',
  },
  canonical_present: {
    why: 'A canonical tag tells search engines which URL is the preferred version when the same content is reachable at several addresses (tracking parameters, http/https, www).',
    fix: 'Add a self-referencing <link rel="canonical"> on each indexable page.',
    platform: { WordPress: 'Yoast, Rank Math and AIOSEO add canonicals automatically once activated.' },
    type: 'Technical', effort: 'Quick', bucket: 'technical', impact: 'Reduces duplicate-URL confusion.',
  },
  canonical_multiple: {
    why: 'Conflicting canonical tags are ignored by Google, so you lose control over which URL is treated as the main version.',
    fix: 'Output exactly one canonical tag. Duplicates usually come from two SEO plugins or a theme plus a plugin.',
    type: 'Technical', effort: 'Quick', bucket: 'technical', impact: 'Restores a clear canonical signal.',
  },
  canonical_match: {
    why: 'This page names a different URL as its canonical. That is correct for genuine duplicates, but if unintentional it asks search engines to index the other URL instead of this one.',
    fix: 'Confirm the canonical target is intentional. For a normal page, the canonical should point to itself.',
    type: 'Technical', effort: 'Quick', bucket: 'technical', impact: 'Ensures the right URL is indexed.',
  },
  robots_txt: {
    why: 'A robots.txt file is optional, but it is the standard place to guide crawlers and declare your sitemap.',
    fix: 'Create a robots.txt at the site root that allows crawling of public pages and lists the sitemap URL.',
    platform: { WordPress: 'WordPress serves a virtual robots.txt by default; Yoast/Rank Math let you edit it under Tools/General settings.' },
    type: 'Configuration', effort: 'Quick', bucket: 'technical', impact: 'Cleaner crawler guidance.',
  },
  robots_sitemap_ref: {
    why: 'Listing the sitemap in robots.txt helps every search engine find it, not only those where you submitted it manually.',
    fix: 'Add a line such as "Sitemap: https://yourdomain/sitemap.xml" to robots.txt.',
    type: 'Configuration', effort: 'Quick', bucket: 'quick_wins', impact: 'Easier sitemap discovery.',
  },
  sitemap: {
    why: 'An XML sitemap lists the pages you want indexed, helping search engines discover them — especially new or deeply linked pages.',
    fix: 'Generate an XML sitemap and submit it in Google Search Console and Bing Webmaster Tools.',
    platform: { WordPress: 'Yoast/Rank Math generate /sitemap_index.xml automatically. WordPress core also provides /wp-sitemap.xml.', Shopify: 'Shopify generates /sitemap.xml automatically.' },
    type: 'Configuration', effort: 'Quick', bucket: 'technical', impact: 'Faster, more complete discovery of pages.',
  },
  lang_attr: {
    why: 'The html lang attribute declares the page language for browsers, screen readers and translation tools.',
    fix: 'Add lang="en" (or en-IN, hi, ta, etc.) to the <html> tag.',
    type: 'Developer', effort: 'Quick', bucket: 'quick_wins', impact: 'Accessibility and clarity.',
  },
  charset: {
    why: 'A declared character encoding prevents garbled text, especially for Indian-language characters and symbols like ₹.',
    fix: 'Add <meta charset="utf-8"> as the first element in <head>.',
    type: 'Developer', effort: 'Quick', bucket: 'quick_wins', impact: 'Correct text rendering.',
  },
  doctype: {
    why: 'Without <!DOCTYPE html> browsers render in "quirks mode", which can break layout.',
    fix: 'Add <!DOCTYPE html> as the first line of the HTML.',
    type: 'Developer', effort: 'Quick', bucket: 'technical', impact: 'Consistent rendering.',
  },
  deprecated_html: {
    why: 'Obsolete HTML tags suggest an outdated template and may render inconsistently.',
    fix: 'Replace obsolete tags with modern HTML and CSS.',
    type: 'Developer', effort: 'Moderate', bucket: 'long_term', impact: 'Maintainability.',
  },
  structured_data: {
    why: 'Structured data (schema.org JSON-LD) helps search engines understand your business, and makes pages eligible for certain rich results.',
    fix: 'Add JSON-LD for your business type (Organization or LocalBusiness), plus Breadcrumb, Product, FAQ or Article where relevant. Validate with Google\'s Rich Results Test.',
    platform: { WordPress: 'Rank Math / Yoast output Organization and WebSite schema; configure the business details in the plugin\'s settings.' },
    type: 'Technical', effort: 'Moderate', bucket: 'long_term', impact: 'Rich-result eligibility; clearer entity understanding. Not a guarantee of rich results.',
  },
  structured_data_errors: {
    why: 'Malformed JSON-LD is ignored entirely by search engines.',
    fix: 'Fix the JSON syntax errors listed and re-test in the Rich Results Test.',
    type: 'Technical', effort: 'Quick', bucket: 'technical', impact: 'Lets search engines read your structured data.',
  },
  html_size: {
    why: 'Very large HTML documents take longer to download and parse, especially on mobile networks.',
    fix: 'Remove inline bloat (large inline scripts/styles, duplicated menus, base64 images).',
    type: 'Developer', effort: 'Moderate', bucket: 'technical', impact: 'Faster first render.',
  },
  response_time: {
    why: 'A slow server response delays everything else on the page. It feeds directly into Largest Contentful Paint.',
    fix: 'Enable page caching, use a CDN, and upgrade hosting if response times stay high.',
    platform: { WordPress: 'Use a caching plugin (LiteSpeed Cache, WP Rocket, W3 Total Cache) and consider a CDN such as Cloudflare.' },
    type: 'Server/Hosting', effort: 'Moderate', bucket: 'high_impact', impact: 'Faster loading for every visitor.',
  },
  compression: {
    why: 'Gzip or Brotli compression typically shrinks HTML, CSS and JS by 60–80%.',
    fix: 'Enable Brotli or Gzip compression on the server or CDN.',
    type: 'Server/Hosting', effort: 'Quick', bucket: 'quick_wins', impact: 'Smaller transfers, faster loads.',
  },
  pagespeed_mobile: {
    why: 'Most Indian users browse on mobile, often on variable networks. Slow mobile pages lose visitors, and page experience is part of how Google evaluates pages.',
    fix: 'Work through the PageSpeed opportunities listed — usually image optimisation, reducing unused JavaScript/CSS, and caching.',
    type: 'Developer', effort: 'Significant', bucket: 'high_impact', impact: 'Better user experience; lower bounce on mobile.',
  },
  pagespeed_desktop: {
    why: 'Desktop performance matters for B2B and office-hours visitors.',
    fix: 'Address the listed PageSpeed opportunities.',
    type: 'Developer', effort: 'Moderate', bucket: 'technical', impact: 'Faster desktop experience.',
  },
  cwv_field: {
    why: 'Core Web Vitals field data comes from real Chrome users visiting this page/site. It is what Google uses in its page experience assessment.',
    fix: 'Improve the failing metric: LCP (server speed, hero image), INP (heavy JavaScript), CLS (image dimensions, late-loading banners).',
    type: 'Developer', effort: 'Significant', bucket: 'high_impact', impact: 'Better real-user experience.',
  },
  viewport: {
    why: 'Without a responsive viewport tag, mobile browsers render the desktop layout zoomed out. Google indexes the mobile version of pages.',
    fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> and ensure the theme is responsive.',
    type: 'Developer', effort: 'Quick', bucket: 'quick_wins', impact: 'Usable mobile layout.',
  },
  viewport_zoom: {
    why: 'Disabling pinch-zoom (user-scalable=no or maximum-scale=1) makes text hard to read for many users and fails accessibility guidelines.',
    fix: 'Remove user-scalable=no and maximum-scale=1 from the viewport tag.',
    type: 'Developer', effort: 'Quick', bucket: 'quick_wins', impact: 'Accessibility.',
  },
  mobile_font: {
    why: 'Text that is too small on phones forces visitors to zoom and makes the page feel hard to use.',
    fix: 'Use a base font size of at least 16px for body text on mobile.',
    type: 'Developer', effort: 'Moderate', bucket: 'technical', impact: 'More readable mobile pages.',
  },
  mobile_tap: {
    why: 'Buttons and links placed too close together cause mis-taps on phones.',
    fix: 'Make tap targets at least 48×48px with spacing between them, especially in menus and footers.',
    type: 'Developer', effort: 'Moderate', bucket: 'technical', impact: 'Easier mobile navigation.',
  },
  favicon: {
    why: 'Google shows the favicon next to your result on mobile. A missing icon looks unfinished and reduces brand recognition.',
    fix: 'Add a square favicon (at least 48×48px).',
    platform: { WordPress: 'Appearance → Customize → Site Identity → Site Icon.' },
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Brand recognition in results.',
  },
  og_tags: {
    why: 'Open Graph tags control the title, description and image shown when your page is shared on WhatsApp, LinkedIn and Facebook.',
    fix: 'Add og:title, og:description and og:image (1200×630px recommended).',
    platform: { WordPress: 'Yoast/Rank Math → page → Social tab.' },
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Better-looking shares on WhatsApp and social media.',
  },
  twitter_card: {
    why: 'Twitter/X card tags control how links appear on X. Without them, X falls back to Open Graph if present.',
    fix: 'Add twitter:card ("summary_large_image") — SEO plugins usually handle this.',
    type: 'Content', effort: 'Quick', bucket: 'long_term', impact: 'Better previews on X.',
  },
  broken_internal_links: {
    why: 'Broken internal links waste crawl budget, leak link value and frustrate visitors.',
    fix: 'Update or remove each broken link listed, or redirect the missing URL to the most relevant live page.',
    platform: { WordPress: 'Edit the content containing the link, or add a 301 via the Redirection plugin / Rank Math Redirections.' },
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Better crawl flow and user experience.',
  },
  broken_external_links: {
    why: 'Links to dead external pages harm user experience and make content look outdated.',
    fix: 'Replace or remove the broken external links.',
    type: 'Content', effort: 'Quick', bucket: 'content', impact: 'Content quality and trust.',
  },
  internal_link_count: {
    why: 'Internal links help search engines discover pages and understand which ones matter most.',
    fix: 'Link from the homepage and key pages to your main services, locations and important content using descriptive anchor text.',
    type: 'Content', effort: 'Moderate', bucket: 'high_impact', impact: 'Better discovery and distribution of authority.',
  },
  nofollow_internal: {
    why: 'Adding rel="nofollow" to your own internal links stops the flow of signals to those pages.',
    fix: 'Remove nofollow from internal links unless the target is intentionally excluded (e.g. login pages).',
    type: 'Content', effort: 'Quick', bucket: 'technical', impact: 'Restores internal link signals.',
  },
  empty_anchor: {
    why: 'Links with no text (and no aria-label) give search engines and screen-reader users no clue about the destination.',
    fix: 'Add descriptive text, or an aria-label/alt text for icon and image links.',
    type: 'Developer', effort: 'Quick', bucket: 'quick_wins', impact: 'Accessibility and link context.',
  },
  duplicate_titles: {
    why: 'Multiple pages with the same title compete for the same searches and make it hard for search engines to tell them apart.',
    fix: 'Give each page a unique title that reflects its specific content.',
    type: 'Content', effort: 'Moderate', bucket: 'content', impact: 'Clearer page targeting.',
  },
  duplicate_meta: {
    why: 'Repeated meta descriptions make search snippets look identical across pages.',
    fix: 'Write unique descriptions for each important page.',
    type: 'Content', effort: 'Moderate', bucket: 'content', impact: 'More relevant snippets.',
  },
  url_length: {
    why: 'Very long URLs are harder to read, share and remember, and are often truncated in results.',
    fix: 'Keep URLs short and descriptive for new pages. Change existing URLs only with 301 redirects.',
    type: 'Technical', effort: 'Moderate', bucket: 'long_term', impact: 'Readability.',
  },
  url_underscore: {
    why: 'Google treats hyphens as word separators but not underscores, so "seo_services" may be read as one word.',
    fix: 'Use hyphens in new URLs. Change existing ones only with 301 redirects.',
    type: 'Technical', effort: 'Moderate', bucket: 'long_term', impact: 'Minor readability benefit.',
  },
  url_uppercase: {
    why: 'URLs are case-sensitive; mixed case can create duplicate versions of a page.',
    fix: 'Use lowercase URLs and redirect uppercase variants.',
    type: 'Technical', effort: 'Moderate', bucket: 'long_term', impact: 'Avoids duplicate URLs.',
  },
  url_params: {
    why: 'Query parameters can create many URL variations of the same content.',
    fix: 'Use clean paths for indexable pages and canonical tags for parameter variants.',
    type: 'Technical', effort: 'Moderate', bucket: 'long_term', impact: 'Fewer duplicate URLs.',
  },
  kw_in_title: {
    why: 'Including the primary keyword in the title is one of the clearest relevance signals you control.',
    fix: 'Work the target keyword naturally into the title, ideally near the start.',
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Clearer relevance for that search term.',
  },
  kw_in_h1: {
    why: 'The H1 confirms the page topic to visitors arriving from search.',
    fix: 'Use the target keyword (or a close natural variation) in the H1.',
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Better topic alignment.',
  },
  kw_in_meta: {
    why: 'Search engines bold query words in snippets, which draws the eye.',
    fix: 'Mention the target keyword naturally in the meta description.',
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'More noticeable snippet.',
  },
  kw_in_content: {
    why: 'If a target keyword never appears in the content, the page is unlikely to be seen as relevant for it.',
    fix: 'Cover the topic properly in the body copy — explain the service, use natural variations, answer common questions.',
    type: 'Content', effort: 'Moderate', bucket: 'content', impact: 'Topical relevance.',
  },
  keyword_stuffing: {
    why: 'Repeating a word or phrase unnaturally reads poorly and can be treated as spam.',
    fix: 'Rewrite to use synonyms and natural language; write for people first.',
    type: 'Content', effort: 'Moderate', bucket: 'content', impact: 'Better readability; avoids spam signals.',
  },
  local_city_mention: {
    why: 'For local searches ("CA in Coimbatore"), mentioning your city in the title, H1 and content helps search engines connect your business to that location.',
    fix: 'Mention the city/area naturally in the title, H1 and body copy of the relevant pages.',
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'Stronger local relevance.',
  },
  local_phone: {
    why: 'A visible, clickable phone number helps mobile visitors call directly and supports consistent business details (NAP) across the web.',
    fix: 'Add a tel: link with your business phone number in the header or footer.',
    type: 'Content', effort: 'Quick', bucket: 'quick_wins', impact: 'More calls from mobile visitors.',
  },
  local_schema: {
    why: 'LocalBusiness structured data states your name, address, phone and hours in a machine-readable way.',
    fix: 'Add LocalBusiness (or a more specific subtype) JSON-LD with name, address, geo, phone, opening hours and sameAs links.',
    type: 'Technical', effort: 'Moderate', bucket: 'long_term', impact: 'Clearer local entity information.',
  },
  analytics: {
    why: 'Without analytics you cannot measure whether SEO work is producing traffic and enquiries.',
    fix: 'Install Google Analytics 4 (ideally via Google Tag Manager) and connect Google Search Console.',
    platform: { WordPress: 'Use Google\'s Site Kit plugin or add GTM via your theme/header plugin.' },
    type: 'Configuration', effort: 'Quick', bucket: 'quick_wins', impact: 'Measurement — essential for proving ROI.',
  },
};

export function kbFor(id, platforms = []) {
  const k = KB[id];
  if (!k) return null;
  const steps = [];
  for (const p of platforms) if (k.platform?.[p]) steps.push({ platform: p, steps: k.platform[p] });
  return {
    whyItMatters: k.why,
    recommendation: k.fix,
    implementation: steps.length ? steps : [{ platform: 'Any website', steps: k.fix }],
    implementationType: k.type,
    effort: k.effort,
    bucket: k.bucket,
    expectedImpact: k.impact,
  };
}
