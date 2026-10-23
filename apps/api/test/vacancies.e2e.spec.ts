import 'reflect-metadata';
import { getPrisma, VacancyIntakeService } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type Api,
  createTestApp,
  deleteTestUsers,
  deleteTestVacancies,
  signedInAgent,
} from './test-app';

// End-to-end: boots the real Nest app (same ValidationPipe as setup-app.ts) against
// the real test database, and hits it over HTTP via supertest. This is what
// actually exercises DTO validation + the class-validator/class-transformer
// pipeline, which a controller-only unit test with a mocked service would miss.
describe('Vacancies (e2e)', () => {
  let app: NestExpressApplication;
  let api: Api;
  const prisma = getPrisma();

  const validPayload = {
    company: 'Acme',
    title: 'Backend Engineer',
    applyUrl: 'https://example.com/jobs/1',
    fullText: 'Full vacancy text goes here.',
    matchScore: 80,
    recommendation: 'APPLY',
    estimationComment: 'Strong match.',
  };

  /** A vacancy intake took in (NEW, unanalysed, no text); returns its id. */
  async function queued(url: string): Promise<number> {
    await new VacancyIntakeService(prisma).intake(api.userId, {
      url,
      company: 'Queued Co',
      title: url,
    });
    return (await prisma.vacancy.findFirstOrThrow({ where: { userId: api.userId, applyUrl: url } }))
      .id;
  }

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

  describe('POST /api/v1/vacancies', () => {
    it('creates a vacancy (201 + Location)', async () => {
      const res = await api.post('/api/v1/vacancies').send(validPayload).expect(201);
      expect(res.body.recommendation).toBe('APPLY');
      expect(res.body.status).toBe('NOT_REVIEWED');
      expect(res.headers.location).toBe(`/api/v1/vacancies/${res.body.id}`);
    });

    it('returns 200 (not 201) when the applyUrl already exists, leaving it untouched', async () => {
      const first = await api
        .post('/api/v1/vacancies')
        .send({ ...validPayload, matchScore: 60 })
        .expect(201);

      const second = await api
        .post('/api/v1/vacancies')
        .send({ ...validPayload, matchScore: 95 })
        .expect(200);

      expect(second.body.id).toBe(first.body.id);
      expect(second.body.matchScore).toBe(60);
      expect(second.headers.location).toBeUndefined();
    });

    it.each(['MAYBE', 'ПОДАВАТИСЯ', 'apply'])(
      'rejects the recommendation %j with 400',
      async (recommendation) => {
        await api
          .post('/api/v1/vacancies')
          .send({ ...validPayload, recommendation })
          .expect(400);
      },
    );

    it('rejects a payload missing required fields with 400', async () => {
      await api.post('/api/v1/vacancies').send({}).expect(400);
    });

    it('rejects an applyUrl that is not an http(s) link with 400', async () => {
      for (const applyUrl of ['not a url', 'example.com/jobs/1', 'javascript:alert(1)']) {
        await api
          .post('/api/v1/vacancies')
          .send({ ...validPayload, applyUrl })
          .expect(400);
      }
      expect(await prisma.vacancy.count({ where: { userId: api.userId } })).toBe(0);
    });

    it('attaches the analysis to a row intake took in: 200, no Location', async () => {
      const id = await queued(validPayload.applyUrl);
      const res = await api.post('/api/v1/vacancies').send(validPayload).expect(200);
      expect(res.body).toMatchObject({ id, recommendation: 'APPLY', status: 'NOT_REVIEWED' });
      expect(res.headers.location).toBeUndefined();
    });
  });

  describe('POST /api/v1/vacancies/intake', () => {
    const intake = (entries: unknown[]) => api.post('/api/v1/vacancies/intake').send({ entries });
    const entry = { url: 'https://acme.com/jobs/1', company: 'Acme', title: 'Dev' };

    it('takes a new posting in as NEW (200, the url as sent); a repeat by url or by name is not new', async () => {
      const raw = 'https://pl.linkedin.com/jobs/view/dev-at-acme-3900000001?trk=x';
      const first = await intake([
        { url: raw, company: 'Acme Sp. z o.o.', title: 'Senior Dev', source: 'linkedin' },
      ]).expect(200);
      expect(first.body).toEqual({ new: [raw] });
      expect(
        await prisma.vacancy.findFirstOrThrow({ where: { userId: api.userId } }),
      ).toMatchObject({
        applyUrl: 'https://www.linkedin.com/jobs/view/3900000001',
        status: 'NEW',
        recommendation: null,
        source: 'linkedin',
        fullText: null,
      });

      const again = await intake([
        { url: 'https://www.linkedin.com/jobs/view/3900000001/', company: 'X', title: 'Y' },
        { url: 'https://acme.com/careers/42', company: 'Acme', title: 'Senior Dev!' },
      ]).expect(200);
      expect(again.body).toEqual({ new: [] });
      expect(await prisma.vacancy.count({ where: { userId: api.userId } })).toBe(1);
    });

    it('fills the posting text on a second call, and nothing else', async () => {
      const fullText = 'The posting. '.padEnd(200, 'x');
      await intake([entry]).expect(200);
      const res = await intake([{ ...entry, source: 'justjoin', fullText }]).expect(200);
      expect(res.body).toEqual({ new: [] });
      expect(
        await prisma.vacancy.findFirstOrThrow({
          where: { userId: api.userId, applyUrl: entry.url },
        }),
      ).toMatchObject({ fullText, source: null, status: 'NEW' });
    });

    it('400s on a missing or blank company or title, a non-URL, an empty or oversized batch', async () => {
      for (const bad of [
        { ...entry, company: undefined },
        { ...entry, title: undefined },
        { ...entry, title: '  ' },
        { ...entry, url: undefined },
        { ...entry, url: 'acme.com/jobs/1' },
        { ...entry, url: 'javascript:alert(1)' },
        { ...entry, url: 'ftp://acme.com/jobs/1' },
      ]) {
        await intake([bad]).expect(400);
      }
      await intake([]).expect(400);
      await intake(
        Array.from({ length: 101 }, (_, i) => ({ ...entry, url: `https://a.com/${i}` })),
      ).expect(400);
      expect(await prisma.vacancy.count({ where: { userId: api.userId } })).toBe(0);
    });

    it('accepts a ~1 MB body', async () => {
      const fullText = 'x'.repeat(100_000);
      const entries = Array.from({ length: 10 }, (_, i) => ({
        ...entry,
        url: `https://acme.com/jobs/${i}`,
        title: `Role ${i}`,
        fullText,
      }));
      const res = await intake(entries).expect(200);
      expect(res.body.new).toHaveLength(10);
    });
  });

  describe('POST /api/v1/vacancies/:id/analysis', () => {
    const analysis = { matchScore: 30, recommendation: 'SKIP', estimationComment: 'Backend.' };

    it('writes the analysis and moves NEW by the rule; a second one is a 409', async () => {
      const id = await queued('https://example.com/q/1');
      const res = await api.post(`/api/v1/vacancies/${id}/analysis`).send(analysis).expect(200);
      expect(res.body).toMatchObject({ id, recommendation: 'SKIP', status: 'FILTERED_OUT' });

      const again = await api
        .post(`/api/v1/vacancies/${id}/analysis`)
        .send({ ...analysis, matchScore: 90, recommendation: 'APPLY' })
        .expect(409);
      expect(again.body).toMatchObject({ statusCode: 409, error: 'AlreadyAnalysedError' });
      expect((await prisma.vacancy.findUniqueOrThrow({ where: { id } })).matchScore).toBe(30);
    });

    it('404s for an unknown id; 400s on a bad body', async () => {
      await api.post('/api/v1/vacancies/999999/analysis').send(analysis).expect(404);
      const id = await queued('https://example.com/q/1');
      await api
        .post(`/api/v1/vacancies/${id}/analysis`)
        .send({ ...analysis, recommendation: 'MAYBE' })
        .expect(400);
    });
  });

  describe('POST /api/v1/vacancies/analysis', () => {
    const analysis = { matchScore: 80, recommendation: 'APPLY', estimationComment: 'Fits.' };

    it('writes a batch, in order', async () => {
      const a = await queued('https://example.com/q/1');
      const b = await queued('https://example.com/q/2');
      const res = await api
        .post('/api/v1/vacancies/analysis')
        .send({
          analyses: [
            { id: b, ...analysis },
            { id: a, ...analysis },
          ],
        })
        .expect(200);
      expect(res.body.map((row: { id: number }) => row.id)).toEqual([b, a]);
    });

    it('writes none of a batch with an analysed row in it: 409', async () => {
      const a = await queued('https://example.com/q/1');
      const b = await queued('https://example.com/q/2');
      await api.post(`/api/v1/vacancies/${b}/analysis`).send(analysis).expect(200);
      await api
        .post('/api/v1/vacancies/analysis')
        .send({
          analyses: [
            { id: a, ...analysis },
            { id: b, ...analysis },
          ],
        })
        .expect(409);
      expect((await prisma.vacancy.findUniqueOrThrow({ where: { id: a } })).status).toBe('NEW');
    });

    it('400s on an empty batch or more than 10', async () => {
      const post = (analyses: unknown[]) =>
        api.post('/api/v1/vacancies/analysis').send({ analyses });
      await post([]).expect(400);
      await post(Array.from({ length: 11 }, (_, i) => ({ id: i + 1, ...analysis }))).expect(400);
    });
  });

  describe('GET /api/v1/vacancies', () => {
    it('lists saved vacancies without fullText', async () => {
      await api.post('/api/v1/vacancies').send(validPayload).expect(201);

      const res = await api.get('/api/v1/vacancies').expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).not.toHaveProperty('fullText');
    });

    it('filters by ?hasText=; each item carries hasText', async () => {
      await api.post('/api/v1/vacancies').send(validPayload).expect(201);
      const id = await queued('https://example.com/q/1');

      const without = await api.get('/api/v1/vacancies?hasText=false').expect(200);
      expect(without.body.items).toMatchObject([{ id, hasText: false }]);
      const withText = await api.get('/api/v1/vacancies?hasText=true').expect(200);
      expect(withText.body.items).toMatchObject([{ hasText: true }]);
      await api.get('/api/v1/vacancies?hasText=yes').expect(400);
    });

    it('filters by ?status=, any of a comma-separated list', async () => {
      const a = await api
        .post('/api/v1/vacancies')
        .send({ ...validPayload, applyUrl: 'https://example.com/a' });
      await api
        .post('/api/v1/vacancies')
        .send({ ...validPayload, applyUrl: 'https://example.com/b' });
      await api
        .patch(`/api/v1/vacancies/${a.body.id}/status`)
        .send({ status: 'DECLINED' })
        .expect(200);

      const declined = await api.get('/api/v1/vacancies?status=DECLINED').expect(200);
      expect(declined.body.total).toBe(1);
      const either = await api.get('/api/v1/vacancies?status=NOT_REVIEWED,DECLINED').expect(200);
      expect(either.body.total).toBe(2);
      await api.get('/api/v1/vacancies?status=DECLINED,MAYBE').expect(400);
    });

    it('rejects limit above 100 with 400', async () => {
      await api.get('/api/v1/vacancies?limit=200').expect(400);
    });

    it('pages by ?cursor= in ?sort=recommended order', async () => {
      for (const [n, recommendation, matchScore] of [
        [1, 'SKIP', 90],
        [2, 'APPLY', 60],
        [3, 'APPLY_WITH_CAVEATS', 70],
      ] as const) {
        await api
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

      const first = await api.get('/api/v1/vacancies?sort=recommended&limit=2').expect(200);
      expect(first.body.items.map((item: { company: string }) => item.company)).toEqual([
        'Co 2',
        'Co 3',
      ]);
      expect(first.body).toMatchObject({ total: 3, nextCursor: first.body.items[1].id });

      const next = await api
        .get(`/api/v1/vacancies?sort=recommended&limit=2&cursor=${first.body.nextCursor}`)
        .expect(200);
      expect(next.body).toMatchObject({ items: [{ company: 'Co 1' }], total: 3, nextCursor: null });
    });

    it('400s on cursor with offset, a bad cursor, or an unknown sort', async () => {
      await api.get('/api/v1/vacancies?cursor=5&offset=0').expect(400);
      await api.get('/api/v1/vacancies?cursor=abc').expect(400);
      await api.get('/api/v1/vacancies?sort=oldest').expect(400);
    });

    it('filters by ?search= on either the company or the title', async () => {
      await api.post('/api/v1/vacancies').send(validPayload).expect(201);
      await api
        .post('/api/v1/vacancies')
        .send({
          ...validPayload,
          company: 'Beta Corp',
          title: 'Frontend Lead',
          applyUrl: 'https://example.com/jobs/2',
          recommendation: 'SKIP',
        })
        .expect(201);

      const byCompany = await api.get('/api/v1/vacancies?search=ACME').expect(200);
      expect(byCompany.body.total).toBe(1);
      expect(byCompany.body.items[0].company).toBe('Acme');

      const byTitle = await api.get('/api/v1/vacancies?search=frontend').expect(200);
      expect(byTitle.body.total).toBe(1);
      expect(byTitle.body.items[0].title).toBe('Frontend Lead');
    });

    it('treats a LIKE metacharacter in ?search= as a literal', async () => {
      await api.post('/api/v1/vacancies').send(validPayload).expect(201);

      // Unescaped, `%` is a wildcard and this matches every row in the table.
      const res = await api
        .get('/api/v1/vacancies?search=%25') // %25 is a URL-encoded '%'
        .expect(200);

      expect(res.body.total).toBe(0);
    });

    it('ANDs ?search= with the other query filters', async () => {
      await api.post('/api/v1/vacancies').send(validPayload).expect(201);

      const res = await api.get('/api/v1/vacancies?search=acme&recommendation=SKIP').expect(200);
      expect(res.body.total).toBe(0);
    });

    it('carries the derived companyMatchCount, counted across the whole table', async () => {
      await api.post('/api/v1/vacancies').send(validPayload).expect(201);
      await api
        .post('/api/v1/vacancies')
        .send({ ...validPayload, title: 'Data Engineer', applyUrl: 'https://example.com/jobs/3' })
        .expect(201);

      // limit=1: the count still spans both Acme rows, so it is a property of the
      // row, not of the page it arrived on.
      const res = await api.get('/api/v1/vacancies?company=Acme&limit=1').expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].companyMatchCount).toBe(2);
    });

    it('lists every spelling of a company with ?sameCompanyAs=', async () => {
      await api.post('/api/v1/vacancies').send(validPayload).expect(201);
      await api
        .post('/api/v1/vacancies')
        .send({ ...validPayload, company: 'Acme Polska', applyUrl: 'https://example.com/jobs/4' })
        .expect(201);

      for (const name of ['Acme', 'Acme Polska']) {
        const res = await api
          .get(`/api/v1/vacancies?sameCompanyAs=${encodeURIComponent(name)}`)
          .expect(200);
        expect(res.body.total).toBe(2);
      }
    });
  });

  describe('GET /api/v1/vacancies/:id', () => {
    it('404s for an unknown id', async () => {
      await api.get('/api/v1/vacancies/999999').expect(404);
    });

    it('returns the full record, including fullText, for a known id', async () => {
      const created = await api.post('/api/v1/vacancies').send(validPayload);
      const res = await api.get(`/api/v1/vacancies/${created.body.id}`).expect(200);
      expect(res.body.fullText).toBe(validPayload.fullText);
      expect(res.body.estimationComment).toBe(validPayload.estimationComment);
      expect(res.body.timeline).toEqual([
        { status: 'NEW', createdAt: res.body.statusChangedAt },
        { status: 'NOT_REVIEWED', createdAt: res.body.statusChangedAt },
      ]);
    });
  });

  describe('PATCH /api/v1/vacancies/:id/status', () => {
    it('404s for an unknown id', async () => {
      await api.patch('/api/v1/vacancies/999999/status').send({ status: 'DECLINED' }).expect(404);
    });

    it('updates the status for a known id', async () => {
      const created = await api.post('/api/v1/vacancies').send(validPayload);
      const res = await api
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'SAVED_FOR_LATER' })
        .expect(200);
      expect(res.body.status).toBe('SAVED_FOR_LATER');
      // The web parses this response with its list-item schema, which reads it.
      expect(res.body.estimationComment).toBe(validPayload.estimationComment);
    });

    it('adds the comment as a USER comment with the move', async () => {
      const created = await api.post('/api/v1/vacancies').send(validPayload);
      const res = await api
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'SAVED_FOR_LATER', comment: 'After the holidays.' })
        .expect(200);
      expect(res.body.status).toBe('SAVED_FOR_LATER');
      expect(res.body.comments.at(-1)).toMatchObject({
        source: 'USER',
        body: 'After the holidays.',
      });
      await api
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'DECLINED', comment: 42 })
        .expect(400);
    });

    it('sets UNAVAILABLE, and filters by it', async () => {
      const created = await api.post('/api/v1/vacancies').send(validPayload);
      const res = await api
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'UNAVAILABLE' })
        .expect(200);
      expect(res.body.status).toBe('UNAVAILABLE');
      const listed = await api.get('/api/v1/vacancies?status=UNAVAILABLE').expect(200);
      expect(listed.body.total).toBe(1);
    });

    it('refuses a repeated triage status with 422', async () => {
      const created = await api.post('/api/v1/vacancies').send(validPayload);
      const res = await api
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'NOT_REVIEWED' })
        .expect(422);
      expect(res.body.error).toBe('SameStatusError');
    });

    it('sets an unanalysed vacancy back to NEW; an analysed one is a 422', async () => {
      const id = await queued('https://example.com/jobs/queued');
      await api
        .patch(`/api/v1/vacancies/${id}/status`)
        .send({ status: 'FILTERED_OUT' })
        .expect(200);
      const back = await api
        .patch(`/api/v1/vacancies/${id}/status`)
        .send({ status: 'NEW' })
        .expect(200);
      expect(back.body.status).toBe('NEW');

      // Saved with an analysis: the CHECK would make it a 500, core refuses it first.
      const created = await api.post('/api/v1/vacancies').send(validPayload);
      const res = await api
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'NEW' })
        .expect(422);
      expect(res.body.error).toBe('AnalysedNotNewError');
    });

    it('rejects an invalid status with 400', async () => {
      const created = await api.post('/api/v1/vacancies').send(validPayload);
      await api
        .patch(`/api/v1/vacancies/${created.body.id}/status`)
        .send({ status: 'MAYBE' })
        .expect(400);
    });
  });
});
