// Performance data. Two sources, always labelled separately:
//  1. "measured" — our own server-side timing of the HTML response.
//  2. "pagespeed" — Google PageSpeed Insights (Lighthouse lab + CrUX field data).
// Core Web Vitals are only shown when PageSpeed actually returns them.

import { config } from '../config.js';

const PSI = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

function metric(audits, id) {
  const a = audits?.[id];
  if (!a) return null;
  return { value: a.numericValue ?? null, display: a.displayValue ?? null, score: a.score ?? null };
}

function fieldMetric(m) {
  if (!m) return null;
  return { percentile: m.percentile, category: m.category };
}

async function runStrategy(url, strategy) {
  const params = new URLSearchParams({ url, strategy, category: 'performance' });
  if (config.pagespeed.apiKey) params.set('key', config.pagespeed.apiKey);
  let res;
  try {
    res = await fetch(`${PSI}?${params}`, { signal: AbortSignal.timeout(60000) });
  } catch (e) {
    return { strategy, available: false, error: e.name === 'TimeoutError' ? 'PageSpeed Insights timed out (60s).' : 'PageSpeed Insights could not be reached.' };
  }
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const quota = res.status === 429 || /quota/i.test(msg);
    return {
      strategy,
      available: false,
      error: quota
        ? 'PageSpeed Insights quota exceeded. Add a PAGESPEED_API_KEY to raise the limit.'
        : `PageSpeed Insights returned an error: ${msg.slice(0, 200)}`,
    };
  }
  const lh = json.lighthouseResult;
  const audits = lh?.audits || {};
  const field = json.loadingExperience?.metrics;
  const hasField = field && json.loadingExperience?.id && !json.loadingExperience?.origin_fallback;
  const originField = json.originLoadingExperience?.metrics;

  const opportunities = Object.values(audits)
    .filter((a) => a.details?.type === 'opportunity' && a.score !== null && a.score < 0.9 && (a.details.overallSavingsMs || 0) > 100)
    .sort((a, b) => (b.details.overallSavingsMs || 0) - (a.details.overallSavingsMs || 0))
    .slice(0, 6)
    .map((a) => ({ id: a.id, title: a.title, savingsMs: Math.round(a.details.overallSavingsMs || 0), display: a.displayValue || null }));

  return {
    strategy,
    available: true,
    fetchedAt: lh?.fetchTime || null,
    lighthouseVersion: lh?.lighthouseVersion || null,
    score: lh?.categories?.performance?.score != null ? Math.round(lh.categories.performance.score * 100) : null,
    lab: {
      fcp: metric(audits, 'first-contentful-paint'),
      lcp: metric(audits, 'largest-contentful-paint'),
      tbt: metric(audits, 'total-blocking-time'),
      cls: metric(audits, 'cumulative-layout-shift'),
      si: metric(audits, 'speed-index'),
      tti: metric(audits, 'interactive'),
    },
    totalByteWeight: audits['total-byte-weight']?.numericValue ?? null,
    requestCount: audits['network-requests']?.details?.items?.length ?? null,
    field: hasField
      ? {
          scope: 'url',
          overall: json.loadingExperience.overall_category || null,
          lcp: fieldMetric(field.LARGEST_CONTENTFUL_PAINT_MS),
          inp: fieldMetric(field.INTERACTION_TO_NEXT_PAINT),
          cls: fieldMetric(field.CUMULATIVE_LAYOUT_SHIFT_SCORE),
          fcp: fieldMetric(field.FIRST_CONTENTFUL_PAINT_MS),
          ttfb: fieldMetric(field.EXPERIMENTAL_TIME_TO_FIRST_BYTE),
        }
      : originField
        ? {
            scope: 'origin',
            overall: json.originLoadingExperience.overall_category || null,
            lcp: fieldMetric(originField.LARGEST_CONTENTFUL_PAINT_MS),
            inp: fieldMetric(originField.INTERACTION_TO_NEXT_PAINT),
            cls: fieldMetric(originField.CUMULATIVE_LAYOUT_SHIFT_SCORE),
            fcp: fieldMetric(originField.FIRST_CONTENTFUL_PAINT_MS),
            ttfb: fieldMetric(originField.EXPERIMENTAL_TIME_TO_FIRST_BYTE),
          }
        : null,
    opportunities,
    viewportAudit: audits.viewport ? { score: audits.viewport.score, title: audits.viewport.title } : null,
    fontSizeAudit: audits['font-size'] ? { score: audits['font-size'].score } : null,
    tapTargetsAudit: audits['tap-targets'] ? { score: audits['tap-targets'].score } : null,
  };
}

export async function runPageSpeed(url) {
  if (!config.pagespeed.enabled) {
    return { source: 'pagespeed', enabled: false, mobile: null, desktop: null, note: 'PageSpeed Insights is disabled on this server.' };
  }
  const [mobile, desktop] = await Promise.all([runStrategy(url, 'mobile'), runStrategy(url, 'desktop')]);
  return { source: 'pagespeed', enabled: true, keyConfigured: Boolean(config.pagespeed.apiKey), mobile, desktop };
}
