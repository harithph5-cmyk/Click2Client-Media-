// Run: npm test. Uses a throwaway DB; no real payments or services involved.
const os = require('os'), path = require('path'), fs = require('fs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-'));
process.env.DATA_DIR = tmp;
const test = require('node:test'), assert = require('node:assert/strict');
const { app, db, hashPassword } = require('../server');

let base, srv, adminCookie = '';
test.before(async () => {
  await new Promise((r) => { srv = app.listen(0, () => { base = `http://127.0.0.1:${srv.address().port}`; r(); }); });
  db.prepare('INSERT INTO administrators (name,email,password_hash) VALUES (?,?,?)').run('T', 'a@test.dev', hashPassword('correct-horse-battery'));
});
test.after(() => srv.close());
const call = (p, o = {}) => fetch(base + p, o);
const json = (b) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', cookie: adminCookie }, body: JSON.stringify(b) });
const reg = (over = {}) => call('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  fullName: 'Asha K', phone: '98765 43210', email: 'Asha@Test.com', organization: 'Asha Homes', category: 'SME', city: 'Chennai', consent: true, reviewed: true, ...over }) });
const pay = (tok, ref, extra = {}) => { const f = new FormData(); f.set('transactionReference', ref); f.set('paymentDate', new Date().toISOString().slice(0, 10)); for (const [k, v] of Object.entries(extra)) f.set(k, v); return call(`/api/session/${tok}/payment`, { method: 'POST', body: f }); };
const tokOf = (b) => b.paymentUrl.split('/').pop();

test('registration validation', async () => {
  assert.equal((await reg({ phone: '12345' })).status, 400);
  assert.equal((await reg({ email: 'nope' })).status, 400);
  assert.equal((await reg({ consent: false })).status, 400);
  assert.equal((await reg({ fullName: '' })).status, 400);
});

test('full happy path: register -> qr -> submit -> whatsapp -> verify -> confirmed', async () => {
  const r = await reg(); assert.equal(r.status, 201);
  const b = await r.json(); const tok = tokOf(b);
  assert.match(b.registrationId, /^TNM-2026-[A-Z2-9]{6}$/);
  const row = db.prepare('SELECT * FROM registrations WHERE public_registration_id=?').get(b.registrationId);
  assert.equal(row.amount_due_paise, 49900); assert.equal(row.normalized_phone, '9876543210'); assert.equal(row.registration_status, 'PENDING_PAYMENT');
  assert.equal(db.prepare('SELECT token_hash FROM payment_sessions').get().token_hash.includes(tok), false, 'token stored hashed');

  let s = await (await call(`/api/session/${tok}`)).json();
  assert.equal(s.whatsappUrl, undefined); assert.equal(s.confirmedAt, undefined);
  assert.equal((await call(`/api/session/${tok}/qr`)).status, 200);

  assert.equal((await pay(tok, 'ab')).status, 400);                         // bad reference
  assert.equal((await pay(tok, 'UTR123456789', { screenshot: new Blob([Buffer.from('not an image')]), })).status, 400); // fake screenshot
  assert.equal((await pay(tok, '123456789012')).status, 201);
  assert.equal((await pay(tok, '123456789012')).status, 409);              // no duplicate submission
  s = await (await call(`/api/session/${tok}`)).json();
  assert.equal(s.status, 'VERIFICATION_PENDING');
  const u = new URL(s.whatsappUrl); assert.equal(u.pathname, '/919940411837');
  const msg = u.searchParams.get('text'); assert.match(msg, /Registration ID: TNM-2026-/); assert.match(msg, /Amount Paid: ₹499/); assert.match(msg, /123456789012/); assert.match(msg, /1 November 2026/);

  // Not paid until an admin says so
  assert.equal(db.prepare('SELECT registration_status s FROM registrations WHERE id=?').get(row.id).s, 'VERIFICATION_PENDING');
  assert.equal((await call(`/api/admin/stats`)).status, 401);
  assert.equal((await call('/api/admin/login', json({ email: 'a@test.dev', password: 'wrong' }))).status, 401);
  const login = await call('/api/admin/login', json({ email: 'a@test.dev', password: 'correct-horse-battery' }));
  assert.equal(login.status, 200); adminCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('/api/admin/stats', { headers: { cookie: adminCookie } })).status, 200);

  const subId = db.prepare('SELECT id FROM payment_submissions').get().id;
  assert.equal((await call(`/api/admin/payments/${subId}/verify`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie: adminCookie }, body: '{"confirmed":true}' })).status, 403); // CSRF header missing
  assert.equal((await call(`/api/admin/payments/${subId}/verify`, json({}))).status, 400);                // checklist required
  assert.equal((await call(`/api/admin/payments/${subId}/verify`, json({ confirmed: true }))).status, 200);
  assert.equal((await (await call(`/api/admin/payments/${subId}/verify`, json({ confirmed: true }))).json()).already, true); // idempotent
  assert.equal((await call(`/api/admin/payments/${subId}/reject`, json({ reason: 'x' }))).status, 409);   // PAID is final

  s = await (await call(`/api/session/${tok}`)).json();
  assert.equal(s.status, 'PAID'); assert.ok(s.confirmedAt);
  const st = await (await call('/api/admin/stats', { headers: { cookie: adminCookie } })).json();
  assert.equal(st.verifiedRevenuePaise, 49900);
  assert.ok(db.prepare("SELECT 1 FROM audit_logs WHERE action='PAYMENT_VERIFIED'").get());
});

test('session security: bad / expired / revoked tokens, fee tampering, duplicates', async () => {
  assert.equal((await call('/api/session/' + 'A'.repeat(43))).status, 404);
  assert.equal((await call('/api/session/1')).status, 404);
  const b = await (await reg({ phone: '9123456780', email: 'x@y.com' })).json(); const tok = tokOf(b);
  assert.equal((await reg({ phone: '9123456780', email: 'other@y.com' })).status, 409);   // stranger can't recover
  const b2 = await (await reg({ phone: '9123456780', email: 'x@y.com' })).json();         // owner recovers
  assert.equal(b2.registrationId, b.registrationId);
  assert.equal((await call(`/api/session/${tok}`)).status, 404, 'old token revoked');
  db.prepare("UPDATE payment_sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await call(`/api/session/${tokOf(b2)}`)).status, 404, 'expired');
  const fresh = await (await reg({ phone: '9123456780', email: 'x@y.com' })).json();
  const r = await reg({ phone: '9000000001', email: 'p@q.com', amount: 1, amountDuePaise: 1 }); // browser-sent price ignored
  assert.equal(db.prepare('SELECT amount_due_paise a FROM registrations WHERE normalized_phone=?').get('9000000001').a, 49900);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM registrations WHERE normalized_phone=?').get('9123456780').c, 1);
  db.prepare('UPDATE workshops SET qr_storage_key=NULL').run();
  assert.equal((await call(`/api/session/${tokOf(fresh)}/qr`)).status, 404);
  assert.equal((await pay(tokOf(fresh), '123456789013')).status, 503, 'no QR configured -> no payment submission');
});

test('duplicate UTR cannot be verified twice; reject / correction flows', async () => {
  db.prepare("UPDATE workshops SET qr_storage_key='official-qr.png'").run();
  const mk = async (phone, ref) => { const b = await (await reg({ phone, email: phone + '@t.com' })).json(); await pay(tokOf(b), ref); return tokOf(b); };
  const t1 = await mk('9111111111', 'SAMEUTR99999'), t2 = await mk('9222222222', 'SAMEUTR99999');
  const ids = db.prepare("SELECT id FROM payment_submissions WHERE transaction_reference='SAMEUTR99999' ORDER BY id").all().map((x) => x.id);
  assert.equal((await call(`/api/admin/payments/${ids[0]}/verify`, json({ confirmed: true }))).status, 200);
  assert.equal((await call(`/api/admin/payments/${ids[1]}/verify`, json({ confirmed: true }))).status, 409);
  assert.equal((await call(`/api/admin/payments/${ids[1]}/correct`, json({ reason: 'Wrong UTR' }))).status, 200);
  const s = await (await call(`/api/session/${t2}`)).json();
  assert.equal(s.status, 'PENDING_PAYMENT'); assert.equal(s.submission.reason, 'Wrong UTR');
  assert.equal((await pay(t2, 'DIFFERENT12345')).status, 201, 'resubmission allowed after correction');
  const id3 = db.prepare("SELECT id FROM payment_submissions WHERE transaction_reference='DIFFERENT12345'").get().id;
  assert.equal((await call(`/api/admin/payments/${id3}/reject`, json({ reason: 'Not received' }))).status, 200);
  assert.equal((await (await call(`/api/session/${t2}`)).json()).status, 'REJECTED');
  assert.equal((await call(`/api/session/${t2}/qr`)).status, 404, 'QR hidden once rejected');
  void t1;
});

test('fee change does not alter existing registrations', async () => {
  const before = db.prepare('SELECT amount_due_paise a FROM registrations LIMIT 1').get().a;
  db.prepare('UPDATE workshops SET amount_paise=99900').run();
  assert.equal(db.prepare('SELECT amount_due_paise a FROM registrations LIMIT 1').get().a, before);
  db.prepare('UPDATE workshops SET amount_paise=49900').run();
});
