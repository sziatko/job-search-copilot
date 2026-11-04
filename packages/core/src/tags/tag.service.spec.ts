import { beforeEach, describe, expect, it } from 'vitest';
import { createUser } from '../../tests/user';
import { getPrisma } from '../db/prisma-client';
import {
  InvalidTagsError,
  TagNameTakenError,
  TagNotFoundError,
  VacancyNotFoundError,
} from '../domain/errors';
import { normalizeTagKey } from '../domain/tags';
import { VacancyIntakeService } from '../intake/vacancy-intake.service';
import { VacancyService } from '../vacancies/vacancy.service';
import { ANALYSIS_BATCH_MAX, MAX_LENGTH } from '../vacancies/vacancy.types';
import { TagService } from './tag.service';
import { TAGS_PER_VACANCY_MAX } from './tag.types';

const prisma = getPrisma();
const tags = new TagService();
const vacancies = new VacancyService();
const intake = new VacancyIntakeService();

let userId: string;
beforeEach(async () => {
  userId = await createUser();
});

/** A NEW vacancy of `owner`; returns its id. */
async function vacancy(n: number, owner = userId): Promise<number> {
  const url = `https://example.com/tags/${n}`;
  await intake.intake(owner, { url, company: 'Acme', title: `Dev ${n}` });
  return (
    await prisma.vacancy.findUniqueOrThrow({
      where: { userId_applyUrl: { userId: owner, applyUrl: url } },
    })
  ).id;
}

/** The names on a vacancy, as a read returns them. */
async function namesOn(id: number): Promise<string[]> {
  const found = await vacancies.getById(userId, id);
  return (found?.tags ?? []).map((tag) => tag.name);
}

/** Every tag the user has, by name. */
async function allNames(): Promise<string[]> {
  return (await tags.list(userId)).map((tag) => tag.name);
}

/** `n` distinct names, in sorted order. */
function names(n: number, prefix = 'tag'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix} ${String(i).padStart(3, '0')}`);
}

describe('normalizeTagKey', () => {
  it('trims, collapses spaces and lowers the case', () => {
    expect(normalizeTagKey('  Fully\t  REMOTE \n')).toBe('fully remote');
  });
});

describe('the DB rules', () => {
  it("refuses a link between one user's tag and another user's vacancy", async () => {
    const other = await createUser();
    const vacancyId = await vacancy(1);
    const foreign = await tags.create(other, { name: 'Remote' });
    const fk = { code: 'P2003' };

    await expect(
      prisma.vacancyTag.create({ data: { vacancyId, tagId: foreign.id, userId } }),
    ).rejects.toMatchObject(fk);
    await expect(
      prisma.vacancyTag.create({ data: { vacancyId, tagId: foreign.id, userId: other } }),
    ).rejects.toMatchObject(fk);
  });

  it('refuses an empty nameKey', async () => {
    await expect(prisma.tag.create({ data: { userId, name: 'x', nameKey: '' } })).rejects.toThrow(
      /Tag_nameKey_not_empty/,
    );
  });

  it('takes the links with a deleted vacancy and keeps the tag', async () => {
    const vacancyId = await vacancy(1);
    await tags.tagVacancies(userId, [{ vacancyId, add: ['Remote'] }]);

    await prisma.vacancy.delete({ where: { id: vacancyId } });

    expect(await tags.list(userId)).toMatchObject([{ name: 'Remote', vacancyCount: 0 }]);
  });
});

describe('TagService', () => {
  describe('create', () => {
    it('keeps the spelling, tidied, and defaults the tone', async () => {
      expect(await tags.create(userId, { name: '  Fully   Remote ' })).toEqual({
        id: expect.any(Number),
        name: 'Fully Remote',
        tone: 'NEUTRAL',
      });
    });

    it('takes a tone', async () => {
      expect(await tags.create(userId, { name: 'Dream', tone: 'GOOD' })).toMatchObject({
        tone: 'GOOD',
      });
    });

    it('refuses a name taken in any spelling', async () => {
      await tags.create(userId, { name: 'Remote' });
      await expect(tags.create(userId, { name: ' REMOTE ' })).rejects.toBeInstanceOf(
        TagNameTakenError,
      );
      expect(await allNames()).toEqual(['Remote']);
    });

    it('refuses a blank name and one over the limit, and takes one at it', async () => {
      await expect(tags.create(userId, { name: '   ' })).rejects.toBeInstanceOf(InvalidTagsError);
      await expect(
        tags.create(userId, { name: 'x'.repeat(MAX_LENGTH.tag + 1) }),
      ).rejects.toBeInstanceOf(InvalidTagsError);
      await tags.create(userId, { name: 'x'.repeat(MAX_LENGTH.tag) });
      expect(await tags.list(userId)).toHaveLength(1);
    });

    it('does not echo a huge name into the error, which is logged and answered', async () => {
      const error = await tags.create(userId, { name: 'x'.repeat(100_000) }).catch((e) => e);
      expect(error).toBeInstanceOf(InvalidTagsError);
      expect(error.message.length).toBeLessThan(200);
    });
  });

  describe('list', () => {
    it('sorts by name, whatever the case, and counts the vacancies', async () => {
      const [first, second] = [await vacancy(1), await vacancy(2)];
      await tags.tagVacancies(userId, [
        { vacancyId: first, add: ['remote', 'Poland'] },
        { vacancyId: second, add: ['remote'] },
      ]);
      await tags.create(userId, { name: 'Unused', tone: 'WARN' });

      expect(await tags.list(userId)).toEqual([
        { id: expect.any(Number), name: 'Poland', tone: 'NEUTRAL', vacancyCount: 1 },
        { id: expect.any(Number), name: 'remote', tone: 'NEUTRAL', vacancyCount: 2 },
        { id: expect.any(Number), name: 'Unused', tone: 'WARN', vacancyCount: 0 },
      ]);
    });
  });

  describe('update', () => {
    it('renames and changes the tone, each without the other', async () => {
      const { id } = await tags.create(userId, { name: 'Remote', tone: 'GOOD' });

      expect(await tags.update(userId, id, { name: ' Anywhere ' })).toEqual({
        id,
        name: 'Anywhere',
        tone: 'GOOD',
      });
      expect(await tags.update(userId, id, { tone: 'BAD' })).toEqual({
        id,
        name: 'Anywhere',
        tone: 'BAD',
      });
    });

    it('moves the key with the name, so the old name is free again', async () => {
      const { id } = await tags.create(userId, { name: 'Remote' });
      await tags.update(userId, id, { name: 'Anywhere' });

      await tags.create(userId, { name: 'remote' });
      await expect(tags.create(userId, { name: 'ANYWHERE' })).rejects.toBeInstanceOf(
        TagNameTakenError,
      );
    });

    it('changes the case of its own name', async () => {
      const { id } = await tags.create(userId, { name: 'remote' });
      expect(await tags.update(userId, id, { name: 'REMOTE' })).toMatchObject({ name: 'REMOTE' });
    });

    it('refuses a name another tag has', async () => {
      await tags.create(userId, { name: 'Remote' });
      const { id } = await tags.create(userId, { name: 'Hybrid' });
      await expect(tags.update(userId, id, { name: 'remote' })).rejects.toBeInstanceOf(
        TagNameTakenError,
      );
    });

    it('refuses an unknown id and a blank name', async () => {
      await expect(tags.update(userId, 2147483647, { tone: 'BAD' })).rejects.toBeInstanceOf(
        TagNotFoundError,
      );
      const { id } = await tags.create(userId, { name: 'Remote' });
      await expect(tags.update(userId, id, { name: ' ' })).rejects.toBeInstanceOf(InvalidTagsError);
    });
  });

  describe('delete', () => {
    it('takes the tag off its vacancies', async () => {
      const vacancyId = await vacancy(1);
      await tags.tagVacancies(userId, [{ vacancyId, add: ['Remote', 'Poland'] }]);
      const remote = (await tags.list(userId)).filter((tag) => tag.name === 'Remote')[0];

      await tags.delete(userId, remote.id);

      expect(await namesOn(vacancyId)).toEqual(['Poland']);
      expect(await allNames()).toEqual(['Poland']);
    });

    it('refuses an unknown id', async () => {
      await expect(tags.delete(userId, 2147483647)).rejects.toBeInstanceOf(TagNotFoundError);
    });
  });

  describe('tagVacancies', () => {
    it('finds or creates by name: one tag per spelling, the first one kept', async () => {
      const vacancyId = await vacancy(1);
      await tags.tagVacancies(userId, [{ vacancyId, add: [' Remote ', 'remote', 'REMOTE'] }]);
      expect(await namesOn(vacancyId)).toEqual(['Remote']);

      const second = await vacancy(2);
      await tags.tagVacancies(userId, [{ vacancyId: second, add: ['remote'] }]);
      expect(await namesOn(second)).toEqual(['Remote']);
      expect(await allNames()).toEqual(['Remote']);
    });

    it('gives a new name the neutral tone and leaves an existing tone alone', async () => {
      const vacancyId = await vacancy(1);
      await tags.create(userId, { name: 'Dream', tone: 'GOOD' });
      await tags.tagVacancies(userId, [{ vacancyId, add: ['dream', 'Remote'] }]);

      expect((await tags.list(userId)).map((tag) => [tag.name, tag.tone])).toEqual([
        ['Dream', 'GOOD'],
        ['Remote', 'NEUTRAL'],
      ]);
    });

    it('repeats harmlessly', async () => {
      const vacancyId = await vacancy(1);
      await tags.tagVacancies(userId, [{ vacancyId, add: ['Remote'] }]);
      await tags.tagVacancies(userId, [{ vacancyId, add: ['Remote'] }]);
      expect(await namesOn(vacancyId)).toEqual(['Remote']);
    });

    it('removes by any spelling, the tag itself stays, an unknown name is ignored', async () => {
      const vacancyId = await vacancy(1);
      await tags.tagVacancies(userId, [{ vacancyId, add: ['Remote', 'Poland'] }]);

      await tags.tagVacancies(userId, [{ vacancyId, remove: [' REMOTE ', 'Never existed'] }]);

      expect(await namesOn(vacancyId)).toEqual(['Poland']);
      expect(await allNames()).toEqual(['Poland', 'Remote']);
    });

    it("refuses an unknown or another user's vacancy, even with nothing to add", async () => {
      const other = await createUser();
      const foreign = await vacancy(1, other);
      const mine = await vacancy(2);

      for (const item of [
        { vacancyId: foreign, add: ['Remote'] },
        { vacancyId: foreign, remove: ['Remote'] },
        { vacancyId: foreign },
        { vacancyId: 2147483647 },
        { vacancyId: 2147483648 },
      ]) {
        await expect(
          tags.tagVacancies(userId, [{ vacancyId: mine, add: ['Mine'] }, item]),
        ).rejects.toBeInstanceOf(VacancyNotFoundError);
      }
      expect(await allNames()).toEqual([]);
      expect(await namesOn(mine)).toEqual([]);
    });

    it('is all or nothing: a bad name leaves no tag and no link', async () => {
      const [first, second] = [await vacancy(1), await vacancy(2)];

      await expect(
        tags.tagVacancies(userId, [
          { vacancyId: first, add: ['Remote'] },
          { vacancyId: second, add: ['   '] },
        ]),
      ).rejects.toBeInstanceOf(InvalidTagsError);

      expect(await allNames()).toEqual([]);
      expect(await namesOn(first)).toEqual([]);
    });

    it('holds a vacancy to the limit, counting what it already has', async () => {
      const vacancyId = await vacancy(1);
      await tags.tagVacancies(userId, [{ vacancyId, add: names(TAGS_PER_VACANCY_MAX) }]);
      expect(await namesOn(vacancyId)).toHaveLength(TAGS_PER_VACANCY_MAX);

      await expect(
        tags.tagVacancies(userId, [{ vacancyId, add: ['One more'] }]),
      ).rejects.toBeInstanceOf(InvalidTagsError);
      expect(await allNames()).not.toContain('One more');

      // A repeat is not one more, and a removal in the same item makes room.
      await tags.tagVacancies(userId, [{ vacancyId, add: names(1) }]);
      await tags.tagVacancies(userId, [{ vacancyId, add: ['One more'], remove: names(1) }]);
      expect(await namesOn(vacancyId)).toContain('One more');
    });

    it('moves neither the status, the analysis, the journal nor the row', async () => {
      const { vacancy: row } = await vacancies.save(userId, {
        company: 'Acme',
        title: 'Dev',
        applyUrl: 'https://example.com/tags/analysed',
        fullText: 'Text.',
        matchScore: 40,
        recommendation: 'SKIP',
        estimationComment: 'No.',
      });
      const snapshot = () =>
        prisma.vacancy.findUniqueOrThrow({
          where: { id: row.id },
          include: { statusChanges: true, comments: true },
        });
      const before = await snapshot();

      await tags.tagVacancies(userId, [{ vacancyId: row.id, add: ['Remote'] }]);
      await tags.tagVacancies(userId, [{ vacancyId: row.id, remove: ['Remote'] }]);

      expect(await snapshot()).toEqual(before);
    });

    it('takes parallel calls that overlap, in opposite orders', async () => {
      const [first, second] = [await vacancy(1), await vacancy(2)];
      const shared = names(5, 'shared');

      await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          tags.tagVacancies(userId, [
            { vacancyId: first, add: i % 2 ? shared : [...shared].reverse() },
            { vacancyId: second, add: i % 2 ? [...shared].reverse() : shared },
          ]),
        ),
      );

      expect(await allNames()).toEqual(shared);
      expect(await namesOn(first)).toEqual(shared);
      expect(await namesOn(second)).toEqual(shared);
    });

    it('takes parallel batches whose items add new names in opposite orders', async () => {
      const [first, second] = [await vacancy(1), await vacancy(2)];
      const zeta = { vacancyId: first, add: ['Zeta'] };
      const alpha = { vacancyId: second, add: ['Alpha'] };

      await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          tags.tagVacancies(userId, i % 2 ? [zeta, alpha] : [alpha, zeta]),
        ),
      );

      expect(await allNames()).toEqual(['Alpha', 'Zeta']);
    });

    it('takes parallel batches over existing tags, the items in opposite orders', async () => {
      const [first, second] = [await vacancy(1), await vacancy(2)];
      await tags.create(userId, { name: 'Alpha' });
      await tags.create(userId, { name: 'Zeta' });
      const zeta = { vacancyId: first, add: ['Zeta'] };
      const alpha = { vacancyId: second, add: ['Alpha'] };

      await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          tags.tagVacancies(userId, i % 2 ? [zeta, alpha] : [alpha, zeta]),
        ),
      );

      expect(await namesOn(first)).toEqual(['Zeta']);
      expect(await namesOn(second)).toEqual(['Alpha']);
    });

    it('takes parallel writes alongside markUnavailable, its items in reverse order', async () => {
      const ids: number[] = [];
      for (let n = 0; n < 6; n++) ids.push(await vacancy(n));
      const reversed = [...ids].reverse().map((id) => ({ id, reason: 'Gone' }));

      await Promise.all([
        vacancies.markUnavailable(userId, reversed),
        ...Array.from({ length: 6 }, () =>
          tags.tagVacancies(
            userId,
            ids.map((vacancyId) => ({ vacancyId, add: ['Alpha'] })),
          ),
        ),
      ]);

      expect(await namesOn(ids[0])).toEqual(['Alpha']);
    });

    it('takes parallel swaps on one vacancy', async () => {
      const vacancyId = await vacancy(1);
      await tags.tagVacancies(userId, [{ vacancyId, add: ['Alpha', 'Zeta'] }]);

      await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          tags.tagVacancies(userId, [
            i % 2
              ? { vacancyId, add: ['Alpha'], remove: ['Zeta'] }
              : { vacancyId, add: ['Zeta'], remove: ['Alpha'] },
          ]),
        ),
      );

      expect(await namesOn(vacancyId)).toHaveLength(1);
    });

    it('holds the limit against parallel writes', async () => {
      const vacancyId = await vacancy(1);
      await tags.tagVacancies(userId, [{ vacancyId, add: names(TAGS_PER_VACANCY_MAX - 1) }]);

      const results = await Promise.allSettled(
        ['One', 'Two', 'Three', 'Four'].map((name) =>
          tags.tagVacancies(userId, [{ vacancyId, add: [name] }]),
        ),
      );

      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(await namesOn(vacancyId)).toHaveLength(TAGS_PER_VACANCY_MAX);
    });

    it('takes a full batch at the limit inside the transaction timeout', async () => {
      const ids: number[] = [];
      for (let n = 0; n < ANALYSIS_BATCH_MAX; n++) ids.push(await vacancy(n));

      await tags.tagVacancies(
        userId,
        ids.map((vacancyId) => ({ vacancyId, add: names(TAGS_PER_VACANCY_MAX) })),
      );

      expect(await namesOn(ids[0])).toHaveLength(TAGS_PER_VACANCY_MAX);
    });
  });
});
