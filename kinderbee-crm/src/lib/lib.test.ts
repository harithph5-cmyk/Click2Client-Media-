// Run: npm test
import assert from 'node:assert/strict'
import { allDues, fillTemplate, fmtDate, monthsDue, normPhone, placeholders, studentDues } from './util.ts'

assert.equal(normPhone('98450 12345'), '+919845012345')
assert.equal(normPhone('+91-98450-12345'), '+919845012345')
assert.equal(normPhone('09845012345'), '+919845012345')
assert.equal(normPhone('919845012345'), '+919845012345')
assert.equal(normPhone('12345'), null)
assert.equal(normPhone('5845012345'), null) // Indian mobiles start 6–9

assert.equal(fmtDate('2026-10-05'), '05-10-2026')
assert.equal(fillTemplate('Hi {name}, ₹{amount} {missing}', { name: 'Ravi', amount: 500 }), 'Hi Ravi, ₹500 {missing}')
assert.deepEqual(placeholders('{a} {b} {a} {c}'), ['a', 'b', 'c'])

assert.equal(monthsDue('2026-06-05', '2026-06-04'), 0)
assert.equal(monthsDue('2026-06-05', '2026-06-05'), 1)
assert.equal(monthsDue('2026-06-05', '2026-10-04'), 4)
assert.equal(monthsDue('2026-06-05', '2026-10-05'), 5)
assert.equal(monthsDue('2026-06-05', '2028-01-01'), 12)

const comps = [
  { id: 'adm', program: 'LKG', academic_year: '2026-27', name: 'Admission', amount: 15000, due_date: '2026-06-01', monthly: false, sort: 1 },
  { id: 't2', program: 'LKG', academic_year: '2026-27', name: 'Term 2', amount: 12000, due_date: '2026-11-15', monthly: false, sort: 2 },
  { id: 'mon', program: 'LKG', academic_year: '2026-27', name: 'Tuition', amount: 3000, due_date: '2026-06-05', monthly: true, sort: 3 },
]
const pays = [
  { student_id: 's1', component_id: 'adm', amount: 10000 },
  { student_id: 's1', component_id: 'mon', amount: 9000 },
  { student_id: 's2', component_id: 'adm', amount: 15000 },
]
const d = studentDues(comps, pays.filter((p) => p.student_id === 's1'), '2026-10-15')
assert.equal(d.lines[0].balance, 5000)
assert.equal(d.lines[1].overdue, false) // Term 2 not due yet
assert.equal(d.lines[2].due, 15000) // 5 months of tuition
assert.equal(d.overdue, 5000 + 6000)
assert.equal(d.balance, 5000 + 12000 + 6000)
assert.equal(d.firstOverdue, '2026-06-01')

const all = allDues([{ id: 's2', program: 'LKG', academic_year: '2026-27' }, { id: 's3', program: 'UKG', academic_year: '2026-27' }], comps, pays, '2026-10-15')
assert.equal(all[0].overdue, 15000) // tuition only
assert.equal(all[1].due, 0) // no structure for UKG

console.log('lib.test.ts: all passed')
