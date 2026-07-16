// Local development Postgres without Docker.
// Uses port 55432 — 5432 sits in a Windows reserved port range on this
// machine. Point DATABASE_URL at it in .env (see .env.example).
// Data persists in .local/pgdata (gitignored). Stop with Ctrl+C.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const DATA_DIR = join(process.cwd(), '.local', 'pgdata');

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'sitefoundry',
    password: 'sitefoundry',
    port: 55432,
    persistent: true,
  });

  if (!existsSync(join(DATA_DIR, 'PG_VERSION'))) {
    console.log('Initialising Postgres data directory...');
    await pg.initialise();
  }

  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = 'sitefoundry'",
  );
  if (exists.rowCount === 0) {
    await pg.createDatabase('sitefoundry');
    console.log('Created database "sitefoundry".');
  }
  await client.end();

  console.log(
    'Postgres ready on postgresql://sitefoundry:sitefoundry@localhost:55432/sitefoundry',
  );

  const stop = async () => {
    console.log('\nStopping Postgres...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
