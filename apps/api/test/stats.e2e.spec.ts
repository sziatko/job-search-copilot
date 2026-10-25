import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type Api,
  createTestApp,
  deleteTestUsers,
  deleteTestVacancies,
  signedInAgent,
} from './test-app';

describe('Stats (e2e)', () => {
  let app: NestExpressApplication;
  let api: Api;
  const prisma = getPrisma();

  beforeAll(async () => {
    app = await createTestApp();
    api = await signedInAgent(app);
  });

  afterEach(deleteTestVacancies);

  afterAll(async () => {
    await deleteTestUsers();
    await app.close();
    await prisma.$disconnect();
  });

  it('GET counts the funnel from the journal and the pipeline from the status', async () => {
    await api
      .post('/api/v1/vacancies/intake')
      .send({ entries: [{ url: 'https://beta.com/jobs/1', company: 'Beta', title: 'QA' }] })
      .expect(200);
    const created = await api
      .post('/api/v1/vacancies')
      .send({
        company: 'Acme',
        title: 'Backend Engineer',
        applyUrl: 'https://acme.com/jobs/1',
        fullText: 'Text.',
        matchScore: 80,
        recommendation: 'APPLY',
        estimationComment: 'Strong match.',
      })
      .expect(201);
    const id = created.body.id;
    await api.post('/api/v1/applications').send({ vacancyId: id }).expect(201);
    for (const status of ['ACTION_NEEDED', 'REJECTED']) {
      await api.patch(`/api/v1/applications/${id}/status`).send({ status }).expect(200);
    }

    const res = await api.get('/api/v1/stats').expect(200);

    expect(res.body).not.toHaveProperty('analysed');
    expect(res.body).toMatchObject({
      // Every vacancy: the one intake took in, unanalysed, and the one saved.
      logged: 2,
      awaitingAnalysis: 1,
      awaitingTriage: 0,
      recommended: 1,
      notRecommended: 0,
      applied: 1,
      declined: 0,
      unavailable: 0,
      responded: 1,
      interview: 0,
      actionNeeded: 0,
      pipeline: { byStatus: { REJECTED: 1, APPLIED: 0 }, active: 0, timedOut: 0, total: 1 },
    });
    expect(res.body.recent).toEqual([
      expect.objectContaining({ vacancyId: id, status: 'REJECTED', company: 'Acme' }),
      expect.objectContaining({ status: 'ACTION_NEEDED' }),
      expect.objectContaining({ status: 'APPLIED', title: 'Backend Engineer' }),
    ]);
    expect(typeof res.body.recent[0].createdAt).toBe('string');
  });

  it('GET counts unavailable by the current status', async () => {
    const created = await api
      .post('/api/v1/vacancies')
      .send({
        company: 'Acme',
        title: 'Backend Engineer',
        applyUrl: 'https://acme.com/jobs/2',
        fullText: 'Text.',
        matchScore: 80,
        recommendation: 'APPLY',
        estimationComment: 'Strong match.',
      })
      .expect(201);
    await api
      .patch(`/api/v1/vacancies/${created.body.id}/status`)
      .send({ status: 'UNAVAILABLE' })
      .expect(200);

    const res = await api.get('/api/v1/stats').expect(200);

    expect(res.body).toMatchObject({ unavailable: 1, declined: 0, awaitingTriage: 0 });
  });
});
