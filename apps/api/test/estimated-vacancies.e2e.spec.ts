import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

// End-to-end: boots the real Nest app (same ValidationPipe as main.ts) against
// the real test database, and hits it over HTTP via supertest. This is what
// actually exercises DTO validation + the class-validator/class-transformer
// pipeline, which a controller-only unit test with a mocked service would miss.
describe('EstimatedVacancies (e2e)', () => {
  let app: INestApplication;
  const prisma = getPrisma();

  const validPayload = {
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/jobs/1',
    fullText: 'Full vacancy text goes here.',
    matchScore: 80,
    recommendation: 'ПОДАВАТИСЯ',
    estimationComment: 'Strong match.',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await prisma.estimatedVacancy.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('GET /health', () => {
    it('reports ok when the database is reachable', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ status: 'ok', db: 'up' });
    });
  });

  describe('POST /api/v1/estimated-vacancies', () => {
    it('saves a vacancy and normalizes the Ukrainian recommendation to English', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/estimated-vacancies')
        .send(validPayload)
        .expect(201);
      expect(res.body.recommendation).toBe('APPLY');
      expect(res.body.userAction).toBe('NOT_REVIEWED');
    });

    it('rejects an unknown recommendation with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/estimated-vacancies')
        .send({ ...validPayload, recommendation: 'MAYBE' })
        .expect(400);
    });

    it('rejects a payload missing required fields with 400', async () => {
      await request(app.getHttpServer()).post('/api/v1/estimated-vacancies').send({}).expect(400);
    });
  });

  describe('GET /api/v1/estimated-vacancies', () => {
    it('lists saved vacancies without fullText', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/estimated-vacancies')
        .send(validPayload)
        .expect(201);

      const res = await request(app.getHttpServer()).get('/api/v1/estimated-vacancies').expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).not.toHaveProperty('fullText');
    });

    it('rejects limit above 100 with 400', async () => {
      await request(app.getHttpServer()).get('/api/v1/estimated-vacancies?limit=200').expect(400);
    });
  });

  describe('GET /api/v1/estimated-vacancies/:id', () => {
    it('404s for an unknown id', async () => {
      await request(app.getHttpServer()).get('/api/v1/estimated-vacancies/999999').expect(404);
    });

    it('returns the full record, including fullText, for a known id', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/estimated-vacancies')
        .send(validPayload);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/estimated-vacancies/${created.body.id}`)
        .expect(200);
      expect(res.body.fullText).toBe(validPayload.fullText);
    });
  });

  describe('PATCH /api/v1/estimated-vacancies/:id/user-action', () => {
    it('404s for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/estimated-vacancies/999999/user-action')
        .send({ userAction: 'DECLINED' })
        .expect(404);
    });

    it('updates userAction for a known id', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/estimated-vacancies')
        .send(validPayload);
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/estimated-vacancies/${created.body.id}/user-action`)
        .send({ userAction: 'READY_TO_APPLY' })
        .expect(200);
      expect(res.body.userAction).toBe('READY_TO_APPLY');
    });

    it('rejects an invalid userAction with 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/estimated-vacancies')
        .send(validPayload);
      await request(app.getHttpServer())
        .patch(`/api/v1/estimated-vacancies/${created.body.id}/user-action`)
        .send({ userAction: 'MAYBE' })
        .expect(400);
    });
  });
});
