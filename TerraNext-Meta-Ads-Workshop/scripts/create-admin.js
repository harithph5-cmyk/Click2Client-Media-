// Usage: ADMIN_PASSWORD='...' node scripts/create-admin.js you@example.com "Your Name"
// (omit ADMIN_PASSWORD to be prompted). Re-running for an existing email resets that password.
const readline = require('readline');
const { db, hashPassword } = require('../server');

(async () => {
  const [email, name = 'Admin'] = process.argv.slice(2);
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) { console.error('Usage: node scripts/create-admin.js <email> [name]'); process.exit(1); }
  let pw = process.env.ADMIN_PASSWORD;
  if (!pw) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    pw = await new Promise((r) => rl.question('Password (min 12 chars): ', (a) => { rl.close(); r(a); }));
  }
  if (!pw || pw.length < 12) { console.error('Password must be at least 12 characters'); process.exit(1); }
  db.prepare(`INSERT INTO administrators (name,email,password_hash) VALUES (?,?,?)
              ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, status='ACTIVE'`).run(name, email.toLowerCase(), hashPassword(pw));
  console.log('Admin ready:', email.toLowerCase());
  process.exit(0);
})();
