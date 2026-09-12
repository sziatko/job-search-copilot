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
      expect(updated?.statusComment).toBeNull();
    });

    it('leaves statusComment untouched when none is given', async () => {
      const vacancy = await seedVacancy();
      const { application } = await applications.record({ estimatedVacancyId: vacancy.id });
      await applications.updateStatus(application.id, 'INTERVIEW', 'Recruiter called.');
      const updated = await applications.updateStatus(application.id, 'OFFER');
      expect(updated?.statusComment).toBe('Recruiter called.');
    });

    it('appends a new statusComment to the existing one, joined with " / "', async () => {
      const vacancy = await seedVacancy();
      const { application } = await applications.record({ estimatedVacancyId: vacancy.id });

      const first = await applications.updateStatus(
        application.id,
        'RECRUITER_SCREEN',
        'Recruiter called.',
      );
      expect(first?.statusComment).toBe('Recruiter called.');

      const second = await applications.updateStatus(
        application.id,
        'INTERVIEW',
        'Interview on 20.09.',
      );
      expect(second?.statusComment).toBe('Recruiter called. / Interview on 20.09.');

      const third = await applications.updateStatus(application.id, 'OFFER', 'Offer received!');
      expect(third?.statusComment).toBe(
        'Recruiter called. / Interview on 20.09. / Offer received!',
      );
    });

    it('trims the comment and ignores a blank one', async () => {
      const vacancy = await seedVacancy();
      const { application } = await applications.record({ estimatedVacancyId: vacancy.id });
      const withSpaces = await applications.updateStatus(application.id, 'INTERVIEW', '  padded  ');
      expect(withSpaces?.statusComment).toBe('padded');
      const unchanged = await applications.updateStatus(application.id, 'OFFER', '   ');
      expect(unchanged?.statusComment).toBe('padded');
    });

    it('returns null for an unknown id even when a comment is given', async () => {
      expect(await applications.updateStatus(999_999, 'INTERVIEW', 'note')).toBeNull();
    });
  });

  describe('updateStatusByVacancy', () => {
    it('resolves a unique (company, title) match and updates it', async () => {
      const vacancy = await seedVacancy({ company: 'Delta Co', title: 'Dev' });
      const { application } = await applications.record({ estimatedVacancyId: vacancy.id });

      const updated = await applications.updateStatusByVacancy(
        'delta co',
        'DEV',
        'REJECTED',
        'Rejection email received.',
      );
      expect(updated?.id).toBe(application.id);
      expect(updated?.status).toBe('REJECTED');
      expect(updated?.statusComment).toBe('Rejection email received.');
    });

    it('appends across calls, same as updateStatus by id', async () => {
      const vacancy = await seedVacancy({ company: 'Echo Co', title: 'Dev' });
      await applications.record({ estimatedVacancyId: vacancy.id });

      await applications.updateStatusByVacancy('Echo Co', 'Dev', 'RECRUITER_SCREEN', 'Called.');
      const second = await applications.updateStatusByVacancy(
        'Echo Co',
        'Dev',
        'INTERVIEW',
        'Interview scheduled.',
      );
      expect(second?.statusComment).toBe('Called. / Interview scheduled.');
    });

    it('returns null when no vacancy matches', async () => {
      expect(
        await applications.updateStatusByVacancy('Nobody Inc', 'Ghost Role', 'REJECTED'),
      ).toBeNull();
    });

    it('returns null when the vacancy exists but has no recorded application', async () => {
      await seedVacancy({ company: 'Foxtrot Co', title: 'Dev' });
      expect(await applications.updateStatusByVacancy('Foxtrot Co', 'Dev', 'REJECTED')).toBeNull();
    });

    it('throws AmbiguousVacancyMatchError for two vacancies with the same (company, title)', async () => {
      await seedVacancy({ company: 'Golf Co', title: 'Dev' });
      await seedVacancy({ company: 'Golf Co', title: 'Dev' });
      await expect(
        applications.updateStatusByVacancy('Golf Co', 'Dev', 'REJECTED'),
      ).rejects.toThrow(AmbiguousVacancyMatchError);
    });

    it('throws InvalidApplicationInputError for blank company/title', async () => {
      await expect(applications.updateStatusByVacancy('  ', 'Dev', 'REJECTED')).rejects.toThrow(
        InvalidApplicationInputError,
      );
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
