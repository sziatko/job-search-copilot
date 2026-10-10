import type { VacancyStatus } from '@prisma/client';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApplicationService } from './application.service';
import {
  AlreadyAppliedError,
  AmbiguousVacancyMatchError,
  InvalidApplicationInputError,
} from './errors';
import { getPrisma } from './prisma-client';
import { VacancyService } from './vacancy.service';

// Integration tests against the real (test) Postgres — same rationale as
// vacancy.service.spec.ts.
const applications = new ApplicationService();
const vacancies = new VacancyService();
const prisma = getPrisma();

/** [source, body] per comment, in the order they came back. */
const notes = (item: { comments: { source: string; body: string }[] } | null) =>
  item?.comments.map((c) => [c.source, c.body]);

/** The vacancy's status journal, oldest first. */
async function journal(vacancyId: number) {
  const rows = await prisma.statusChange.findMany({
    where: { vacancyId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => row.status);
}

/** The cache agrees with the journal: status and date are its latest row's. */
async function expectCacheInStep(vacancyId: number) {
  const vacancy = await prisma.vacancy.findUniqueOrThrow({ where: { id: vacancyId } });
  const latest = await prisma.statusChange.findFirstOrThrow({
    where: { vacancyId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  expect(vacancy.status).toBe(latest.status);
  expect(vacancy.statusChangedAt).toEqual(latest.createdAt);
}

/** Every seeded vacancy was saved by the analyzer, so its comments start with this. */
const ANALYZED = ['ANALYZER', 'Strong match.'];

let urlSeq = 0;
async function seedVacancy(
  overrides: { company?: string; title?: string; status?: VacancyStatus } = {},
) {
  urlSeq += 1;
  const { vacancy } = await vacancies.save({
    company: overrides.company ?? 'Acme',
    title: overrides.title ?? 'Backend Engineer',
    applyUrl: `https://example.com/jobs/${urlSeq}`,
    fullText: 'Full vacancy text.',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
  });
  if (overrides.status) {
    await vacancies.updateStatus(vacancy.id, overrides.status);
  }
  return vacancy;
}

describe('ApplicationService', () => {
  describe('record — by id (web path)', () => {
    it('moves the vacancy to APPLIED and sets salary / CV / comment', async () => {
      const vacancy = await seedVacancy({ status: 'SAVED_FOR_LATER' });

      const result = await applications.record({
        vacancyId: vacancy.id,
        salaryInApplication: '130 PLN/h',
        usedTailoredResume: true,
        comment: '  Adapted CV.  ',
      });

      expect(result.resolution).toBe('linked-by-id');
      expect(result.vacancyCreated).toBe(false);
      expect(result.application).toMatchObject({
        id: vacancy.id,
        company: 'Acme',
        matchScore: 80,
        salaryInApplication: '130 PLN/h',
        usedTailoredResume: true,
        status: 'APPLIED',
      });
      expect(notes(result.application)).toEqual([ANALYZED, ['USER', 'Adapted CV.']]);

      const reread = await vacancies.getById(vacancy.id);
      expect(reread?.status).toBe('APPLIED');
      expect(reread?.matchScore).toBe(80); // analyzer fields untouched
    });

    it('writes exactly one journal row, and appliedAt is its date', async () => {
      const vacancy = await seedVacancy();
      const { application } = await applications.record({ vacancyId: vacancy.id });

      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'APPLIED']);
      await expectCacheInStep(vacancy.id);
      expect(application.appliedAt).toEqual(application.statusChangedAt);
    });

    it('throws for an unknown vacancy id', async () => {
      await expect(applications.record({ vacancyId: 999_999 })).rejects.toBeInstanceOf(
        InvalidApplicationInputError,
      );
    });

    it('throws AlreadyAppliedError for a vacancy already in the pipeline', async () => {
      const vacancy = await seedVacancy();
      await applications.record({ vacancyId: vacancy.id });
      await applications.updateStatus(vacancy.id, 'REJECTED', undefined, 'USER');

      await expect(applications.record({ vacancyId: vacancy.id })).rejects.toBeInstanceOf(
        AlreadyAppliedError,
      );
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'APPLIED', 'REJECTED']);
    });

    it('applies again to a vacancy set back to triage', async () => {
      const vacancy = await seedVacancy();
      await applications.record({ vacancyId: vacancy.id });
      await vacancies.updateStatus(vacancy.id, 'NOT_REVIEWED');

      const { application } = await applications.record({ vacancyId: vacancy.id });
      expect(application.status).toBe('APPLIED');
      expect(await journal(vacancy.id)).toEqual([
        'NEW',
        'NOT_REVIEWED',
        'APPLIED',
        'NOT_REVIEWED',
        'APPLIED',
      ]);
    });
  });

  describe('record — by (company, title) (MCP path)', () => {
    it('links to a unique case-insensitive match', async () => {
      const vacancy = await seedVacancy({ company: 'Acme', title: 'Backend Engineer' });

      const result = await applications.record({ company: 'acme', title: 'backend engineer' });

      expect(result.resolution).toBe('linked-existing');
      expect(result.vacancyCreated).toBe(false);
      expect(result.application.id).toBe(vacancy.id);
      expect((await vacancies.getById(vacancy.id))?.status).toBe('APPLIED');
    });

    it('creates a placeholder vacancy when nothing matches', async () => {
      const result = await applications.record({
        company: 'Never Analyzed Co',
        title: 'Staff Engineer',
        matchScore: 72,
        estimationComment: 'From tracker notes.',
      });

      expect(result.resolution).toBe('created-vacancy');
      expect(result.vacancyCreated).toBe(true);
      expect(result.application.matchScore).toBe(72);
      expect(result.application.recommendation).toBe('APPLY'); // derived from 72
      expect(result.application.applyUrl).toMatch(/^tracker:\/\//);
      expect(notes(result.application)).toEqual([['ANALYZER', 'From tracker notes.']]);

      const created = await vacancies.getById(result.application.id);
      expect(created?.fullText).toBeNull();
      expect(created).toMatchObject({ companyKey: 'never analyzed', titleKey: 'staff engineer' });
      expect(created?.status).toBe('APPLIED');
      expect(await journal(result.application.id)).toEqual(['NEW', 'APPLIED']);
      await expectCacheInStep(result.application.id);
    });

    it('writes no ANALYZER comment for a placeholder given none', async () => {
      const result = await applications.record({
        company: 'Silent Co',
        title: 'Dev',
        comment: ' ',
      });
      expect(result.application.comments).toEqual([]);
    });

    it('creates no analysis without a matchScore, a recommendation alone ignored', async () => {
      const result = await applications.record({
        company: 'Blank Co',
        title: 'Dev',
        recommendation: 'SKIP',
      });
      expect(result.application.matchScore).toBeNull();
      expect(result.application.recommendation).toBeNull();
      expect(await journal(result.application.id)).toEqual(['NEW', 'APPLIED']);
    });

    it('throws AmbiguousVacancyMatchError on more than one match', async () => {
      await seedVacancy({ company: 'Dup Co', title: 'Engineer' });
      await seedVacancy({ company: 'Dup Co', title: 'Engineer' });
      await expect(
        applications.record({ company: 'Dup Co', title: 'Engineer' }),
      ).rejects.toBeInstanceOf(AmbiguousVacancyMatchError);
    });

    it('throws for blank company/title', async () => {
      await expect(applications.record({ company: '  ', title: 'X' })).rejects.toBeInstanceOf(
        InvalidApplicationInputError,
      );
    });

    it('journals APPLIED before a status given further along, so appliedAt survives', async () => {
      const result = await applications.record({
        company: 'Status Co',
        title: 'Dev',
        status: 'REJECTED',
      });
      expect(result.application.status).toBe('REJECTED');
      expect(result.application.appliedAt).toEqual(result.application.statusChangedAt);
      expect(await journal(result.application.id)).toEqual(['NEW', 'APPLIED', 'REJECTED']);
      await expectCacheInStep(result.application.id);
    });
  });

  describe('list', () => {
    let acmeId: number;
    let acmeUrl: string;

    beforeEach(async () => {
      const a = await seedVacancy({ company: 'Acme', title: 'Backend Engineer' });
      const b = await seedVacancy({ company: 'Beta Corp', title: 'Frontend Lead' });
      acmeId = a.id;
      acmeUrl = a.applyUrl;
      await applications.record({ vacancyId: a.id });
      await applications.record({ vacancyId: b.id, status: 'REJECTED' });
      // Triage rows stay off /applications.
      await seedVacancy({ company: 'Triage Co', status: 'SAVED_FOR_LATER' });
      await seedVacancy({ company: 'Declined Co', status: 'DECLINED' });
    });

    it('returns only pipeline rows, the last move first', async () => {
      const { items, total } = await applications.list();
      expect(total).toBe(2);
      expect(items.map((item) => item.company)).toEqual(['Beta Corp', 'Acme']);
    });

    it('moves a row to the top on a status write, not on a comment or an edit', async () => {
      await applications.updateStatus(acmeId, 'INTERVIEW', undefined, 'USER');
      expect((await applications.list()).items[0].company).toBe('Acme');

      const beta = (await applications.list()).items[1];
      await applications.update(beta.id, { comment: 'A note.', salaryInApplication: '1' });
      expect((await applications.list()).items[0].company).toBe('Acme');

      // The status it already has is an event too.
      await applications.updateStatus(beta.id, 'REJECTED', undefined, 'USER');
      expect((await applications.list()).items[0].company).toBe('Beta Corp');
    });

    it('finds a row by its applyUrl, normalized as save does', async () => {
      const { items } = await applications.list({
        applyUrl: `${acmeUrl}/?utm_source=mail`,
      });
      expect(items.map((item) => item.company)).toEqual(['Acme']);
      expect((await applications.list({ applyUrl: 'https://example.com/nope' })).total).toBe(0);
    });

    it('carries companyMatchCount: every vacancy of the company, triage ones included', async () => {
      await seedVacancy({ company: 'ACME Polska', title: 'Triage', status: 'DECLINED' });
      const { items } = await applications.list();
      const counts = Object.fromEntries(
        items.map((item) => [item.company, item.companyMatchCount]),
      );
      expect(counts).toEqual({ Acme: 2, 'Beta Corp': 1 });
    });

    it('sameCompanyAs lists the applications of every spelling of the company', async () => {
      const polska = await seedVacancy({ company: 'Acme Polska', status: 'APPLIED' });
      const ids = async (sameCompanyAs: string) =>
        (await applications.list({ sameCompanyAs })).items.map((item) => item.id).sort();

      const acme = await ids('Acme');
      expect(acme).toHaveLength(2);
      expect(acme).toContain(polska.id);
      expect(await ids('ACME Polska')).toEqual(acme);
      // Only the pipeline: the triage rows of other companies stay out regardless.
      expect(await ids('Beta Corp')).toHaveLength(1);
    });

    it('filters by status', async () => {
      const { items, total } = await applications.list({ status: 'REJECTED' });
      expect(total).toBe(1);
      expect(items[0].company).toBe('Beta Corp');
    });

    it('search matches company OR title, case-insensitively', async () => {
      expect((await applications.list({ search: 'acme' })).total).toBe(1);
      expect((await applications.list({ search: 'lead' })).total).toBe(1);
      expect((await applications.list({ search: 'engineer' })).total).toBe(1);
    });

    it('filters by company alone, case-insensitively', async () => {
      const { items, total } = await applications.list({ company: 'acme' });
      expect(total).toBe(1);
      expect(items[0].company).toBe('Acme');
    });

    it('filters by title alone, case-insensitively', async () => {
      const { items, total } = await applications.list({ title: 'lead' });
      expect(total).toBe(1);
      expect(items[0].title).toBe('Frontend Lead');
    });

    it('treats a LIKE metacharacter in the term as literal', async () => {
      // The same two columns as the vacancy service's own search, so `%` here would
      // widen to every application rather than matching nothing.
      expect((await applications.list({ search: '%' })).total).toBe(0);
      expect((await applications.list({ search: '_' })).total).toBe(0);
      expect((await applications.list({ company: '%' })).total).toBe(0);
    });

    it('combines company and title via AND, not OR', async () => {
      // Both fields exist, but only "Acme" / "Backend Engineer" satisfies both at once.
      expect((await applications.list({ company: 'acme', title: 'backend' })).total).toBe(1);
      expect((await applications.list({ company: 'acme', title: 'lead' })).total).toBe(0);
    });

    it('respects limit/offset', async () => {
      const page = await applications.list({ limit: 1, offset: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(2);
    });

    it('orders rows that share one statusChangedAt, so two pages do not overlap', async () => {
      // A migrated batch shares one date, so a tie is the normal case, not an exotic
      // one. Read as windows, an unstable order serves one row twice and skips
      // another; `id desc` is what makes them disjoint.
      const stamp = new Date('2099-01-01');
      for (const company of ['Tie One', 'Tie Two', 'Tie Three']) {
        const vacancy = await seedVacancy({ company, title: 'Same Stamp' });
        await applications.record({ vacancyId: vacancy.id });
        await prisma.vacancy.update({
          where: { id: vacancy.id },
          data: { statusChangedAt: stamp },
        });
      }

      const first = await applications.list({ limit: 3 });
      const second = await applications.list({ limit: 3, offset: 3 });

      const tiedIds = first.items.map((item) => item.id);
      expect(first.items.every((item) => item.statusChangedAt.getTime() === stamp.getTime())).toBe(
        true,
      );
      expect(tiedIds).toEqual([...tiedIds].sort((a, b) => b - a));

      const ids = [...first.items, ...second.items].map((item) => item.id);
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
    });

    describe('Active / Timeout (state) and cursor', () => {
      const DAY = 86_400_000;
      const setLastMove = (id: number, daysAgo: number) =>
        prisma.vacancy.update({
          where: { id },
          data: { statusChangedAt: new Date(Date.now() - daysAgo * DAY) },
        });
      const companies = (items: { company: string }[]) => items.map((item) => item.company);

      beforeEach(async () => {
        // Acme APPLIED and Beta Corp REJECTED, both silent for 40 days; Fresh Co moved
        // today. The closed one is never timed out, however old.
        const fresh = await seedVacancy({ company: 'Fresh Co' });
        await applications.record({ vacancyId: fresh.id, status: 'INTERVIEW' });
        const beta = (await applications.list({ status: 'REJECTED' })).items[0];
        await setLastMove(acmeId, 40);
        await setLastMove(beta.id, 40);
      });

      it('flags each item, and filters on the same rule', async () => {
        const { items } = await applications.list();
        expect(items.map((item) => [item.company, item.timedOut])).toEqual([
          ['Fresh Co', false],
          ['Beta Corp', false],
          ['Acme', true],
        ]);

        const timedOut = await applications.list({ state: 'timedOut' });
        expect(companies(timedOut.items)).toEqual(['Acme']);
        expect(timedOut.total).toBe(1);
        const active = await applications.list({ state: 'active' });
        expect(companies(active.items)).toEqual(['Fresh Co']);
        expect(active.total).toBe(1);
      });

      it('splits at 30 days: 29 is active, 31 timed out', async () => {
        await setLastMove(acmeId, 29);
        expect((await applications.list({ state: 'timedOut' })).total).toBe(0);
        await setLastMove(acmeId, 31);
        expect((await applications.list({ state: 'timedOut' })).total).toBe(1);
      });

      it('ANDs state with status', async () => {
        expect((await applications.list({ status: 'APPLIED', state: 'timedOut' })).total).toBe(1);
        expect((await applications.list({ status: 'INTERVIEW', state: 'timedOut' })).total).toBe(0);
        expect((await applications.list({ status: 'REJECTED', state: 'active' })).total).toBe(0);
      });

      it('pages by cursor without gaps or repeats', async () => {
        const seen: string[] = [];
        let cursor: number | undefined;
        do {
          const page = await applications.list({ limit: 2, cursor });
          seen.push(...companies(page.items));
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        expect(seen).toEqual(['Fresh Co', 'Beta Corp', 'Acme']);
      });

      it('pages on from a cursor row that a status write moved out of the filter', async () => {
        // A second active row, older than Fresh Co, for the next page to find.
        await setLastMove(acmeId, 5);
        const first = await applications.list({ state: 'active', limit: 1 });
        expect(companies(first.items)).toEqual(['Fresh Co']);
        // The cursor row leaves `active`.
        await applications.updateStatus(first.items[0].id, 'OFFER', undefined, 'USER');

        const next = await applications.list({
          state: 'active',
          limit: 1,
          cursor: first.nextCursor ?? undefined,
        });
        expect(companies(next.items)).toEqual(['Acme']);
      });
    });
  });

  describe('getById', () => {
    it('returns a pipeline row, and null for a triage one', async () => {
      const applied = await seedVacancy();
      await applications.record({ vacancyId: applied.id });
      const saved = await seedVacancy({ status: 'SAVED_FOR_LATER' });

      expect((await applications.getById(applied.id))?.status).toBe('APPLIED');
      expect(await applications.getById(saved.id)).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('returns null for an unknown id', async () => {
      expect(await applications.updateStatus(999_999, 'INTERVIEW', undefined, 'USER')).toBeNull();
    });

    it('writes one journal row and keeps the cache in step', async () => {
      const vacancy = await seedVacancy();
      await applications.record({ vacancyId: vacancy.id });
      const updated = await applications.updateStatus(vacancy.id, 'INTERVIEW', undefined, 'USER');

      expect(updated?.status).toBe('INTERVIEW');
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'APPLIED', 'INTERVIEW']);
      await expectCacheInStep(vacancy.id);
      expect(notes(updated)).toEqual([ANALYZED]);
    });

    it('journals the status it already has as a new event — the next interview round', async () => {
      const vacancy = await seedVacancy();
      await applications.record({ vacancyId: vacancy.id });
      const first = await applications.updateStatus(vacancy.id, 'INTERVIEW', 'Round 1.', 'AGENT');

      const second = await applications.updateStatus(vacancy.id, 'INTERVIEW', 'Round 2.', 'AGENT');

      expect(await journal(vacancy.id)).toEqual([
        'NEW',
        'NOT_REVIEWED',
        'APPLIED',
        'INTERVIEW',
        'INTERVIEW',
      ]);
      expect(second?.statusChangedAt.getTime()).toBeGreaterThanOrEqual(
        first?.statusChangedAt.getTime() ?? 0,
      );
      await expectCacheInStep(vacancy.id);
      expect(notes(second)).toEqual([ANALYZED, ['AGENT', 'Round 1.'], ['AGENT', 'Round 2.']]);
    });

    it('record writes one APPLIED row when told status APPLIED', async () => {
      const vacancy = await seedVacancy();
      await applications.record({ vacancyId: vacancy.id, status: 'APPLIED' });
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'APPLIED']);
    });

    it('keeps appliedAt when the row moves on', async () => {
      const vacancy = await seedVacancy();
      const { application } = await applications.record({ vacancyId: vacancy.id });
      const moved = await applications.updateStatus(vacancy.id, 'OFFER', undefined, 'USER');
      expect(moved?.appliedAt).toEqual(application.appliedAt);
    });

    it('has no appliedAt for a row set straight past APPLIED', async () => {
      const vacancy = await seedVacancy();
      const moved = await applications.updateStatus(vacancy.id, 'INTERVIEW', undefined, 'USER');
      expect(moved?.appliedAt).toBeNull();
    });

    it("turns each status note into its own comment row, with the caller's source, oldest first", async () => {
      const vacancy = await seedVacancy();
      await applications.record({ vacancyId: vacancy.id });

      const first = await applications.updateStatus(
        vacancy.id,
        'RECRUITER_SCREEN',
        'Recruiter called.',
        'AGENT',
      );
      expect(notes(first)).toEqual([ANALYZED, ['AGENT', 'Recruiter called.']]);
      expect(first?.comments[1].createdAt).toBeInstanceOf(Date);

      await applications.updateStatus(vacancy.id, 'INTERVIEW', 'Interview on 20.09.', 'USER');
      const third = await applications.updateStatus(
        vacancy.id,
        'OFFER',
        'Offer received!',
        'AGENT',
      );
      expect(notes(third)).toEqual([
        ANALYZED,
        ['AGENT', 'Recruiter called.'],
        ['USER', 'Interview on 20.09.'],
        ['AGENT', 'Offer received!'],
      ]);
      expect(await prisma.comment.count({ where: { vacancyId: vacancy.id } })).toBe(4);
    });

    it('trims the comment and ignores a blank one', async () => {
      const vacancy = await seedVacancy();
      await applications.record({ vacancyId: vacancy.id });
      const withSpaces = await applications.updateStatus(
        vacancy.id,
        'INTERVIEW',
        '  padded  ',
        'USER',
      );
      expect(notes(withSpaces)).toEqual([ANALYZED, ['USER', 'padded']]);
      const unchanged = await applications.updateStatus(vacancy.id, 'OFFER', '   ', 'USER');
      expect(notes(unchanged)).toEqual([ANALYZED, ['USER', 'padded']]);
    });

    it('returns null for an unknown id even when a comment is given', async () => {
      expect(await applications.updateStatus(999_999, 'INTERVIEW', 'note', 'USER')).toBeNull();
    });
  });

  describe('update', () => {
    it('changes only the fields given, and a blank string clears one', async () => {
      const vacancy = await seedVacancy();
      await applications.record({ vacancyId: vacancy.id, salaryInApplication: '100 PLN/h' });

      const edited = await applications.update(vacancy.id, { usedTailoredResume: true });
      expect(edited).toMatchObject({
        salaryInApplication: '100 PLN/h',
        usedTailoredResume: true,
        status: 'APPLIED',
      });
      expect(notes(edited)).toEqual([ANALYZED]);

      const cleared = await applications.update(vacancy.id, { salaryInApplication: '  ' });
      expect(cleared?.salaryInApplication).toBeNull();
    });

    it('adds a non-blank comment as a USER row, and moves nothing', async () => {
      const vacancy = await seedVacancy();
      const { application } = await applications.record({
        vacancyId: vacancy.id,
        comment: 'First note',
      });

      const edited = await applications.update(vacancy.id, { comment: '  Went well.  ' });
      expect(notes(edited)).toEqual([ANALYZED, ['USER', 'First note'], ['USER', 'Went well.']]);
      expect(edited?.statusChangedAt).toEqual(application.statusChangedAt);
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'APPLIED']);

      const blank = await applications.update(vacancy.id, { comment: '   ' });
      expect(blank?.comments).toHaveLength(3);
    });

    it('returns null for an unknown id', async () => {
      expect(await applications.update(999_999, { comment: 'x' })).toBeNull();
    });
  });

  describe('addComment', () => {
    it('adds a trimmed comment with the given source, and moves nothing', async () => {
      const vacancy = await seedVacancy();
      const { application } = await applications.record({ vacancyId: vacancy.id });

      const edited = await applications.addComment(vacancy.id, '  Recruiter wrote.  ', 'AGENT');
      expect(notes(edited)).toEqual([ANALYZED, ['AGENT', 'Recruiter wrote.']]);
      expect(edited?.statusChangedAt).toEqual(application.statusChangedAt);
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'APPLIED']);
    });

    it('refuses a blank body and returns null for an unknown id', async () => {
      const vacancy = await seedVacancy();
      await expect(applications.addComment(vacancy.id, '  ', 'USER')).rejects.toBeInstanceOf(
        InvalidApplicationInputError,
      );
      expect(await applications.addComment(999_999, 'x', 'USER')).toBeNull();
    });
  });

  describe('updateStatusByVacancy', () => {
    it('resolves a unique (company, title) match and updates it', async () => {
      const vacancy = await seedVacancy({ company: 'Delta Co', title: 'Dev' });
      await applications.record({ vacancyId: vacancy.id });

      const updated = await applications.updateStatusByVacancy(
        'delta co',
        'DEV',
        'REJECTED',
        'Rejection email received.',
        'AGENT',
      );
      expect(updated?.id).toBe(vacancy.id);
      expect(updated?.status).toBe('REJECTED');
      expect(notes(updated)).toEqual([ANALYZED, ['AGENT', 'Rejection email received.']]);
    });

    it('returns null for a vacancy never applied to, and writes nothing', async () => {
      const vacancy = await seedVacancy({ company: 'Foxtrot Co', title: 'Dev' });
      const updated = await applications.updateStatusByVacancy(
        'Foxtrot Co',
        'Dev',
        'REJECTED',
        undefined,
        'AGENT',
      );
      expect(updated).toBeNull();
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED']);
    });

    it('ignores a triage duplicate of the applied vacancy', async () => {
      const applied = await seedVacancy({ company: 'Hotel Co', title: 'Dev' });
      await seedVacancy({ company: 'Hotel Co', title: 'Dev' });
      await applications.record({ vacancyId: applied.id });
      const updated = await applications.updateStatusByVacancy(
        'Hotel Co',
        'Dev',
        'INTERVIEW',
        undefined,
        'AGENT',
      );
      expect(updated?.id).toBe(applied.id);
    });

    it('returns null when no vacancy matches', async () => {
      expect(
        await applications.updateStatusByVacancy(
          'Nobody Inc',
          'Ghost Role',
          'REJECTED',
          undefined,
          'AGENT',
        ),
      ).toBeNull();
    });

    it('throws AmbiguousVacancyMatchError for two applied vacancies with the same (company, title)', async () => {
      const first = await seedVacancy({ company: 'Golf Co', title: 'Dev' });
      const second = await seedVacancy({ company: 'Golf Co', title: 'Dev' });
      await applications.record({ vacancyId: first.id });
      await applications.record({ vacancyId: second.id });
      await expect(
        applications.updateStatusByVacancy('Golf Co', 'Dev', 'REJECTED', undefined, 'AGENT'),
      ).rejects.toThrow(AmbiguousVacancyMatchError);
    });

    it('throws InvalidApplicationInputError for blank company/title', async () => {
      await expect(
        applications.updateStatusByVacancy('  ', 'Dev', 'REJECTED', undefined, 'AGENT'),
      ).rejects.toThrow(InvalidApplicationInputError);
    });
  });

  describe('recordMany', () => {
    it('records a mixed batch in one call', async () => {
      const existing = await seedVacancy({ company: 'Batch Co', title: 'Dev' });
      const { results } = await applications.recordMany([
        { vacancyId: existing.id },
        { company: 'Fresh Co', title: 'Engineer', matchScore: 65 },
      ]);
      expect(results.map((r) => r.resolution)).toEqual(['linked-by-id', 'created-vacancy']);
      expect((await applications.list()).total).toBe(2);
    });

    it('rolls the whole batch back if one row fails', async () => {
      const vacancy = await seedVacancy();
      await expect(
        applications.recordMany([
          { vacancyId: vacancy.id },
          { company: 'Rollback Co', title: 'Dev' },
          { vacancyId: 999_999 }, // fails
          { company: 'Never Inserted', title: 'Dev' },
        ]),
      ).rejects.toBeInstanceOf(InvalidApplicationInputError);
      expect((await applications.list()).total).toBe(0);
      expect((await vacancies.list({ company: 'Rollback Co' })).total).toBe(0);
      // The pre-existing seed vacancy is untouched, its journal included.
      expect((await vacancies.getById(vacancy.id))?.status).toBe('NOT_REVIEWED');
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED']);
    });
  });
});
