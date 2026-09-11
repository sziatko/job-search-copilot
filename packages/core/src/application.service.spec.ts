import { beforeEach, describe, expect, it } from 'vitest';
import { ApplicationService } from './application.service';
import {
  AmbiguousVacancyMatchError,
  ApplicationAlreadyExistsError,
  InvalidApplicationInputError,
} from './errors';
import { EstimatedVacancyService } from './estimated-vacancy.service';

// Integration tests against the real (test) Postgres — same rationale as
// estimated-vacancy.service.spec.ts.
const applications = new ApplicationService();
const vacancies = new EstimatedVacancyService();

let urlSeq = 0;
async function seedVacancy(
  overrides: {
    company?: string;
    title?: string;
    userAction?: 'NOT_REVIEWED' | 'READY_TO_APPLY' | 'APPLIED' | 'DECLINED';
  } = {},
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
  if (overrides.userAction && overrides.userAction !== 'NOT_REVIEWED') {
    await vacancies.updateUserAction(vacancy.id, overrides.userAction);
  }
  return vacancy;
}

describe('ApplicationService', () => {
  describe('record — by id (web path)', () => {
    it('links to the vacancy and flips its userAction to APPLIED', async () => {
      const vacancy = await seedVacancy({ userAction: 'READY_TO_APPLY' });

      const result = await applications.record({
        estimatedVacancyId: vacancy.id,
        salaryInListing: '130 PLN/h',
        usedTailoredResume: true,
        userComment: 'Adapted CV.',
      });

      expect(result.resolution).toBe('linked-by-id');
      expect(result.vacancyCreated).toBe(false);
      expect(result.application.company).toBe('Acme');
      expect(result.application.matchScore).toBe(80);
      expect(result.application.salaryInListing).toBe('130 PLN/h');
      expect(result.application.usedTailoredResume).toBe(true);
      expect(result.application.userComment).toBe('Adapted CV.');
      expect(result.application.status).toBe('APPLIED');

      const reread = await vacancies.getById(vacancy.id);
      expect(reread?.userAction).toBe('APPLIED');
      expect(reread?.matchScore).toBe(80); // analyzer fields untouched
    });

    it('throws for an unknown vacancy id', async () => {
      await expect(applications.record({ estimatedVacancyId: 999_999 })).rejects.toBeInstanceOf(
        InvalidApplicationInputError,
      );
    });

    it('throws when the vacancy already has an application', async () => {
      const vacancy = await seedVacancy();
      await applications.record({ estimatedVacancyId: vacancy.id });
      await expect(applications.record({ estimatedVacancyId: vacancy.id })).rejects.toBeInstanceOf(
        ApplicationAlreadyExistsError,
      );
    });
  });

  describe('record — by (company, title) (MCP / import path)', () => {
    it('links to a unique case-insensitive match', async () => {
      const vacancy = await seedVacancy({ company: 'Acme', title: 'Backend Engineer' });

      const result = await applications.record({ company: 'acme', title: 'backend engineer' });

      expect(result.resolution).toBe('linked-existing');
      expect(result.vacancyCreated).toBe(false);
      expect(result.application.estimatedVacancyId).toBe(vacancy.id);
      expect((await vacancies.getById(vacancy.id))?.userAction).toBe('APPLIED');
    });

    it('creates a placeholder vacancy when nothing matches', async () => {
      const result = await applications.record({
        company: 'Never Analyzed Co',
        title: 'Staff Engineer',
        matchScore: 72,
        estimationComment: 'From tracker notes.',
        appliedAt: new Date('2026-08-15'),
      });

      expect(result.resolution).toBe('created-vacancy');
      expect(result.vacancyCreated).toBe(true);
      expect(result.application.matchScore).toBe(72);
      expect(result.application.recommendation).toBe('APPLY'); // derived from 72
      expect(result.application.applyUrl).toMatch(/^tracker:\/\//);
      expect(result.application.estimationComment).toBe('From tracker notes.');

      const created = await vacancies.getById(result.application.estimatedVacancyId);
      expect(created?.fullText).toBe('N/A');
      expect(created?.userAction).toBe('APPLIED');
    });

    it('defaults matchScore to 0 and recommendation to APPLY when neither is given', async () => {
      const result = await applications.record({ company: 'Blank Co', title: 'Dev' });
      expect(result.application.matchScore).toBe(0);
      expect(result.application.recommendation).toBe('APPLY');
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

    it('honours status and appliedAt overrides', async () => {
      const result = await applications.record({
        company: 'Status Co',
        title: 'Dev',
        status: 'REJECTED',
        appliedAt: new Date('2026-07-01'),
      });
      expect(result.application.status).toBe('REJECTED');
      expect(result.application.appliedAt.toISOString().slice(0, 10)).toBe('2026-07-01');
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      const a = await seedVacancy({ company: 'Acme', title: 'Backend Engineer' });
      const b = await seedVacancy({ company: 'Beta Corp', title: 'Frontend Lead' });
      await applications.record({ estimatedVacancyId: a.id, appliedAt: new Date('2026-08-01') });
      await applications.record({
        estimatedVacancyId: b.id,
        status: 'REJECTED',
        appliedAt: new Date('2026-08-10'),
      });
    });

    it('returns newest-first, flattened with the vacancy fields', async () => {
      const { items, total } = await applications.list();
      expect(total).toBe(2);
      expect(items[0].company).toBe('Beta Corp');
      expect(items[0].title).toBe('Frontend Lead');
      expect(items[0]).not.toHaveProperty('estimatedVacancy');
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

    it('respects limit/offset', async () => {
      const page = await applications.list({ limit: 1, offset: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(2);
    });
  });

  describe('updateStatus', () => {
    it('returns null for an unknown id', async () => {
      expect(await applications.updateStatus(999_999, 'INTERVIEW')).toBeNull();
    });

    it('sets status and stamps statusUpdatedAt', async () => {
      const vacancy = await seedVacancy();
      const { application } = await applications.record({ estimatedVacancyId: vacancy.id });
      const updated = await applications.updateStatus(application.id, 'INTERVIEW');
      expect(updated?.status).toBe('INTERVIEW');
      expect(updated?.statusUpdatedAt).toBeInstanceOf(Date);
    });
  });

  describe('recordMany', () => {
    it('records a mixed batch in one call', async () => {
      const existing = await seedVacancy({ company: 'Batch Co', title: 'Dev' });
      const { results } = await applications.recordMany([
        { estimatedVacancyId: existing.id, appliedAt: new Date('2026-08-01') },
        {
          company: 'Fresh Co',
          title: 'Engineer',
          matchScore: 65,
          appliedAt: new Date('2026-08-02'),
        },
      ]);
      expect(results.map((r) => r.resolution)).toEqual(['linked-by-id', 'created-vacancy']);
      expect((await applications.list()).total).toBe(2);
    });

    it('rolls the whole batch back if one row fails', async () => {
      const vacancy = await seedVacancy();
      await expect(
        applications.recordMany([
          { company: 'Rollback Co', title: 'Dev', appliedAt: new Date('2026-08-01') },
          { estimatedVacancyId: 999_999 }, // fails
          { company: 'Never Inserted', title: 'Dev' },
        ]),
      ).rejects.toBeInstanceOf(InvalidApplicationInputError);
      expect((await applications.list()).total).toBe(0);
      expect((await vacancies.list({ company: 'Rollback Co' })).total).toBe(0);
      // The pre-existing seed vacancy is still there.
      expect((await vacancies.getById(vacancy.id))?.id).toBe(vacancy.id);
    });
  });
});
