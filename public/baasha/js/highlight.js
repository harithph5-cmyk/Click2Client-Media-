// Tiny syntax highlighter. Input is raw code; output is HTML where every piece of text is escaped first,
// so it is safe to assign to innerHTML. Unknown languages come back escaped and unstyled.
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const words = s => new RegExp('\\b(?:' + s.trim().split(/\s+/).join('|') + ')\\b');

const JS = words(`async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return static super switch this throw try typeof var void while with yield interface type enum implements namespace declare readonly public private protected as null undefined true false`);
const PY = words(`and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield None True False self match case`);
const SH = words(`if then else elif fi for while do done case esac function in return export local echo cd exit set unset source`);
const SQL = new RegExp('\\b(?:' + 'select from where group by order having insert into values update set delete create table alter drop index join left right inner outer on as and or not null primary key foreign references limit offset union distinct count sum avg min max like in is'.split(' ').join('|') + ')\\b', 'i');
const GEN = words(`if else for while return function class def import from export const let var new true false null`);

const LANGS = {
  javascript: {c: /\/\/[^\n]*|\/\*[\s\S]*?\*\//, s: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/, k: JS},
  python: {c: /#[^\n]*/, s: /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, k: PY},
  bash: {c: /#[^\n]*/, s: /"(?:\\.|[^"\\])*"|'[^']*'/, k: SH},
  sql: {c: /--[^\n]*|\/\*[\s\S]*?\*\//, s: /'(?:''|[^'])*'/, k: SQL},
  json: {c: null, s: /"(?:\\.|[^"\\\n])*"/, k: /\b(?:true|false|null)\b/},
  yaml: {c: /#[^\n]*/, s: /"(?:\\.|[^"\\\n])*"|'[^']*'/, k: /\b(?:true|false|null|yes|no)\b/},
  toml: {c: /#[^\n]*/, s: /"(?:\\.|[^"\\\n])*"|'[^']*'/, k: /\b(?:true|false)\b/},
  ini: {c: /[#;][^\n]*/, s: /"(?:\\.|[^"\\\n])*"/, k: null},
  css: {c: /\/\*[\s\S]*?\*\//, s: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, k: /@[\w-]+/},
  html: {c: /<!--[\s\S]*?-->/, s: /"[^"\n]*"|'[^'\n]*'/, k: /<\/?[A-Za-z][\w-]*|\/?>/},
  xml: {c: /<!--[\s\S]*?-->/, s: /"[^"\n]*"|'[^'\n]*'/, k: /<\/?[A-Za-z][\w:-]*|\/?>/},
  java: {c: /\/\/[^\n]*|\/\*[\s\S]*?\*\//, s: /"(?:\\.|[^"\\\n])*"/, k: JS},
  c: {c: /\/\/[^\n]*|\/\*[\s\S]*?\*\//, s: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, k: GEN},
  cpp: {c: /\/\/[^\n]*|\/\*[\s\S]*?\*\//, s: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, k: GEN},
  go: {c: /\/\/[^\n]*|\/\*[\s\S]*?\*\//, s: /"(?:\\.|[^"\\\n])*"|`[^`]*`/, k: GEN},
  rust: {c: /\/\/[^\n]*|\/\*[\s\S]*?\*\//, s: /"(?:\\.|[^"\\\n])*"/, k: GEN},
  php: {c: /\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\//, s: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, k: GEN},
  ruby: {c: /#[^\n]*/, s: /"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/, k: GEN},
};
LANGS.typescript = LANGS.javascript; LANGS.js = LANGS.javascript; LANGS.ts = LANGS.javascript; LANGS.tsx = LANGS.javascript; LANGS.jsx = LANGS.javascript;
LANGS.py = LANGS.python; LANGS.sh = LANGS.bash; LANGS.shell = LANGS.bash; LANGS.yml = LANGS.yaml; LANGS['c++'] = LANGS.cpp; LANGS.rs = LANGS.rust;

const cache = {};
function compile(L) {
  const parts = [], kinds = [];
  const add = (re, kind) => { if (re) { parts.push('(' + re.source + ')'); kinds.push(kind); } };
  add(L.c, 'c'); add(L.s, 's');
  add(L.k, 'k');
  add(/\b\d[\d_]*(?:\.\d+)?\b/, 'n');
  add(/\b[A-Z][A-Za-z0-9_]*\b/, 't');
  add(/\b[A-Za-z_$][\w$]*(?=\()/, 'f');
  return {re: new RegExp(parts.join('|'), L.k && L.k.flags.includes('i') ? 'gi' : 'g'), kinds};
}

export const LANGUAGE_NAMES = ['text', 'python', 'javascript', 'typescript', 'html', 'css', 'json', 'bash', 'sql', 'yaml', 'markdown', 'java', 'c', 'cpp', 'go', 'rust', 'php', 'ruby', 'toml', 'ini', 'xml'];

export function highlight(code, lang) {
  const L = LANGS[(lang || '').toLowerCase()];
  if (!L || code.length > 200000) return esc(code);
  const key = (lang || '').toLowerCase();
  const c = cache[key] || (cache[key] = compile(L));
  c.re.lastIndex = 0;
  let out = '', last = 0, m;
  while ((m = c.re.exec(code))) {
    if (m[0] === '') { c.re.lastIndex++; continue; }
    const idx = m.findIndex((v, i) => i > 0 && v !== undefined) - 1;
    out += esc(code.slice(last, m.index)) + '<span class="tk-' + c.kinds[idx] + '">' + esc(m[0]) + '</span>';
    last = m.index + m[0].length;
  }
  return out + esc(code.slice(last));
}
