// Run an audit from the terminal: npm run audit -- example.com [homepage|quick|full] [--no-psi]
import { runAudit } from '../server/engine/auditor.js';
import fs from 'node:fs';

const [url, mode = 'homepage', ...flags] = process.argv.slice(2);
if (!url) { console.error('Usage: npm run audit -- <url> [homepage|quick|full] [--no-psi] [--out=file.json]'); process.exit(1); }
const out = flags.find((f) => f.startsWith('--out='))?.slice(6);
const audit = await runAudit({ url, mode, usePageSpeed: !flags.includes('--no-psi') }, (e) => console.log(`[${e.status.padEnd(7)}] ${e.stage}${e.detail ? ' — ' + e.detail : ''}`));
console.log(`\nScore ${audit.score.overall}/100 (${audit.score.grade}) · ${audit.pagesAnalyzed} page(s) · ${audit.issues.length} issues · ${audit.durationMs} ms`);
for (const [k, c] of Object.entries(audit.score.categories)) if (c.score != null) console.log(`  ${c.label.padEnd(20)} ${c.score}`);
for (const i of audit.issues.slice(0, 15)) console.log(`  [${i.priority}] ${i.title} — ${i.value}`);
if (out) fs.writeFileSync(out, JSON.stringify(audit, null, 2));
