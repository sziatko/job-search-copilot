import { afterAll, afterEach } from 'vitest';
import { getPrisma } from '../src/db/prisma-client';
import { deleteCreatedUsers } from './user';

// Integration tests write real rows into job_search_copilot_test. Each test's rows hang
// off the users it made, so deleting those users cleans up after it — and only after it,
// so files running at the same time keep their rows (ADR-0015).
afterEach(deleteCreatedUsers);

afterAll(async () => {
  await getPrisma().$disconnect();
});
