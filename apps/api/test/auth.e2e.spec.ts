import { getPrisma, VacancyIntakeService } from '@job-search-copilot/core';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { CurrentUserId } from '../src/auth/api-key.guard';
import { createApiKey, createTestApp, signIn } from './test-app';

// Every route is closed by default (ADR-0034); n8n's three are open to an API key too
// (ADR-0039). /health's anonymity is health.e2e.spec.ts's.
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
    return (await prisma.vacancy.findFirstOrThrow({ where: { applyUrl: url } })).id;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await prisma.vacancy.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany(); // their keys go with them (cascade)
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

    it('is not opened by an API key on a read route', async () => {
      const { key } = await createKey();
      await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .set('Authorization', `Bearer ${key}`)
        .expect(401);
    });
  });

  describe('an API key, on the three n8n routes', () => {
    /** [route, (the key owner's id) → [path, body]]: the owner's vacancies, so 200. */
    const routes: [string, (userId: string) => Promise<[string, object]>][] = [
      [
        'POST /vacancies/intake',
        async () => [
          '/api/v1/vacancies/intake',
          { entries: [{ url: 'https://acme.com/jobs/1', company: 'Acme', title: 'Dev' }] },
        ],
      ],
      [
        'POST /vacancies/:id/analysis',
        async (userId) => [
          `/api/v1/vacancies/${await queued(userId, 'https://acme.com/q/1')}/analysis`,
          analysis,
        ],
      ],
      [
        'POST /vacancies/analysis',
        async (userId) => [
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
        const [path, body] = await setup(userId);
        const post = () => request(app.getHttpServer()).post(path).send(body);

        await post().expect(401);
        await post().set('Authorization', 'Bearer jsc_not-a-key').expect(401);
        await post().set('Authorization', `Bearer ${revoked.key}`).expect(401);
        await post().set('Authorization', key).expect(401); // no scheme
        await post().set('Authorization', `Bearer ${key}`).expect(200);
      },
    );

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
