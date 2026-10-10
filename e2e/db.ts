import type { PrismaClient } from '@job-search-copilot/core';

/** An env var the e2e run needs: from `.env.e2e` locally (loaded by the config), from
 * the job's env in CI. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: copy .env.e2e, or set it in the env`);
  return value;
}

/** Where global setup copies every table once it has seeded; each test starts from it. */
const SNAPSHOT = 'e2e_snapshot';

/**
 * A restore wipes every table, so it refuses any database but an `*_e2e` one — asked of
 * the connection itself, as `resetToSeed` does. The dev DB holds real data.
 */
async function assertE2eDb(db: PrismaClient): Promise<void> {
  const [{ name }] = await db.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!name.endsWith('_e2e')) throw new Error(`e2e refuses "${name}": only a *_e2e database`);
}

const tablesOf = async (db: PrismaClient, schema: string) =>
  (
    await db.$queryRaw<{ name: string }[]>`SELECT tablename AS name FROM pg_tables
      WHERE schemaname = ${schema} AND tablename <> '_prisma_migrations'`
  ).map((row) => `"${row.name}"`);

/** Copies every table (the seed, the user, the session) into the `e2e_snapshot` schema. */
export async function takeSnapshot(db: PrismaClient): Promise<void> {
  await assertE2eDb(db);
  const tables = await tablesOf(db, 'public');
  await db.$transaction([
    db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS ${SNAPSHOT} CASCADE`),
    db.$executeRawUnsafe(`CREATE SCHEMA ${SNAPSHOT}`),
    ...tables.map((t) =>
      db.$executeRawUnsafe(`CREATE TABLE ${SNAPSHOT}.${t} AS TABLE public.${t}`),
    ),
  ]);
}

/**
 * Makes every table the snapshot again — what `resetToSeed` makes it (~9 s), in ~0.1–1 s
 * — so a test also gets back a session another one signed out. One statement, so atomic.
 * DELETE, not TRUNCATE: on tables this small TRUNCATE's per-table cost made it ~0.8 s.
 * Sequences are left alone: a row a test inserts gets an id past every snapshot one.
 * `session_replication_role = replica` skips the foreign-key checks while the tables
 * refill in any order; it needs a superuser (`postgres`, locally and in CI).
 */
export async function restoreSnapshot(db: PrismaClient): Promise<void> {
  await assertE2eDb(db);
  const tables = await tablesOf(db, SNAPSHOT);
  if (tables.length === 0) throw new Error('No e2e snapshot: global setup takes it');
  await db.$executeRawUnsafe(`DO $$ BEGIN
    SET LOCAL session_replication_role = replica;
    ${tables.map((t) => `DELETE FROM public.${t}; INSERT INTO public.${t} SELECT * FROM ${SNAPSHOT}.${t};`).join('\n')}
  END $$`);
}
