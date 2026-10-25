import { randomUUID } from 'node:crypto';
import { getPrisma } from '../src/db/prisma-client';

/** The users this file's tests made and have not yet deleted. */
const created: string[] = [];

/** A user row to own the test's vacancies (ADR-0038); `setup.ts` deletes it after the
 * test. Returns its id. */
export async function createUser(): Promise<string> {
  const id = randomUUID();
  await getPrisma().user.create({ data: { id, name: 'Test User', email: `${id}@example.com` } });
  created.push(id);
  return id;
}

/** Deletes the users `createUser` made; their vacancies, comments, status changes,
 * sessions and keys go with them (ON DELETE CASCADE). */
export async function deleteCreatedUsers(): Promise<void> {
  await getPrisma().user.deleteMany({ where: { id: { in: created.splice(0) } } });
}
