// Safe Markdown: everything is HTML-escaped first, then a small set of constructs is formatted.
// No raw HTML from the model is ever inserted; links are http(s) only.
import {esc} from './core.js';
import {highlight} from './highlight.js';

function inline(t) {
  return esc(t).replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function md(src) {
  const out = []; let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  src.split(/```/).forEach((part, i) => {
    if (i % 2) {   // fenced code block: first line may be the language
      close();
      const nl = part.indexOf('\n');
      const lang = nl > -1 ? part.slice(0, nl).trim() : '';
      const code = nl > -1 ? part.slice(nl + 1) : part;
      const label = /^[\w+#.-]{1,20}$/.test(lang) ? lang : 'code';
      out.push('<div class="code"><div class="code-h"><span>' + esc(label) + '</span>' +
        '<button type="button" class="copy-code" aria-label="Copy code"><span class="ms" aria-hidden="true">content_copy</span>Copy</button></div>' +
        '<pre><code>' + highlight(code.replace(/\n$/, ''), label) + '</code></pre></div>');
      return;
    }
    part.split('\n').forEach(line => {
      let m;
      if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push('<li>' + inline(m[1]) + '</li>'); }
      else if ((m = line.match(/^#{1,4}\s+(.*)/))) { close(); out.push('<h3>' + inline(m[1]) + '</h3>'); }
      else if (line.trim()) { close(); out.push('<p>' + inline(line) + '</p>'); }
      else close();
    });
    close();
  });
  return out.join('');
}
