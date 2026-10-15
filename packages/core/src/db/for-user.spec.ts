import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../../tests/user';
import { forUser } from './for-user';
import { getPrisma } from './prisma-client';

const prisma = getPrisma();

let a: string;
let b: string;
let aRow: { id: number };
beforeEach(async () => {
  a = await createUser();
  b = await createUser();
  aRow = await prisma.vacancy.create({
    data: {
      userId: a,
      company: 'Acme',
      title: 'Dev',
      applyUrl: 'https://example.com/a',
      statusChanges: { create: { status: 'NEW' } },
      comments: { create: { body: "A's note.", source: 'USER' } },
    },
  });
});

const notFound = { name: 'PrismaClientKnownRequestError', code: 'P2025' };

describe('forUser', () => {
  it("reads only the user's own vacancies", async () => {
    const asB = forUser(prisma, b);
    expect(await asB.vacancy.findUnique({ where: { id: aRow.id } })).toBeNull();
    expect(await asB.vacancy.findFirst({ where: { company: 'Acme' } })).toBeNull();
    expect(await asB.vacancy.findMany()).toEqual([]);
    expect(await asB.vacancy.count()).toBe(0);
    expect(await asB.vacancy.groupBy({ by: ['company'], _count: { _all: true } })).toEqual([]);
    expect(await asB.vacancy.findMany({ cursor: { id: aRow.id }, take: 1 })).toEqual([]);

    const asA = forUser(prisma, a);
    expect(await asA.vacancy.findUnique({ where: { id: aRow.id } })).toMatchObject(aRow);
    expect(await asA.vacancy.count()).toBe(1);
  });

  it("writes none of another user's vacancies", async () => {
    const asB = forUser(prisma, b);
    await expect(
      asB.vacancy.update({ where: { id: aRow.id }, data: { company: 'Hacked' } }),
    ).rejects.toMatchObject(notFound);
    expect(await asB.vacancy.updateMany({ data: { company: 'Hacked' } })).toEqual({ count: 0 });
    expect(await asB.vacancy.updateManyAndReturn({ data: { company: 'Hacked' } })).toEqual([]);
    expect(await asB.vacancy.deleteMany()).toEqual({ count: 0 });

    expect(await prisma.vacancy.findUnique({ where: { id: aRow.id } })).toMatchObject({
      company: 'Acme',
    });
  });

  it('creates a vacancy only for its own user', async () => {
    const asB = forUser(prisma, b);
    const row = { company: 'Beta', title: 'QA', applyUrl: 'https://example.com/b' };
    await expect(asB.vacancy.create({ data: { ...row, userId: a } })).rejects.toThrow(
      'must carry the scoped userId',
    );
    expect(await asB.vacancy.create({ data: { ...row, userId: b } })).toMatchObject({ userId: b });
  });

  it('scopes StatusChange and Comment through their vacancy', async () => {
    const asB = forUser(prisma, b);
    expect(await asB.statusChange.findMany()).toEqual([]);
    expect(await asB.comment.findMany({ where: { vacancyId: aRow.id } })).toEqual([]);
    await expect(
      asB.statusChange.create({ data: { vacancyId: aRow.id, status: 'DECLINED' } }),
    ).rejects.toMatchObject(notFound);
    await expect(
      asB.comment.create({ data: { vacancyId: aRow.id, body: 'Hi.', source: 'AGENT' } }),
    ).rejects.toMatchObject(notFound);

    const asA = forUser(prisma, a);
    expect(await asA.comment.findMany()).toHaveLength(1);
    await asA.statusChange.create({ data: { vacancyId: aRow.id, status: 'DECLINED' } });
    expect(await prisma.statusChange.count({ where: { vacancyId: aRow.id } })).toBe(2);
  });

  it('stays on inside an interactive transaction', async () => {
    const seen = await forUser(prisma, b).$transaction(async (db) => ({
      row: await db.vacancy.findUnique({ where: { id: aRow.id } }),
      changes: await db.statusChange.findMany(),
    }));
    expect(seen).toEqual({ row: null, changes: [] });
  });

  it('throws on an operation it does not scope', async () => {
    const asB = forUser(prisma, b);
    await expect(asB.vacancy.delete({ where: { id: aRow.id } })).rejects.toThrow(
      'forUser does not scope Vacancy.delete',
    );
    await expect(asB.vacancy.aggregate({ _max: { id: true } })).rejects.toThrow(
      'forUser does not scope Vacancy.aggregate',
    );
    await expect(asB.comment.deleteMany()).rejects.toThrow(
      'forUser does not scope Comment.deleteMany',
    );
    expect(await prisma.comment.count()).toBe(1);
  });

  it('refuses an empty userId', () => {
    expect(() => forUser(prisma, '')).toThrow('forUser needs a userId');
  });

  it('keeps P2002 a known request error (the services catch it)', async () => {
    const asA = forUser(prisma, a);
    await expect(
      asA.vacancy.create({
        data: { userId: a, company: 'Acme', title: 'Dev', applyUrl: 'https://example.com/a' },
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});

/** Every source file of core, from `src/` down — not only this spec's folder. */
const SRC = path.resolve(import.meta.dirname, '..');

/** Core's source files outside forUser, specs left out. */
function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return file.endsWith('.ts') && !file.endsWith('.spec.ts') && entry.name !== 'for-user.ts'
      ? [file]
      : [];
  });
}

describe('every domain query goes through forUser (ADR-0038)', () => {
  it.each(sources().map((file) => [path.relative(SRC, file), file]))('%s', (_, file) => {
    const code = readFileSync(file, 'utf8');
    // The raw client never reaches a domain model: the services hold it as `this.db`,
    // resetToSeed as `prisma`, and a raw transaction is called `tx`.
    expect(code).not.toMatch(/\b(?:this\.db|tx|prisma)\??\.(?:vacancy|statusChange|comment)\b/);
    expect(code).not.toMatch(/\bthis\.db\.\$transaction\b/);
    // `this.db` appears only as forUser's argument.
    expect(code.match(/\bthis\.db\b/g)?.length ?? 0).toBe(
      code.match(/\bforUser\(this\.db, userId\)/g)?.length ?? 0,
    );
  });
});
