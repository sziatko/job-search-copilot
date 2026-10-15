import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Api, createTestApp, signedInAgent } from './test-app';

/** [source, body] per comment, in the order the API returned them. */
const notes = (item: { comments: { source: string; body: string }[] }) =>
  item.comments.map((c) => [c.source, c.body]);

/** Every seeded vacancy was saved by the analyzer, so its comments start with this. */
const ANALYZED = ['ANALYZER', 'Strong match.'];

describe('Applications (e2e)', () => {
  let app: NestExpressApplication;
  let api: Api;
  const prisma = getPrisma();

  const vacancyPayload = {
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/jobs/1',
    fullText: 'Full vacancy text.',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
  };

  async function seedVacancy(overrides: Record<string, unknown> = {}): Promise<number> {
    const res = await api.post('/api/v1/vacancies').send({
      ...vacancyPayload,
      applyUrl: `https://example.com/jobs/${Math.random()}`,
      ...overrides,
    });
    return res.body.id as number;
  }

  beforeAll(async () => {
    app = await createTestApp();
    api = await signedInAgent(app);
  });

  afterEach(async () => {
    await prisma.vacancy.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/applications', () => {
    it('records an application (201 + Location) on the vacancy, and moves it to APPLIED', async () => {
      const vacancyId = await seedVacancy();

      const res = await api
        .post('/api/v1/applications')
        .send({
          vacancyId,
          salaryInApplication: '130 PLN/h',
          usedTailoredResume: true,
          comment: 'Adapted CV.',
        })
        .expect(201);

      expect(res.body.resolution).toBe('linked-by-id');
      expect(res.body.vacancyCreated).toBe(false);
      expect(res.body.application.company).toBe('Acme');
      expect(res.body.application.matchScore).toBe(80);
      expect(res.body.application.salaryInApplication).toBe('130 PLN/h');
      expect(res.body.application.id).toBe(vacancyId);
      expect(res.body.application.appliedAt).toBe(res.body.application.statusChangedAt);
      expect(notes(res.body.application)).toEqual([ANALYZED, ['USER', 'Adapted CV.']]);
      expect(res.headers.location).toBe(`/api/v1/applications/${res.body.application.id}`);

      const vacancy = await api.get(`/api/v1/vacancies/${vacancyId}`).expect(200);
      expect(vacancy.body.status).toBe('APPLIED');
    });

    it('422s for a vacancy already in the pipeline', async () => {
      const vacancyId = await seedVacancy();
      await api.post('/api/v1/applications').send({ vacancyId }).expect(201);
      await api.post('/api/v1/applications').send({ vacancyId }).expect(422);
    });

    it('404s for an unknown vacancy id', async () => {
      await api.post('/api/v1/applications').send({ vacancyId: 999_999 }).expect(404);
    });

    it('400s for a missing vacancyId', async () => {
      await api.post('/api/v1/applications').send({}).expect(400);
    });

    it('400s for a status outside the pipeline', async () => {
      const vacancyId = await seedVacancy();
      for (const status of ['MAYBE', 'DECLINED']) {
        await api.post('/api/v1/applications').send({ vacancyId, status }).expect(400);
      }
    });
  });

  describe('GET /api/v1/applications', () => {
    it('lists pipeline rows, the last move first; filters by status and search', async () => {
      const a = await seedVacancy({ applyUrl: 'https://example.com/a', company: 'Acme' });
      const b = await seedVacancy({ applyUrl: 'https://example.com/b', company: 'Beta Corp' });
      await seedVacancy({ applyUrl: 'https://example.com/c', company: 'Not Applied' });
      await api.post('/api/v1/applications').send({ vacancyId: a });
      await api.post('/api/v1/applications').send({ vacancyId: b, status: 'REJECTED' });

      const all = await api.get('/api/v1/applications').expect(200);
      expect(all.body.total).toBe(2);
      expect(all.body.items.map((i: { company: string }) => i.company)).toEqual([
        'Beta Corp',
        'Acme',
      ]);

      const rejected = await api.get('/api/v1/applications?status=REJECTED').expect(200);
      expect(rejected.body.total).toBe(1);
      expect(rejected.body.items[0].company).toBe('Beta Corp');

      const searched = await api.get('/api/v1/applications?search=beta').expect(200);
      expect(searched.body.total).toBe(1);
    });

    it('carries the derived companyMatchCount, counted over every vacancy', async () => {
      const a = await seedVacancy({ company: 'Acme' });
      await seedVacancy({ company: 'Acme Polska' }); // not applied to — still counted
      await api.post('/api/v1/applications').send({ vacancyId: a });

      const res = await api.get('/api/v1/applications').expect(200);
      expect(res.body.items[0].companyMatchCount).toBe(2);
    });

    it('filters by ?sameCompanyAs=, whatever the spelling', async () => {
      const a = await seedVacancy({ company: 'Acme' });
      const b = await seedVacancy({ company: 'Acme Polska' });
      const c = await seedVacancy({ company: 'Beta Corp' });
      for (const vacancyId of [a, b, c]) {
        await api.post('/api/v1/applications').send({ vacancyId });
      }

      const res = await api.get('/api/v1/applications?sameCompanyAs=acme%20polska').expect(200);
      expect(res.body.items.map((i: { id: number }) => i.id).sort()).toEqual([a, b].sort());
    });

    it('filters by ?state=, flags timedOut, and pages by ?cursor=', async () => {
      const a = await seedVacancy({ applyUrl: 'https://example.com/a', company: 'Acme' });
      const b = await seedVacancy({ applyUrl: 'https://example.com/b', company: 'Beta Corp' });
      await api.post('/api/v1/applications').send({ vacancyId: a });
      await api.post('/api/v1/applications').send({ vacancyId: b });
      await prisma.vacancy.update({
        where: { id: a },
        data: { statusChangedAt: new Date(Date.now() - 40 * 86_400_000) },
      });

      const timedOut = await api.get('/api/v1/applications?state=timedOut').expect(200);
      expect(timedOut.body).toMatchObject({ total: 1, nextCursor: null });
      expect(timedOut.body.items).toMatchObject([{ id: a, timedOut: true }]);
      const active = await api.get('/api/v1/applications?state=active&status=APPLIED').expect(200);
      expect(active.body.items).toMatchObject([{ id: b, timedOut: false }]);

      const first = await api.get('/api/v1/applications?limit=1').expect(200);
      expect(first.body.nextCursor).toBe(b);
      const second = await api
        .get(`/api/v1/applications?limit=1&cursor=${first.body.nextCursor}`)
        .expect(200);
      expect(second.body).toMatchObject({ items: [{ id: a }], total: 2, nextCursor: null });
    });

    it('400s for limit above 500, a status outside the pipeline, a bad state, or cursor with offset', async () => {
      await api.get('/api/v1/applications?limit=1000').expect(400);
      await api.get('/api/v1/applications?status=DECLINED').expect(400);
      await api.get('/api/v1/applications?state=TIMEOUT').expect(400);
      await api.get('/api/v1/applications?cursor=5&offset=0').expect(400);
    });
  });

  describe('GET /api/v1/applications/:id', () => {
    it('404s for an unknown id, and for a vacancy not in the pipeline', async () => {
      await api.get('/api/v1/applications/999999').expect(404);
      const vacancyId = await seedVacancy();
      await api.get(`/api/v1/applications/${vacancyId}`).expect(404);
    });
  });

  describe('PATCH /api/v1/applications/:id/status', () => {
    it('updates the status for a known id', async () => {
      const vacancyId = await seedVacancy();
      const created = await api.post('/api/v1/applications').send({ vacancyId });
      const res = await api
        .patch(`/api/v1/applications/${created.body.application.id}/status`)
        .send({ status: 'INTERVIEW' })
        .expect(200);
      expect(res.body.status).toBe('INTERVIEW');
      expect(new Date(res.body.statusChangedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(created.body.application.statusChangedAt).getTime(),
      );
      // The applied date stays the journal's APPLIED row.
      expect(res.body.appliedAt).toBe(created.body.application.appliedAt);
      expect(notes(res.body)).toEqual([ANALYZED]);
    });

    it('turns each comment into a dated USER comment, oldest first', async () => {
      const vacancyId = await seedVacancy();
      const created = await api.post('/api/v1/applications').send({ vacancyId });
      const id = created.body.application.id;

      const first = await api
        .patch(`/api/v1/applications/${id}/status`)
        .send({ status: 'ACTION_NEEDED', comment: 'Recruiter called.' })
        .expect(200);
      expect(notes(first.body)).toEqual([ANALYZED, ['USER', 'Recruiter called.']]);
      expect(typeof first.body.comments[1].createdAt).toBe('string');

      const second = await api
        .patch(`/api/v1/applications/${id}/status`)
        .send({ status: 'INTERVIEW', comment: 'Interview on 20.09.' })
        .expect(200);
      expect(notes(second.body)).toEqual([
        ANALYZED,
        ['USER', 'Recruiter called.'],
        ['USER', 'Interview on 20.09.'],
      ]);

      const noComment = await api
        .patch(`/api/v1/applications/${id}/status`)
        .send({ status: 'OFFER' })
        .expect(200);
      expect(noComment.body.comments).toHaveLength(3);
    });

    it('404s for an unknown id', async () => {
      await api
        .patch('/api/v1/applications/999999/status')
        .send({ status: 'INTERVIEW' })
        .expect(404);
    });

    // REPLIED and RECRUITER_SCREEN left the enum in phase 7.2.
    it.each(['MAYBE', 'REPLIED', 'RECRUITER_SCREEN'])('400s for the status %s', async (status) => {
      const vacancyId = await seedVacancy();
      const created = await api.post('/api/v1/applications').send({ vacancyId });
      await api
        .patch(`/api/v1/applications/${created.body.application.id}/status`)
        .send({ status })
        .expect(400);
    });
  });

  async function recordOne(extra: Record<string, unknown> = {}): Promise<number> {
    const vacancyId = await seedVacancy();
    const res = await api
      .post('/api/v1/applications')
      .send({ vacancyId, ...extra })
      .expect(201);
    return res.body.application.id as number;
  }

  describe('PATCH /api/v1/applications/:id', () => {
    it('edits the given fields, leaves the rest, and adds the comment', async () => {
      const id = await recordOne({ salaryInApplication: '100 PLN/h', comment: 'Old' });

      const res = await api
        .patch(`/api/v1/applications/${id}`)
        .send({ usedTailoredResume: true, comment: 'New', status: 'OFFER' })
        .expect(200);
      expect(res.body).toMatchObject({
        salaryInApplication: '100 PLN/h',
        usedTailoredResume: true,
        // not a field of this DTO — stripped by whitelist, so the status stays
        status: 'APPLIED',
      });
      expect(notes(res.body)).toEqual([ANALYZED, ['USER', 'Old'], ['USER', 'New']]);
    });

    it('clears a field sent as null', async () => {
      const id = await recordOne({ salaryInApplication: '100 PLN/h' });
      const res = await api
        .patch(`/api/v1/applications/${id}`)
        .send({ salaryInApplication: null })
        .expect(200);
      expect(res.body.salaryInApplication).toBeNull();
    });

    it('404s for an unknown id; 400s on a bad field', async () => {
      await api.patch('/api/v1/applications/999999').send({ comment: 'x' }).expect(404);
      const id = await recordOne();
      await api.patch(`/api/v1/applications/${id}`).send({ usedTailoredResume: 'yes' }).expect(400);
    });
  });
});
