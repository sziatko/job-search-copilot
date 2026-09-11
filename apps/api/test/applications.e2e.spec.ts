import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

describe('Applications (e2e)', () => {
  let app: INestApplication;
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
    const res = await request(app.getHttpServer())
      .post('/api/v1/estimated-vacancies')
      .send({
        ...vacancyPayload,
        applyUrl: `https://example.com/jobs/${Math.random()}`,
        ...overrides,
      });
    return res.body.id as number;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterEach(async () => {
    await prisma.application.deleteMany();
    await prisma.estimatedVacancy.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/applications', () => {
    it('records an application (201 + Location), links the vacancy and marks it APPLIED', async () => {
      const vacancyId = await seedVacancy();

      const res = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({
          estimatedVacancyId: vacancyId,
          salaryInListing: '130 PLN/h',
          usedTailoredResume: true,
          userComment: 'Adapted CV.',
        })
        .expect(201);

      expect(res.body.resolution).toBe('linked-by-id');
      expect(res.body.vacancyCreated).toBe(false);
      expect(res.body.application.company).toBe('Acme');
      expect(res.body.application.matchScore).toBe(80);
      expect(res.body.application.salaryInListing).toBe('130 PLN/h');
      expect(res.headers.location).toBe(`/api/v1/applications/${res.body.application.id}`);

      const vacancy = await request(app.getHttpServer())
        .get(`/api/v1/estimated-vacancies/${vacancyId}`)
        .expect(200);
      expect(vacancy.body.userAction).toBe('APPLIED');
    });

    it('422s on a second application for the same vacancy', async () => {
      const vacancyId = await seedVacancy();
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ estimatedVacancyId: vacancyId })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ estimatedVacancyId: vacancyId })
        .expect(422);
    });

    it('422s for an unknown vacancy id', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ estimatedVacancyId: 999_999 })
        .expect(422);
    });

    it('400s for a missing estimatedVacancyId', async () => {
      await request(app.getHttpServer()).post('/api/v1/applications').send({}).expect(400);
    });

    it('400s for a bad status', async () => {
      const vacancyId = await seedVacancy();
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ estimatedVacancyId: vacancyId, status: 'MAYBE' })
        .expect(400);
    });
  });

  describe('GET /api/v1/applications', () => {
    it('lists flattened rows, filters by status and search', async () => {
      const a = await seedVacancy({ applyUrl: 'https://example.com/a', company: 'Acme' });
      const b = await seedVacancy({ applyUrl: 'https://example.com/b', company: 'Beta Corp' });
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ estimatedVacancyId: a });
      await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ estimatedVacancyId: b, status: 'REJECTED' });

      const all = await request(app.getHttpServer()).get('/api/v1/applications').expect(200);
      expect(all.body.total).toBe(2);
      expect(all.body.items[0]).toHaveProperty('company');
      expect(all.body.items[0]).not.toHaveProperty('estimatedVacancy');

      const rejected = await request(app.getHttpServer())
        .get('/api/v1/applications?status=REJECTED')
        .expect(200);
      expect(rejected.body.total).toBe(1);
      expect(rejected.body.items[0].company).toBe('Beta Corp');

      const searched = await request(app.getHttpServer())
        .get('/api/v1/applications?search=beta')
        .expect(200);
      expect(searched.body.total).toBe(1);
    });

    it('400s for limit above 500', async () => {
      await request(app.getHttpServer()).get('/api/v1/applications?limit=1000').expect(400);
    });
  });

  describe('GET /api/v1/applications/:id', () => {
    it('404s for an unknown id', async () => {
      await request(app.getHttpServer()).get('/api/v1/applications/999999').expect(404);
    });
  });

  describe('PATCH /api/v1/applications/:id/status', () => {
    it('updates the status for a known id', async () => {
      const vacancyId = await seedVacancy();
      const created = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ estimatedVacancyId: vacancyId });
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/applications/${created.body.application.id}/status`)
        .send({ status: 'INTERVIEW' })
        .expect(200);
      expect(res.body.status).toBe('INTERVIEW');
      expect(res.body.statusUpdatedAt).not.toBeNull();
    });

    it('404s for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/applications/999999/status')
        .send({ status: 'INTERVIEW' })
        .expect(404);
    });

    it('400s for a bad status', async () => {
      const vacancyId = await seedVacancy();
      const created = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send({ estimatedVacancyId: vacancyId });
      await request(app.getHttpServer())
        .patch(`/api/v1/applications/${created.body.application.id}/status`)
        .send({ status: 'MAYBE' })
        .expect(400);
    });
  });
});
