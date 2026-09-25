import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationService } from './application.service';
import { InvalidRecommendationError } from './errors';
import { EstimatedVacancyService } from './estimated-vacancy.service';
import type {
  EstimatedVacancyListItem,
  SaveEstimatedVacancyInput,
} from './estimated-vacancy.types';

// Integration tests: hit the real (test) Postgres database instead of mocking
// Prisma. A mocked Prisma client would just re-assert our own query calls and
// break on every harmless refactor — the DB round-trip is what actually matters.
const service = new EstimatedVacancyService();

function input(overrides: Partial<SaveEstimatedVacancyInput> = {}): SaveEstimatedVacancyInput {
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
function countsByCompany(items: EstimatedVacancyListItem[]): Record<string, number> {
  return Object.fromEntries(items.map((item) => [item.company, item.companyMatchCount]));
}

describe('EstimatedVacancyService', () => {
  describe('save', () => {
    it('creates a new vacancy with the recommendation normalized to English', async () => {
      const { created, vacancy } = await service.save(input({ recommendation: 'ПОДАВАТИСЯ' }));
      expect(created).toBe(true);
      expect(vacancy.recommendation).toBe('APPLY');
      expect(vacancy.userAction).toBe('NOT_REVIEWED');
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
      expect(second.vacancy.estimationComment).toBe('First pass.');
    });

    it('a second save does not disturb a userAction set in between', async () => {
      const first = await service.save(input());
      await service.updateUserAction(first.vacancy.id, 'READY_TO_APPLY');

      const resaved = await service.save(input({ matchScore: 50 }));

      expect(resaved.created).toBe(false);
      expect(resaved.vacancy.id).toBe(first.vacancy.id);
      expect(resaved.vacancy.userAction).toBe('READY_TO_APPLY');
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
        // shape would move the 42 synthetic rows already stored, and
        // `backfill-applyurl.ts` refuses to merge, so it is recorded, not changed.
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

    it('returns the full record including fullText', async () => {
      const { vacancy } = await service.save(input());
      const found = await service.getById(vacancy.id);
      expect(found?.fullText).toBe(vacancy.fullText);
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

      it('is a case-insensitive substring, in one direction only', async () => {
        // 'Acme' contains itself in 'Acme Recruiting', but not the reverse — the
        // needle is this row's own company, which is what the button reports.
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/d', company: 'Acme Recruiting' }),
        );

        const { items } = await service.list();

        expect(countsByCompany(items)).toEqual({ Acme: 2, 'Acme Recruiting': 1, 'Beta Corp': 1 });
      });

      it('matches a differently-cased company name', async () => {
        await service.save(
          input({ applyUrl: 'https://example.com/jobs/e', company: 'acme consulting' }),
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
        expect(items[0].id).toBe(application.estimatedVacancyId);
        expect(items[0].hasAnalysis).toBe(false);
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
        // The companyMatchCount prefilter feeds each row's company back through
        // `contains`; unescaped, that pattern missed the row it came from, so the
        // duplicates button hid on a company's own page (phase 2.2, finding 12).
        await service.save(input({ applyUrl: 'https://example.com/jobs/bs', company: 'A\\B' }));

        const { items } = await service.list({ company: 'A\\B' });

        expect(countsByCompany(items)['A\\B']).toBe(1);
      });
    });
  });

  describe('updateUserAction', () => {
    it('returns null when the id does not exist', async () => {
      expect(await service.updateUserAction(999_999, 'DECLINED')).toBeNull();
    });

    it('sets userAction and stamps userActionUpdatedAt', async () => {
      const { vacancy } = await service.save(input());
      const updated = await service.updateUserAction(vacancy.id, 'DECLINED');
      expect(updated?.userAction).toBe('DECLINED');
      expect(updated?.userActionUpdatedAt).toBeInstanceOf(Date);
    });
  });
});
