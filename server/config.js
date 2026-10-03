// Central configuration. Secrets are read from the environment on the server
// only; the browser only ever sees the public contact details and booleans.

const env = process.env;

const int = (v, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  port: int(env.PORT, 3000),
  publicUrl: (env.PUBLIC_URL || '').replace(/\/$/, ''),
  dataDir: env.DATA_DIR || './data',
  isProduction: env.NODE_ENV === 'production',

  crawler: {
    userAgent:
      env.CRAWLER_USER_AGENT ||
      'Mozilla/5.0 (compatible; Click2ClientSEOAudit/1.0; +https://click2clientmedia.com/seo-audit)',
    requestTimeoutMs: int(env.CRAWLER_TIMEOUT_MS, 15000),
    maxHtmlBytes: int(env.CRAWLER_MAX_HTML_BYTES, 5 * 1024 * 1024),
    concurrency: int(env.CRAWLER_CONCURRENCY, 3),
    linkCheckLimit: int(env.LINK_CHECK_LIMIT, 60),
    maxPagesCeiling: int(env.MAX_PAGES_CEILING, 100),
    allowPrivateHosts: env.ALLOW_PRIVATE_HOSTS === 'true',
  },

  ai: {
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN) && env.AI_DISABLED !== 'true',
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    effort: env.ANTHROPIC_EFFORT || 'medium',
  },

  pagespeed: {
    apiKey: env.PAGESPEED_API_KEY || '',
    enabled: env.PAGESPEED_DISABLED !== 'true',
  },

  backlinks: {
    provider: env.BACKLINK_PROVIDER || (env.DATAFORSEO_LOGIN ? 'dataforseo' : ''),
    dataforseoLogin: env.DATAFORSEO_LOGIN || '',
    dataforseoPassword: env.DATAFORSEO_PASSWORD || '',
  },

  traffic: { provider: env.TRAFFIC_PROVIDER || '' },

  email: {
    resendApiKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || '',
    notifyTo: env.NOTIFY_EMAIL || '',
  },

  leads: { webhookUrl: env.LEAD_WEBHOOK_URL || '' },

  admin: {
    // The initial admin password. Prefer ADMIN_PASSWORD_HASH (scrypt, see
    // README) in production; ADMIN_PASSWORD is hashed in memory at start-up
    // and never stored or sent anywhere in plain text.
    password: env.ADMIN_PASSWORD || '2004',
    passwordHash: env.ADMIN_PASSWORD_HASH || '',
    sessionHours: int(env.ADMIN_SESSION_HOURS, 8),
  },

  // Audit prices live on the server only. The browser never decides the amount.
  pricing: {
    p25: int(env.PRICE_25_PAGE_AUDIT, 125),
    p50: int(env.PRICE_50_PAGE_AUDIT, 399),
  },

  // Defaults for the site settings an admin can edit in the portal.
  siteDefaults: {
    companyName: 'Click2Client Media',
    phone: env.CONTACT_PHONE || '+91 99404 11837',
    whatsapp: env.WHATSAPP_NUMBER || '919940411837',
    email: env.CONTACT_EMAIL || 'harithph5@gmail.com',
    instagram: env.INSTAGRAM_URL || 'https://www.instagram.com/click2client_media/?hl=en',
    facebook: env.FACEBOOK_URL || 'https://www.facebook.com/profile.php?id=61589983354793',
    city: 'Madurai',
    region: 'Tamil Nadu',
    country: 'India',
    upiId: env.UPI_ID || '',
    payeeName: env.UPI_PAYEE_NAME || 'Click2Client Media',
    testimonials: '',
    reportFooter: 'This report reflects data collected at the time of the audit. Search rankings depend on many factors; no ranking outcome is guaranteed.',
  },
};

export function integrationStatus() {
  return [
    { id: 'crawler', name: 'Website crawler & HTML parser', required: true, configured: true, envVars: [], usedFor: 'Fetching pages, robots.txt, sitemaps, link checks, TLS inspection.' },
    { id: 'ai', name: 'Anthropic Claude (consultant layer)', required: false, configured: config.ai.enabled, envVars: ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'ANTHROPIC_EFFORT'], usedFor: 'Executive summary and contextual notes on paid reports. Rule library is used otherwise.' },
    { id: 'pagespeed', name: 'Google PageSpeed Insights', required: false, configured: Boolean(config.pagespeed.apiKey), partiallyAvailable: config.pagespeed.enabled && !config.pagespeed.apiKey, envVars: ['PAGESPEED_API_KEY'], usedFor: 'Lab performance scores and Core Web Vitals.' },
    { id: 'backlinks', name: 'Backlink provider (DataForSEO)', required: false, configured: config.backlinks.provider === 'dataforseo' && Boolean(config.backlinks.dataforseoPassword), envVars: ['BACKLINK_PROVIDER', 'DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'], usedFor: 'Backlink totals. Never estimated.' },
    { id: 'email', name: 'Email delivery (Resend)', required: false, configured: Boolean(config.email.resendApiKey && config.email.from), envVars: ['RESEND_API_KEY', 'EMAIL_FROM', 'NOTIFY_EMAIL'], usedFor: 'Report-ready emails to customers, new-lead alerts to you.' },
    { id: 'leadWebhook', name: 'Lead webhook (CRM / Sheets)', required: false, configured: Boolean(config.leads.webhookUrl), envVars: ['LEAD_WEBHOOK_URL'], usedFor: 'Forwarding leads to your CRM.' },
    { id: 'gateway', name: 'Payment gateway (Razorpay / Cashfree)', required: false, configured: false, envVars: ['(adapter slot — server/commerce/payments.js)'], usedFor: 'Automatic UPI/card payments. Currently manual QR + WhatsApp verification.' },
  ];
}
