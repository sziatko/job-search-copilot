import { getPrisma, VacancyIntakeService } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, signIn } from './test-app';

// Every route is closed by default (ADR-0034); n8n's three are open to INTAKE_TOKEN too
// (ADR-0036). /health's anonymity is health.e2e.spec.ts's.
describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  const prisma = getPrisma();
  const token = process.env.INTAKE_TOKEN ?? '';
  const analysis = { matchScore: 30, recommendation: 'SKIP', estimationComment: 'Backend.' };

  async function queued(url: string): Promise<number> {
    await new VacancyIntakeService(prisma).intake({ url, company: 'Queued Co', title: url });
    return (await prisma.vacancy.findUniqueOrThrow({ where: { applyUrl: url } })).id;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await prisma.vacancy.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  describe('a session', () => {
    it('401s without a cookie or with a forged one, 200s with a signed one', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/vacancies').expect(401);

      const cookie = await signIn(app);
      await request(server).get('/api/v1/vacancies').set('Cookie', `${cookie}x`).expect(401);
      await request(server).get('/api/v1/vacancies').set('Cookie', cookie).expect(200);
    });

    it('is not opened by INTAKE_TOKEN on a read route', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });
  });

  describe('the machine token, on the three n8n routes', () => {
    const routes: [string, () => Promise<[string, object]>][] = [
      [
        'POST /vacancies/intake',
        async () => [
          '/api/v1/vacancies/intake',
          { entries: [{ url: 'https://acme.com/jobs/1', company: 'Acme', title: 'Dev' }] },
        ],
      ],
      [
        'POST /vacancies/:id/analysis',
        async () => [
          `/api/v1/vacancies/${await queued('https://acme.com/q/1')}/analysis`,
          analysis,
        ],
      ],
      [
        'POST /vacancies/analysis',
        async () => [
          '/api/v1/vacancies/analysis',
          { analyses: [{ id: await queued('https://acme.com/q/2'), ...analysis }] },
        ],
      ],
    ];

    it.each(routes)(
      '%s: 401 with no token or a wrong one, 200 with INTAKE_TOKEN',
      async (_, setup) => {
        expect(token.length).toBeGreaterThanOrEqual(32);
        const [path, body] = await setup();
        const post = () => request(app.getHttpServer()).post(path).send(body);

        await post().expect(401);
        await post().set('Authorization', 'Bearer wrong').expect(401);
        // Same length, last character changed: the comparison is over the whole token.
        await post()
          .set('Authorization', `Bearer ${token.slice(0, -1)}${token.endsWith('x') ? 'y' : 'x'}`)
          .expect(401);
        await post().set('Authorization', token).expect(401); // no scheme
        await post().set('Authorization', `Bearer ${token}`).expect(200);
      },
    );
  });
});
