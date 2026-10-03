// HTML → structured, factual page evidence. No judgement happens here; the
// rule engine reads this object and decides what is a problem.

import * as cheerio from 'cheerio';

const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();

function resolve(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function sameSite(a, b) {
  try {
    const strip = (h) => h.replace(/^www\./, '');
    return strip(new URL(a).hostname) === strip(new URL(b).hostname);
  } catch {
    return false;
  }
}

export function parsePage(html, pageUrl) {
  const $ = cheerio.load(html);
  const base = resolve($('base[href]').attr('href') || '', pageUrl) || pageUrl;
  const isHttps = pageUrl.startsWith('https:');

  const titles = $('title').filter((_, el) => $(el).closest('svg').length === 0).map((_, el) => clean($(el).text())).get();
  const metaContent = (sel) => $(sel).map((_, el) => clean($(el).attr('content'))).get();
  const descriptions = metaContent('meta[name="description" i]');

  const headings = { h1: [], h2: [], h3: [], h4: [], h5: [], h6: [] };
  const headingOrder = [];
  $('h1,h2,h3,h4,h5,h6').each((_, el) => {
    const level = el.tagName.toLowerCase();
    const text = clean($(el).text());
    headings[level].push(text);
    headingOrder.push({ level: Number(level[1]), text });
  });

  const og = {};
  $('meta[property^="og:"]').each((_, el) => { og[$(el).attr('property').toLowerCase()] = clean($(el).attr('content')); });
  const twitter = {};
  $('meta[name^="twitter:" i], meta[property^="twitter:" i]').each((_, el) => {
    const k = ($(el).attr('name') || $(el).attr('property')).toLowerCase();
    twitter[k] = clean($(el).attr('content'));
  });

  const jsonLd = [];
  const jsonLdErrors = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const data = JSON.parse(raw);
      const collect = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(collect);
        if (node['@type']) jsonLd.push(...[].concat(node['@type']).map(String));
        if (node['@graph']) collect(node['@graph']);
      };
      collect(data);
    } catch {
      jsonLdErrors.push(raw.slice(0, 120));
    }
  });

  const images = [];
  $('img').each((_, el) => {
    const $el = $(el);
    const rawSrc = $el.attr('src') || $el.attr('data-src') || $el.attr('data-lazy-src') || ($el.attr('srcset') || '').split(/\s+/)[0] || '';
    const src = rawSrc.startsWith('data:') ? null : resolve(rawSrc, base);
    const altAttr = $el.attr('alt');
    let filename = '';
    try { filename = src ? decodeURIComponent(new URL(src).pathname.split('/').pop()) : '(inline data image)'; } catch { filename = ''; }
    const linkParent = $el.closest('a').attr('href');
    const ctx = clean($el.closest('figure').find('figcaption').text()) || clean($el.parent().text()).slice(0, 90);
    images.push({
      src: src || '(inline data URI)',
      alt: altAttr === undefined ? null : clean(altAttr),
      filename,
      width: $el.attr('width') || null,
      height: $el.attr('height') || null,
      loading: $el.attr('loading') || null,
      inLink: linkParent ? resolve(linkParent, base) : null,
      context: ctx,
    });
  });

  const links = [];
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = ($el.attr('href') || '').trim();
    if (!href || href.startsWith('javascript:')) return;
    const rel = ($el.attr('rel') || '').toLowerCase();
    let anchor = clean($el.text());
    if (!anchor) anchor = clean($el.attr('aria-label') || $el.attr('title') || $el.find('img').attr('alt') || '');
    if (href.startsWith('#')) {
      links.push({ href, url: null, anchor, type: 'in-page', rel });
      return;
    }
    if (/^(mailto|tel|sms|whatsapp):/i.test(href)) {
      links.push({ href, url: href, anchor, type: href.split(':')[0].toLowerCase(), rel });
      return;
    }
    const abs = resolve(href, base);
    if (!abs || !/^https?:/.test(abs)) return;
    links.push({
      href,
      url: abs.split('#')[0],
      anchor,
      type: sameSite(abs, pageUrl) ? 'internal' : 'external',
      rel,
      nofollow: rel.includes('nofollow') || rel.includes('ugc') || rel.includes('sponsored'),
      newTab: $el.attr('target') === '_blank',
    });
  });

  const scripts = $('script[src]').map((_, el) => resolve($(el).attr('src'), base)).get().filter(Boolean);
  const inlineScripts = $('script:not([src])').map((_, el) => $(el).contents().text()).get().join('\n').slice(0, 400000);
  const stylesheets = $('link[rel~="stylesheet" i]').map((_, el) => resolve($(el).attr('href'), base)).get().filter(Boolean);
  const inlineStyles = $('style').map((_, el) => $(el).contents().text()).get().join('\n');

  const mixedContent = [];
  if (isHttps) {
    $('img[src^="http:"], script[src^="http:"], iframe[src^="http:"], source[src^="http:"], video[src^="http:"], audio[src^="http:"]').each((_, el) => {
      mixedContent.push({ tag: el.tagName.toLowerCase(), url: $(el).attr('src') });
    });
    $('link[href^="http:"]').each((_, el) => {
      const rel = ($(el).attr('rel') || '').toLowerCase();
      if (/stylesheet|icon|preload/.test(rel)) mixedContent.push({ tag: 'link', url: $(el).attr('href') });
    });
  }

  const hreflang = $('link[rel="alternate" i][hreflang]').map((_, el) => ({
    lang: $(el).attr('hreflang'),
    href: resolve($(el).attr('href'), base),
  })).get();

  const canonicals = $('link[rel="canonical" i]').map((_, el) => ({
    raw: $(el).attr('href') || '',
    resolved: resolve($(el).attr('href') || '', base),
  })).get();

  const favicon = $('link[rel~="icon" i]').first().attr('href');
  const appleTouch = $('link[rel="apple-touch-icon" i]').length > 0;
  const generator = metaContent('meta[name="generator" i]');

  // Visible text: strip non-content elements on a clone.
  const $body = $('body').clone();
  $body.find('script,style,noscript,svg,template,iframe').remove();
  const text = clean($body.text());
  const words = text ? text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)) : [];

  const doctypeMatch = /^\s*(?:<!--[\s\S]*?-->\s*)*<!doctype\s+([^>]+)>/i.exec(html);

  return {
    title: { values: titles, text: titles[0] ?? null },
    metaDescription: { values: descriptions, text: descriptions[0] ?? null },
    metaKeywords: metaContent('meta[name="keywords" i]')[0] ?? null,
    metaRobots: metaContent('meta[name="robots" i], meta[name="googlebot" i]'),
    viewport: metaContent('meta[name="viewport" i]')[0] ?? null,
    charset: $('meta[charset]').attr('charset') || (/charset=([\w-]+)/i.exec($('meta[http-equiv="content-type" i]').attr('content') || '')?.[1] ?? null),
    lang: $('html').attr('lang') || null,
    doctype: doctypeMatch ? clean(doctypeMatch[1]) : null,
    canonicals,
    hreflang,
    headings,
    headingOrder,
    og,
    twitter,
    jsonLd: [...new Set(jsonLd)],
    jsonLdErrors,
    hasMicrodata: $('[itemscope]').length > 0,
    images,
    links,
    scripts,
    inlineScripts,
    stylesheets,
    inlineStyles: inlineStyles.slice(0, 200000),
    mixedContent,
    favicon: favicon ? resolve(favicon, base) : null,
    appleTouchIcon: appleTouch,
    generator,
    iframes: $('iframe').map((_, el) => resolve($(el).attr('src') || '', base)).get().filter(Boolean),
    deprecatedTags: ['font', 'center', 'marquee', 'blink', 'frame', 'frameset'].filter((t) => $(t).length > 0),
    flash: $('object[type*="flash"], embed[src$=".swf"]').length > 0,
    forms: $('form').length,
    text: text.slice(0, 60000),
    wordCount: words.length,
    htmlBytes: Buffer.byteLength(html, 'utf8'),
    textBytes: Buffer.byteLength(text, 'utf8'),
    resourceCounts: {
      scripts: scripts.length,
      inlineScripts: $('script:not([src])').length,
      stylesheets: stylesheets.length,
      images: images.length,
      iframes: $('iframe').length,
    },
    bodyChildren: $('body').children().length,
    emptyAppRoot: ['#root', '#app', '#__next', '#__nuxt'].some((s) => $(s).length && !clean($(s).text())),
  };
}
