// Server-side page rendering for the public site. Pages are plain HTML files
// in /views with {{tokens}} and <!--#include name--> partials, so every piece
// of SEO-critical content and contact detail is in the HTML search engines
// receive — nothing important depends on JavaScript.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import * as store from '../store/db.js';
import { TIERS } from '../commerce/plans.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const VIEWS = path.join(here, '..', '..', 'views');
const cache = new Map();

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function read(name) {
  if (config.isProduction && cache.has(name)) return cache.get(name);
  const html = fs.readFileSync(path.join(VIEWS, name + '.html'), 'utf8');
  cache.set(name, html);
  return html;
}

export async function siteSettings() {
  // Marketing pages must render even if the database is briefly unreachable:
  // fall back to the default contact details instead of failing the page.
  try {
    return { ...config.siteDefaults, ...(await store.getSetting('site', {})) };
  } catch (err) {
    console.error('[settings] using defaults —', err.message);
    return { ...config.siteDefaults };
  }
}

export const siteUrl = (req) => config.publicUrl || `${req.protocol}://${req.get('host')}`;

export const PAGES = {
  home: { path: '/', file: 'home', title: 'Digital Marketing, SEO & Website Development Agency in India | Click2Client Media', description: 'Click2Client Media is a digital marketing agency in Madurai, Tamil Nadu, helping businesses across India and abroad grow with SEO, performance marketing and high-converting websites. Run a free SEO audit.', priority: '1.0' },
  audit: { path: '/seo-audit', file: 'seo-audit', title: 'Free SEO Audit Tool & Website SEO Analysis | Click2Client', description: "Analyze your website with Click2Client Media's SEO audit tool. Find technical, on-page and performance issues with 10, 25 and 50-page SEO audits.", priority: '0.9', crumb: 'SEO Audit' },
  services: { path: '/services', file: 'services', title: 'Digital Marketing, SEO & Website Development Services | Click2Client Media', description: 'SEO services, Google Ads and Meta Ads management, WordPress and custom website development, web applications and UI/UX design for businesses in India and internationally.', priority: '0.9', crumb: 'Services' },
  enquire: { path: '/enquire', file: 'enquire', title: 'Book a Consultation | Click2Client Media', description: 'Tell us about your business and goals. Click2Client Media will get back to you about SEO, digital marketing or website development.', priority: '0.7', crumb: 'Enquire Now' },
  privacy: { path: '/privacy-policy', file: 'privacy', title: 'Privacy Policy | Click2Client Media', description: 'How Click2Client Media collects, uses and protects your information.', priority: '0.2', crumb: 'Privacy Policy' },
  terms: { path: '/terms', file: 'terms', title: 'Terms & Conditions | Click2Client Media', description: 'Terms for using the Click2Client Media website and SEO audit services.', priority: '0.2', crumb: 'Terms & Conditions' },
  cookies: { path: '/cookie-policy', file: 'cookies', title: 'Cookie Policy | Click2Client Media', description: 'How the Click2Client Media website uses cookies.', priority: '0.2', crumb: 'Cookie Policy' },
};

function schemaFor(id, s, base) {
  const org = {
    '@type': ['Organization', 'ProfessionalService'],
    '@id': `${base}/#organization`,
    name: s.companyName,
    url: `${base}/`,
    logo: `${base}/img/click2client-media-logo.webp`,
    image: `${base}/img/click2client-media-logo.webp`,
    slogan: 'Your Digital Growth Partner',
    description: 'Digital marketing, SEO and website development company helping businesses across India and international markets.',
    telephone: s.phone,
    email: s.email,
    address: { '@type': 'PostalAddress', addressLocality: s.city, addressRegion: s.region, addressCountry: 'IN' },
    areaServed: [{ '@type': 'Country', name: 'India' }, 'Worldwide'],
    sameAs: [s.instagram, s.facebook].filter(Boolean),
    knowsAbout: ['Search Engine Optimization', 'Digital Marketing', 'Website Development', 'Performance Marketing', 'UI/UX Design', 'Web Applications'],
  };
  const graph = [org, { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: s.companyName, publisher: { '@id': `${base}/#organization` } }];
  const p = PAGES[id];
  if (p.crumb) graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` }, { '@type': 'ListItem', position: 2, name: p.crumb, item: `${base}${p.path}` }] });
  if (id === 'audit') {
    graph.push({
      '@type': 'Service', name: 'Website SEO Audit', provider: { '@id': `${base}/#organization` }, areaServed: 'Worldwide',
      offers: ['free', 'p25', 'p50'].map((t) => ({ '@type': 'Offer', name: TIERS[t].name, price: String(TIERS[t].price), priceCurrency: 'INR' })),
    });
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

function testimonialsHtml(raw) {
  const items = String(raw || '').split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((p) => p.length >= 3 && p[2]);
  if (!items.length) return '';
  return `<section class="section" aria-labelledby="t-h"><div class="wrap"><div class="sec-head reveal"><span class="eyebrow">Client feedback</span><h2 id="t-h">What Our Clients Say</h2></div>
    <div class="testimonials reveal">${items.slice(0, 6).map(([n, b, q]) => `<figure class="card testimonial"><blockquote>“${esc(q)}”</blockquote><figcaption><b>${esc(n)}</b><span>${esc(b)}</span></figcaption></figure>`).join('')}</div></div></section>`;
}

export async function renderPage(id, req) {
  const p = PAGES[id];
  const s = await siteSettings();
  const base = siteUrl(req);
  const tel = s.phone.replace(/[^\d+]/g, '');
  const wa = s.whatsapp.replace(/\D/g, '');
  const vars = {
    'title': esc(p.title),
    'description': esc(p.description),
    'canonical': esc(base + p.path),
    'base': esc(base),
    'company': esc(s.companyName),
    'phone': esc(s.phone),
    'phoneHref': esc('tel:' + tel),
    'whatsappHref': esc(`https://wa.me/${wa}?text=${encodeURIComponent('Hi Click2Client Media, I would like to know more about your services.')}`),
    'email': esc(s.email),
    'instagram': esc(s.instagram),
    'facebook': esc(s.facebook),
    'city': esc(s.city),
    'year': String(new Date().getFullYear()),
    'price.p25': String(TIERS.p25.price),
    'price.p50': String(TIERS.p50.price),
    'schema': schemaFor(id, s, base),
    'testimonials': testimonialsHtml(s.testimonials),
    'gscMeta': s.gscVerification ? `<meta name="google-site-verification" content="${esc(s.gscVerification)}">` : '',
    'analyticsNote': s.ga4Id || s.gtmId
      ? 'We use Google Analytics to understand how visitors use this website (for example, which pages are viewed and whether forms are submitted). Google Analytics sets its own cookies (named _ga). You can block them in your browser settings or with the Google Analytics opt-out browser add-on.'
      : 'The public website does not currently use advertising or analytics cookies.',
    [`nav.${id}`]: 'aria-current="page"',
  };
  let html = read(p.file);
  html = html.replace(/<!--#include (\w+)-->/g, (_, n) => read('_' + n));
  html = html.replace(/\{\{([\w.]+)\}\}/g, (_, k) => vars[k] ?? '');
  return html;
}

export function sitemap(req) {
  const base = siteUrl(req);
  const today = new Date().toISOString().slice(0, 10);
  const urls = Object.values(PAGES).map((p) => `  <url><loc>${base}${p.path}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robots(req) {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /app',
    'Disallow: /api/',
    'Disallow: /audit/',
    'Disallow: /report/',
    'Disallow: /order/',
    '',
    `Sitemap: ${siteUrl(req)}/sitemap.xml`,
    '',
  ].join('\n');
}
