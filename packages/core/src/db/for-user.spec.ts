import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../../tests/user';
import { ApplicationService } from '../applications/application.service';
import { VacancyIntakeService } from '../intake/vacancy-intake.service';
import { StatsService } from '../stats/stats.service';
import { VacancyService } from '../vacancies/vacancy.service';
import { forUser, type Unscoped } from './for-user';
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
    expect(await prisma.comment.count({ where: { vacancyId: aRow.id } })).toBe(1);
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

  it('throws on any other model, so a relation cannot read past it', async () => {
    const asB = forUser(prisma, b);
    await expect(
      asB.user.findUnique({ where: { id: a }, include: { vacancies: true } }),
    ).rejects.toThrow('forUser does not scope User.findUnique');
  });

  it('nests only a create in a vacancy write, and never moves its owner', async () => {
    const asB = forUser(prisma, b);
    const own = await asB.vacancy.create({
      data: {
        userId: b,
        company: 'Beta',
        title: 'QA',
        applyUrl: 'https://example.com/b',
        comments: { create: { body: "B's note.", source: 'USER' } },
      },
    });
    const [aComment] = await prisma.comment.findMany({ where: { vacancyId: aRow.id } });
    await expect(
      asB.vacancy.update({
        where: { id: own.id },
        data: { comments: { connect: { id: aComment.id } } },
      }),
    ).rejects.toThrow('nests only a create (comments)');
    await expect(
      asB.vacancy.update({ where: { id: own.id }, data: { userId: a } }),
    ).rejects.toThrow('cannot change its owner');
    await expect(
      asB.vacancy.update({ where: { id: own.id }, data: { user: { connect: { id: a } } } }),
    ).rejects.toThrow('cannot change its owner');

    expect(await prisma.comment.findUnique({ where: { id: aComment.id } })).toMatchObject({
      vacancyId: aRow.id,
    });
    expect(await prisma.vacancy.findUnique({ where: { id: own.id } })).toMatchObject({
      userId: b,
    });
  });
});

describe('the raw client reaches a domain model only through forUser (ADR-0038)', () => {
  // Checked by `npm run typecheck` (tsconfig.spec.json): each line below must not compile.
  it('as Unscoped, it has no model delegates and no $transaction', () => {
    const raw: Unscoped = prisma;
    // @ts-expect-error — no delegates
    void raw.vacancy;
    // @ts-expect-error — no transaction outside the scope
    void raw.$transaction;
  });

  it('every service holds it as Unscoped', () => {
    // Element access reaches a private field, so only its type is checked.
    const DB = 'db';
    // @ts-expect-error — `db` is Unscoped
    void new VacancyService(prisma)[DB].vacancy;
    // @ts-expect-error — `db` is Unscoped
    void new ApplicationService(prisma)[DB].vacancy;
    // @ts-expect-error — `db` is Unscoped
    void new StatsService(prisma)[DB].vacancy;
    // @ts-expect-error — `db` is Unscoped
    void new VacancyIntakeService(prisma)[DB].vacancy;
  });
});
