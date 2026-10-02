import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationService } from './application.service';
import { InvalidRecommendationError, SameStatusError } from './errors';
import { getPrisma } from './prisma-client';
import { companyKey, VacancyService } from './vacancy.service';
import type { ListVacanciesFilters, SaveVacancyInput, VacancyListItem } from './vacancy.types';

// Integration tests: hit the real (test) Postgres database instead of mocking
// Prisma. A mocked Prisma client would just re-assert our own query calls and
// break on every harmless refactor — the DB round-trip is what actually matters.
const service = new VacancyService();

/** The vacancy's status journal, oldest first. */
async function journal(vacancyId: number) {
  const rows = await getPrisma().statusChange.findMany({
    where: { vacancyId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => row.status);
}

function input(overrides: Partial<SaveVacancyInput> = {}): SaveVacancyInput {
  return {
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/jobs/1',
    fullText: 'Full vacancy text goes here.',
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

// Pairs and near-misses from the dev DB's 448 company names (2026-10-02).
describe('companyKey', () => {
  it.each([
    ['contoso', 'contoso Polska'],
    ['Sii Polska', 'Sii Poland'],
    ['ALTEN', 'ALTEN Spain'],
    ['UST', 'UST España & Latam'],
    ['Fabrikam', 'Fabrikam (partner company, anonymized)'],
    ['7N', '7N Sp. z o. o.'],
    ['Exadel', 'Exadel Inc'],
    ['Connectis', 'Connectis_'],
    ['iTeamly', 'Iteamly'],
  ])('%j and %j are one company', (a, b) => {
    expect(companyKey(a)).toBe(companyKey(b));
  });

  it.each([
    ['iO', 'Apollo.io'],
    ['Box', 'Mapbox'],
    ['Hays', 'Haystack People'],
    ['Tailspin', 'Tenth Tailspinion Group'],
    ['Software Mind', 'Software Mansion'],
  ])('%j and %j are not', (a, b) => {
    expect(companyKey(a)).not.toBe(companyKey(b));
  });

  it('keeps a name that is nothing but a country or a note', () => {
    expect(companyKey('Polska')).toBe('polska');
    expect(companyKey('(stealth)')).toBe('(stealth)');
  });
});

describe('VacancyService', () => {
  describe('save', () => {
    it('creates a new vacancy with the recommendation normalized to English', async () => {
      const { created, vacancy } = await service.save(input({ recommendation: 'ПОДАВАТИСЯ' }));
      expect(created).toBe(true);
      expect(vacancy.recommendation).toBe('APPLY');
      expect(vacancy.status).toBe('NOT_REVIEWED');
    });

    it('journals NOT_REVIEWED, dated with the cache', async () => {
      const { vacancy } = await service.save(input());
      const rows = await getPrisma().statusChange.findMany({ where: { vacancyId: vacancy.id } });
      expect(rows.map((r) => [r.status, r.createdAt])).toEqual([
        ['NOT_REVIEWED', vacancy.statusChangedAt],
      ]);
    });

    it('leaves an already-saved vacancy untouched on a second save (same applyUrl)', async () => {
      const first = await service.save(input({ matchScore: 60, estimationComment: 'First pass.' }));
      const second = await service.save(
        input({ matchScore: 95, estimationComment: 'Re-analyzed.' }),
      );

      const all = await service.list();
      expect(all.total).toBe(1);
      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.vacancy.id).toBe(first.vacancy.id);
      expect(second.vacancy.matchScore).toBe(60);
      // Analyze-once covers the comment too: the repeat save wrote no second row.
      expect((await service.getById(first.vacancy.id))?.estimationComment).toBe('First pass.');
      expect(all.items[0].estimationComment).toBe('First pass.');
      expect(await getPrisma().comment.count()).toBe(1);
      expect(await getPrisma().statusChange.count()).toBe(1);
    });

    it('writes the estimationComment as one ANALYZER comment', async () => {
      const { vacancy } = await service.save(input({ estimationComment: '  Strong match.  ' }));
      const rows = await getPrisma().comment.findMany({ where: { vacancyId: vacancy.id } });
      expect(rows.map((r) => [r.source, r.body])).toEqual([['ANALYZER', 'Strong match.']]);
    });

    it('a second save does not disturb a status set in between', async () => {
      const first = await service.save(input());
      await service.updateStatus(first.vacancy.id, 'SAVED_FOR_LATER');

      const resaved = await service.save(input({ matchScore: 50 }));

      expect(resaved.created).toBe(false);
      expect(resaved.vacancy.id).toBe(first.vacancy.id);
      expect(resaved.vacancy.status).toBe('SAVED_FOR_LATER');
    });

    it('collapses two tracking variants of one posting into a single row', async () => {
      // The payoff of canonicalizing applyUrl, asserted end-to-end rather than
      // through the pure function: same posting, two marketing links, one key.
      const first = await service.save(
        input({ applyUrl: 'https://acme.com/jobs/3912345678?utm_source=linkedin&fbclid=x' }),
      );
      const second = await service.save(
        input({ applyUrl: 'https://acme.com/jobs/3912345678?ref=telegram', matchScore: 95 }),
      );

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.vacancy.id).toBe(first.vacancy.id);
      expect(second.vacancy.matchScore).toBe(80); // the duplicate's analysis is discarded
      expect(second.vacancy.applyUrl).toBe('https://acme.com/jobs/3912345678');
      expect((await service.list()).total).toBe(1);
    });

    it('keeps two different Indeed postings from one locale apart', async () => {
      // The regression the site rule exists for. The vacancy id is the `jk` query
      // param, so before the rule every Indeed URL from one locale canonicalized
      // to the same `…/viewjob` key: the first posting took the row and each later
      // one was silently discarded as an already-analysed duplicate. Asserted here
      // rather than through the pure function, because this is where the loss was.
      const first = await service.save(
        input({ applyUrl: 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6' }),
      );
      const second = await service.save(
        input({
          applyUrl: 'https://pl.indeed.com/viewjob?jk=aa11bb22cc33dd44',
          title: 'Data Engineer',
          matchScore: 95,
        }),
      );

      expect(first.created).toBe(true);
      expect(second.created).toBe(true);
      expect(second.vacancy.applyUrl).toBe('https://pl.indeed.com/viewjob?jk=aa11bb22cc33dd44');
      expect((await service.list()).total).toBe(2);
    });

    it('still collapses one Indeed posting reached through two links', async () => {
      const first = await service.save(
        input({ applyUrl: 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6' }),
      );
      const second = await service.save(
        input({
          applyUrl: 'https://pl.indeed.com/viewjob?from=serp&jk=49a71fd8aa94f8a6&vjs=3',
          matchScore: 95,
        }),
      );

      expect(second.created).toBe(false);
      expect(second.vacancy.id).toBe(first.vacancy.id);
      expect(second.vacancy.matchScore).toBe(80); // the duplicate's analysis is discarded
      expect(second.vacancy.applyUrl).toBe('https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6');
      expect((await service.list()).total).toBe(1);
    });

    it('keeps two locales of one Indeed posting apart, deliberately', async () => {
      // The accepted cost in ADR-0023. `jk` is global, so merging `pl.` and `us.`
      // would dedup one posting seen twice — and would also send the user to a
      // locale they never scraped. Two rows, two analyses, pinned so the trade is
      // not reversed by accident.
      await service.save(input({ applyUrl: 'https://pl.indeed.com/viewjob?jk=49a71fd8aa94f8a6' }));
      const us = await service.save(
        input({ applyUrl: 'https://us.indeed.com/viewjob?jk=49a71fd8aa94f8a6', matchScore: 95 }),
      );

      expect(us.created).toBe(true);
      expect((await service.list()).total).toBe(2);
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
          input({ applyUrl: 'javascript:alert(1)', matchScore: 71 }),
        );

        expect(created).toBe(true);
        expect(vacancy.applyUrl).toBe('tracker://acme/backend-engineer/2026-09-21');
        expect(vacancy.matchScore).toBe(71);
        expect((await service.list()).total).toBe(1);
      });

      it('does not dedup a URL-less posting across days — the date is part of the key', async () => {
        // A named cost, pinned rather than fixed (ADR-0023). The same company and
        // title saved again tomorrow lands on a different key and becomes a second
        // row — the duplicate the unique index exists to prevent. Changing the key
        // shape would move the 42 synthetic rows already stored, which would need a
        // collision-aware backfill, so it is recorded, not changed.
        const day1 = await service.save(input({ applyUrl: 'not a url at all' }));
        expect(day1.created).toBe(true);

        vi.setSystemTime(new Date('2026-09-22T09:00:00.000Z'));
        const day2 = await service.save(input({ applyUrl: 'not a url at all' }));

        expect(day2.created).toBe(true);
        expect(day2.vacancy.id).not.toBe(day1.vacancy.id);
        expect(day1.vacancy.applyUrl).toBe('tracker://acme/backend-engineer/2026-09-21');
        expect(day2.vacancy.applyUrl).toBe('tracker://acme/backend-engineer/2026-09-22');
      });
    });
  });

  describe('saveMany', () => {
    it('saves a mixed batch, keeping input order and per-item created flags', async () => {
      await service.save(input({ applyUrl: 'https://example.com/jobs/existing' }));

      const { results } = await service.saveMany([
        input({ applyUrl: 'https://example.com/jobs/existing', matchScore: 1 }), // duplicate
        input({ applyUrl: 'https://example.com/jobs/new', company: 'Fresh Co' }),
      ]);

      expect(results.map((r) => r.created)).toEqual([false, true]);
      expect(results[0].vacancy.matchScore).toBe(80); // untouched by the duplicate's payload
      expect(results[1].vacancy.company).toBe('Fresh Co');
      expect((await service.list()).total).toBe(2);
    });

    it('does not roll back earlier items when a later one fails', async () => {
      await expect(
        service.saveMany([
          input({ applyUrl: 'https://example.com/jobs/good' }),
          input({ applyUrl: 'https://example.com/jobs/bad', recommendation: 'NOT_A_REAL_VALUE' }),
        ]),
      ).rejects.toBeInstanceOf(InvalidRecommendationError);

      expect((await service.list()).total).toBe(1);
    });
  });

  describe('getById', () => {
    it('returns null when the id does not exist', async () => {
      expect(await service.getById(999_999)).toBeNull();
    });

    it('returns the full record including fullText and every comment', async () => {
      const { vacancy } = await service.save(input());
      await new ApplicationService().record({ vacancyId: vacancy.id, comment: 'Applied.' });
      const found = await service.getById(vacancy.id);
      expect(found?.fullText).toBe(vacancy.fullText);
      expect(found?.estimationComment).toBe('Strong match.');
      expect(found?.comments.map((c) => [c.source, c.body])).toEqual([
        ['ANALYZER', 'Strong match.'],
        ['USER', 'Applied.'],
      ]);
    });

    it('reads a missing analyzer comment as null', async () => {
      const { application } = await new ApplicationService().record({
        company: 'Placeholder Co',
        title: 'Imported Role',
      });
      expect((await service.getById(application.id))?.estimationComment).toBeNull();
    });

    it('carries the status journal as `timeline`, oldest first, a repeat included', async () => {
      const { vacancy } = await service.save(input());
      await service.updateStatus(vacancy.id, 'INTERVIEW');
      const updated = await service.updateStatus(vacancy.id, 'INTERVIEW');

      const found = await service.getById(vacancy.id);
      expect(found?.timeline.map((step) => step.status)).toEqual([
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
        input({
          applyUrl: 'https://example.com/jobs/a',
          company: 'Acme',
          title: 'Backend Engineer',
          recommendation: 'APPLY',
        }),
      );
      await service.save(
        input({
          applyUrl: 'https://example.com/jobs/b',
          company: 'Beta Corp',
          title: 'Frontend Lead',
          recommendation: 'SKIP',
        }),
      );
    });

    it('omits fullText from list results', async () => {
      const { items } = await service.list();
      expect(items[0]).not.toHaveProperty('fullText');
    });

    it('finds a vacancy by its applyUrl, normalized as save does', async () => {
      const tracked = 'https://example.com/jobs/a/?utm_source=mail#apply';
      expect((await service.list({ applyUrl: tracked })).items.map((i) => i.company)).toEqual([
        'Acme',
      ]);
      expect((await service.list({ applyUrl: 'https://example.com/jobs/zzz' })).total).toBe(0);

      // An unusable url is compared raw: a placeholder's synthetic key still matches.
      const { application } = await new ApplicationService().record({
        company: 'Placeholder Co',
        title: 'Imported Role',
      });
      const found = await service.list({ applyUrl: application.applyUrl });
      expect(found.items.map((i) => i.id)).toEqual([application.id]);
    });

    it('filters by any of several statuses', async () => {
      const { items } = await service.list({ company: 'Beta Corp' });
      await service.updateStatus(items[0].id, 'DECLINED');

      expect((await service.list({ status: ['DECLINED'] })).total).toBe(1);
      expect((await service.list({ status: ['NOT_REVIEWED', 'DECLINED'] })).total).toBe(2);
      expect((await service.list({ status: ['APPLIED', 'REJECTED'] })).total).toBe(0);
      expect((await service.list({ status: [] })).total).toBe(2);
    });

    it('filters by recommendation', async () => {
      const { items, total } = await service.list({ recommendation: 'SKIP' });
      expect(total).toBe(1);
      expect(items[0].company).toBe('Beta Corp');
    });

    it('filters by company, case-insensitively', async () => {
      const { items } = await service.list({ company: 'acme' });
      expect(items).toHaveLength(1);
      expect(items[0].company).toBe('Acme');
    });

    it('filters by title, case-insensitively', async () => {
      const { items } = await service.list({ title: 'frontend' });
      expect(items).toHaveLength(1);
      expect(items[0].title).toBe('Frontend Lead');
    });

    it('respects limit/offset', async () => {
      const page = await service.list({ limit: 1, offset: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(2);
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
          const page = await service.list({ ...filters, cursor });
          seen.push(...companies(page.items));
          cursor = page.nextCursor ?? undefined;
        } while (cursor !== undefined);
        return seen;
      }

      it('defaults to newest first, id breaking a createdAt tie', async () => {
        expect(companies((await service.list()).items)).toEqual(NEWEST);
        expect(companies((await service.list({ sort: 'newest' })).items)).toEqual(NEWEST);
      });

      it('sorts recommended: APPLY first, then score, then id', async () => {
        const { items } = await service.list({ sort: 'recommended' });
        expect(companies(items)).toEqual(RECOMMENDED);
      });

      it('pages by cursor without gaps or repeats, in either sort', async () => {
        expect(await allPages({ limit: 2 })).toEqual(NEWEST);
        expect(await allPages({ sort: 'recommended', limit: 2 })).toEqual(RECOMMENDED);
        const last = await service.list({ limit: 5 });
        expect(last).toMatchObject({ total: 5, nextCursor: null });
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
        const first = await service.list(filters);
        expect(companies(first.items)).toEqual(['Gamma', 'Echo']);

        await service.updateStatus(first.items[1].id, 'SAVED_FOR_LATER');

        const next = await service.list({ ...filters, cursor: first.nextCursor ?? undefined });
        expect(companies(next.items)).toEqual(['Acme', 'Delta']);
        expect(next.total).toBe(4);
      });
    });

    describe('companyMatchCount', () => {
      it('counts the row itself, so a company with no siblings reports 1', async () => {
        const { items } = await service.list();
        expect(countsByCompany(items)).toEqual({ Acme: 1, 'Beta Corp': 1 });
      });

      it('counts every row of the same company', async () => {
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/c', title: 'Data Engineer' }),
        );

        const { items } = await service.list();

        expect(countsByCompany(items).Acme).toBe(2);
      });

      it('is the same from every spelling of the company (ADR-0032)', async () => {
        // The substring rule this replaced counted 'Acme Polska' into Acme's 2 and
        // gave 'Acme Polska' itself 1 — #807 / #761 on the dev DB, 11 vs 4.
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/d', company: 'Acme Polska' }),
        );
        // A longer name is another company now, not a match from the short side.
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/d2', company: 'Acme Recruiting' }),
        );

        const { items } = await service.list();

        expect(countsByCompany(items)).toEqual({
          Acme: 2,
          'Acme Polska': 2,
          'Acme Recruiting': 1,
          'Beta Corp': 1,
        });
      });

      it('matches a differently-cased name with a legal form', async () => {
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/e', company: 'ACME Sp. z o.o.' }),
        );

        const { items } = await service.list();

        expect(countsByCompany(items).Acme).toBe(2);
      });

      it('counts rows that are not on the page', async () => {
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/f', title: 'Data Engineer' }),
        );

        // limit=1 -> one Acme row comes back, but both exist.
        const { items } = await service.list({ company: 'Acme', limit: 1 });

        expect(items).toHaveLength(1);
        expect(items[0].companyMatchCount).toBe(2);
      });
    });

    describe('sameCompanyAs', () => {
      it('lists the same rows from either spelling', async () => {
        const polska = await service.save(
          input({ applyUrl: 'https://example.com/jobs/s1', company: 'Acme Polska' }),
        );
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/s2', company: 'Acme Recruiting' }),
        );
        const ids = async (sameCompanyAs: string) =>
          (await service.list({ sameCompanyAs })).items.map((item) => item.id).sort();

        const acme = await ids('Acme');
        expect(acme).toHaveLength(2);
        expect(acme).toContain(polska.vacancy.id);
        expect(await ids('Acme Polska')).toEqual(acme);
        expect(await ids('acme sp. z o.o.')).toEqual(acme);
      });

      it('ANDs with the other filters, `company` included', async () => {
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/s3', company: 'Acme Polska' }),
        );

        expect((await service.list({ sameCompanyAs: 'Acme', company: 'polska' })).total).toBe(1);
        expect((await service.list({ sameCompanyAs: 'Acme', status: ['DECLINED'] })).total).toBe(0);
      });

      it('lists nothing for a company with no vacancies', async () => {
        expect((await service.list({ sameCompanyAs: 'Nobody' })).total).toBe(0);
      });
    });

    describe('hasAnalysis', () => {
      it('is true for a row the analyzer saved', async () => {
        const { items } = await service.list();
        expect(items.map((item) => item.hasAnalysis)).toEqual([true, true]);
      });

      it('is false for a placeholder, whatever its other fields say', async () => {
        // What the importer path creates (ADR-0019) — via the service that writes it,
        // so the sentinel and the derivation are tested against each other rather
        // than against a literal this file happens to share.
        const applications = new ApplicationService();
        const { application, resolution } = await applications.record({
          company: 'Placeholder Co',
          title: 'Imported Role',
        });
        expect(resolution).toBe('created-vacancy');

        const { items } = await service.list({ company: 'Placeholder Co' });

        expect(items).toHaveLength(1);
        expect(items[0].id).toBe(application.id);
        expect(items[0].hasAnalysis).toBe(false);
        expect(items[0].estimationComment).toBeNull();
      });

      it('is true for a placeholder given an analyzer comment — the named ceiling', async () => {
        await new ApplicationService().record({
          company: 'Noted Co',
          title: 'Imported Role',
          estimationComment: 'From tracker notes.',
        });
        const { items } = await service.list({ company: 'Noted Co' });
        expect(items[0].hasAnalysis).toBe(true);
        expect(items[0].estimationComment).toBe('From tracker notes.');
      });
    });

    describe('search', () => {
      it('matches on the company', async () => {
        const { items, total } = await service.list({ search: 'acme' });
        expect(total).toBe(1);
        expect(items[0].company).toBe('Acme');
      });

      it('matches on the title', async () => {
        const { items, total } = await service.list({ search: 'frontend' });
        expect(total).toBe(1);
        expect(items[0].title).toBe('Frontend Lead');
      });

      it('is case-insensitive', async () => {
        expect((await service.list({ search: 'BACKEND' })).total).toBe(1);
      });

      it('ANDs with the other filters rather than replacing them', async () => {
        // `search` widens (company OR title); it must not also *drop* the narrowing
        // filters — Acme matches, but no Acme row is SKIP.
        expect((await service.list({ search: 'acme', recommendation: 'SKIP' })).total).toBe(0);
        expect((await service.list({ search: 'acme', recommendation: 'APPLY' })).total).toBe(1);
      });

      it('counts every match in total while the page stays limited', async () => {
        // Same term reaching two rows through different columns — the OR half of the
        // clause — and `total` staying the match count rather than the page size.
        await service.save(
          input({
            applyUrl: 'https://example.com/jobs/c',
            company: 'Gamma',
            title: 'Acme Support Lead',
          }),
        );

        const page = await service.list({ search: 'acme', limit: 1 });

        expect(page.items).toHaveLength(1);
        expect(page.total).toBe(2); // Acme (company) + Acme Support Lead (title)
      });
    });

    // Every term here reaches the pattern Prisma builds from `contains`, where
    // `%`, `_` and `\` each mean something. A user's typing means none of them.
    describe('LIKE metacharacters in a term are literal', () => {
      it('does not treat % as a wildcard', async () => {
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/pct', company: '100% Remote' }),
        );

        // Unescaped, all three of these match every row in the table.
        expect((await service.list({ search: '%' })).total).toBe(1);
        expect((await service.list({ company: '%' })).total).toBe(1);
        expect((await service.list({ search: '100% Rem' })).total).toBe(1);
      });

      it('does not treat _ as a wildcard', async () => {
        await service.save(input({ applyUrl: 'https://example.com/jobs/und', company: 'A_B' }));
        await service.save(input({ applyUrl: 'https://example.com/jobs/und2', company: 'AXB' }));

        const { items, total } = await service.list({ search: 'A_B' });

        expect(total).toBe(1);
        expect(items[0].company).toBe('A_B');
      });

      it('does not treat a backslash as an escape', async () => {
        // `A\B` is also the case where the *unescaped* pattern (`%A\B%`) matches
        // something else — here `AB` — rather than the row that was typed.
        await service.save(input({ applyUrl: 'https://example.com/jobs/bs', company: 'A\\B' }));
        await service.save(input({ applyUrl: 'https://example.com/jobs/bs2', company: 'AB' }));

        const { items, total } = await service.list({ search: 'A\\B' });

        expect(total).toBe(1);
        expect(items[0].company).toBe('A\\B');
      });

      it('counts a company whose own name contains a backslash', async () => {
        // The count once fed each row's company back through `contains`; unescaped,
        // that pattern missed the row it came from, so the duplicates button hid on
        // a company's own page (phase 2.2, finding 12).
        await service.save(input({ applyUrl: 'https://example.com/jobs/bs', company: 'A\\B' }));

        const { items } = await service.list({ company: 'A\\B' });

        expect(countsByCompany(items)['A\\B']).toBe(1);
      });
    });
  });

  describe('updateStatus', () => {
    it('returns null when the id does not exist', async () => {
      expect(await service.updateStatus(999_999, 'DECLINED')).toBeNull();
    });

    it('writes one journal row and keeps the cache in step', async () => {
      const { vacancy } = await service.save(input());
      const updated = await service.updateStatus(vacancy.id, 'DECLINED');
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
      expect(await journal(vacancy.id)).toEqual(['NOT_REVIEWED', 'DECLINED']);
    });

    it('journals a pipeline status the vacancy already has as a new event', async () => {
      const { vacancy } = await service.save(input());
      await service.updateStatus(vacancy.id, 'INTERVIEW');
      const before = await service.getById(vacancy.id);

      const same = await service.updateStatus(vacancy.id, 'INTERVIEW');

      expect(same?.statusChangedAt.getTime()).toBeGreaterThanOrEqual(
        before?.statusChangedAt.getTime() ?? 0,
      );
      expect(await journal(vacancy.id)).toEqual(['NOT_REVIEWED', 'INTERVIEW', 'INTERVIEW']);
    });

    it('refuses a triage status the vacancy already has, and journals nothing', async () => {
      const { vacancy } = await service.save(input());
      await service.updateStatus(vacancy.id, 'DECLINED');
      const before = await service.getById(vacancy.id);

      await expect(service.updateStatus(vacancy.id, 'DECLINED')).rejects.toThrow(SameStatusError);
      expect((await service.getById(vacancy.id))?.statusChangedAt).toEqual(before?.statusChangedAt);
      expect(await journal(vacancy.id)).toEqual(['NOT_REVIEWED', 'DECLINED']);
    });

    it('moves to UNAVAILABLE, a triage status: a repeat is refused', async () => {
      const { vacancy } = await service.save(input());
      expect((await service.updateStatus(vacancy.id, 'UNAVAILABLE'))?.status).toBe('UNAVAILABLE');
      expect((await service.list({ status: ['UNAVAILABLE'] })).total).toBe(1);

      await expect(service.updateStatus(vacancy.id, 'UNAVAILABLE')).rejects.toThrow(
        SameStatusError,
      );
      expect(await journal(vacancy.id)).toEqual(['NOT_REVIEWED', 'UNAVAILABLE']);
    });

    it('refuses NOT_REVIEWED on a vacancy that was never moved', async () => {
      const { vacancy } = await service.save(input());
      await expect(service.updateStatus(vacancy.id, 'NOT_REVIEWED')).rejects.toThrow(
        SameStatusError,
      );
      const found = await service.getById(vacancy.id);
      expect(found?.statusChangedAt).toEqual(vacancy.statusChangedAt);
      expect(await journal(vacancy.id)).toEqual(['NOT_REVIEWED']);
    });

    it('can set a vacancy back to NOT_REVIEWED', async () => {
      const { vacancy } = await service.save(input());
      await service.updateStatus(vacancy.id, 'DECLINED');
      const back = await service.updateStatus(vacancy.id, 'NOT_REVIEWED');
      expect(back?.status).toBe('NOT_REVIEWED');
      expect(await journal(vacancy.id)).toEqual(['NOT_REVIEWED', 'DECLINED', 'NOT_REVIEWED']);
    });
  });
});
