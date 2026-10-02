import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

// End-to-end: boots the real Nest app (same ValidationPipe as setup-app.ts) against
// the real test database, and hits it over HTTP via supertest. This is what
// actually exercises DTO validation + the class-validator/class-transformer
// pipeline, which a controller-only unit test with a mocked service would miss.
describe('Vacancies (e2e)', () => {
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
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterEach(async () => {
    await prisma.vacancy.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('POST /api/v1/vacancies', () => {
    it('creates a vacancy (201 + Location) and normalizes the Ukrainian recommendation', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send(validPayload)
        .expect(201);
      expect(res.body.recommendation).toBe('APPLY');
      expect(res.body.status).toBe('NOT_REVIEWED');
      expect(res.headers.location).toBe(`/api/v1/vacancies/${res.body.id}`);
    });

    it('returns 200 (not 201) when the applyUrl already exists, leaving it untouched', async () => {
      const first = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send({ ...validPayload, matchScore: 60 })
        .expect(201);

      const second = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send({ ...validPayload, matchScore: 95 })
        .expect(200);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.matchScore).toBe(60);
      expect(second.headers.location).toBeUndefined();
    });

    it('rejects an unknown recommendation with 400', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send({ ...validPayload, recommendation: 'MAYBE' })
        .expect(400);
    });

    it('rejects a payload missing required fields with 400', async () => {
      await request(app.getHttpServer()).post('/api/v1/vacancies').send({}).expect(400);
    });
  });

  describe('GET /api/v1/vacancies', () => {
    it('lists saved vacancies without fullText', async () => {
      await request(app.getHttpServer()).post('/api/v1/vacancies').send(validPayload).expect(201);

      const res = await request(app.getHttpServer()).get('/api/v1/vacancies').expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).not.toHaveProperty('fullText');
    });

    it('filters by ?status=, any of a comma-separated list', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send({ ...validPayload, applyUrl: 'https://example.com/a' });
      await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send({ ...validPayload, applyUrl: 'https://example.com/b' });
      await request(app.getHttpServer())
        .patch(`/api/v1/vacancies/${a.body.id}/status`)
        .send({ status: 'DECLINED' })
        .expect(200);

      const declined = await request(app.getHttpServer())
        .get('/api/v1/vacancies?status=DECLINED')
        .expect(200);
      expect(declined.body.total).toBe(1);
      const either = await request(app.getHttpServer())
        .get('/api/v1/vacancies?status=NOT_REVIEWED,DECLINED')
        .expect(200);
      expect(either.body.total).toBe(2);
      await request(app.getHttpServer()).get('/api/v1/vacancies?status=DECLINED,MAYBE').expect(400);
    });

    it('rejects limit above 100 with 400', async () => {
      await request(app.getHttpServer()).get('/api/v1/vacancies?limit=200').expect(400);
    });

    it('pages by ?cursor= in ?sort=recommended order', async () => {
      const server = app.getHttpServer();
      for (const [n, recommendation, matchScore] of [
        [1, 'SKIP', 90],
        [2, 'APPLY', 60],
        [3, 'APPLY_WITH_CAVEATS', 70],
      ] as const) {
        await request(server)
          .post('/api/v1/vacancies')
          .send({
            ...validPayload,
            company: `Co ${n}`,
            applyUrl: `https://example.com/p/${n}`,
            recommendation,
            matchScore,
          })
          .expect(201);
      }

      const first = await request(server)
        .get('/api/v1/vacancies?sort=recommended&limit=2')
        .expect(200);
      expect(first.body.items.map((item: { company: string }) => item.company)).toEqual([
        'Co 2',
        'Co 3',
      ]);
      expect(first.body).toMatchObject({ total: 3, nextCursor: first.body.items[1].id });

      const next = await request(server)
        .get(`/api/v1/vacancies?sort=recommended&limit=2&cursor=${first.body.nextCursor}`)
        .expect(200);
      expect(next.body).toMatchObject({ items: [{ company: 'Co 1' }], total: 3, nextCursor: null });
    });

    it('400s on cursor with offset, a bad cursor, or an unknown sort', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/vacancies?cursor=5&offset=0').expect(400);
      await request(server).get('/api/v1/vacancies?cursor=abc').expect(400);
      await request(server).get('/api/v1/vacancies?sort=oldest').expect(400);
    });

    it('filters by ?search= on either the company or the title', async () => {
      const server = app.getHttpServer();
      await request(server).post('/api/v1/vacancies').send(validPayload).expect(201);
      await request(server)
        .post('/api/v1/vacancies')
        .send({
          ...validPayload,
          company: 'Beta Corp',
          title: 'Frontend Lead',
          applyUrl: 'https://example.com/jobs/2',
          recommendation: 'SKIP',
        })
        .expect(201);

      const byCompany = await request(server).get('/api/v1/vacancies?search=ACME').expect(200);
      expect(byCompany.body.total).toBe(1);
      expect(byCompany.body.items[0].company).toBe('Acme');

      const byTitle = await request(server).get('/api/v1/vacancies?search=frontend').expect(200);
      expect(byTitle.body.total).toBe(1);
      expect(byTitle.body.items[0].title).toBe('Frontend Lead');
    });

    it('treats a LIKE metacharacter in ?search= as a literal', async () => {
      const server = app.getHttpServer();
      await request(server).post('/api/v1/vacancies').send(validPayload).expect(201);

      // Unescaped, `%` is a wildcard and this matches every row in the table.
      const res = await request(server)
        .get('/api/v1/vacancies?search=%25') // %25 is a URL-encoded '%'
        .expect(200);

      expect(res.body.total).toBe(0);
    });

    it('ANDs ?search= with the other query filters', async () => {
      const server = app.getHttpServer();
      await request(server).post('/api/v1/vacancies').send(validPayload).expect(201);

      const res = await request(server)
        .get('/api/v1/vacancies?search=acme&recommendation=SKIP')
        .expect(200);
      expect(res.body.total).toBe(0);
    });

    it('carries the derived companyMatchCount, counted across the whole table', async () => {
      const server = app.getHttpServer();
      await request(server).post('/api/v1/vacancies').send(validPayload).expect(201);
      await request(server)
        .post('/api/v1/vacancies')
        .send({ ...validPayload, title: 'Data Engineer', applyUrl: 'https://example.com/jobs/3' })
        .expect(201);

      // limit=1: the count still spans both Acme rows, so it is a property of the
      // row, not of the page it arrived on.
      const res = await request(server).get('/api/v1/vacancies?company=Acme&limit=1').expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].companyMatchCount).toBe(2);
    });
  });

  describe('GET /api/v1/vacancies/:id', () => {
    it('404s for an unknown id', async () => {
      await request(app.getHttpServer()).get('/api/v1/vacancies/999999').expect(404);
    });

    it('returns the full record, including fullText, for a known id', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send(validPayload);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/vacancies/${created.body.id}`)
        .expect(200);
      expect(res.body.fullText).toBe(validPayload.fullText);
      expect(res.body.estimationComment).toBe(validPayload.estimationComment);
      expect(res.body.timeline).toEqual([
        { status: 'NOT_REVIEWED', createdAt: res.body.statusChangedAt },
      ]);
    });
  });

  describe('PATCH /api/v1/vacancies/:id/status', () => {
    it('404s for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/vacancies/999999/status')
        .send({ status: 'DECLINED' })
        .expect(404);
    });

    it('updates the status for a known id', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send(validPayload);
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'SAVED_FOR_LATER' })
        .expect(200);
      expect(res.body.status).toBe('SAVED_FOR_LATER');
      // The web parses this response with its list-item schema, which reads it.
      expect(res.body.estimationComment).toBe(validPayload.estimationComment);
    });

    it('sets UNAVAILABLE, and filters by it', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send(validPayload);
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'UNAVAILABLE' })
        .expect(200);
      expect(res.body.status).toBe('UNAVAILABLE');
      const listed = await request(app.getHttpServer())
        .get('/api/v1/vacancies?status=UNAVAILABLE')
        .expect(200);
      expect(listed.body.total).toBe(1);
    });

    it('refuses a repeated triage status with 422', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send(validPayload);
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'NOT_REVIEWED' })
        .expect(422);
      expect(res.body.error).toBe('SameStatusError');
    });

    it('rejects an invalid status with 400', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/vacancies')
        .send(validPayload);
      await request(app.getHttpServer())
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'MAYBE' })
        .expect(400);
    });
  });
});
