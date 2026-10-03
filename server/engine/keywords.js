// Keyword & phrase extraction from real page text, plus a placement matrix
// (URL / title / meta / H1 / H2 / content) for top terms and any target
// keywords the user supplied.

const STOP = new Set(`a about above after again against all also am an and any are aren't as at be because been before being below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further get got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself just let's like me more most mustn't my myself no nor not now of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up us very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves one two three via per etc may might must shall new home page click read view see contact us menu skip content login sign search close open www com http https rights reserved copyright privacy policy terms cookies cookie accept learn`.split(/\s+/));

const tokenize = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[^\p{L}\p{N}'+#&-]+/u)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length > 1 && !/^\d+$/.test(w));

function ngrams(tokens, n) {
  const out = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const g = tokens.slice(i, i + n);
    if (STOP.has(g[0]) || STOP.has(g[n - 1])) continue;
    if (g.some((w) => w.length < 2)) continue;
    out.push(g.join(' '));
  }
  return out;
}

function count(arr) {
  const m = new Map();
  for (const x of arr) m.set(x, (m.get(x) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

const contains = (hay, term) => {
  if (!hay) return false;
  const h = ' ' + tokenize(hay).join(' ') + ' ';
  const t = ' ' + tokenize(term).join(' ') + ' ';
  if (h.includes(t)) return true;
  // tolerate simple plural/singular variation
  const ts = tokenize(term).map((w) => w.replace(/s$/, ''));
  const hs = ' ' + tokenize(hay).map((w) => w.replace(/s$/, '')).join(' ') + ' ';
  return hs.includes(' ' + ts.join(' ') + ' ');
};

export function analyzeKeywords(page, pageUrl, targetKeywords = []) {
  const tokens = tokenize(page.text);
  const total = tokens.length;
  const content = tokens.filter((w) => !STOP.has(w));

  const singles = count(content).slice(0, 25).map(([term, c]) => ({ term, count: c, density: total ? +(100 * c / total).toFixed(2) : 0 }));
  const bi = count(ngrams(tokens, 2)).filter(([, c]) => c >= 2).slice(0, 15).map(([term, c]) => ({ term, count: c, density: total ? +(100 * c * 2 / total).toFixed(2) : 0 }));
  const tri = count(ngrams(tokens, 3)).filter(([, c]) => c >= 2).slice(0, 10).map(([term, c]) => ({ term, count: c, density: total ? +(100 * c * 3 / total).toFixed(2) : 0 }));

  let urlText = '';
  try { urlText = decodeURIComponent(new URL(pageUrl).pathname).replace(/[-_/.]/g, ' '); } catch {}
  const locations = {
    url: urlText,
    title: page.title.text || '',
    meta: page.metaDescription.text || '',
    h1: page.headings.h1.join(' | '),
    h2: page.headings.h2.join(' | '),
    content: page.text,
  };

  const matrixTerms = [
    ...targetKeywords.map((k) => ({ term: k.trim().toLowerCase(), source: 'target' })).filter((k) => k.term),
    ...bi.slice(0, 4).map((b) => ({ term: b.term, source: 'detected' })),
    ...singles.slice(0, 6).map((s) => ({ term: s.term, source: 'detected' })),
  ];
  const seen = new Set();
  const matrix = [];
  for (const t of matrixTerms) {
    if (seen.has(t.term)) continue;
    seen.add(t.term);
    const row = { term: t.term, source: t.source, occurrences: 0, density: 0 };
    for (const [k, v] of Object.entries(locations)) row[k] = contains(v, t.term);
    const n = tokenize(t.term).length;
    const joined = ' ' + tokens.join(' ') + ' ';
    const needle = ' ' + tokenize(t.term).join(' ') + ' ';
    row.occurrences = needle.trim() ? joined.split(needle).length - 1 : 0;
    row.density = total ? +(100 * row.occurrences * n / total).toFixed(2) : 0;
    row.placementScore = ['title', 'meta', 'h1', 'h2', 'content', 'url'].filter((k) => row[k]).length;
    matrix.push(row);
    if (matrix.length >= 12) break;
  }

  const stuffing = [...singles, ...bi].filter((k) => k.density > 4 && total > 150);
  return {
    totalWords: total,
    uniqueWords: new Set(content).size,
    keywords: singles,
    phrases2: bi,
    phrases3: tri,
    matrix,
    targetKeywords: matrix.filter((m) => m.source === 'target'),
    possibleStuffing: stuffing,
  };
}
