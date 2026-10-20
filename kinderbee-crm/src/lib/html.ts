// Turns an uploaded HTML file into the website's content formats. Blog posts are stored as the light markdown the
// website renders (headings, paragraphs, lists, quotes, bold/italic, links, YouTube links); nothing else from the
// HTML (scripts, styles, inline images) is kept, so an uploaded file can't inject code into the website.

const text = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

function inline(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent ?? '').replace(/\s+/g, ' ')
  if (!(n instanceof Element)) return ''
  const inner = () => Array.from(n.childNodes).map(inline).join('')
  switch (n.tagName) {
    case 'STRONG': case 'B': { const t = inner().trim(); return t ? `**${t}**` : '' }
    case 'EM': case 'I': { const t = inner().trim(); return t ? `*${t}*` : '' }
    case 'A': {
      const href = n.getAttribute('href') ?? ''
      const t = inner().trim()
      return /^https?:\/\//.test(href) && t ? `[${t}](${href})` : t
    }
    case 'BR': return ' '
    case 'SCRIPT': case 'STYLE': case 'IMG': case 'SVG': return ''
    default: return inner()
  }
}

/** HTML body → markdown lines the website's blog renderer understands. */
export function blocks(root: Element): string[] {
  const out: string[] = []
  for (const el of Array.from(root.children)) {
    const tag = el.tagName
    const line = text(inline(el))
    if (/^H[1-6]$/.test(tag)) { if (line) out.push(`${'#'.repeat(Number(tag[1]))} ${line}`) }
    else if (tag === 'P') { if (line) out.push(line) }
    else if (tag === 'BLOCKQUOTE') { if (line) out.push(`> ${line}`) }
    else if (tag === 'UL' || tag === 'OL') {
      Array.from(el.children).filter((li) => li.tagName === 'LI').forEach((li, i) => {
        const t = text(inline(li))
        if (t) out.push(tag === 'OL' ? `${i + 1}. ${t}` : `- ${t}`)
      })
    } else if (tag === 'TABLE') {
      for (const tr of Array.from(el.querySelectorAll('tr'))) {
        const cells = Array.from(tr.children).map((c) => text(inline(c))).filter(Boolean)
        if (cells.length) out.push(cells.length === 2 ? `- **${cells[0]}**: ${cells[1]}` : `- ${cells.join(' · ')}`)
      }
    } else if (tag === 'IFRAME') {
      const src = el.getAttribute('src') ?? ''
      if (/youtube\.com|youtu\.be/.test(src)) out.push(src.startsWith('//') ? 'https:' + src : src)
    } else if (!['SCRIPT', 'STYLE', 'NOSCRIPT', 'NAV', 'HEADER', 'FOOTER', 'FORM', 'IMG', 'SVG'].includes(tag)) {
      // div / section / article / main…: block children are read as blocks, plain text as a paragraph
      if (Array.from(el.children).some((c) => /^(H[1-6]|P|UL|OL|TABLE|BLOCKQUOTE|DIV|SECTION|ARTICLE|IFRAME)$/.test(c.tagName))) out.push(...blocks(el))
      else if (line) out.push(line)
    }
  }
  return out
}

function parse(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const h1 = doc.querySelector('h1')
  const title = text(h1?.textContent) || text(doc.title)
  h1?.remove() // the website shows the title above the post already
  const meta = text(doc.querySelector('meta[name="description"]')?.getAttribute('content'))
  const firstP = text(doc.querySelector('p')?.textContent)
  return { doc, title, summary: (meta || firstP).slice(0, 220) }
}

export function htmlToPost(html: string) {
  const { doc, title, summary } = parse(html)
  const lines = blocks(doc.body)
  const words = lines.join(' ').split(/\s+/).length
  return { title, excerpt: summary, content: lines.join('\n\n'), readTime: `${Math.max(1, Math.round(words / 200))} min read` }
}

/** HTML → Joint Venture listing fields: paragraphs become the overview, two-column table rows the details. */
export function htmlToListing(html: string) {
  const { doc, title, summary } = parse(html)
  const overview = Array.from(doc.querySelectorAll('p')).map((p) => text(p.textContent)).filter(Boolean)
  const details = Array.from(doc.querySelectorAll('tr'))
    .map((tr) => Array.from(tr.children).map((c) => text(c.textContent)))
    .filter((c) => c.length === 2 && c[0] && c[1]).map(([label, value]) => ({ label, value }))
  return { title, summary, headline: text(doc.querySelector('h2')?.textContent) || summary, overview, details }
}

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.click()
  })
}
