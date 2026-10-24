import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUser } from '../../tests/user';
import { ApplicationService } from '../applications/application.service';
import { getPrisma } from '../db/prisma-client';
import {
  AlreadyAnalysedError,
  AnalysedNotNewError,
  InvalidRecommendationError,
  SameStatusError,
  VacancyNotFoundError,
} from '../domain/errors';
import { companyGroupKey } from '../domain/identity';
import { VacancyIntakeService } from '../intake/vacancy-intake.service';
import { VacancyService } from './vacancy.service';
import type { ListVacanciesFilters, SaveVacancyInput, VacancyListItem } from './vacancy.types';

/** Every call acts as this test's user (ADR-0038). */
let userId: string;
beforeEach(async () => {
  userId = await createUser();
});

// Integration tests: hit the real (test) Postgres database instead of mocking
// Prisma. A mocked Prisma client would just re-assert our own query calls and
// break on every harmless refactor — the DB round-trip is what actually matters.
const service = new VacancyService();
const intake = new VacancyIntakeService();

/** A vacancy intake took in: NEW, unanalysed, no text. Returns its id. */
async function queued(n: number): Promise<number> {
  const url = `https://example.com/queue/${n}`;
  await intake.intake(userId, { url, company: 'Queued Co', title: `Dev ${n}` });
  return (
    await getPrisma().vacancy.findUniqueOrThrow({
      where: { userId_applyUrl: { userId, applyUrl: url } },
    })
  ).id;
}

const analysis = { matchScore: 70, recommendation: 'APPLY', estimationComment: 'Good.' };

/** The vacancy's status journal, oldest first. */
async function journal(vacancyId: number) {
  const rows = await getPrisma().statusChange.findMany({
    where: { vacancyId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => row.status);
}

/** Posting text long enough to be stored (MIN_TEXT_LENGTH). */
const FULL_TEXT = 'Full vacancy text goes here. '.padEnd(200, 'x');

function input(overrides: Partial<SaveVacancyInput> = {}): SaveVacancyInput {
  return {
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/jobs/1',
    fullText: FULL_TEXT,
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
    ...overrides,
  };
}

/** company → companyMatchCount, so a count can be asserted without depending on
 * the page's order (row order is createdAt desc, and rows saved in the same
 * millisecond have no order to depend on). */
function countsByCompany(items: VacancyListItem[]): Record<string, number> {
  return Object.fromEntries(items.map((item) => [item.company, item.companyMatchCount]));
}

// Made-up names, one per rule: a country or region, a note, a legal form, case and
// punctuation join; a substring, a prefix or a shared first word do not.
describe('companyGroupKey', () => {
  it.each([
    ['Contoso', 'Contoso Polska'],
    ['Globex Polska', 'Globex Poland'],
    ['Initech', 'Initech Spain'],
    ['Umbrella', 'Umbrella España & Latam'],
    ['Fabrikam', 'Fabrikam (partner company)'],
    ['Q7', 'Q7 Sp. z o. o.'],
    ['Hooli', 'Hooli Inc'],
    ['Vandelay', 'Vandelay_'],
    ['iAcme', 'Iacme'],
  ])('%j and %j are one company', (a, b) => {
    expect(companyGroupKey(a)).toBe(companyGroupKey(b));
  });

  it.each([
    ['iO', 'Globex.io'],
    ['Ark', 'Starkline'],
    ['Nord', 'Nordwind People'],
    ['Tailspin', 'Tenth Tailspinion Group'],
    ['Acme Grove', 'Acme Garden'],
  ])('%j and %j are not', (a, b) => {
    expect(companyGroupKey(a)).not.toBe(companyGroupKey(b));
  });

  it('keeps a name that is nothing but a country or a note', () => {
    expect(companyGroupKey('Polska')).toBe('polska');
    expect(companyGroupKey('(stealth)')).toBe('(stealth)');
  });
});

describe('VacancyService', () => {
  describe('save', () => {
    it('creates a new vacancy with its recommendation', async () => {
      const { created, vacancy } = await service.save(userId, input({ recommendation: 'APPLY' }));
      expect(created).toBe(true);
      expect(vacancy.recommendation).toBe('APPLY');
      expect(vacancy.status).toBe('NOT_REVIEWED');
    });

    it('journals NEW, then NOT_REVIEWED, both dated with the cache', async () => {
      const { vacancy } = await service.save(userId, input());
      const rows = await getPrisma().statusChange.findMany({
        where: { vacancyId: vacancy.id },
        orderBy: { id: 'asc' },
      });
      expect(rows.map((r) => [r.status, r.createdAt])).toEqual([
        ['NEW', vacancy.statusChangedAt],
        ['NOT_REVIEWED', vacancy.statusChangedAt],
      ]);
    });

    it('moves a SKIP out of NEW to FILTERED_OUT (ADR-0033)', async () => {
      const { vacancy } = await service.save(userId, input({ recommendation: 'SKIP' }));
      expect(vacancy).toMatchObject({ status: 'FILTERED_OUT', recommendation: 'SKIP' });
      expect(await journal(vacancy.id)).toEqual(['NEW', 'FILTERED_OUT']);
    });

    it('stores the match keys intake dedups on', async () => {
      const { vacancy } = await service.save(
        userId,
        input({ company: 'Acme Sp. z o.o.', title: 'Senior  Front-End Dev' }),
      );
      expect(vacancy).toMatchObject({ companyKey: 'acme', titleKey: 'senior front end dev' });
    });

    it('leaves an already-saved vacancy untouched on a second save (same applyUrl)', async () => {
      const first = await service.save(
        userId,
        input({ matchScore: 60, estimationComment: 'First pass.' }),
      );
      const second = await service.save(
        userId,
        input({ matchScore: 95, estimationComment: 'Re-analyzed.' }),
      );

      const all = await service.list(userId);
      expect(all.total).toBe(1);
      expect(first.created).toBe(true);
      expect([second.created, second.attached]).toEqual([false, false]);
      expect(second.vacancy.id).toBe(first.vacancy.id);
      expect(second.vacancy.matchScore).toBe(60);
      // Analyze-once covers the comment too: the repeat save wrote no second row.
      expect((await service.getById(userId, first.vacancy.id))?.estimationComment).toBe(
        'First pass.',
      );
      expect(all.items[0].estimationComment).toBe('First pass.');
      expect(await getPrisma().comment.count({ where: { vacancy: { userId } } })).toBe(1);
      expect(await getPrisma().statusChange.count({ where: { vacancy: { userId } } })).toBe(2);
    });

    it('writes the estimationComment as one ANALYZER comment', async () => {
      const { vacancy } = await service.save(
        userId,
        input({ estimationComment: '  Strong match.  ' }),
      );
      const rows = await getPrisma().comment.findMany({ where: { vacancyId: vacancy.id } });
      expect(rows.map((r) => [r.source, r.body])).toEqual([['ANALYZER', 'Strong match.']]);
    });

    it('a second save does not disturb a status set in between', async () => {
      const first = await service.save(userId, input());
      await service.updateStatus(userId, first.vacancy.id, 'SAVED_FOR_LATER');

      const resaved = await service.save(userId, input({ matchScore: 50 }));

      expect(resaved.created).toBe(false);
      expect(resaved.vacancy.id).toBe(first.vacancy.id);
      expect(resaved.vacancy.status).toBe('SAVED_FOR_LATER');
    });

    it('attaches the analysis to a row intake took in, and the text it lacked', async () => {
      await intake.intake(userId, {
        url: 'https://example.com/jobs/1',
        company: 'Acme',
        title: 'Dev',
      });

      const { created, attached, vacancy } = await service.save(
        userId,
        input({ recommendation: 'SKIP' }),
      );

      expect([created, attached]).toEqual([false, true]);
      expect(vacancy).toMatchObject({
        company: 'Acme',
        title: 'Dev',
        matchScore: 80,
        recommendation: 'SKIP',
        status: 'FILTERED_OUT',
        fullText: FULL_TEXT,
      });
      expect(await journal(vacancy.id)).toEqual(['NEW', 'FILTERED_OUT']);
      expect((await service.getById(userId, vacancy.id))?.estimationComment).toBe('Strong match.');
      expect(await getPrisma().vacancy.count({ where: { userId } })).toBe(1);
    });

    it('keeps the text a row intake took in already has', async () => {
      const fullText = 'From the source. '.padEnd(200, 'x');
      await intake.intake(userId, {
        url: 'https://example.com/jobs/1',
        company: 'Acme',
        title: 'Dev',
        fullText,
      });
      const { attached, vacancy } = await service.save(userId, input());
      expect(attached).toBe(true);
      expect(vacancy.fullText).toBe(fullText);
    });

    it('stores a blank text as none, so intake can still fill it in', async () => {
      const { vacancy } = await service.save(userId, input({ fullText: '' }));
      expect(vacancy.fullText).toBeNull();
      expect((await service.list(userId)).items[0].hasText).toBe(false);

      await intake.intake(userId, {
        url: 'https://example.com/jobs/1',
        company: 'Acme',
        title: 'Backend Engineer',
        fullText: FULL_TEXT,
      });
      expect((await service.getById(userId, vacancy.id))?.fullText).toBe(FULL_TEXT);
    });

    it('takes text under 200 characters as none, created or attached', async () => {
      const short = 'Please sign in to see this job.';
      const created = await service.save(userId, input({ fullText: short }));
      expect(created.vacancy.fullText).toBeNull();

      await intake.intake(userId, {
        url: 'https://example.com/jobs/2',
        company: 'Acme',
        title: 'Dev',
      });
      const attached = await service.save(
        userId,
        input({ applyUrl: 'https://example.com/jobs/2', title: 'Dev', fullText: short }),
      );
      expect(attached.attached).toBe(true);
      expect(attached.vacancy.fullText).toBeNull();
    });

    it('collapses two tracking variants of one posting into a single row', async () => {
      // The payoff of canonicalizing applyUrl, asserted end-to-end rather than
      // through the pure function: same posting, two marketing links, one key.
      const first = await service.save(
        userId,
        input({ applyUrl: 'https://acme.com/jobs/3912345678?utm_source=linkedin&fbclid=x' }),
      );
      const second = await service.save(
        userId,
        input({ applyUrl: 'https://acme.com/jobs/3912345678?ref=telegram', matchScore: 95 }),
      );

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.vacancy.id).toBe(first.vacancy.id);
      expect(second.vacancy.matchScore).toBe(80); // the duplicate's analysis is discarded
      expect(second.vacancy.applyUrl).toBe('https://acme.com/jobs/3912345678');
      expect((await service.list(userId)).total).toBe(1);
    });

    it('keeps two different Indeed postings from one locale apart', async () => {
      // The regression the site rule exists for. The vacancy id is the `jk` query
      // param, so before the rule every Indeed URL from one locale canonicalized
      // to the same `…/viewjob` key: the first posting took the row and each later
      // one was silently discarded as an already-analysed duplicate. Asserted here
      // rather than through the pure function, because this is where the loss was.
      const first = await service.save(
        userId,
        input({ applyUrl: 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6' }),
      );
      const second = await service.save(
        userId,
        input({
          applyUrl: 'https://pl.indeed.com/viewjob?jk=aa11bb22cc33dd44',
          title: 'Data Engineer',
          matchScore: 95,
        }),
      );

      expect(first.created).toBe(true);
      expect(second.created).toBe(true);
      expect(second.vacancy.applyUrl).toBe('https://pl.indeed.com/viewjob?jk=aa11bb22cc33dd44');
      expect((await service.list(userId)).total).toBe(2);
    });

    it('still collapses one Indeed posting reached through two links', async () => {
      const first = await service.save(
        userId,
        input({ applyUrl: 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6' }),
      );
      const second = await service.save(
        userId,
        input({
          applyUrl: 'https://pl.indeed.com/viewjob?from=serp&jk=49a71fd8aa94f8a6&vjs=3',
          matchScore: 95,
        }),
      );

      expect(second.created).toBe(false);
      expect(second.vacancy.id).toBe(first.vacancy.id);
      expect(second.vacancy.matchScore).toBe(80); // the duplicate's analysis is discarded
      expect(second.vacancy.applyUrl).toBe('https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6');
      expect((await service.list(userId)).total).toBe(1);
    });

    it('keeps two locales of one Indeed posting apart, deliberately', async () => {
      // The accepted cost in ADR-0023. `jk` is global, so merging `pl.` and `us.`
      // would dedup one posting seen twice — and would also send the user to a
      // locale they never scraped. Two rows, two analyses, pinned so the trade is
      // not reversed by accident.
      await service.save(
        userId,
        input({ applyUrl: 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6' }),
      );
      const us = await service.save(
        userId,
        input({ applyUrl: 'https://us.indeed.com/viewjob?jk=49a71fd8aa94f8a6', matchScore: 95 }),
      );

      expect(us.created).toBe(true);
      expect((await service.list(userId)).total).toBe(2);
    });

    describe('the synthetic key fallback', () => {
      // `save()` builds the stand-in key from `new Date()`, so these are the only
      // tests here that need a fixed clock. `toFake: ['Date']` and nothing else:
      // faking the whole timer set is what stalls Prisma's pool while a test
      // awaits real database I/O.
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-09-21T09:00:00.000Z'));
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('falls back to a tracker:// key when the applyUrl is unusable', async () => {
        // The `??` half of the fallback. A scraped `javascript:` URL is refused by
        // the scheme gate, and the cost of that refusal is the link — never the
        // analysis.
        const { created, vacancy } = await service.save(
          userId,
          input({ applyUrl: 'javascript:alert(1)', matchScore: 71 }),
        );

        expect(created).toBe(true);
        expect(vacancy.applyUrl).toBe('tracker://acme/backend-engineer/2026-09-21');
        expect(vacancy.matchScore).toBe(71);
        expect((await service.list(userId)).total).toBe(1);
      });

      it('does not dedup a URL-less posting across days — the date is part of the key', async () => {
        // A named cost, pinned rather than fixed (ADR-0023). The same company and
        // title saved again tomorrow lands on a different key and becomes a second
        // row — the duplicate the unique index exists to prevent. Changing the key
        // shape would move the 42 synthetic rows already stored, which would need a
        // collision-aware backfill, so it is recorded, not changed.
        const day1 = await service.save(userId, input({ applyUrl: 'not a url at all' }));
        expect(day1.created).toBe(true);

        vi.setSystemTime(new Date('2026-09-22T09:00:00.000Z'));
        const day2 = await service.save(userId, input({ applyUrl: 'not a url at all' }));

        expect(day2.created).toBe(true);
        expect(day2.vacancy.id).not.toBe(day1.vacancy.id);
        expect(day1.vacancy.applyUrl).toBe('tracker://acme/backend-engineer/2026-09-21');
        expect(day2.vacancy.applyUrl).toBe('tracker://acme/backend-engineer/2026-09-22');
      });
    });
  });

  describe('saveMany', () => {
    it('saves a mixed batch, keeping input order and per-item created flags', async () => {
      await service.save(userId, input({ applyUrl: 'https://example.com/jobs/existing' }));

      const { results } = await service.saveMany(userId, [
        input({ applyUrl: 'https://example.com/jobs/existing', matchScore: 1 }), // duplicate
        input({ applyUrl: 'https://example.com/jobs/new', company: 'Fresh Co' }),
      ]);

      expect(results.map((r) => r.created)).toEqual([false, true]);
      expect(results[0].vacancy.matchScore).toBe(80); // untouched by the duplicate's payload
      expect(results[1].vacancy.company).toBe('Fresh Co');
      expect((await service.list(userId)).total).toBe(2);
    });

    it('does not roll back earlier items when a later one fails', async () => {
      await expect(
        service.saveMany(userId, [
          input({ applyUrl: 'https://example.com/jobs/good' }),
          input({ applyUrl: 'https://example.com/jobs/bad', recommendation: 'NOT_A_REAL_VALUE' }),
        ]),
      ).rejects.toBeInstanceOf(InvalidRecommendationError);

      expect((await service.list(userId)).total).toBe(1);
    });
  });

  describe('submitAnalysis', () => {
    it('moves a NEW vacancy to NOT_REVIEWED, journaled, with the ANALYZER comment', async () => {
      const id = await queued(1);
      const vacancy = await service.submitAnalysis(userId, { id, ...analysis });

      expect(vacancy).toMatchObject({ matchScore: 70, recommendation: 'APPLY' });
      expect(vacancy.status).toBe('NOT_REVIEWED');
      expect(await journal(id)).toEqual(['NEW', 'NOT_REVIEWED']);
      expect((await service.getById(userId, id))?.estimationComment).toBe('Good.');
    });

    it('moves a SKIP out of NEW to FILTERED_OUT', async () => {
      const id = await queued(1);
      const vacancy = await service.submitAnalysis(userId, {
        id,
        ...analysis,
        recommendation: 'SKIP',
      });
      expect(vacancy.status).toBe('FILTERED_OUT');
      expect(await journal(id)).toEqual(['NEW', 'FILTERED_OUT']);
    });

    it('refuses a second analysis and writes nothing', async () => {
      const id = await queued(1);
      await service.submitAnalysis(userId, { id, ...analysis });

      await expect(
        service.submitAnalysis(userId, { id, ...analysis, matchScore: 10, recommendation: 'SKIP' }),
      ).rejects.toThrow(AlreadyAnalysedError);

      expect(await service.getById(userId, id)).toMatchObject({
        matchScore: 70,
        recommendation: 'APPLY',
        status: 'NOT_REVIEWED',
      });
      expect(await journal(id)).toEqual(['NEW', 'NOT_REVIEWED']);
      expect(await getPrisma().comment.count({ where: { vacancy: { userId } } })).toBe(1);
    });

    it('scores a pipeline placeholder and leaves its status alone', async () => {
      const { application } = await new ApplicationService().record(userId, {
        company: 'Placeholder Co',
        title: 'Imported Role',
      });
      const vacancy = await service.submitAnalysis(userId, { id: application.id, ...analysis });
      expect(vacancy).toMatchObject({ status: 'APPLIED', recommendation: 'APPLY' });
      expect(await journal(application.id)).toEqual(['NEW', 'APPLIED']);
    });

    it('refuses an unknown id', async () => {
      await expect(service.submitAnalysis(userId, { id: 999_999, ...analysis })).rejects.toThrow(
        VacancyNotFoundError,
      );
    });
  });

  describe('submitAnalyses', () => {
    it('writes each analysis, in order', async () => {
      const [a, b] = [await queued(1), await queued(2)];
      const rows = await service.submitAnalyses(userId, [
        { id: a, ...analysis },
        { id: b, ...analysis, recommendation: 'SKIP' },
      ]);
      expect(rows.map((row) => [row.id, row.status])).toEqual([
        [a, 'NOT_REVIEWED'],
        [b, 'FILTERED_OUT'],
      ]);
    });

    it('writes none of them when one fails', async () => {
      const [a, b] = [await queued(1), await queued(2)];
      await service.submitAnalysis(userId, { id: b, ...analysis });

      await expect(
        service.submitAnalyses(userId, [
          { id: a, ...analysis },
          { id: b, ...analysis },
        ]),
      ).rejects.toThrow(AlreadyAnalysedError);

      expect(await service.getById(userId, a)).toMatchObject({
        status: 'NEW',
        recommendation: null,
      });
      expect(await journal(a)).toEqual(['NEW']);
    });
  });

  describe('getById', () => {
    it('returns null when the id does not exist', async () => {
      expect(await service.getById(userId, 999_999)).toBeNull();
    });

    it('returns the full record including fullText and every comment', async () => {
      const { vacancy } = await service.save(userId, input());
      await new ApplicationService().record(userId, { vacancyId: vacancy.id, comment: 'Applied.' });
      const found = await service.getById(userId, vacancy.id);
      expect(found?.fullText).toBe(vacancy.fullText);
      expect(found?.estimationComment).toBe('Strong match.');
      expect(found?.comments.map((c) => [c.source, c.body])).toEqual([
        ['ANALYZER', 'Strong match.'],
        ['USER', 'Applied.'],
      ]);
    });

    it('reads a missing analyzer comment as null', async () => {
      const { application } = await new ApplicationService().record(userId, {
        company: 'Placeholder Co',
        title: 'Imported Role',
      });
      expect((await service.getById(userId, application.id))?.estimationComment).toBeNull();
    });

    it('carries the status journal as `timeline`, oldest first, a repeat included', async () => {
      const { vacancy } = await service.save(userId, input());
      await service.updateStatus(userId, vacancy.id, 'INTERVIEW');
      const updated = await service.updateStatus(userId, vacancy.id, 'INTERVIEW');

      const found = await service.getById(userId, vacancy.id);
      expect(found?.timeline.map((step) => step.status)).toEqual([
        'NEW',
        'NOT_REVIEWED',
        'INTERVIEW',
        'INTERVIEW',
      ]);
      expect(found?.timeline[0].createdAt).toEqual(vacancy.statusChangedAt);
      expect(found?.timeline.at(-1)?.createdAt).toEqual(found?.statusChangedAt);
      // The PATCH answers with the same shape.
      expect(updated?.timeline).toEqual(found?.timeline);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      await service.save(
        userId,
        input({
          applyUrl: 'https://example.com/jobs/a',
          company: 'Acme',
          title: 'Backend Engineer',
          recommendation: 'APPLY',
        }),
      );
      await service.save(
        userId,
        input({
          applyUrl: 'https://example.com/jobs/b',
          company: 'Beta Corp',
          title: 'Frontend Lead',
          recommendation: 'SKIP',
        }),
      );
    });

    it('omits fullText from list results', async () => {
      const { items } = await service.list(userId);
      expect(items[0]).not.toHaveProperty('fullText');
    });

    it('finds a vacancy by its applyUrl, normalized as save does', async () => {
      const tracked = 'https://example.com/jobs/a/?utm_source=mail#apply';
      expect(
        (await service.list(userId, { applyUrl: tracked })).items.map((i) => i.company),
      ).toEqual(['Acme']);
      expect((await service.list(userId, { applyUrl: 'https://example.com/jobs/zzz' })).total).toBe(
        0,
      );

      // An unusable url is compared raw: a placeholder's synthetic key still matches.
      const { application } = await new ApplicationService().record(userId, {
        company: 'Placeholder Co',
        title: 'Imported Role',
      });
      const found = await service.list(userId, { applyUrl: application.applyUrl });
      expect(found.items.map((i) => i.id)).toEqual([application.id]);
    });

    it('filters by any of several statuses', async () => {
      const { items } = await service.list(userId, { company: 'Beta Corp' });
      await service.updateStatus(userId, items[0].id, 'DECLINED');

      expect((await service.list(userId, { status: ['DECLINED'] })).total).toBe(1);
      expect((await service.list(userId, { status: ['NOT_REVIEWED', 'DECLINED'] })).total).toBe(2);
      expect((await service.list(userId, { status: ['APPLIED', 'REJECTED'] })).total).toBe(0);
      expect((await service.list(userId, { status: [] })).total).toBe(2);
    });

    it('filters by recommendation', async () => {
      const { items, total } = await service.list(userId, { recommendation: 'SKIP' });
      expect(total).toBe(1);
      expect(items[0].company).toBe('Beta Corp');
    });

    it('filters by company, case-insensitively', async () => {
      const { items } = await service.list(userId, { company: 'acme' });
      expect(items).toHaveLength(1);
      expect(items[0].company).toBe('Acme');
    });

    it('filters by title, case-insensitively', async () => {
      const { items } = await service.list(userId, { title: 'frontend' });
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Frontend Lead');
    });

    it('respects limit, and pages on by nextCursor', async () => {
      const first = await service.list(userId, { limit: 1 });
      const second = await service.list(userId, { limit: 1, cursor: first.nextCursor ?? -1 });
      expect([first.items.length, second.items.length]).toEqual([1, 1]);
      expect(second.items[0].id).not.toBe(first.items[0].id);
      expect([first.total, second.total, second.nextCursor]).toEqual([2, 2, null]);
    });

    it('filters by hasText, and marks each item', async () => {
      const id = await queued(1);

      const withText = await service.list(userId, { hasText: true });
      expect(withText.total).toBe(2);
      expect(withText.items.map((item) => item.hasText)).toEqual([true, true]);

      const without = await service.list(userId, { hasText: false });
      expect(without.items.map((item) => [item.id, item.hasText])).toEqual([[id, false]]);
      expect((await service.list(userId)).total).toBe(3);
    });

    describe('sort and cursor', () => {
      // Beside the two rows above (Acme APPLY 80, Beta Corp SKIP 80): three more, and
      // dates set by hand so the order has a createdAt tie (Beta Corp, Gamma, Delta)
      // and a matchScore tie (Acme, Echo) that only `id` can break.
      const NEWEST = ['Acme', 'Delta', 'Gamma', 'Beta Corp', 'Echo'];
      const RECOMMENDED = ['Gamma', 'Echo', 'Acme', 'Delta', 'Beta Corp'];

      beforeEach(async () => {
        const more = [
          { company: 'Gamma', recommendation: 'APPLY', matchScore: 95 },
          { company: 'Delta', recommendation: 'APPLY_WITH_CAVEATS', matchScore: 70 },
          { company: 'Echo', recommendation: 'APPLY', matchScore: 80 },
        ];
        for (const row of more) {
          await service.save(
            userId,
            input({ ...row, applyUrl: `https://example.com/jobs/${row.company}` }),
          );
        }
        const dates = {
          Acme: '2026-09-03',
          'Beta Corp': '2026-09-02',
          Gamma: '2026-09-02',
          Delta: '2026-09-02',
          Echo: '2026-09-01',
        };
        for (const [company, date] of Object.entries(dates)) {
          await getPrisma().vacancy.updateMany({
            where: { company },
            data: { createdAt: new Date(date) },
          });
        }
      });

      const companies = (items: VacancyListItem[]) => items.map((item) => item.company);

      /** Every row, `limit` at a time, following `nextCursor` to the end. */
      async function allPages(filters: ListVacanciesFilters) {
        const seen: string[] = [];
        let cursor: number | undefined;
        do {
          const page = await service.list(userId, { ...filters, cursor });
          seen.push(...companies(page.items));
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        return seen;
      }

      it('defaults to newest first, id breaking a createdAt tie', async () => {
        expect(companies((await service.list(userId)).items)).toEqual(NEWEST);
        expect(companies((await service.list(userId, { sort: 'newest' })).items)).toEqual(NEWEST);
      });

      it('sorts recommended: APPLY first, then score, then id', async () => {
        const { items } = await service.list(userId, { sort: 'recommended' });
        expect(companies(items)).toEqual(RECOMMENDED);
      });

      it('pages by cursor without gaps or repeats, in either sort', async () => {
        expect(await allPages({ limit: 2 })).toEqual(NEWEST);
        expect(await allPages({ sort: 'recommended', limit: 2 })).toEqual(RECOMMENDED);
        const last = await service.list(userId, { limit: 5 });
        expect(last).toMatchObject({ total: 5, nextCursor: null });
      });

      it('sorts the unanalysed last, and pages across them', async () => {
        const applications = new ApplicationService();
        for (const company of ['Zeta', 'Eta']) {
          await applications.record(userId, { company, title: 'Imported Role' });
        }
        const { items } = await service.list(userId, { sort: 'recommended' });
        expect(companies(items).slice(0, 5)).toEqual(RECOMMENDED);
        expect(items.slice(5).map((item) => item.recommendation)).toEqual([null, null]);
        expect(await allPages({ sort: 'recommended', limit: 2 })).toEqual(companies(items));
      });

      it('pages on from a cursor row that has left the filter', async () => {
        // The /vacancies case: the last loaded row is triaged out of NOT_REVIEWED
        // before the next page is asked for. Prisma's `skip: 1` assumes the cursor
        // row is in the result — here it is not (ADR-0030).
        const filters = {
          status: ['NOT_REVIEWED' as const],
          sort: 'recommended' as const,
          limit: 2,
        };
        const first = await service.list(userId, filters);
        expect(companies(first.items)).toEqual(['Gamma', 'Echo']);

        await service.updateStatus(userId, first.items[1].id, 'SAVED_FOR_LATER');

        const next = await service.list(userId, {
          ...filters,
          cursor: first.nextCursor ?? undefined,
        });
        expect(companies(next.items)).toEqual(['Acme', 'Delta']);
        // Beta Corp, a SKIP, was never NOT_REVIEWED: it went to FILTERED_OUT.
        expect(next.total).toBe(3);
      });
    });

    describe('companyMatchCount', () => {
      it('counts the row itself, so a company with no siblings reports 1', async () => {
        const { items } = await service.list(userId);
        expect(countsByCompany(items)).toEqual({ Acme: 1, 'Beta Corp': 1 });
      });

      it('counts every row of the same company', async () => {
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/c', title: 'Data Engineer' }),
        );

        const { items } = await service.list(userId);

        expect(countsByCompany(items).Acme).toBe(2);
      });

      it('is the same from every spelling of the company (ADR-0032)', async () => {
        // The substring rule this replaced counted 'Acme Polska' into Acme's 2 and
        // gave 'Acme Polska' itself 1 — 11 vs 4 on the dev DB.
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/d', company: 'Acme Polska' }),
        );
        // A longer name is another company now, not a match from the short side.
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/d2', company: 'Acme Recruiting' }),
        );

        const { items } = await service.list(userId);

        expect(countsByCompany(items)).toEqual({
          Acme: 2,
          'Acme Polska': 2,
          'Acme Recruiting': 1,
          'Beta Corp': 1,
        });
      });

      it('matches a differently-cased name with a legal form', async () => {
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/e', company: 'ACME Sp. z o.o.' }),
        );

        const { items } = await service.list(userId);

        expect(countsByCompany(items).Acme).toBe(2);
      });

      it('counts rows that are not on the page', async () => {
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/f', title: 'Data Engineer' }),
        );

        // limit=1 -> one Acme row comes back, but both exist.
        const { items } = await service.list(userId, { company: 'Acme', limit: 1 });

        expect(items).toHaveLength(1);
        expect(items[0].companyMatchCount).toBe(2);
      });
    });

    describe('sameCompanyAs', () => {
      it('lists the same rows from either spelling', async () => {
        const polska = await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/s1', company: 'Acme Polska' }),
        );
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/s2', company: 'Acme Recruiting' }),
        );
        const ids = async (sameCompanyAs: string) =>
          (await service.list(userId, { sameCompanyAs })).items.map((item) => item.id).sort();

        const acme = await ids('Acme');
        expect(acme).toHaveLength(2);
        expect(acme).toContain(polska.vacancy.id);
        expect(await ids('Acme Polska')).toEqual(acme);
        expect(await ids('acme sp. z o.o.')).toEqual(acme);
      });

      it('ANDs with the other filters, `company` included', async () => {
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/s3', company: 'Acme Polska' }),
        );

        expect(
          (await service.list(userId, { sameCompanyAs: 'Acme', company: 'polska' })).total,
        ).toBe(1);
        expect(
          (await service.list(userId, { sameCompanyAs: 'Acme', status: ['DECLINED'] })).total,
        ).toBe(0);
      });

      it('lists nothing for a company with no vacancies', async () => {
        expect((await service.list(userId, { sameCompanyAs: 'Nobody' })).total).toBe(0);
      });

      it('leaves FILTERED_OUT out of both the list and the count', async () => {
        // A SKIP moves the new row to FILTERED_OUT.
        const skipped = await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/s4', recommendation: 'SKIP' }),
        );
        expect(skipped.vacancy.status).toBe('FILTERED_OUT');

        const { items } = await service.list(userId, { sameCompanyAs: 'Acme' });
        expect(items.map((item) => item.id)).not.toContain(skipped.vacancy.id);
        expect(items).toHaveLength(1);
        // The button's count is the modal's row count.
        expect(items[0].companyMatchCount).toBe(1);
        // From the FILTERED_OUT row itself (/inbox): itself + the one row the modal
        // lists, so its button still reads "1 other".
        const own = await service.list(userId, { status: ['FILTERED_OUT'] });
        expect(own.items[0].companyMatchCount).toBe(2);
      });
    });

    describe('hasAnalysis', () => {
      it('is true for a row the analyzer saved', async () => {
        const { items } = await service.list(userId);
        expect(items.map((item) => item.hasAnalysis)).toEqual([true, true]);
      });

      it('is false for a placeholder, whatever its other fields say', async () => {
        // What `record()` creates (ADR-0019) — via the service that writes it,
        // so the write and the derivation are tested against each other rather than
        // against a literal this file happens to share.
        const applications = new ApplicationService();
        const { application, resolution } = await applications.record(userId, {
          company: 'Placeholder Co',
          title: 'Imported Role',
        });
        expect(resolution).toBe('created-vacancy');

        const { items } = await service.list(userId, { company: 'Placeholder Co' });

        expect(items).toHaveLength(1);
        expect(items[0].id).toBe(application.id);
        expect(items[0].hasAnalysis).toBe(false);
        expect(items[0].estimationComment).toBeNull();
      });
    });

    describe('search', () => {
      it('matches on the company', async () => {
        const { items, total } = await service.list(userId, { search: 'acme' });
        expect(total).toBe(1);
        expect(items[0].company).toBe('Acme');
      });

      it('matches on the title', async () => {
        const { items, total } = await service.list(userId, { search: 'frontend' });
        expect(total).toBe(1);
        expect(items[0].title).toBe('Frontend Lead');
      });

      it('is case-insensitive', async () => {
        expect((await service.list(userId, { search: 'BACKEND' })).total).toBe(1);
      });

      it('ANDs with the other filters rather than replacing them', async () => {
        // `search` widens (company OR title); it must not also *drop* the narrowing
        // filters — Acme matches, but no Acme row is SKIP.
        expect((await service.list(userId, { search: 'acme', recommendation: 'SKIP' })).total).toBe(
          0,
        );
        expect(
          (await service.list(userId, { search: 'acme', recommendation: 'APPLY' })).total,
        ).toBe(1);
      });

      it('counts every match in total while the page stays limited', async () => {
        // Same term reaching two rows through different columns — the OR half of the
        // clause — and `total` staying the match count rather than the page size.
        await service.save(
          userId,
          input({
            applyUrl: 'https://example.com/jobs/c',
            company: 'Gamma',
            title: 'Acme Support Lead',
          }),
        );

        const page = await service.list(userId, { search: 'acme', limit: 1 });

        expect(page.items).toHaveLength(1);
        expect(page.total).toBe(2); // Acme (company) + Acme Support Lead (title)
      });
    });

    // Every term here reaches the pattern Prisma builds from `contains`, where
    // `%`, `_` and `\` each mean something. A user's typing means none of them.
    describe('LIKE metacharacters in a term are literal', () => {
      it('does not treat % as a wildcard', async () => {
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/pct', company: '100% Remote' }),
        );

        // Unescaped, all three of these match every row in the table.
        expect((await service.list(userId, { search: '%' })).total).toBe(1);
        expect((await service.list(userId, { company: '%' })).total).toBe(1);
        expect((await service.list(userId, { search: '100% Rem' })).total).toBe(1);
      });

      it('does not treat _ as a wildcard', async () => {
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/und', company: 'A_B' }),
        );
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/und2', company: 'AXB' }),
        );

        const { items, total } = await service.list(userId, { search: 'A_B' });

        expect(total).toBe(1);
        expect(items[0].company).toBe('A_B');
      });

      it('does not treat a backslash as an escape', async () => {
        // `A\B` is also the case where the *unescaped* pattern (`%A\B%`) matches
        // something else — here `AB` — rather than the row that was typed.
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/bs', company: 'A\\B' }),
        );
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/bs2', company: 'AB' }),
        );

        const { items, total } = await service.list(userId, { search: 'A\\B' });

        expect(total).toBe(1);
        expect(items[0].company).toBe('A\\B');
      });

      it('counts a company whose own name contains a backslash', async () => {
        // The count once fed each row's company back through `contains`; unescaped,
        // that pattern missed the row it came from, so the duplicates button hid on
        // a company's own page.
        await service.save(
          userId,
          input({ applyUrl: 'https://example.com/jobs/bs', company: 'A\\B' }),
        );

        const { items } = await service.list(userId, { company: 'A\\B' });

        expect(countsByCompany(items)['A\\B']).toBe(1);
      });
    });
  });

  describe('the DB rules (ADR-0033)', () => {
    const row = { company: 'Acme', title: 'Dev', applyUrl: 'https://example.com/jobs/check' };

    it('refuses half an analysis', async () => {
      await expect(
        getPrisma().vacancy.create({
          data: { ...row, userId, status: 'NOT_REVIEWED', matchScore: 50 },
        }),
      ).rejects.toThrow(/Vacancy_analysis_both_or_neither/);
      await expect(
        getPrisma().vacancy.create({
          data: { ...row, userId, status: 'NOT_REVIEWED', recommendation: 'APPLY' },
        }),
      ).rejects.toThrow(/Vacancy_analysis_both_or_neither/);
    });

    it('refuses an analysis on a NEW row', async () => {
      await expect(
        getPrisma().vacancy.create({
          data: { ...row, userId, matchScore: 50, recommendation: 'APPLY' },
        }),
      ).rejects.toThrow(/Vacancy_new_is_unanalysed/);
      expect(await getPrisma().vacancy.count({ where: { userId } })).toBe(0);
    });
  });

  describe('updateStatus', () => {
    it('throws VacancyNotFoundError when the id does not exist', async () => {
      await expect(service.updateStatus(userId, 999_999, 'DECLINED')).rejects.toBeInstanceOf(
        VacancyNotFoundError,
      );
    });

    it('writes one journal row and keeps the cache in step', async () => {
      const { vacancy } = await service.save(userId, input());
      const updated = await service.updateStatus(userId, vacancy.id, 'DECLINED');
      expect(updated?.status).toBe('DECLINED');
      expect(updated?.statusChangedAt.getTime()).toBeGreaterThanOrEqual(
        vacancy.statusChangedAt.getTime(),
      );
      expect(updated?.estimationComment).toBe('Strong match.');

      const latest = await getPrisma().statusChange.findFirstOrThrow({
        where: { vacancyId: vacancy.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      expect([latest.status, latest.createdAt]).toEqual(['DECLINED', updated?.statusChangedAt]);
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'DECLINED']);
    });

    it('journals a pipeline status the vacancy already has as a new event', async () => {
      const { vacancy } = await service.save(userId, input());
      await service.updateStatus(userId, vacancy.id, 'INTERVIEW');
      const before = await service.getById(userId, vacancy.id);

      const same = await service.updateStatus(userId, vacancy.id, 'INTERVIEW');

      expect(same?.statusChangedAt.getTime()).toBeGreaterThanOrEqual(
        before?.statusChangedAt.getTime() ?? 0,
      );
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'INTERVIEW', 'INTERVIEW']);
    });

    it('refuses a triage status the vacancy already has, and journals nothing', async () => {
      const { vacancy } = await service.save(userId, input());
      await service.updateStatus(userId, vacancy.id, 'DECLINED');
      const before = await service.getById(userId, vacancy.id);

      await expect(service.updateStatus(userId, vacancy.id, 'DECLINED')).rejects.toThrow(
        SameStatusError,
      );
      expect((await service.getById(userId, vacancy.id))?.statusChangedAt).toEqual(
        before?.statusChangedAt,
      );
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'DECLINED']);
    });

    it('moves to UNAVAILABLE, a triage status: a repeat is refused', async () => {
      const { vacancy } = await service.save(userId, input());
      expect((await service.updateStatus(userId, vacancy.id, 'UNAVAILABLE'))?.status).toBe(
        'UNAVAILABLE',
      );
      expect((await service.list(userId, { status: ['UNAVAILABLE'] })).total).toBe(1);

      await expect(service.updateStatus(userId, vacancy.id, 'UNAVAILABLE')).rejects.toThrow(
        SameStatusError,
      );
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED', 'UNAVAILABLE']);
    });

    it('refuses NOT_REVIEWED on a vacancy that was never moved', async () => {
      const { vacancy } = await service.save(userId, input());
      await expect(service.updateStatus(userId, vacancy.id, 'NOT_REVIEWED')).rejects.toThrow(
        SameStatusError,
      );
      const found = await service.getById(userId, vacancy.id);
      expect(found?.statusChangedAt).toEqual(vacancy.statusChangedAt);
      expect(await journal(vacancy.id)).toEqual(['NEW', 'NOT_REVIEWED']);
    });

    it('sets an unanalysed vacancy back to NEW, and refuses an analysed one', async () => {
      // Back to the queue (ADR-0033): fine while there is no analysis.
      const id = await queued(1);
      await service.updateStatus(userId, id, 'FILTERED_OUT');
      expect((await service.updateStatus(userId, id, 'NEW'))?.status).toBe('NEW');
      expect(await journal(id)).toEqual(['NEW', 'FILTERED_OUT', 'NEW']);

      // An analysed one would break the CHECK — refused as a DomainError, nothing written.
      const { vacancy } = await service.save(userId, input({ recommendation: 'SKIP' }));
      await expect(service.updateStatus(userId, vacancy.id, 'NEW')).rejects.toThrow(
        AnalysedNotNewError,
      );
      expect(await journal(vacancy.id)).toEqual(['NEW', 'FILTERED_OUT']);
      // A NEW row asked for NEW again is still a plain repeat.
      await expect(service.updateStatus(userId, await queued(2), 'NEW')).rejects.toThrow(
        SameStatusError,
      );
    });

    it('can set a vacancy back to NOT_REVIEWED', async () => {
      const { vacancy } = await service.save(userId, input());
      await service.updateStatus(userId, vacancy.id, 'DECLINED');
      const back = await service.updateStatus(userId, vacancy.id, 'NOT_REVIEWED');
      expect(back?.status).toBe('NOT_REVIEWED');
      expect(await journal(vacancy.id)).toEqual([
        'NEW',
        'NOT_REVIEWED',
        'DECLINED',
        'NOT_REVIEWED',
      ]);
    });

    it('saves a comment with the move, as a USER comment', async () => {
      const { vacancy } = await service.save(userId, input());
      const saved = await service.updateStatus(
        userId,
        vacancy.id,
        'SAVED_FOR_LATER',
        '  Back in May.  ',
      );
      expect(saved?.status).toBe('SAVED_FOR_LATER');
      expect(saved?.comments.map((c) => [c.source, c.body])).toEqual([
        ['ANALYZER', 'Strong match.'],
        ['USER', 'Back in May.'],
      ]);
    });

    it('adds no comment for a blank one', async () => {
      const { vacancy } = await service.save(userId, input());
      const saved = await service.updateStatus(userId, vacancy.id, 'SAVED_FOR_LATER', '   ');
      expect(saved?.status).toBe('SAVED_FOR_LATER');
      expect(await getPrisma().comment.count({ where: { vacancyId: vacancy.id } })).toBe(1);
    });

    it('throws VacancyNotFoundError for an unknown id with a comment, and writes nothing', async () => {
      await expect(
        service.updateStatus(userId, 999_999, 'SAVED_FOR_LATER', 'note'),
      ).rejects.toBeInstanceOf(VacancyNotFoundError);
      expect(await getPrisma().comment.count({ where: { vacancy: { userId } } })).toBe(0);
    });

    it('writes no comment when the move is refused', async () => {
      const { vacancy } = await service.save(userId, input());
      await service.updateStatus(userId, vacancy.id, 'SAVED_FOR_LATER');
      await expect(
        service.updateStatus(userId, vacancy.id, 'SAVED_FOR_LATER', 'Again.'),
      ).rejects.toThrow(SameStatusError);
      expect(await getPrisma().comment.count({ where: { vacancyId: vacancy.id } })).toBe(1);
    });
  });
});
