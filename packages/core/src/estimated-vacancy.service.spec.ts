import { beforeEach, describe, expect, it } from 'vitest';
import { EstimatedVacancyService } from './estimated-vacancy.service';
import type { SaveEstimatedVacancyInput } from './estimated-vacancy.types';

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
