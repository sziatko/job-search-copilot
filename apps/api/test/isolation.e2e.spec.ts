import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { type Api, createApiKey, createTestApp, signedInAgent } from './test-app';

// Every row has an owner (ADR-0038): another user's row is a 404, never a 403, and a
// key acts as its owner. core's isolation.spec.ts covers each service method; this is
// the same promise over HTTP.
describe('Isolation between users (e2e)', () => {
  let app: NestExpressApplication;
  let a: Api;
  let b: Api;
  const prisma = getPrisma();

  beforeAll(async () => {
    app = await createTestApp();
    a = await signedInAgent(app);
    b = await signedInAgent(app);
  });

  afterEach(async () => {
    await prisma.vacancy.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  it("404s B on A's vacancy and application, GET and PATCH, and leaves A's row as it was", async () => {
    const { body: vacancy } = await a
      .post('/api/v1/vacancies')
      .send({
        company: 'Acme',
        title: 'Backend Engineer',
        applyUrl: 'https://example.com/jobs/1',
        fullText: 'Full vacancy text.',
        matchScore: 80,
        recommendation: 'APPLY',
        estimationComment: 'Strong match.',
      })
      .expect(201);
    await a.post('/api/v1/applications').send({ vacancyId: vacancy.id }).expect(201);
    const before = (await a.get(`/api/v1/vacancies/${vacancy.id}`).expect(200)).body;

    await b.get(`/api/v1/vacancies/${vacancy.id}`).expect(404);
    await b
      .patch(`/api/v1/vacancies/${vacancy.id}/status`)
      .send({ status: 'DECLINED' })
      .expect(404);
    await b.get(`/api/v1/applications/${vacancy.id}`).expect(404);
    await b.patch(`/api/v1/applications/${vacancy.id}`).send({ comment: 'Mine.' }).expect(404);
    await b
      .patch(`/api/v1/applications/${vacancy.id}/status`)
      .send({ status: 'REJECTED' })
      .expect(404);

    expect((await a.get(`/api/v1/vacancies/${vacancy.id}`).expect(200)).body).toEqual(before);
  });

  it("lands an intake with B's key in B: new to B though A has the same url, unseen by A", async () => {
    const entries = [{ url: 'https://acme.com/jobs/1', company: 'Acme', title: 'Dev' }];
    await a.post('/api/v1/vacancies/intake').send({ entries }).expect(200);
    const owner = await createApiKey(app);

    const res = await request(app.getHttpServer())
      .post('/api/v1/vacancies/intake')
      .set('Authorization', `Bearer ${owner.key}`)
      .send({ entries })
      .expect(200);

    expect(res.body).toEqual({ new: [entries[0].url] });
    expect(await prisma.vacancy.count({ where: { userId: owner.userId } })).toBe(1);
    expect((await a.get('/api/v1/vacancies').expect(200)).body.total).toBe(1);
  });
});
