// Branded PDF receipts and salary slips (jsPDF, loaded on demand).
import { brand } from '../config/brand'
import { fmtDate, monthLabel } from './util'

// jsPDF's built-in fonts have no ₹ glyph, so PDFs use "Rs."
const rs = (n: number | string) => 'Rs. ' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function sheet(title: string) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a5' })
  const w = doc.internal.pageSize.getWidth()
  doc.setFillColor(brand.colors.primary)
  doc.rect(0, 0, w, 28, 'F')
  try {
    const img = await loadImage(brand.logo)
    doc.addImage(img, 'PNG', 8, 5, 18, 18)
  } catch { /* no logo yet */ }
  doc.setTextColor(brand.colors.charcoal)
  doc.setFont('helvetica', 'bold').setFontSize(15).text(brand.school, 30, 13)
  doc.setFont('helvetica', 'normal').setFontSize(8).text(`${brand.address} · ${brand.phone} · ${brand.email}`, 30, 19)
  doc.setFont('helvetica', 'bold').setFontSize(12).text(title, w / 2, 38, { align: 'center' })
  return { doc, w }
}

function rows(doc: any, w: number, y: number, items: [string, string][]) {
  doc.setFontSize(9)
  for (const [k, v] of items) {
    doc.setFont('helvetica', 'normal').setTextColor('#666').text(k, 12, y)
    doc.setFont('helvetica', 'bold').setTextColor(brand.colors.charcoal).text(v || '—', w - 12, y, { align: 'right' })
    doc.setDrawColor('#eee').line(12, y + 2.5, w - 12, y + 2.5)
    y += 8
  }
  return y
}

function footer(doc: any, w: number, note: string) {
  const h = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'italic').setFontSize(8).setTextColor('#888')
  doc.text(note, w / 2, h - 10, { align: 'center' })
}

export async function feeReceipt(p: {
  receipt_no: number; paid_on: string; student: string; program: string; parent?: string | null
  component: string; amount: number; mode: string; reference?: string | null; collected_by?: string
}) {
  const { doc, w } = await sheet('FEE RECEIPT')
  let y = rows(doc, w, 50, [
    ['Receipt No.', `KB-${String(p.receipt_no).padStart(6, '0')}`],
    ['Date', fmtDate(p.paid_on)],
    ['Student', p.student],
    ['Program', p.program],
    ['Parent', p.parent ?? ''],
    ['Towards', p.component],
    ['Payment mode', p.mode.toUpperCase()],
    ['Reference', p.reference ?? ''],
    ['Collected by', p.collected_by ?? ''],
  ])
  doc.setFillColor('#FFF8E7').roundedRect(12, y, w - 24, 14, 3, 3, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(brand.colors.charcoal)
  doc.text('Amount received', 16, y + 9)
  doc.text(rs(p.amount), w - 16, y + 9, { align: 'right' })
  footer(doc, w, 'Computer-generated receipt. Thank you for choosing ' + brand.school + '!')
  doc.save(`Receipt-KB-${p.receipt_no}.pdf`)
}

export async function salarySlip(p: {
  staff: { name: string; role?: string | null; bank_account_name?: string | null; account_no?: string | null; ifsc?: string | null; monthly_salary: number }
  month: string; amount: number; deductions: number; bonus: number; paid_on: string; mode: string
}): Promise<Blob> {
  const { doc, w } = await sheet(`SALARY SLIP — ${monthLabel(p.month).toUpperCase()}`)
  const acct = p.staff.account_no ? '••••' + p.staff.account_no.slice(-4) : ''
  let y = rows(doc, w, 50, [
    ['Employee', p.staff.name],
    ['Designation', p.staff.role ?? ''],
    ['Bank account', [p.staff.bank_account_name, acct, p.staff.ifsc].filter(Boolean).join(' · ')],
    ['Paid on', fmtDate(p.paid_on)],
    ['Mode', p.mode.toUpperCase()],
    ['Gross salary', rs(p.amount)],
    ['Bonus', rs(p.bonus)],
    ['Deductions', '- ' + rs(p.deductions)],
  ])
  doc.setFillColor('#FFF8E7').roundedRect(12, y, w - 24, 14, 3, 3, 'F')
  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(brand.colors.charcoal)
  doc.text('Net pay', 16, y + 9)
  doc.text(rs(Number(p.amount) + Number(p.bonus) - Number(p.deductions)), w - 16, y + 9, { align: 'right' })
  footer(doc, w, 'This is a computer-generated salary slip.')
  return doc.output('blob')
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((ok, fail) => {
    const img = new Image()
    img.onload = () => ok(img)
    img.onerror = fail
    img.src = src
  })
}
