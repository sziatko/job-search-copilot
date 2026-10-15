/**
 * Run by the api's webServer command, before the api boots: Playwright starts its
 * webServers before global setup, and the api connects at boot. Creates the e2e
 * database if it is missing, then `prisma migrate deploy` on it.
 */
import { execSync } from 'node:child_process';
import pg from 'pg';
import { env } from './db';

async function main() {
  const url = new URL(env('DATABASE_URL'));
  const name = url.pathname.slice(1);
  if (!/^\w+_e2e$/.test(name)) throw new Error(`e2e refuses "${name}": only a *_e2e database`);

  url.pathname = '/postgres';
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!rowCount) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
  // The last run's snapshot copies every table, so its columns use the schema's enum
  // types: a migration that rebuilds one could not drop the old type. Global setup takes
  // a fresh snapshot anyway.
  const e2e = new pg.Client({ connectionString: env('DATABASE_URL') });
  await e2e.connect();
  try {
    await e2e.query('DROP SCHEMA IF EXISTS e2e_snapshot CASCADE');
  } finally {
    await e2e.end();
  }
  // Its `dotenv -e .env` never overrides the DATABASE_URL already set.
  execSync('npm run migrate:deploy --workspace=@job-search-copilot/core', { stdio: 'inherit' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
