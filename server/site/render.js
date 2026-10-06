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
import { portfolioVars, homeWorkHtml, projectVars, listProjects } from '../portfolio.js';
import { blogListVars, postVars, publishedPosts } from '../blog.js';

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
  portfolio: { path: '/portfolio', file: 'portfolio', title: 'Portfolio — Websites, SEO, Social Media, Ads & UI/UX Work | Click2Client Media', description: 'A curated showcase of websites, SEO campaigns, social media strategies, advertising campaigns and UI/UX experiences created by Click2Client Media for brands and businesses.', priority: '0.8', crumb: 'Portfolio' },
  products: { path: '/products', file: 'products', title: 'Products — ATS, AI Quiz, Productivity & CRM Systems | Click2Client Media', description: 'Ready-made digital systems from Click2Client Media: an ATS for recruitment, an AI quiz system, a productivity / to-do system and a CRM for managing leads and customers.', priority: '0.8', crumb: 'Products' },
  about: { path: '/about', file: 'about', title: 'About Click2Client Media — Digital Marketing, SEO & Web Development, Madurai', description: 'Click2Client Media is a Madurai-based digital growth company for SEO, performance marketing, websites and web applications, founded by Hari.', priority: '0.6', crumb: 'About' },
  blog: { path: '/blog', file: 'blog', title: 'Blog — SEO, Digital Marketing & Website Tips | Click2Client Media', description: 'Practical guides on SEO, Google and Meta Ads, websites and lead generation from Click2Client Media, a digital marketing agency in Madurai.', priority: '0.8', crumb: 'Blog' },
  services: { path: '/services', file: 'services', title: 'Digital Marketing, SEO & Website Development Services | Click2Client Media', description: 'SEO services, Google Ads and Meta Ads management, WordPress and custom website development, web applications and UI/UX design for businesses in India and internationally.', priority: '0.9', crumb: 'Services' },
  enquire: { path: '/enquire', file: 'enquire', title: 'Book a Consultation | Click2Client Media', description: 'Tell us about your business and goals. Click2Client Media will get back to you about SEO, digital marketing or website development.', priority: '0.7', crumb: 'Enquire Now' },
  privacy: { path: '/privacy-policy', file: 'privacy', title: 'Privacy Policy | Click2Client Media', description: 'How Click2Client Media collects, uses and protects your information.', priority: '0.2', crumb: 'Privacy Policy' },
  terms: { path: '/terms', file: 'terms', title: 'Terms & Conditions | Click2Client Media', description: 'Terms for using the Click2Client Media website and SEO audit services.', priority: '0.2', crumb: 'Terms & Conditions' },
  cookies: { path: '/cookie-policy', file: 'cookies', title: 'Cookie Policy | Click2Client Media', description: 'How the Click2Client Media website uses cookies.', priority: '0.2', crumb: 'Cookie Policy' },
};

function schemaFor(id, s, base, p = PAGES[id]) {
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
    founder: { '@type': 'Person', name: 'Hari', jobTitle: 'Founder', image: `${base}/img/founder-hari.webp` },
  };
  const graph = [org, { '@type': 'WebSite', '@id': `${base}/#website`, url: `${base}/`, name: s.companyName, publisher: { '@id': `${base}/#organization` } }];
  if (p.post) {
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` }, { '@type': 'ListItem', position: 2, name: 'Blog', item: `${base}/blog` }, { '@type': 'ListItem', position: 3, name: p.post.title, item: `${base}${p.path}` }] });
    graph.push({ '@type': 'BlogPosting', headline: p.post.title, description: p.description, datePublished: p.post.date, dateModified: p.post.updated || p.post.date, author: { '@type': 'Person', name: p.post.author || 'Hari' }, publisher: { '@id': `${base}/#organization` }, mainEntityOfPage: `${base}${p.path}`, ...(p.image ? { image: p.image } : {}) });
  } else if (p.trail) {
    graph.push({ '@type': 'BreadcrumbList', itemListElement: p.trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: `${base}${t.path}` })) });
    if (p.extraSchema) graph.push(p.extraSchema);
  } else if (p.crumb) graph.push({ '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: `${base}/` }, { '@type': 'ListItem', position: 2, name: p.crumb, item: `${base}${p.path}` }] });
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

export async function renderPage(id, req, override = {}) {
  const p = override.page || PAGES[id];
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
    'schema': schemaFor(id, s, base, p),
    'ogImage': esc(`${base}/img/click2client-media-logo.webp`),
    'ogType': 'website',
    'testimonials': testimonialsHtml(s.testimonials),
    'gscMeta': s.gscVerification ? `<meta name="google-site-verification" content="${esc(s.gscVerification)}">` : '',
    'analyticsNote': s.ga4Id || s.gtmId
      ? 'We use Google Analytics to understand how visitors use this website (for example, which pages are viewed and whether forms are submitted). Google Analytics sets its own cookies (named _ga). You can block them in your browser settings or with the Google Analytics opt-out browser add-on.'
      : 'The public website does not currently use advertising or analytics cookies.',
    [`nav.${p.nav || id}`]: 'aria-current="page"',
  };
  if (id === 'portfolio') Object.assign(vars, await portfolioVars());
  if (id === 'blog') Object.assign(vars, await blogListVars());
  if (id === 'home') vars['home.work'] = await homeWorkHtml();
  Object.assign(vars, override.vars);
  let html = read(p.file);
  html = html.replace(/<!--#include (\w+)-->/g, (_, n) => read('_' + n));
  html = html.replace(/\{\{([\w.]+)\}\}/g, (_, k) => vars[k] ?? '');
  return html;
}

/** A published blog post, rendered with the shared head/header/footer. */
export async function renderPost(req, post) {
  const base = siteUrl(req);
  const v = await postVars(post, base);
  const page = { path: `/blog/${post.id}`, file: 'blog-post', nav: 'blog', title: `${post.title} | Click2Client Media Blog`, description: post.excerpt || post.title, post, image: post.cover ? v.ogImage : '' };
  return renderPage('blogPost', req, { page, vars: v });
}

/** A portfolio project page (also used for an admin preview of a draft). */
export async function renderProject(req, project) {
  const base = siteUrl(req);
  const v = await projectVars(project, base);
  const path = `/portfolio/${project.slug}`;
  const page = {
    path, file: 'portfolio-project', nav: 'portfolio', title: v['wk.seoTitle'], description: project.short_description,
    trail: [{ name: 'Home', path: '/' }, { name: 'Portfolio', path: '/portfolio' }, { name: project.title, path }],
    extraSchema: { '@type': 'CreativeWork', name: project.title, description: project.short_description, url: `${base}${path}`, creator: { '@id': `${base}/#organization` }, ...(project.cover_image ? { image: v.ogImage } : {}), ...(project.year ? { dateCreated: project.year } : {}) },
  };
  return renderPage('portfolioProject', req, { page, vars: v });
}

export async function sitemap(req) {
  const base = siteUrl(req);
  const today = new Date().toISOString().slice(0, 10);
  const posts = await publishedPosts().catch(() => []);
  const works = await listProjects().catch(() => []);
  const urls = [
    ...Object.values(PAGES).map((p) => `  <url><loc>${base}${p.path}</loc><lastmod>${today}</lastmod><priority>${p.priority}</priority></url>`),
    ...posts.map((p) => `  <url><loc>${base}/blog/${p.id}</loc><lastmod>${(p.updated || p.date).slice(0, 10)}</lastmod><priority>0.7</priority></url>`),
    ...works.map((p) => `  <url><loc>${base}/portfolio/${p.slug}</loc><lastmod>${String(p.updated_at).slice(0, 10)}</lastmod><priority>0.6</priority></url>`),
  ].join('\n');
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
