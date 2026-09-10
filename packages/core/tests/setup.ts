import { afterAll, afterEach } from 'vitest';
import { getPrisma } from '../src/prisma-client';

// Integration tests write real rows into job_search_copilot_test — wipe them
// between tests so tests don't leak state into one another.
const prisma = getPrisma();

afterEach(async () => {
  await prisma.estimatedVacancy.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});
