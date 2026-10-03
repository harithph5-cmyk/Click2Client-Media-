// Local / traditional-server entry point. On Vercel, api/index.js is used instead.
import app from './app.js';
import { config, integrationStatus } from './config.js';
import { driver } from './store/db.js';

app.listen(config.port, () => {
  console.log(`Click2Client Media running → http://localhost:${config.port}`);
  console.log(`  Admin portal → http://localhost:${config.port}/admin`);
  console.log(`  Database: ${driver === 'postgres' ? 'Postgres (DATABASE_URL)' : 'local SQLite file (data/click2client.db)'}`);
  for (const i of integrationStatus()) console.log(`  ${i.configured ? '●' : '○'} ${i.name}${i.configured ? '' : i.partiallyAvailable ? ' (keyless, low quota)' : ' (not configured)'}`);
});
