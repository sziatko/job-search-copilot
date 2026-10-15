/**
 * `npm run seed`: resets the database in `.env.e2e` to the made-up seed (ADR-0037), as
 * the data of the first `AUTH_ALLOWED_EMAILS` user — the one e2e signs in as — created
 * when missing. resetToSeed refuses any database not named `*_e2e`, `*_test` or `*_demo`.
 */
import { randomUUID } from 'node:crypto';
import { getPrisma } from '../src/db/prisma-client';
import { SEED_VACANCIES } from '../src/seed/data';
import { resetToSeed } from '../src/seed/reset-to-seed';

async function main() {
  const prisma = getPrisma();
  try {
    const email = process.env.AUTH_ALLOWED_EMAILS?.split(',')[0].trim();
    if (!email) throw new Error('AUTH_ALLOWED_EMAILS is not set');
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { id: randomUUID(), email, name: 'E2E User', emailVerified: true },
    });
    await resetToSeed(prisma, user.id);
    console.log(`Seeded ${SEED_VACANCIES.length} vacancies.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
