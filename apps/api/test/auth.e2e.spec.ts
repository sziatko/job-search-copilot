import { getPrisma, VacancyIntakeService } from '@job-search-copilot/core';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CurrentUserId } from '../src/auth/api-key.guard';
import {
  createApiKey,
  createTestApp,
  deleteTestUsers,
  deleteTestVacancies,
  signIn,
} from './test-app';

// Every route is closed by default (ADR-0034); the domain routes are open to an API key
// too (ADR-0039). /health's anonymity is health.e2e.spec.ts's.
describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = getPrisma();
  const analysis = { matchScore: 30, recommendation: 'SKIP', estimationComment: 'Backend.' };

  const createKey = () => createApiKey(app);

  async function queued(userId: string, url: string): Promise<number> {
    await new VacancyIntakeService(prisma).intake(userId, {
      url,
      company: 'Queued Co',
      title: url,
    });
    return (await prisma.vacancy.findFirstOrThrow({ where: { userId, applyUrl: url } })).id;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(deleteTestVacancies);

  afterAll(async () => {
    await deleteTestUsers(); // their sessions, keys and vacancies go with them
    await app.close();
    await prisma.$disconnect();
  });

  describe('a session', () => {
    it('401s without a cookie or with a forged one, 200s with a signed one', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/vacancies').expect(401);

      const { cookie } = await signIn(app);
      await request(server).get('/api/v1/vacancies').set('Cookie', `${cookie}x`).expect(401);
      await request(server).get('/api/v1/vacancies').set('Cookie', cookie).expect(200);
    });
  });

  describe('an API key, on the domain routes', () => {
    /** [route, (the key owner's id) → [method, path, body?]]: the owner's rows, so 200. */
    const routes: [string, (userId: string) => Promise<['get' | 'post', string, object?]>][] = [
      ['GET /vacancies', async () => ['get', '/api/v1/vacancies']],
      ['GET /applications', async () => ['get', '/api/v1/applications']],
      ['GET /stats', async () => ['get', '/api/v1/stats']],
      [
        'POST /vacancies/intake',
        async () => [
          'post',
          '/api/v1/vacancies/intake',
          { entries: [{ url: 'https://acme.com/jobs/1', company: 'Acme', title: 'Dev' }] },
        ],
      ],
      [
        'POST /vacancies/:id/analysis',
        async (userId) => [
          'post',
          `/api/v1/vacancies/${await queued(userId, 'https://acme.com/q/1')}/analysis`,
          analysis,
        ],
      ],
      [
        'POST /vacancies/analysis',
        async (userId) => [
          'post',
          '/api/v1/vacancies/analysis',
          { analyses: [{ id: await queued(userId, 'https://acme.com/q/2'), ...analysis }] },
        ],
      ],
    ];

    it.each(routes)(
      '%s: 401 with no key, a bad or revoked one; 200 with a key',
      async (_, setup) => {
        const { key, userId } = await createKey();
        const revoked = await createKey();
        await prisma.apikey.delete({ where: { id: revoked.id } }); // what Revoke does
        const [method, path, body] = await setup(userId);
        const call = () => request(app.getHttpServer())[method](path).send(body);

        await call().expect(401);
        await call().set('Authorization', 'Bearer jsc_not-a-key').expect(401);
        await call().set('Authorization', `Bearer ${revoked.key}`).expect(401);
        await call().set('Authorization', key).expect(401); // no scheme
        await call().set('Authorization', `Bearer ${key}`).expect(200);
      },
    );

    /** [route, (a queued vacancy's id) → [method, path, body]] — each writes a comment. */
    const commenting: [string, (id: number) => ['post' | 'patch', string, object]][] = [
      [
        'PATCH /vacancies/:id/status',
        (id) => ['patch', `/api/v1/vacancies/${id}/status`, { status: 'SAVED_FOR_LATER' }],
      ],
      [
        'PATCH /applications/:id/status',
        (id) => ['patch', `/api/v1/applications/${id}/status`, { status: 'INTERVIEW' }],
      ],
      ['POST /applications', (id) => ['post', '/api/v1/applications', { vacancyId: id }]],
      ['PATCH /applications/:id', (id) => ['patch', `/api/v1/applications/${id}`, {}]],
    ];

    it.each(commenting)('%s: writes the comment as AGENT', async (route, setup) => {
      const { key, userId } = await createKey();
      const slug = route.replace(/\W+/g, '-').toLowerCase();
      const [method, path, body] = setup(await queued(userId, `https://acme.com/c/${slug}`));
      const res = await request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${key}`)
        .send({ ...body, comment: 'From n8n.' })
        .expect(method === 'post' ? 201 : 200);
      // POST /applications answers an envelope, the rest the row.
      const row = res.body.application ?? res.body;
      expect(row.comments.at(-1)).toMatchObject({ body: 'From n8n.', source: 'AGENT' });
    });

    it("leaves a session's comment USER", async () => {
      const { cookie, userId } = await signIn(app);
      const id = await queued(userId, 'https://acme.com/q/session');
      const { body } = await request(app.getHttpServer())
        .patch(`/api/v1/vacancies/${id}/status`)
        .set('Cookie', cookie)
        .send({ status: 'SAVED_FOR_LATER', comment: 'Later.' })
        .expect(200);
      expect(body.comments.at(-1)).toMatchObject({ body: 'Later.', source: 'USER' });
    });

    it('lets a session through too', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/vacancies/intake')
        .set('Cookie', (await signIn(app)).cookie)
        .send({ entries: [{ url: 'https://acme.com/jobs/2', company: 'Acme', title: 'Dev' }] })
        .expect(200);
    });
  });

  describe('@CurrentUserId()', () => {
    // Nest keeps a param decorator's factory in the route's metadata: resolved here on a
    // probe, for the branches the routes' tests do not each reach.
    class Probe {
      handler(@CurrentUserId() _userId: string) {}
    }
    const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler');
    const factory = (Object.values(meta)[0] as { factory: (d: unknown, c: unknown) => string })
      .factory;
    const resolve = (req: object) =>
      factory(undefined, {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext);

    it("is the session's user, else the key's owner, else 401", () => {
      expect(resolve({ user: { id: 'u-session' }, apiKeyOwner: 'u-key' })).toBe('u-session');
      expect(resolve({ user: null, apiKeyOwner: 'u-key' })).toBe('u-key');
      expect(() => resolve({ user: null })).toThrow(UnauthorizedException);
    });
  });
});
