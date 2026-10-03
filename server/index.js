// Local / traditional-server entry point. On Vercel, api/index.js is used instead.
import app from './app.js';
import { config, integrationStatus } from './config.js';
import { databaseEnvVar } from './store/db.js';

app.listen(config.port, () => {
  console.log(`Click2Client Media running → http://localhost:${config.port}`);
  console.log(`  Admin portal → http://localhost:${config.port}/admin`);
  console.log(`  Database: ${databaseEnvVar ? `Postgres via ${databaseEnvVar}` : 'NOT CONFIGURED — set DATABASE_URL in .env (or database_POSTGRES_URL)'}`);
  for (const i of integrationStatus()) console.log(`  ${i.configured ? '●' : '○'} ${i.name}${i.configured ? '' : i.partiallyAvailable ? ' (keyless, low quota)' : ' (not configured)'}`);
});
