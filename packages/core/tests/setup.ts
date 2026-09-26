import { afterAll, afterEach } from 'vitest';
import { getPrisma } from '../src/prisma-client';

// Integration tests write real rows into job_search_copilot_test — wipe them
// between tests so tests don't leak state into one another.
const prisma = getPrisma();

afterEach(async () => {
  // Applications first — they FK into estimatedVacancy (ON DELETE CASCADE would
  // handle it, but being explicit keeps the intent obvious).
  await prisma.application.deleteMany();
  await prisma.estimatedVacancy.deleteMany();
  await prisma.vacancyLogEntry.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
