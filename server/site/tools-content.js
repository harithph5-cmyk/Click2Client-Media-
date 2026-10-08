// Server-side SEO content, metadata, FAQs, and curated related tools
// for the 15 free SEO tools. All copy is unique, human-readable, and
// reflects real search intent without keyword stuffing or false claims.

export const TOOL_CONTENT = {
  'website-seo-checker': {
    title: 'Free Website SEO Checker — Analyze On-Page & Technical SEO | Click2Client Media',
    description: "Check your website for critical SEO issues, metadata errors, heading structure, mobile readiness and crawlability with Click2Client Media's free SEO checker.",
    h1: 'Free Website SEO Checker',
    intro: 'Analyze any webpage to audit core on-page SEO factors, technical compliance, and search engine readiness in seconds.',
    steps: [
      { num: '01', title: 'Enter your page URL', desc: 'Type your webpage address (including https://) to initiate the automated diagnostic scan.' },
      { num: '02', title: 'Automated on-page crawl', desc: 'Our engine inspects HTML metadata, heading hierarchy, image assets, and crawlability rules.' },
      { num: '03', title: 'Review prioritized findings', desc: 'Inspect findings grouped into critical errors, warnings, and passed technical checks.' },
      { num: '04', title: 'Apply actionable fixes', desc: 'Follow targeted remediation guidance to resolve technical and on-page search bottlenecks.' },
    ],
    checks: [
      { icon: '🏷️', title: 'Meta Tags & SERP Preview', desc: 'Validates title and meta description presence, length thresholds, and Google snippet simulation.' },
      { icon: '📑', title: 'Heading Hierarchy', desc: 'Inspects H1 uniqueness, heading hierarchy (H1–H6), and flags skipped or empty heading levels.' },
      { icon: '🖼️', title: 'Image Accessibility & ALT', desc: 'Audits image assets across the page and flags missing or empty alternative text attributes.' },
      { icon: '🔒', title: 'Technical Crawlability', desc: 'Verifies canonical tag configuration, HTTPS security, mobile viewport, and indexability rules.' },
    ],
    fixes: [
      { title: 'Resolve Missing Metadata First', desc: 'Ensure every page has a unique title (50–60 characters) and meta description (120–160 characters) to optimize search snippet visibility.' },
      { title: 'Establish a Single Primary H1', desc: 'Use exactly one H1 describing the main page topic, followed by logical H2 and H3 subheadings without skipping heading levels.' },
      { title: 'Add Descriptive Image ALT Text', desc: 'Supply concise, descriptive alternative text for all informational images to aid screen readers and Google Image search.' },
      { title: 'Verify Canonical Consistency', desc: 'Ensure your canonical tag is self-referencing and uses the exact secure HTTPS address with correct trailing slash rules.' },
    ],
    faqs: [
      { q: 'What does this website SEO checker do?', a: 'It audits essential on-page and technical SEO elements on any live webpage, checking metadata, headings, images, canonical tags, and mobile readiness against search engine guidelines.' },
      { q: 'Can I check any webpage for free?', a: 'Yes. Any publicly accessible webpage that returns HTML can be audited instantly without registration or subscription.' },
      { q: 'What is the difference between a critical issue and a warning?', a: 'Critical issues (such as missing titles or noindex tags) directly obstruct search indexing and ranking, whereas warnings highlight optimization opportunities like short descriptions.' },
      { q: 'Does this tool test mobile-friendliness?', a: 'It verifies viewport meta tag configuration to ensure your webpage scales properly across mobile viewports and passes basic mobile-readiness rules.' },
      { q: 'How often should I run an SEO check on my pages?', a: 'Run an audit whenever publishing new content, updating page templates, or revamping design to catch technical regressions before search engines recrawl.' },
    ],
    relatedSlugs: ['seo-score-checker', 'meta-analyzer', 'heading-checker', 'broken-link-checker'],
  },

  'seo-score-checker': {
    title: 'SEO Score Checker — Check Your Website SEO Health Score | Click2Client Media',
    description: "Calculate your website's on-page SEO health score out of 100. Identify priority technical issues and content gaps with Click2Client Media's free scoring tool.",
    h1: 'Website SEO Score Checker',
    intro: 'Get an instant, transparent on-page SEO health score out of 100 with prioritized action items to systematically improve search performance.',
    steps: [
      { num: '01', title: 'Submit your URL', desc: 'Provide your webpage address to trigger a comprehensive technical and on-page evaluation.' },
      { num: '02', title: 'Rule engine scoring', desc: 'Our auditor scores metadata, heading order, asset accessibility, and crawlability out of 100.' },
      { num: '03', title: 'View score breakdown', desc: 'Review your total health score alongside categorical benchmarks (Optimal, Needs Attention, Critical).' },
      { num: '04', title: 'Address priority items', desc: 'Fix high-impact critical deficiencies first to elevate your site into the optimal 80–100 tier.' },
    ],
    checks: [
      { icon: '💯', title: 'Mathematical Health Score', desc: 'Weighted score combining passed checks (full value) and warnings (half value) out of 100.' },
      { icon: '🚨', title: 'Critical Action Items', desc: 'Isolates high-severity failures like missing titles, duplicate H1s, or broken canonical links.' },
      { icon: '⚡', title: 'Optimization Warnings', desc: 'Flags secondary issues such as short meta descriptions or skipped heading hierarchy levels.' },
      { icon: '📊', title: 'Issue Breakdown Progress', desc: 'Visual distribution bar showing the proportion of critical, warning, passed, and info checks.' },
    ],
    fixes: [
      { title: 'Eliminate Red Critical Deficiencies', desc: 'Tackle critical alerts immediately. Fixing missing titles and canonical conflicts produces the fastest score improvement.' },
      { title: 'Refine Optimization Warnings', desc: 'Expand short meta descriptions and ensure images have descriptive ALT text to lift scores into the 80+ tier.' },
      { title: 'Maintain Content Depth', desc: 'Ensure core landing pages provide comprehensive topical coverage with at least 300 words of helpful, relevant copy.' },
      { title: 'Re-test After Publishing Changes', desc: 'Run the tool again following template or copy updates to confirm that all remediation items have resolved.' },
    ],
    faqs: [
      { q: 'What does the SEO score mean?', a: 'The score reflects how well your webpage conforms to fundamental on-page technical and search best practices on a transparent 0–100 scale.' },
      { q: 'Does a higher score guarantee top Google rankings?', a: 'No single score guarantees rankings because backlinks, user intent, and competition also matter; however, a high score eliminates technical penalties that hold pages back.' },
      { q: 'What is considered a good SEO score?', a: 'Scores between 80 and 100 indicate optimal on-page health; 50–79 indicates areas needing attention; below 50 signals critical deficiencies.' },
      { q: 'How is the score calculated?', a: 'It mathematically weights verified checks: passed items add full value, warnings add half value, and failures contribute zero toward the total.' },
      { q: 'How can I improve my score quickly?', a: 'Focus on failed critical checks first—such as adding missing title tags, creating a single H1, and providing image ALT attributes.' },
    ],
    relatedSlugs: ['website-seo-checker', 'meta-analyzer', 'keyword-density', 'schema-validator'],
  },

  'meta-analyzer': {
    title: 'Meta Title & Description Analyzer — SERP Preview Tool | Click2Client Media',
    description: 'Analyze title tag and meta description lengths with live Google SERP preview. Prevent title truncation and optimize click-through rates for free.',
    h1: 'Meta Title & Description Analyzer',
    intro: 'Inspect your page title and meta description tags, verify character counts against search engine display limits, and preview your Google search snippet.',
    steps: [
      { num: '01', title: 'Enter webpage URL', desc: 'Input the URL of the webpage whose meta tags and search appearance you want to inspect.' },
      { num: '02', title: 'Extract head markup', desc: 'The analyzer parses <title> and <meta name="description"> tags directly from the live HTML.' },
      { num: '03', title: 'Inspect character lengths', desc: 'Check character counts against recommended thresholds (50–60 for titles, 120–160 for descriptions).' },
      { num: '04', title: 'Review Google preview', desc: 'Verify that your snippet communicates key benefits without awkward truncation or ellipses.' },
    ],
    checks: [
      { icon: '📏', title: 'Title Tag Character Count', desc: 'Verifies title presence and flags titles under 30 characters (short) or over 60 characters (truncated).' },
      { icon: '📝', title: 'Meta Description Length', desc: 'Checks description presence and flags text under 70 characters (short) or over 160 characters.' },
      { icon: '🔍', title: 'Google SERP Preview', desc: 'Accurately simulates how searchers see your title, URL, and description on desktop Google search.' },
      { icon: '⚠️', title: 'Tag Duplication Audit', desc: 'Detects accidental multiple title tags or duplicate description tags in your document <head>.' },
    ],
    fixes: [
      { title: 'Keep Titles Between 50–60 Characters', desc: 'Front-load your primary target keyword and include your brand name toward the end separated by a dash or pipe.' },
      { title: 'Target 120–160 Characters for Descriptions', desc: 'Write a persuasive summary answering search intent with a compelling call-to-action to maximize organic click-through rates.' },
      { title: 'Avoid Keyword Stuffing in Titles', desc: 'Write natural, human-friendly titles rather than comma-separated keyword lists that look spammy to searchers.' },
      { title: 'Ensure Exactly One Title Tag Exists', desc: 'Remove any duplicate <title> tags generated by conflicting SEO plugins or CMS templates in your <head>.' },
    ],
    faqs: [
      { q: 'What is the ideal title tag length for SEO?', a: 'Between 50 and 60 characters (or under 600 pixels) ensures your title tag displays fully in desktop and mobile search snippets without being cut off.' },
      { q: 'Why does Google sometimes rewrite meta descriptions?', a: 'Google dynamically generates snippets based on user query intent if the declared meta description is missing, too short, or deemed less relevant to the query.' },
      { q: 'Do meta descriptions directly impact organic rankings?', a: 'Meta descriptions do not directly affect search ranking algorithms, but they significantly influence organic click-through rates (CTR).' },
      { q: 'Can a webpage have more than one title tag?', a: 'No. HTML standards require exactly one <title> element inside the <head>. Multiple title tags can confuse search crawlers.' },
      { q: 'What happens if my title tag is too long?', a: 'Search engines will truncate the excess text with an ellipsis (…), potentially hiding key benefits or brand identifiers from searchers.' },
    ],
    relatedSlugs: ['meta-generator', 'open-graph-checker', 'heading-checker', 'website-seo-checker'],
  },

  'meta-generator': {
    title: 'Free Meta Tag Generator — Create Open Graph & Meta Tags | Click2Client Media',
    description: 'Generate clean, valid HTML meta tags including Title, Description, Canonical, Open Graph and Twitter Card markup ready to copy and paste.',
    h1: 'Free Meta Tag Generator',
    intro: 'Generate complete, search-engine-ready HTML meta tags, canonical links, and social share cards tailored for your website or CMS template.',
    steps: [
      { num: '01', title: 'Input page details', desc: 'Provide your page title, description, URL, website name, and optional social image address.' },
      { num: '02', title: 'Live validation', desc: 'Real-time validation tracks character counts and alerts you to short or overly long text.' },
      { num: '03', title: 'Preview search snippet', desc: 'Review the simulated Google desktop search preview to inspect your title and description appearance.' },
      { num: '04', title: 'Copy & paste code', desc: 'Click "Copy Code" and paste the clean HTML snippet directly between the <head> tags of your site.' },
    ],
    checks: [
      { icon: '🏷️', title: 'Complete Tag Suite', desc: 'Generates Title, Meta Description, Canonical, Open Graph, and Twitter Card markup simultaneously.' },
      { icon: '📏', title: 'Length Guidance', desc: 'Instant character counters ensure your title (50–60) and description (120–160) hit optimal lengths.' },
      { icon: '🌐', title: 'Open Graph Integration', desc: 'Formats og:type, og:title, og:description, og:url, og:image, and og:site_name for social sharing.' },
      { icon: '🐦', title: 'Twitter Card Markup', desc: 'Includes twitter:card (summary_large_image), twitter:title, and twitter:image tags for X.' },
    ],
    fixes: [
      { title: 'Paste Directly Inside <head>', desc: 'Place the generated snippet high in your HTML document between <head> and </head>, before stylesheets or scripts.' },
      { title: 'Use Absolute URLs for Social Images', desc: 'Ensure your share image URL starts with https:// and points to a publicly accessible 1200×630px image.' },
      { title: 'Keep Descriptions Action-Oriented', desc: 'Summarize the primary topic and include an active invitation such as "Discover...", "Learn how...", or "Explore...".' },
      { title: 'Update CMS Field Settings', desc: 'If using WordPress, Shopify, or Webflow, copy the title and description into your theme or SEO plugin settings.' },
    ],
    faqs: [
      { q: 'Where do I paste the generated meta tags?', a: 'Paste the copied code directly between the opening <head> and closing </head> tags in your HTML template or CMS header settings.' },
      { q: 'What meta tags does this generator create?', a: 'It creates the <title> tag, meta description, canonical link, Open Graph tags (Facebook/LinkedIn/WhatsApp), and Twitter Card markup.' },
      { q: 'Why should I include Open Graph tags?', a: 'Open Graph tags control how links display rich image previews, titles, and snippets when shared on social networks and messaging apps.' },
      { q: 'Can I use this for WordPress or Shopify?', a: 'Yes. You can copy the title and description directly into your SEO plugin (like Yoast or Rank Math) or paste the full snippet into your theme header.' },
      { q: 'Is this meta tag generator free to use?', a: 'Yes, it is 100% free with no account creation, limits, or software downloads required.' },
    ],
    relatedSlugs: ['meta-analyzer', 'open-graph-checker', 'website-seo-checker', 'canonical-checker'],
  },

  'heading-checker': {
    title: 'Heading Structure Checker — Inspect H1 to H6 Hierarchy | Click2Client Media',
    description: 'Check heading tags (H1–H6) on any webpage. Detect missing H1s, multiple H1 tags, skipped levels, and inspect your full content outline for free.',
    h1: 'Heading Structure Checker',
    intro: 'Inspect the heading hierarchy (H1–H6) of any page to identify missing main headings, skipped outline levels, and accessibility issues.',
    steps: [
      { num: '01', title: 'Enter webpage URL', desc: 'Provide your webpage address to extract all heading tags in exact sequential document order.' },
      { num: '02', title: 'Audit outline structure', desc: 'The checker verifies H1 status, heading counts by level, and nesting continuity from H1 to H6.' },
      { num: '03', title: 'Inspect visual outline', desc: 'Explore an interactive hierarchical tree displaying every heading tag alongside its text content.' },
      { num: '04', title: 'Fix structural skips', desc: 'Correct skipped levels and ensure headings reflect an organized, logical document outline.' },
    ],
    checks: [
      { icon: '🥇', title: 'Primary H1 Audit', desc: 'Verifies presence of exactly one H1 tag and flags missing or duplicate H1 headings.' },
      { icon: '🔢', title: 'Heading Level Counts', desc: 'Summarizes total counts across all individual heading tags from H1 through H6.' },
      { icon: '🪜', title: 'Hierarchy Continuity', desc: 'Identifies skipped levels (such as jumping from H1 directly to H3) that confuse crawlers.' },
      { icon: '🌲', title: 'Visual Outline Tree', desc: 'Renders the complete content hierarchy as an indented semantic tree showing heading relationships.' },
    ],
    fixes: [
      { title: 'Use Exactly One H1 Per Page', desc: 'Designate a single primary H1 heading that clearly communicates the overarching topic of the webpage.' },
      { title: 'Follow Logical Sequential Nesting', desc: 'Nest H2 sections under your H1, and H3 subsections under H2s. Never jump from H1 directly to H3 or H4.' },
      { title: 'Eliminate Empty Heading Elements', desc: 'Remove heading tags that contain no visible text or whitespace, which confuse screen readers and accessibility tools.' },
      { title: 'Separate Styling From Semantics', desc: 'Never use heading tags merely to make text visually larger or bold; use semantic CSS classes instead.' },
    ],
    faqs: [
      { q: 'Why is heading structure important for SEO?', a: 'Headings provide a clear topical outline that helps search engines understand the relationships between sections and topical hierarchy.' },
      { q: 'Should every webpage have only one H1 heading?', a: 'Having a single descriptive H1 is widely recognized as the clearest, most accessible practice for users and search engine crawlers.' },
      { q: 'What is a skipped heading level?', a: 'A skipped heading level occurs when subheadings jump across levels without an intermediate tag, such as placing an H3 directly after an H1 without an H2.' },
      { q: 'Do empty heading tags hurt SEO?', a: 'Empty heading tags create structural confusion for assistive technology like screen readers and introduce unnecessary DOM bloat.' },
      { q: 'Can I style headings with CSS without breaking hierarchy?', a: 'Yes. HTML headings should always be chosen for semantic meaning, while CSS classes should control font size, weight, and visual appearance.' },
    ],
    relatedSlugs: ['website-seo-checker', 'keyword-density', 'meta-analyzer', 'internal-link-checker'],
  },

  'keyword-density': {
    title: 'Keyword Density Checker — Analyze Word Frequency & Phrases | Click2Client Media',
    description: 'Analyze keyword density and phrase frequency across your content. Identify top 1-word, 2-word, and 3-word phrases and check keyword placement in titles and H1s.',
    h1: 'Keyword Density Checker',
    intro: 'Analyze word frequency, n-gram phrases, lexical richness, and target keyword placement across critical HTML elements on any webpage.',
    steps: [
      { num: '01', title: 'Enter URL & target keyword', desc: 'Input your webpage address and optionally provide your target keyword or phrase to analyze.' },
      { num: '02', title: 'Tokenize & filter content', desc: 'Our engine strips boilerplate, removes stop words, and computes n-gram phrase frequency.' },
      { num: '03', title: 'Analyze phrase density', desc: 'Review top 1-word, 2-word, and 3-word phrases alongside calculated density percentages.' },
      { num: '04', title: 'Check placement matrix', desc: 'Verify whether your target keyword appears in the Title, H1, Meta Description, and Body copy.' },
    ],
    checks: [
      { icon: '📚', title: 'Total Words & Vocabulary', desc: 'Calculates total word count, unique vocabulary size, and lexical diversity ratio.' },
      { icon: '📊', title: '1, 2 & 3-Word Phrase Tables', desc: 'Extracts the most prominent single words, 2-word phrases, and 3-word phrases on the page.' },
      { icon: '⚠️', title: 'Keyword Stuffing Alert', desc: 'Flags phrases exceeding 4% density that may risk search engine algorithmic over-optimization penalties.' },
      { icon: '🎯', title: 'Keyword Placement Matrix', desc: 'Inspects occurrences and placement across the <title>, <h1>, meta description, and body content.' },
    ],
    fixes: [
      { title: 'Keep Phrase Density Natural (1–2.5%)', desc: 'Aim for a natural frequency between 1% and 2.5% for primary topics. Writing naturally for human readers is always best.' },
      { title: 'Prioritize Strategic Placement Over Frequency', desc: 'Ensure your primary keyword appears naturally in the title tag, H1, introductory paragraph, and URL slug.' },
      { title: 'Incorporate Semantic Synonyms', desc: 'Use variations, synonyms, and related topical entities rather than repeating the exact same phrase continuously.' },
      { title: 'Expand Thin Content Under 300 Words', desc: 'Pages with low word counts often struggle to rank; provide thorough, detailed coverage of your core subject matter.' },
    ],
    faqs: [
      { q: 'What is an ideal keyword density percentage?', a: 'There is no fixed ideal, but a density between 1% and 2% is generally considered natural and effective without risking keyword stuffing penalties.' },
      { q: 'What is keyword stuffing?', a: 'Keyword stuffing is the practice of loading a webpage with repetitive keywords to manipulate search engine rankings, which can lead to ranking demotions.' },
      { q: 'What does lexical diversity measure?', a: 'Lexical diversity measures vocabulary richness by calculating the ratio of unique words to total word count on the page.' },
      { q: 'Does this tool analyze multi-word phrases?', a: 'Yes. It breaks down top 1-word keywords, 2-word keyphrases, and 3-word phrases with individual counts and percentages.' },
      { q: 'Why is keyword placement more important than repetition?', a: 'Search engines give greater weight to words placed in prominent semantic HTML tags like the Title, H1, and lead paragraph than raw body repetition.' },
    ],
    relatedSlugs: ['heading-checker', 'website-seo-checker', 'meta-analyzer', 'internal-link-checker'],
  },

  'image-alt-checker': {
    title: 'Image ALT Text Checker — Audit Image Accessibility & SEO | Click2Client Media',
    description: 'Audit image ALT attributes across your webpage. Identify missing or empty ALT text, preview image thumbnails, and enhance accessibility and image search rankings.',
    h1: 'Image ALT Text Checker',
    intro: 'Audit all image tags on any webpage to locate missing or incomplete ALT attributes, preview image assets, and improve search visibility and accessibility.',
    steps: [
      { num: '01', title: 'Enter webpage address', desc: 'Input your webpage URL to extract all <img> elements and attributes from the live DOM.' },
      { num: '02', title: 'Verify ALT attributes', desc: 'The auditor inspects every image to determine whether descriptive alternative text is provided.' },
      { num: '03', title: 'Filter missing images', desc: 'Use the interactive filter button to isolate only images lacking alternative text.' },
      { num: '04', title: 'Update CMS image tags', desc: 'Add meaningful descriptions in your CMS media library or HTML templates to ensure accessibility.' },
    ],
    checks: [
      { icon: '🖼️', title: 'Total Images Audited', desc: 'Counts every image element discovered across the rendered webpage markup.' },
      { icon: '✅', title: 'Descriptive ALT Compliance', desc: 'Verifies images with meaningful, non-empty alternative text descriptions.' },
      { icon: '⚠️', title: 'Missing ALT Detection', desc: 'Flags images completely lacking an alt attribute or containing empty attributes where content is expected.' },
      { icon: '👁️', title: 'Visual Thumbnail Previews', desc: 'Displays visual thumbnails alongside source URLs so you can identify each asset instantly.' },
    ],
    fixes: [
      { title: 'Write Accurate, Contextual Descriptions', desc: 'Describe what is actually depicted in the image concisely and accurately for someone who cannot see it.' },
      { title: 'Use Empty ALT Only for Decorative Assets', desc: 'For purely decorative icons or background borders, use alt="" so screen readers know to skip them cleanly.' },
      { title: 'Avoid Repetitive Keyword Stuffing', desc: 'Do not cram keywords into image ALT tags. Describe the image subject naturally in 5 to 15 words.' },
      { title: 'Omit Redundant Words Like "Image Of"', desc: 'Screen readers already announce that an element is an image; jump straight into the descriptive subject.' },
    ],
    faqs: [
      { q: 'Why is ALT text important for SEO?', a: 'Search engine crawlers cannot visually interpret images with certainty; they rely on ALT text to understand image context and index images in Google Images.' },
      { q: 'How does ALT text benefit accessibility?', a: 'Screen readers read ALT text aloud to visually impaired users, allowing them to comprehend the visual content and purpose of images.' },
      { q: 'Should decorative images have ALT text?', a: 'Decorative images should include an empty alt="" attribute so screen readers recognize them as decorative and skip them cleanly.' },
      { q: 'What is the recommended length for ALT text?', a: 'Aim for under 125 characters, providing a clear and succinct description without unnecessary fluff.' },
      { q: 'Can I include keywords in image ALT text?', a: 'Include keywords only when they naturally and accurately describe the image subject; avoid keyword stuffing.' },
    ],
    relatedSlugs: ['website-seo-checker', 'seo-score-checker', 'heading-checker', 'schema-validator'],
  },

  'canonical-checker': {
    title: 'Canonical URL Checker — Verify rel="canonical" Tags | Click2Client Media',
    description: 'Check canonical tags on any webpage. Identify missing, conflicting or multiple canonical declarations and ensure preferred URLs resolve properly.',
    h1: 'Canonical URL Checker',
    intro: 'Verify <link rel="canonical"> implementations on any URL to avoid duplicate content confusion, check self-referencing links, and protect search indexation.',
    steps: [
      { num: '01', title: 'Enter page URL', desc: 'Provide the webpage URL you want to audit for canonical tag implementation.' },
      { num: '02', title: 'Parse canonical link', desc: 'Our engine inspects the HTML <head> to discover declared <link rel="canonical"> tags.' },
      { num: '03', title: 'Check resolution status', desc: 'Verifies whether the canonical tag is self-referencing, cross-domain, or pointing elsewhere.' },
      { num: '04', title: 'Resolve discrepancies', desc: 'Fix multiple tags, relative URLs, or protocol mismatches to ensure proper search consolidation.' },
    ],
    checks: [
      { icon: '🔗', title: 'Canonical Tag Presence', desc: 'Confirms whether a valid canonical link element is declared inside the page <head>.' },
      { icon: '🎯', title: 'Self-Referencing Verification', desc: 'Checks whether the canonical URL matches the requested URL protocol, host, and path.' },
      { icon: '⚠️', title: 'Multiple Tag Detection', desc: 'Flags instances where multiple conflicting canonical tags exist on a single webpage.' },
      { icon: '🌐', title: 'Cross-Domain Canonical Status', desc: 'Identifies when a page deliberately credits an external master URL for syndicated content.' },
    ],
    fixes: [
      { title: 'Ensure Every Indexable Page Has a Canonical Tag', desc: 'Every canonical page should declare a self-referencing canonical tag pointing directly to its preferred URL.' },
      { title: 'Always Use Absolute HTTPS URLs', desc: 'Specify the full URL including https://, correct subdomain (www vs non-www), and consistent trailing slashes.' },
      { title: 'Remove Duplicate Canonical Declarations', desc: 'If multiple canonical tags exist, search engines may ignore all of them. Ensure your template outputs only one.' },
      { title: 'Match Internal Links to Canonicals', desc: 'Ensure all internal navigation links point directly to the canonical URL rather than non-canonical variants.' },
    ],
    faqs: [
      { q: 'What is a canonical URL tag?', a: 'A canonical tag (<link rel="canonical" href="...">) tells search engines which URL represents the master, preferred version of a webpage.' },
      { q: 'What happens if a page has multiple canonical tags?', a: 'Search engines will typically ignore all declared canonicals if conflicting declarations are detected on the same page.' },
      { q: 'Should canonical tags be self-referencing?', a: 'Yes. Standard standalone pages should have self-referencing canonical tags pointing directly to their own exact canonical URL.' },
      { q: 'Can canonical tags point to a different domain?', a: 'Yes. Cross-domain canonicals allow publishers to syndicate content to external sites while preserving SEO credit for the original source.' },
      { q: 'Are canonical tags treated as absolute directives?', a: 'Search engines treat canonical tags as strong hints, but they may override them if internal links, sitemaps, and redirects send conflicting signals.' },
    ],
    relatedSlugs: ['robots-checker', 'redirect-checker', 'website-seo-checker', 'sitemap-checker'],
  },

  'robots-checker': {
    title: 'Robots.txt Checker — Test Crawler Access & Directives | Click2Client Media',
    description: 'Test your website\'s robots.txt file. Verify crawler permissions for Googlebot, Bingbot, and all user-agents, inspect disallow rules, and check sitemap references.',
    h1: 'Robots.txt Checker & Rule Tester',
    intro: 'Inspect your website\'s robots.txt file to verify crawler permissions for Googlebot and Bingbot, review directive rules, and ensure your XML sitemap is referenced.',
    steps: [
      { num: '01', title: 'Enter your domain or URL', desc: 'Input your website address; the tool automatically locates and parses /robots.txt from the root.' },
      { num: '02', title: 'Evaluate crawler rules', desc: 'Our parser tests specific access permissions for Googlebot, Bingbot, and all general user-agents (*).' },
      { num: '03', title: 'Review rule table', desc: 'Inspect parsed directive rules with human-readable explanations of what each path blocks or allows.' },
      { num: '04', title: 'Verify sitemap reference', desc: 'Confirm that your robots.txt contains a valid Sitemap: line pointing to your XML sitemap index.' },
    ],
    checks: [
      { icon: '🤖', title: 'Googlebot Access Permission', desc: 'Tests whether Googlebot is allowed to crawl the specified URL path based on matching rules.' },
      { icon: '🔎', title: 'Bingbot Access Permission', desc: 'Tests whether Bingbot is permitted to crawl the path according to declared directive groups.' },
      { icon: '🌐', title: 'All Crawlers (*) Status', desc: 'Verifies default fallback crawl permissions applied to all generic web crawlers.' },
      { icon: '🗺️', title: 'Sitemap Directive Detection', desc: 'Confirms whether one or more XML sitemaps are declared with absolute URLs inside robots.txt.' },
    ],
    fixes: [
      { title: 'Never Block Public Pages with Disallow: /', desc: 'Ensure that a catch-all Disallow: / directive is not accidentally left active from a staging or pre-launch environment.' },
      { title: 'Declare Your XML Sitemap URL', desc: 'Add a clean Sitemap: https://yourdomain.com/sitemap.xml line at the end of robots.txt so crawlers discover it easily.' },
      { title: 'Host Strictly at the Domain Root', desc: 'The robots.txt file must always be served from the top-level root path (e.g. https://example.com/robots.txt).' },
      { title: 'Use Case-Sensitive Path Matching', desc: 'Robots.txt rules are case-sensitive. Ensure disallowed paths match your server URL structure exactly.' },
    ],
    faqs: [
      { q: 'What is the purpose of robots.txt?', a: 'Robots.txt provides instructions to search engine web crawlers about which URLs and directories they are permitted or forbidden to crawl.' },
      { q: 'Does robots.txt prevent a page from appearing in Google?', a: 'No. If external links point to a blocked URL, Google may still index the URL without crawling its content. Use a noindex tag instead.' },
      { q: 'Where must the robots.txt file be located?', a: 'It must always reside in the top-level root directory of your website domain (e.g., https://example.com/robots.txt).' },
      { q: 'What does Disallow: / mean?', a: 'Disallow: / tells web crawlers not to crawl any page or resource across the entire website.' },
      { q: 'Should I list my sitemap in robots.txt?', a: 'Yes. Including a Sitemap: directive provides crawlers with an immediate pathway to discover all your indexable content.' },
    ],
    relatedSlugs: ['sitemap-checker', 'canonical-checker', 'redirect-checker', 'website-seo-checker'],
  },

  'sitemap-checker': {
    title: 'XML Sitemap Checker — Validate & Count Sitemap URLs | Click2Client Media',
    description: 'Validate your website\'s XML sitemap. Verify sitemap availability, check robots.txt references, count indexed URLs, and inspect sample URLs for free.',
    h1: 'XML Sitemap Checker & Validator',
    intro: 'Discover, validate, and analyze your XML sitemaps to ensure search engine crawlers can efficiently discover all important pages across your domain.',
    steps: [
      { num: '01', title: 'Enter your domain', desc: 'Provide your website domain or direct sitemap address to initiate automated discovery.' },
      { num: '02', title: 'Locate XML sitemap', desc: 'The tool checks standard locations (/sitemap.xml, /sitemap_index.xml) and robots.txt declarations.' },
      { num: '03', title: 'Validate XML format', desc: 'Validates XML syntax, schemas, and counts total URLs listed within the sitemap index.' },
      { num: '04', title: 'Inspect sample URLs', desc: 'Examine sample URLs to confirm that only live, canonical, indexable pages are included.' },
    ],
    checks: [
      { icon: '🗺️', title: 'XML Sitemap Discovery', desc: 'Verifies availability and HTTP 200 status code at standard sitemap addresses.' },
      { icon: '🤖', title: 'Robots.txt Declaration', desc: 'Confirms whether the sitemap is linked via a Sitemap: directive in robots.txt.' },
      { icon: '🔢', title: 'Total URL Count', desc: 'Counts discovered URLs and flags whether the sitemap is a sitemap index file.' },
      { icon: '📋', title: 'Sample URL Feed', desc: 'Displays a table of sample URLs extracted directly from the XML document feed.' },
    ],
    fixes: [
      { title: 'Include Only Canonical 200 OK Pages', desc: 'Ensure your sitemap never includes redirected URLs (301s), broken pages (404s), or pages with noindex tags.' },
      { title: 'Keep Sitemaps Under 50,000 URLs', desc: 'A single sitemap file must not exceed 50,000 URLs or 50MB uncompressed; use a sitemap index for larger sites.' },
      { title: 'Reference Sitemap in robots.txt', desc: 'Add a clean Sitemap: line in your robots.txt file so all major search engines locate it automatically.' },
      { title: 'Submit to Search Consoles', desc: 'Submit your primary sitemap address to Google Search Console and Bing Webmaster Tools for index monitoring.' },
    ],
    faqs: [
      { q: 'What is an XML sitemap?', a: 'An XML sitemap is a formatted file that lists essential URLs on a website, helping search engines discover and crawl pages intelligently.' },
      { q: 'Where is an XML sitemap normally located?', a: 'It is commonly found at https://example.com/sitemap.xml or referenced directly inside robots.txt.' },
      { q: 'How many URLs can a single XML sitemap hold?', a: 'Up to 50,000 URLs and a maximum uncompressed file size of 50 MB. Larger websites utilize a sitemap index containing multiple sitemaps.' },
      { q: 'Should redirected or noindex pages be in my sitemap?', a: 'No. Sitemaps should exclusively list clean, live (HTTP 200), indexable, canonical URLs.' },
      { q: 'How does an XML sitemap help search rankings?', a: 'While it does not directly alter ranking algorithms, it accelerates discovery and indexation of new or updated content.' },
    ],
    relatedSlugs: ['robots-checker', 'canonical-checker', 'broken-link-checker', 'website-seo-checker'],
  },

  'schema-validator': {
    title: 'Schema Markup Validator — Check JSON-LD Structured Data | Click2Client Media',
    description: 'Validate JSON-LD structured data on any webpage. Check for JSON syntax errors, inspect declared schema types, and verify markup implementation for free.',
    h1: 'Schema Markup Validator',
    intro: 'Audit JSON-LD structured data on any webpage to detect syntax errors, verify declared schema types, and ensure search engines understand your entities.',
    steps: [
      { num: '01', title: 'Enter page URL', desc: 'Input the URL of the webpage whose structured data markup you want to inspect.' },
      { num: '02', title: 'Parse JSON-LD scripts', desc: 'The validator extracts all <script type="application/ld+json"> blocks from the page DOM.' },
      { num: '03', title: 'Syntax & entity audit', desc: 'Validates JSON syntax rules and extracts declared Schema.org entity types (Organization, Article, etc.).' },
      { num: '04', title: 'Refine structured data', desc: 'Fix syntax breakages and expand entity markup to qualify for rich search results.' },
    ],
    checks: [
      { icon: '🧩', title: 'JSON-LD Type Detection', desc: 'Extracts and lists all recognized Schema.org types declared in JSON-LD script blocks.' },
      { icon: '✅', title: 'JSON Syntax Validation', desc: 'Identifies malformed JSON script blocks containing trailing commas, unescaped quotes, or syntax flaws.' },
      { icon: '📜', title: 'Microdata Inspection', desc: 'Checks for legacy itemscope and itemprop HTML microdata markup on the page.' },
      { icon: '⭐', title: 'Rich Result Verification Tip', desc: 'Provides guidance on testing with Google\'s Rich Results Test for specific visual snippet eligibility.' },
    ],
    fixes: [
      { title: 'Embed Valid JSON-LD in <script> Tags', desc: 'Place structured data inside <script type="application/ld+json"> elements in your page <head> or body.' },
      { title: 'Ensure Valid JSON Syntax', desc: 'Validate that all keys and strings use double quotes, and remove trailing commas that break strict JSON parsers.' },
      { title: 'Implement Relevant Schema Types', desc: 'Match schema to your page purpose: Organization for company info, Article for blogs, Product for commerce, and FAQPage for Q&As.' },
      { title: 'Keep Schema Accurate to Visible Content', desc: 'Never declare entities, reviews, or prices in schema that are not visibly represented on the actual webpage.' },
    ],
    faqs: [
      { q: 'What is structured data / schema markup?', a: 'Structured data is standardized code placed on a webpage to provide explicit clues about page meaning and entities to search engines.' },
      { q: 'What is JSON-LD?', a: 'JSON-LD (JavaScript Object Notation for Linked Data) is the structured data format explicitly recommended by Google.' },
      { q: 'Does schema markup guarantee rich search results?', a: 'No. Schema markup qualifies your page for rich results, but search engines decide whether to show them based on query intent and page quality.' },
      { q: 'What are the most common schema types?', a: 'Common types include Organization, LocalBusiness, Article, Product, BreadcrumbList, WebApplication, and FAQPage.' },
      { q: 'How do I test rich result eligibility?', a: 'After validating syntax correctness here, test your URL with Google\'s official Rich Results Test for specific feature preview eligibility.' },
    ],
    relatedSlugs: ['open-graph-checker', 'meta-analyzer', 'website-seo-checker', 'seo-score-checker'],
  },

  'open-graph-checker': {
    title: 'Open Graph Preview — Test Social Share Cards & OG Tags | Click2Client Media',
    description: 'Preview how your link appears when shared on WhatsApp, Facebook, LinkedIn and X. Audit og:title, og:description, and og:image tags for free.',
    h1: 'Open Graph Preview & Social Meta Tag Checker',
    intro: 'Test how your webpages appear when shared across social media and chat apps, verify Open Graph and Twitter Card tags, and inspect social image assets.',
    steps: [
      { num: '01', title: 'Enter link URL', desc: 'Provide any public webpage URL to inspect its social share card appearance.' },
      { num: '02', title: 'Fetch Open Graph tags', desc: 'The checker extracts og:title, og:description, og:image, og:url, and twitter:card tags.' },
      { num: '03', title: 'Verify share image', desc: 'Verifies that the declared og:image URL loads successfully and returns HTTP 200.' },
      { num: '04', title: 'Review visual preview', desc: 'Inspect simulated social preview cards formatted for Facebook, LinkedIn, X, and WhatsApp.' },
    ],
    checks: [
      { icon: '🖼️', title: 'og:image Availability', desc: 'Verifies social image URL existence, absolute protocol, and verifies that the image returns HTTP 200.' },
      { icon: '🏷️', title: 'og:title & og:description', desc: 'Audits social headlines and summaries designed for viral social engagement.' },
      { icon: '🐦', title: 'Twitter Card Markup', desc: 'Inspects twitter:card format (summary_large_image) and associated Twitter meta tags.' },
      { icon: '📱', title: 'Visual Share Simulation', desc: 'Renders an authentic preview card showing how your link renders when shared by users.' },
    ],
    fixes: [
      { title: 'Use High-Resolution 1200×630px Images', desc: 'Ensure your og:image uses a 1.91:1 aspect ratio (1200×630 pixels) to render sharp, full-width cards on modern devices.' },
      { title: 'Always Provide an Absolute HTTPS Image URL', desc: 'Social crawlers cannot resolve relative paths; specify full addresses like https://yourdomain.com/og-image.jpg.' },
      { title: 'Write Engaging Social Headlines', desc: 'Social titles can be more conversational and benefit-driven than search engine title tags.' },
      { title: 'Refresh Platform Caches After Updates', desc: 'Use Facebook\'s Sharing Debugger and LinkedIn\'s Post Inspector to clear cached preview data after updating tags.' },
    ],
    faqs: [
      { q: 'What are Open Graph meta tags?', a: 'Open Graph tags are protocol meta tags developed by Facebook that control how URLs render when shared across social media platforms and messaging apps.' },
      { q: 'What is the recommended Open Graph image size?', a: '1200 × 630 pixels (a 1.91:1 aspect ratio) is the industry standard for sharp, edge-to-edge preview cards.' },
      { q: 'Why does my social share preview not update after changes?', a: 'Platforms like Facebook, LinkedIn, and WhatsApp cache scrape data; use their respective debug tools to force an immediate cache refresh.' },
      { q: 'Do Open Graph tags directly impact Google rankings?', a: 'While not direct Google ranking factors, compelling social cards increase referral traffic, social shares, and brand visibility.' },
      { q: 'What happens if og:image is missing?', a: 'Social platforms may display a plain text link or randomly select an arbitrary image from the page body, looking unprofessional.' },
    ],
    relatedSlugs: ['meta-analyzer', 'meta-generator', 'schema-validator', 'website-seo-checker'],
  },

  'internal-link-checker': {
    title: 'Internal Link Checker — Audit Site Architecture & Links | Click2Client Media',
    description: 'Audit internal links on any webpage. Discover unique destinations, detect missing anchor text, find nofollow attributes, and optimize link structure for free.',
    h1: 'Internal Link Checker & Architecture Audit',
    intro: 'Audit internal links on any webpage to evaluate link architecture, inspect anchor text clarity, identify nofollow attributes, and optimize PageRank flow.',
    steps: [
      { num: '01', title: 'Input webpage URL', desc: 'Enter your webpage address to discover and classify all hyperlinks on the page.' },
      { num: '02', title: 'Extract internal links', desc: 'Our crawler separates internal same-domain links from external destination links.' },
      { num: '03', title: 'Audit anchor text & attributes', desc: 'Inspects anchor text descriptiveness, counts unique destinations, and flags nofollow attributes.' },
      { num: '04', title: 'Optimize link equity', desc: 'Restructure links to distribute authority to important conversion and informational landing pages.' },
    ],
    checks: [
      { icon: '🔗', title: 'Total & Unique Internal Links', desc: 'Reports total internal links discovered alongside count of unique destination URLs.' },
      { icon: '🏷️', title: 'Anchor Text Quality', desc: 'Flags empty anchor tags or links lacking descriptive text that help crawlers understand targets.' },
      { icon: '🚫', title: 'Nofollow Attribute Audit', desc: 'Detects internal links incorrectly marked with rel="nofollow" that restrict PageRank flow.' },
      { icon: '📊', title: 'Searchable Links Table', desc: 'Complete interactive table listing every discovered anchor text paired with its destination URL.' },
    ],
    fixes: [
      { title: 'Use Descriptive Anchor Text', desc: 'Replace generic phrases like "click here" or "learn more" with keyword-rich phrases describing the target page.' },
      { title: 'Remove Nofollow on Internal Links', desc: 'Internal links should almost never have rel="nofollow"; allow search crawlers to flow freely across your domain.' },
      { title: 'Link to Important Cornerstone Pages', desc: 'Strengthen core commercial and content pages by referencing them naturally from relevant supporting articles.' },
      { title: 'Audit and Eliminate Broken Destinations', desc: 'Ensure all internal links point to active, 200 OK URLs and do not route through redirect hops.' },
    ],
    faqs: [
      { q: 'Why are internal links crucial for SEO?', a: 'Internal links establish site architecture, distribute link equity (PageRank), and help search engines discover and understand deeper pages.' },
      { q: 'What is good anchor text for internal links?', a: 'Descriptive anchor text that clearly and concisely communicates the topic and content of the destination webpage.' },
      { q: 'Should internal links ever have nofollow attributes?', a: 'Rarely. Internal links should almost always be followed so search engines can crawl, discover, and index your pages naturally.' },
      { q: 'How many internal links should a page have?', a: 'Keep link counts reasonable and focused on user relevance; avoid cluttering content with hundreds of links that dilute link value.' },
      { q: 'What is an orphan page?', a: 'An orphan page is a webpage on your site that has zero internal links pointing to it, making it extremely difficult for crawlers and users to find.' },
    ],
    relatedSlugs: ['broken-link-checker', 'redirect-checker', 'heading-checker', 'website-seo-checker'],
  },

  'broken-link-checker': {
    title: 'Broken Link Checker — Find Dead Links & 404 Errors | Click2Client Media',
    description: 'Check any webpage for broken links, dead URLs, and HTTP errors. Audit internal and external links in real time with Click2Client Media\'s free tool.',
    h1: 'Free Broken Link Checker',
    intro: 'Scan any webpage to detect dead links, 404 errors, and unreachable resources that harm user experience and waste search engine crawl budget.',
    steps: [
      { num: '01', title: 'Enter webpage address', desc: 'Input the webpage URL you wish to check for dead or failing hyperlinks.' },
      { num: '02', title: 'Extract all links', desc: 'The tool extracts all unique internal and external links found on the target webpage.' },
      { num: '03', title: 'Real-time HTTP verification', desc: 'Links are verified concurrently with live HTTP requests and status code evaluations.' },
      { num: '04', title: 'Filter & fix dead links', desc: 'Use the "Show Broken Only" filter to isolate broken URLs and remediate them immediately.' },
    ],
    checks: [
      { icon: '⛓️', title: 'Real-Time HTTP Status Audit', desc: 'Tests links and records exact response codes (200 OK, 301 Redirect, 404 Not Found, 500 Error).' },
      { icon: '🚨', title: 'Broken Link Identification', desc: 'Flags all URLs returning HTTP 4xx, 5xx, or network connection errors.' },
      { icon: '🔍', title: 'Interactive Broken Filter', desc: 'One-click filter button allows you to instantly hide working links and view only errors.' },
      { icon: '📈', title: 'Scan Coverage Tracking', desc: 'Reports total discovered links alongside total checked links (up to 30 per quick scan).' },
    ],
    fixes: [
      { title: 'Update or Remove Dead Hyperlinks', desc: 'Replace dead URLs with current working addresses or remove obsolete anchor tags from your page.' },
      { title: 'Fix URL Typos and Protocol Errors', desc: 'Check for simple typographical errors in href attributes, such as missing colons or mistyped domain names.' },
      { title: 'Implement 301 Redirects for Moved Content', desc: 'If pages on your site were relocated, configure 301 redirects to seamlessly guide users and crawlers to new URLs.' },
      { title: 'Regularly Audit Outbound Resources', desc: 'External websites frequently change URLs or shut down; periodically audit outbound links to preserve quality.' },
    ],
    faqs: [
      { q: 'What is a broken link?', a: 'A broken link (dead link) is a hyperlink that points to a non-existent or inaccessible web resource, typically returning a 404 HTTP status code.' },
      { q: 'Why are broken links detrimental to SEO?', a: 'Broken links degrade user experience, elevate bounce rates, and waste valuable search engine crawl budget on dead ends.' },
      { q: 'Does this tool check internal and external links?', a: 'Yes. It audits unique internal links to other pages on your site as well as outbound links to external domains.' },
      { q: 'How do I fix a broken link on my website?', a: 'Update the link to the correct live URL, remove the link if the resource is no longer available, or set up a 301 redirect.' },
      { q: 'How often should I scan my site for broken links?', a: 'Conduct a check at least monthly, or immediately following content migrations, redesigns, or URL restructuring.' },
    ],
    relatedSlugs: ['redirect-checker', 'internal-link-checker', 'website-seo-checker', 'canonical-checker'],
  },

  'redirect-checker': {
    title: 'Redirect Checker — Trace 301 & 302 Redirect Chains | Click2Client Media',
    description: 'Trace redirect paths, status codes, and HTTP hops in real time. Detect redirect chains, temporary 302 redirects, and preserve link equity for free.',
    h1: 'Redirect Checker & Hop Analyzer',
    intro: 'Trace the exact redirection path of any URL hop-by-hop, verify HTTP status codes, and eliminate redirect chains that slow down page load speeds.',
    steps: [
      { num: '01', title: 'Enter source URL', desc: 'Type any web address you suspect redirects to another location.' },
      { num: '02', title: 'Trace redirect hops', desc: 'Our engine follows redirects step-by-step, logging every intermediate response and location.' },
      { num: '03', title: 'Analyze hop timeline', desc: 'Inspect the visual timeline of HTTP status codes (301, 302, 307, 308) and destination addresses.' },
      { num: '04', title: 'Streamline redirect paths', desc: 'Eliminate intermediate hops by updating links and configurations to point directly to the final URL.' },
    ],
    checks: [
      { icon: '🔀', title: 'Step-by-Step Hop Timeline', desc: 'Visual timeline showing each URL hop, status badge, and target redirect location.' },
      { icon: '⚠️', title: 'Redirect Chain Detection', desc: 'Flags multi-hop chains (e.g. A → B → C) that add latency and bleed link equity.' },
      { icon: '🏷️', title: 'Temporary (302/307) Alerts', desc: 'Alerts you when temporary redirects are used where permanent 301s should be declared.' },
      { icon: '🏁', title: 'Final Destination Verification', desc: 'Confirms that the final destination URL responds cleanly with an HTTP 200 OK status.' },
    ],
    fixes: [
      { title: 'Eliminate Multi-Hop Redirect Chains', desc: 'Update internal links and configuration so URLs point directly to the final destination in a single hop.' },
      { title: 'Use Permanent 301s for Moved Content', desc: 'Use permanent 301 redirects rather than temporary 302 redirects when permanently relocating pages to transfer SEO value.' },
      { title: 'Ensure Consistent Protocol & Slashes', desc: 'Standardize on https:// and consistent trailing slash rules to avoid unnecessary canonical redirect hops.' },
      { title: 'Update Outdated Inbound References', desc: 'Update old URLs in your XML sitemaps, internal links, and external campaigns to target the live destination.' },
    ],
    faqs: [
      { q: 'What is a redirect chain?', a: 'A redirect chain occurs when there are multiple redirects between the initial requested URL and the final destination URL (e.g., URL A redirects to URL B, which redirects to URL C).' },
      { q: 'Why are redirect chains bad for SEO?', a: 'They increase page load latency, degrade mobile browsing experience, and risk search crawlers giving up before reaching the destination.' },
      { q: 'What is the difference between a 301 and a 302 redirect?', a: 'A 301 redirect indicates a permanent move and passes full link equity (PageRank); a 302 indicates a temporary move and may not pass historical search value.' },
      { q: 'Do 301 redirects pass PageRank?', a: 'Google has confirmed that 301 redirects pass PageRank without penalty; however, direct links are always faster and preferred.' },
      { q: 'How many redirect hops are acceptable?', a: 'Aim for zero hops for internal links. When redirection is necessary, it should resolve cleanly in a single hop (A → B).' },
    ],
    relatedSlugs: ['broken-link-checker', 'canonical-checker', 'robots-checker', 'website-seo-checker'],
  },
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderToolContentHtml(tool, c, waHref) {
  const steps = c.steps || [];
  const checks = c.checks || [];
  const fixes = c.fixes || [];
  const faqs = c.faqs || [];

  return `
    <section class="section tl-guide-sec" aria-labelledby="hiw-title">
      <div class="wrap">
        <div class="sec-head center reveal">
          <span class="eyebrow">Step-by-step workflow</span>
          <h2 id="hiw-title">How the ${esc(tool.name)} Works</h2>
          <p>Run a real-time diagnostic scan in four simple steps — no sign-up or software installation required.</p>
        </div>
        <ol class="tl-steps-grid" style="list-style:none;padding:0;margin:0">
          ${steps.map((s) => `
            <li class="tl-step-card reveal">
              <span class="tl-step-num">${esc(s.num)}</span>
              <h3>${esc(s.title)}</h3>
              <p>${esc(s.desc)}</p>
            </li>
          `).join('')}
        </ol>
      </div>
    </section>

    <section class="section tint tl-checks-info-sec" aria-labelledby="wtc-title">
      <div class="wrap">
        <div class="sec-head center reveal">
          <span class="eyebrow">Diagnostic coverage</span>
          <h2 id="wtc-title">What This Tool Checks</h2>
          <p>Verified against modern search engine quality guidelines and technical best practices.</p>
        </div>
        <div class="tl-features-grid">
          ${checks.map((ch) => `
            <article class="tl-feature-card reveal">
              <span class="tl-feature-icon" aria-hidden="true">${ch.icon || '🔍'}</span>
              <h3>${esc(ch.title)}</h3>
              <p>${esc(ch.desc)}</p>
            </article>
          `).join('')}
        </div>
      </div>
    </section>

    <section class="section tl-fixes-sec" aria-labelledby="htf-title">
      <div class="wrap">
        <div class="split-head reveal">
          <div class="sec-head">
            <span class="eyebrow">Practical best practices</span>
            <h2 id="htf-title">How to Fix Common Issues</h2>
          </div>
          <p>Practical steps to resolve common deficiencies and improve search visibility.</p>
        </div>
        <div class="tl-fixes-grid">
          ${fixes.map((f) => `
            <article class="tl-fix-card reveal">
              <h3>${esc(f.title)}</h3>
              <p>${esc(f.desc)}</p>
            </article>
          `).join('')}
        </div>
      </div>
    </section>

    <section class="section tint tl-faq-sec" aria-labelledby="faq-title">
      <div class="wrap">
        <div class="sec-head center reveal">
          <span class="eyebrow">Questions &amp; answers</span>
          <h2 id="faq-title">Frequently Asked Questions</h2>
          <p>Everything you need to know about using this tool and understanding your results.</p>
        </div>
        <div class="tl-faq-list">
          ${faqs.map((faq) => `
            <details class="tl-faq-item reveal">
              <summary>
                <h3>${esc(faq.q)}</h3>
                <span class="tl-faq-toggle" aria-hidden="true">▾</span>
              </summary>
              <div class="tl-faq-answer">
                <p>${esc(faq.a)}</p>
              </div>
            </details>
          `).join('')}
        </div>
      </div>
    </section>

    <section class="section tight tl-bridge-sec">
      <div class="wrap">
        <div class="cta-final reveal">
          <div>
            <span class="eyebrow">Looking for deeper analysis?</span>
            <h2>Audit Your Entire Website with Click2Client Media</h2>
            <p style="margin-top:14px;font-size:17px">Free tools analyze one page at a time. Our multi-page SEO audits crawl up to 50 pages to uncover site-wide technical bottlenecks, broken links, and metadata gaps.</p>
          </div>
          <div class="row wrap-row" style="justify-content:flex-end">
            <a class="btn white lg" href="/seo-audit#free-audit">Run Full SEO Audit →</a>
            ${waHref ? `<a class="btn glass lg" href="${esc(waHref)}" target="_blank" rel="noopener">Talk to an SEO Expert</a>` : ''}
          </div>
        </div>
      </div>
    </section>
  `;
}
