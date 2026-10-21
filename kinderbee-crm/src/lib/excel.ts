// Excel import/export. SheetJS is loaded on demand to keep the first load small.

export type Col = { key: string; label: string }

export async function exportExcel(filename: string, cols: Col[], rows: Record<string, unknown>[]) {
  const XLSX = await import('xlsx')
  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.label, r[c.key] ?? ''])))
  const ws = XLSX.utils.json_to_sheet(data, { header: cols.map((c) => c.label) })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Reads the first sheet; maps headers to keys by label or key, ignoring case/spaces/punctuation. */
export async function importExcel(file: File, cols: (Col & { aliases?: string[] })[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
  const lookup = new Map<string, string>()
  for (const c of cols) for (const n of [c.key, c.label, ...(c.aliases ?? [])]) lookup.set(norm(n), c.key)
  return raw
    .map((r) => {
      const out: Record<string, string> = {}
      for (const [h, v] of Object.entries(r)) {
        const k = lookup.get(norm(h))
        if (k) out[k] = v instanceof Date ? v.toLocaleDateString('en-CA') : String(v).trim()
      }
      return out
    })
    .filter((r) => Object.values(r).some(Boolean))
}
