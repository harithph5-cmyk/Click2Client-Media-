// Technology & analytics fingerprinting from HTML, script URLs, headers and
// cookies. Each detection carries the evidence that triggered it.

const TECH = [
  // CMS / platforms
  { name: 'WordPress', category: 'CMS', html: [/\/wp-content\//i, /\/wp-includes\//i], generator: /wordpress/i },
  { name: 'WooCommerce', category: 'E-commerce', html: [/woocommerce/i], generator: /woocommerce/i },
  { name: 'Shopify', category: 'E-commerce', html: [/cdn\.shopify\.com/i, /Shopify\.theme/], header: { 'x-shopid': /./, 'x-shopify-stage': /./ } },
  { name: 'Wix', category: 'Website builder', html: [/static\.wixstatic\.com/i, /wix-code/i], header: { 'x-wix-request-id': /./ } },
  { name: 'Squarespace', category: 'Website builder', html: [/static1\.squarespace\.com/i], generator: /squarespace/i },
  { name: 'Webflow', category: 'Website builder', html: [/data-wf-page/i, /webflow\.js/i], generator: /webflow/i },
  { name: 'Drupal', category: 'CMS', html: [/\/sites\/default\/files/i, /drupal-settings-json/i], generator: /drupal/i, header: { 'x-generator': /drupal/i } },
  { name: 'Joomla', category: 'CMS', html: [/\/media\/jui\//i], generator: /joomla/i },
  { name: 'Magento', category: 'E-commerce', html: [/Magento_/, /mage\/cookies/i] },
  { name: 'Ghost', category: 'CMS', generator: /ghost/i },
  { name: 'Blogger', category: 'CMS', generator: /blogger/i },
  { name: 'Zoho Sites', category: 'Website builder', html: [/zohositescontent|sites\.zoho/i] },
  // WP builders & SEO plugins
  { name: 'Elementor', category: 'Page builder', html: [/elementor/i] },
  { name: 'Divi', category: 'Page builder', html: [/et_pb_|\/Divi\//] },
  { name: 'WPBakery', category: 'Page builder', html: [/vc_row|js_composer/i] },
  { name: 'Yoast SEO', category: 'SEO plugin', html: [/yoast seo plugin|yoast-schema-graph/i] },
  { name: 'Rank Math', category: 'SEO plugin', html: [/rank math|rank-math/i] },
  { name: 'All in One SEO', category: 'SEO plugin', html: [/all in one seo|aioseo/i] },
  // JS frameworks
  { name: 'Next.js', category: 'JS framework', html: [/__NEXT_DATA__|\/_next\/static\//], header: { 'x-powered-by': /next\.js/i } },
  { name: 'Nuxt', category: 'JS framework', html: [/__NUXT__|\/_nuxt\//] },
  { name: 'Gatsby', category: 'JS framework', html: [/___gatsby/] },
  { name: 'React', category: 'JS library', html: [/data-reactroot|react(-dom)?(\.production)?(\.min)?\.js/i] },
  { name: 'Vue.js', category: 'JS library', html: [/vue(\.runtime)?(\.global)?(\.prod)?(\.min)?\.js|data-v-[0-9a-f]{8}/i] },
  { name: 'Angular', category: 'JS framework', html: [/ng-version=/i] },
  { name: 'jQuery', category: 'JS library', html: [/jquery(\.min)?\.js|jquery-\d/i] },
  { name: 'Bootstrap', category: 'CSS framework', html: [/bootstrap(\.bundle)?(\.min)?\.(css|js)/i] },
  { name: 'Tailwind CSS', category: 'CSS framework', html: [/tailwind(\.min)?\.css|cdn\.tailwindcss\.com/i] },
  // Hosting / CDN / server
  { name: 'Cloudflare', category: 'CDN', header: { server: /cloudflare/i, 'cf-ray': /./ } },
  { name: 'Amazon CloudFront', category: 'CDN', header: { via: /cloudfront/i, 'x-amz-cf-id': /./ } },
  { name: 'Akamai', category: 'CDN', header: { 'x-akamai-transformed': /./, server: /akamai/i } },
  { name: 'Fastly', category: 'CDN', header: { 'x-served-by': /cache-/i, via: /varnish/i } },
  { name: 'Vercel', category: 'Hosting', header: { server: /vercel/i, 'x-vercel-id': /./ } },
  { name: 'Netlify', category: 'Hosting', header: { server: /netlify/i, 'x-nf-request-id': /./ } },
  { name: 'Hostinger', category: 'Hosting', header: { platform: /hostinger/i, 'x-hcdn-request-id': /./ } },
  { name: 'Nginx', category: 'Web server', header: { server: /nginx/i } },
  { name: 'Apache', category: 'Web server', header: { server: /apache/i } },
  { name: 'LiteSpeed', category: 'Web server', header: { server: /litespeed/i } },
  { name: 'Microsoft IIS', category: 'Web server', header: { server: /iis/i } },
  { name: 'PHP', category: 'Language', header: { 'x-powered-by': /php/i }, cookie: /PHPSESSID/ },
  { name: 'ASP.NET', category: 'Language', header: { 'x-powered-by': /asp\.net/i, 'x-aspnet-version': /./ } },
  { name: 'WP Rocket', category: 'Performance', html: [/wp-rocket/i] },
  { name: 'LiteSpeed Cache', category: 'Performance', html: [/litespeed-cache|litespeed\/(js|css)/i], header: { 'x-litespeed-cache': /./ } },
  // Widgets & services
  { name: 'Google Fonts', category: 'Fonts', html: [/fonts\.googleapis\.com/i] },
  { name: 'Font Awesome', category: 'Fonts', html: [/font-?awesome/i] },
  { name: 'Google reCAPTCHA', category: 'Security', html: [/recaptcha/i] },
  { name: 'HubSpot', category: 'Marketing', html: [/js\.hs-scripts\.com|hs-analytics/i] },
  { name: 'Zoho SalesIQ', category: 'Live chat', html: [/salesiq\.zoho/i] },
  { name: 'Tawk.to', category: 'Live chat', html: [/embed\.tawk\.to/i] },
  { name: 'Intercom', category: 'Live chat', html: [/widget\.intercom\.io/i] },
  { name: 'WhatsApp chat widget', category: 'Live chat', html: [/wa\.me\/|api\.whatsapp\.com\/send/i] },
  { name: 'Razorpay', category: 'Payments', html: [/checkout\.razorpay\.com/i] },
  { name: 'Stripe', category: 'Payments', html: [/js\.stripe\.com/i] },
  { name: 'Google Maps embed', category: 'Maps', html: [/google\.com\/maps\/embed|maps\.googleapis\.com/i] },
  { name: 'YouTube embed', category: 'Video', html: [/youtube(-nocookie)?\.com\/embed/i] },
];

const ANALYTICS = [
  { name: 'Google Analytics 4', re: /gtag\/js\?id=G-[A-Z0-9]+|['"]G-[A-Z0-9]{6,}['"]/, idRe: /G-[A-Z0-9]{6,}/ },
  { name: 'Google Tag Manager', re: /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/, idRe: /GTM-[A-Z0-9]{4,}/ },
  { name: 'Universal Analytics (retired)', re: /UA-\d{4,}-\d+|google-analytics\.com\/analytics\.js/, idRe: /UA-\d{4,}-\d+/ },
  { name: 'Google Ads conversion tag', re: /AW-\d{6,}/, idRe: /AW-\d{6,}/ },
  { name: 'Meta (Facebook) Pixel', re: /connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(['"]init/ },
  { name: 'Microsoft Clarity', re: /clarity\.ms\/tag/ },
  { name: 'Hotjar', re: /static\.hotjar\.com|hjSiteSettings/ },
  { name: 'LinkedIn Insight Tag', re: /snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/ },
  { name: 'Matomo', re: /matomo\.js|piwik\.js|_paq\.push/ },
  { name: 'Plausible', re: /plausible\.io\/js/ },
  { name: 'Microsoft UET (Bing Ads)', re: /bat\.bing\.com\/bat\.js/ },
  { name: 'Yandex Metrica', re: /mc\.yandex\.ru\/metrika/ },
  { name: 'TikTok Pixel', re: /analytics\.tiktok\.com/ },
  { name: 'Site Kit by Google', re: /google-site-kit|googlesitekit/ },
];

export function detectTechnologies(html, page, headers = {}) {
  const found = [];
  const scriptBlob = page.scripts.join('\n');
  const generator = page.generator.join(' ');
  for (const t of TECH) {
    const evidence = [];
    if (t.generator && t.generator.test(generator)) evidence.push(`meta generator: "${generator.slice(0, 80)}"`);
    for (const re of t.html || []) {
      const m = re.exec(scriptBlob) || re.exec(html);
      if (m) { evidence.push(`page source contains "${m[0].slice(0, 60)}"`); break; }
    }
    for (const [h, re] of Object.entries(t.header || {})) {
      if (headers[h] && re.test(headers[h])) { evidence.push(`HTTP header ${h}: ${headers[h].slice(0, 60)}`); break; }
    }
    if (t.cookie && t.cookie.test(headers['set-cookie'] || '')) evidence.push('cookie name match');
    if (evidence.length) found.push({ name: t.name, category: t.category, evidence: evidence[0], confidence: t.generator && evidence[0].startsWith('meta') ? 'verified' : 'detected' });
  }
  // Version from generator where present (e.g. WordPress 6.6.2)
  const ver = /WordPress\s+([\d.]+)/i.exec(generator);
  if (ver) {
    const wp = found.find((f) => f.name === 'WordPress');
    if (wp) wp.version = ver[1];
  }
  return {
    detected: found,
    server: headers.server || null,
    poweredBy: headers['x-powered-by'] || null,
    checkedSignatures: TECH.length,
    note: 'Detection is based on fingerprints in the HTML, script URLs and HTTP headers of the pages crawled. Technologies loaded only after user interaction, or hidden by the server, may not be detected.',
  };
}

export function detectAnalytics(html, page) {
  const haystack = html + '\n' + page.scripts.join('\n');
  const tools = [];
  for (const a of ANALYTICS) {
    const m = a.re.exec(haystack);
    if (m) {
      const ids = a.idRe ? [...new Set(haystack.match(new RegExp(a.idRe.source, 'g')) || [])].slice(0, 5) : [];
      tools.push({ name: a.name, status: 'detected', evidence: m[0].slice(0, 80), ids });
    }
  }
  const hasGtm = tools.some((t) => t.name === 'Google Tag Manager');
  const consentTool = /cookiebot|onetrust|cookieyes|complianz|cookie-law-info|iubenda|termly/i.exec(haystack)?.[0] || null;
  return {
    tools,
    consentManager: consentTool,
    status: tools.length ? 'detected' : 'not_detected',
    note: tools.length
      ? hasGtm
        ? 'Google Tag Manager is present. Tags fired inside GTM (including GA4) are not visible in page source, so additional tools may be active.'
        : null
      : `No analytics tags were found in the page source.${consentTool ? ` A consent manager (${consentTool}) was detected — tags may load only after consent.` : ''} This does not prove analytics is absent: tags can be injected by a tag manager, server-side tagging or after consent.`,
  };
}
