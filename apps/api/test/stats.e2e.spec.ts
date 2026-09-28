import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

describe('Stats (e2e)', () => {
  let app: INestApplication;
  const prisma = getPrisma();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterEach(async () => {
    await prisma.vacancy.deleteMany();
    await prisma.vacancyLogEntry.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('GET counts the funnel from the journal and the pipeline from the status', async () => {
    const server = app.getHttpServer();
    await request(server)
      .post('/api/v1/log/check')
      .send({ entries: [{ url: 'https://acme.com/jobs/1' }] })
      .expect(200);
    const created = await request(server)
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
    await request(server).post('/api/v1/applications').send({ vacancyId: id }).expect(201);
    for (const status of ['REPLIED', 'REJECTED']) {
      await request(server).patch(`/api/v1/applications/${id}/status`).send({ status }).expect(200);
    }

    const res = await request(server).get('/api/v1/stats').expect(200);

    expect(res.body).toMatchObject({
      logged: 1,
      analysed: 1,
      awaitingTriage: 0,
      recommended: 1,
      applied: 1,
      responded: 1,
      interview: 0,
      recruiterScreen: 0,
      pipeline: { byStatus: { REJECTED: 1, APPLIED: 0 }, active: 0, timedOut: 0, total: 1 },
    });
    expect(res.body.recent).toEqual([
      expect.objectContaining({ vacancyId: id, status: 'REJECTED', company: 'Acme' }),
      expect.objectContaining({ status: 'REPLIED' }),
      expect.objectContaining({ status: 'APPLIED', title: 'Backend Engineer' }),
    ]);
    expect(typeof res.body.recent[0].createdAt).toBe('string');
  });
});
