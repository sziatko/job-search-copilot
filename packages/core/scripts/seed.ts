/**
 * `npm run seed`: resets the database in `.env.e2e` to the made-up seed (ADR-0037).
 * resetToSeed refuses any database not named `*_e2e`, `*_test` or `*_demo`.
 */
import { getPrisma } from '../src/prisma-client';
import { SEED_VACANCIES } from '../src/seed/data';
import { resetToSeed } from '../src/seed/reset-to-seed';

async function main() {
  const prisma = getPrisma();
  try {
    await resetToSeed(prisma);
    console.log(`Seeded ${SEED_VACANCIES.length} vacancies.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
