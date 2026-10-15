import { randomUUID } from 'node:crypto';
import { getPrisma } from '../src/db/prisma-client';

/** A user row to own the test's vacancies (ADR-0038); `setup.ts` deletes it after the
 * test. Returns its id. */
export async function createUser(): Promise<string> {
  const id = randomUUID();
  await getPrisma().user.create({ data: { id, name: 'Test User', email: `${id}@example.com` } });
  return id;
}
