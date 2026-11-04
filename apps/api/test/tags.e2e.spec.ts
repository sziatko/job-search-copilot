import 'reflect-metadata';
import {
  ANALYSIS_BATCH_MAX,
  getPrisma,
  MAX_LENGTH,
  TAGS_PER_VACANCY_MAX,
  VacancyIntakeService,
} from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type Api,
  createApiKey,
  createTestApp,
  deleteTestUsers,
  deleteTestVacancies,
  signedInAgent,
} from './test-app';

describe('Tags (e2e)', () => {
  let app: NestExpressApplication;
  let api: Api;
  const prisma = getPrisma();

  const analysis = { matchScore: 80, recommendation: 'APPLY', estimationComment: 'Strong match.' };
  const names = (count: number) => Array.from({ length: count }, (_, i) => `Tag ${i}`);

  /** A vacancy intake took in (NEW, unanalysed); returns its id. */
  async function queued(url: string, userId = api.userId): Promise<number> {
    await new VacancyIntakeService(prisma).intake(userId, {
      url,
      company: 'Acme',
      title: url,
    });
    return (await prisma.vacancy.findFirstOrThrow({ where: { userId, applyUrl: url } })).id;
  }

  async function tagNames(id: number): Promise<string[]> {
    const { body } = await api.get(`/api/v1/vacancies/${id}`).expect(200);
    return body.tags.map((tag: { name: string }) => tag.name);
  }

  const tagVacancies = (items: unknown) => api.post('/api/v1/vacancies/tags').send({ items });

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

  describe('POST /tags', () => {
    it('201s the tag, NEUTRAL unless a tone is sent', async () => {
      const plain = await api.post('/api/v1/tags').send({ name: ' Remote ' }).expect(201);
      expect(plain.body).toEqual({ id: expect.any(Number), name: 'Remote', tone: 'NEUTRAL' });

      const toned = await api.post('/api/v1/tags').send({ name: 'EU', tone: 'GOOD' }).expect(201);
      expect(toned.body.tone).toBe('GOOD');
    });

    it('409s a name taken in another spelling', async () => {
      await api.post('/api/v1/tags').send({ name: 'Remote' }).expect(201);

      const res = await api.post('/api/v1/tags').send({ name: ' REMOTE' }).expect(409);

      expect(res.body.error).toBe('TagNameTakenError');
    });

    it.each([
      ['blank', '   '],
      ['too long', 'x'.repeat(MAX_LENGTH.tag + 1)],
    ])('422s a %s name', async (_, name) => {
      const res = await api.post('/api/v1/tags').send({ name }).expect(422);
      expect(res.body.error).toBe('InvalidTagsError');
    });

    it('takes a name that fits once tidied', async () => {
      const name = `  ${'x'.repeat(MAX_LENGTH.tag)}  `;
      await api.post('/api/v1/tags').send({ name }).expect(201);
    });

    it.each([
      ['no name', { tone: 'GOOD' }],
      ['a name not a string', { name: 7 }],
      ['an unknown tone', { name: 'Remote', tone: 'PINK' }],
      ['a null tone, not a 500', { name: 'Remote', tone: null }],
    ])('400s %s', async (_, body) => {
      await api.post('/api/v1/tags').send(body).expect(400);
    });
  });

  describe('GET /tags', () => {
    it('lists by name whatever its case, with how many vacancies carry each', async () => {
      const id = await queued('https://example.com/jobs/1');
      await tagVacancies([{ vacancyId: id, add: ['remote', 'EU'] }]).expect(204);
      await api.post('/api/v1/tags').send({ name: 'Unused', tone: 'WARN' }).expect(201);

      const { body } = await api.get('/api/v1/tags').expect(200);

      expect(body).toEqual([
        { id: expect.any(Number), name: 'EU', tone: 'NEUTRAL', vacancyCount: 1 },
        { id: expect.any(Number), name: 'remote', tone: 'NEUTRAL', vacancyCount: 1 },
        { id: expect.any(Number), name: 'Unused', tone: 'WARN', vacancyCount: 0 },
      ]);
    });
  });

  describe('PATCH /tags/:id', () => {
    it('200s the tag; a field left out is untouched', async () => {
      const { body: tag } = await api
        .post('/api/v1/tags')
        .send({ name: 'Remote', tone: 'GOOD' })
        .expect(201);

      const renamed = await api
        .patch(`/api/v1/tags/${tag.id}`)
        .send({ name: 'Fully remote' })
        .expect(200);
      expect(renamed.body).toEqual({ id: tag.id, name: 'Fully remote', tone: 'GOOD' });

      const toned = await api.patch(`/api/v1/tags/${tag.id}`).send({ tone: 'BAD' }).expect(200);
      expect(toned.body).toEqual({ id: tag.id, name: 'Fully remote', tone: 'BAD' });
    });

    it('409s a taken name, 422s a blank one', async () => {
      await api.post('/api/v1/tags').send({ name: 'Remote' }).expect(201);
      const { body: tag } = await api.post('/api/v1/tags').send({ name: 'EU' }).expect(201);

      await api.patch(`/api/v1/tags/${tag.id}`).send({ name: 'remote' }).expect(409);
      await api.patch(`/api/v1/tags/${tag.id}`).send({ name: '  ' }).expect(422);
    });

    it.each([
      ['a null name', { name: null }],
      ['a null tone', { tone: null }],
      ['an unknown tone', { tone: 'PINK' }],
    ])('400s %s, not a 500', async (_, body) => {
      const { body: tag } = await api.post('/api/v1/tags').send({ name: 'Remote' }).expect(201);
      await api.patch(`/api/v1/tags/${tag.id}`).send(body).expect(400);
    });

    it('404s an unknown id', async () => {
      const res = await api.patch('/api/v1/tags/999999').send({ name: 'EU' }).expect(404);
      expect(res.body.error).toBe('TagNotFoundError');
    });
  });

  describe('DELETE /tags/:id', () => {
    it('204s and takes the tag off its vacancies; the vacancy stays', async () => {
      const id = await queued('https://example.com/jobs/1');
      await tagVacancies([{ vacancyId: id, add: ['Remote', 'EU'] }]).expect(204);
      const { body: tags } = await api.get('/api/v1/tags').expect(200);
      const remote = tags.find((tag: { name: string }) => tag.name === 'Remote');

      await api.delete(`/api/v1/tags/${remote.id}`).expect(204);

      expect(await tagNames(id)).toEqual(['EU']);
    });

    it('404s an unknown id', async () => {
      await api.delete('/api/v1/tags/999999').expect(404);
    });
  });

  describe('POST /vacancies/tags', () => {
    it('204s; adds by name, creates the new ones, removes, and leaves the status alone', async () => {
      const first = await queued('https://example.com/jobs/1');
      const second = await queued('https://example.com/jobs/2');

      await tagVacancies([
        { vacancyId: first, add: ['Remote', 'EU'] },
        { vacancyId: second, add: [' remote '] },
      ]).expect(204);
      expect(await tagNames(first)).toEqual(['EU', 'Remote']);
      expect(await tagNames(second)).toEqual(['Remote']); // the first spelling

      await tagVacancies([{ vacancyId: first, remove: ['REMOTE', 'Unknown'] }]).expect(204);

      expect(await tagNames(first)).toEqual(['EU']);
      const { body } = await api.get(`/api/v1/vacancies/${first}`).expect(200);
      expect(body.status).toBe('NEW');
    });

    it('writes nothing when one item fails: an unknown vacancy is a 404', async () => {
      const id = await queued('https://example.com/jobs/1');

      await tagVacancies([
        { vacancyId: id, add: ['Remote'] },
        { vacancyId: 999_999, add: ['EU'] },
      ]).expect(404);

      expect(await tagNames(id)).toEqual([]);
      expect((await api.get('/api/v1/tags').expect(200)).body).toEqual([]);
    });

    it('404s a vacancy id past Int4, and an unknown one with nothing to add', async () => {
      await tagVacancies([{ vacancyId: 99_999_999_999, add: ['Remote'] }]).expect(404);
      await tagVacancies([{ vacancyId: 999_999, remove: ['Remote'] }]).expect(404);
    });

    it('422s a bad name, and a vacancy going over the limit with what it already has', async () => {
      const id = await queued('https://example.com/jobs/1');
      await tagVacancies([{ vacancyId: id, add: names(TAGS_PER_VACANCY_MAX) }]).expect(204);

      const over = await tagVacancies([{ vacancyId: id, add: ['One more'] }]).expect(422);
      expect(over.body.error).toBe('InvalidTagsError');
      await tagVacancies([{ vacancyId: id, add: ['  '] }]).expect(422);

      expect(await tagNames(id)).toHaveLength(TAGS_PER_VACANCY_MAX);
      const { body } = await api.get('/api/v1/tags').expect(200);
      expect(body).toHaveLength(TAGS_PER_VACANCY_MAX);
    });

    it.each([
      ['no items', []],
      ['an item that is an array', [[{ vacancyId: 1, add: ['A'] }]]],
      ['too many items', Array(ANALYSIS_BATCH_MAX + 1).fill({ vacancyId: 1, add: ['A'] })],
      ['an id not a number', [{ vacancyId: 'one', add: ['A'] }]],
      ['an id past bigint, not a 500', [{ vacancyId: 1e30, add: ['A'] }]],
      ['a null add', [{ vacancyId: 1, add: null }]],
      ['a null remove', [{ vacancyId: 1, remove: null }]],
      ['a name not a string', [{ vacancyId: 1, add: [7] }]],
      ['more names than a vacancy holds', [{ vacancyId: 1, add: names(TAGS_PER_VACANCY_MAX + 1) }]],
    ])('400s %s', async (_, items) => {
      await tagVacancies(items).expect(400);
    });
  });

  describe('tags with an analysis', () => {
    it('POST /vacancies writes them', async () => {
      const { body } = await api
        .post('/api/v1/vacancies')
        .send({
          company: 'Acme',
          title: 'Backend Engineer',
          applyUrl: 'https://example.com/jobs/1',
          fullText: 'Full vacancy text.',
          ...analysis,
          tags: ['Remote'],
        })
        .expect(201);

      expect(await tagNames(body.id)).toEqual(['Remote']);
    });

    it('POST /vacancies with a bad name saves no vacancy', async () => {
      const applyUrl = 'https://example.com/jobs/1';
      const vacancy = { company: 'Acme', title: 'Backend Engineer', applyUrl, ...analysis };

      await api
        .post('/api/v1/vacancies')
        .send({ ...vacancy, fullText: 'Full vacancy text.', tags: ['  '] })
        .expect(422);

      const { body } = await api.get('/api/v1/vacancies?company=Acme').expect(200);
      expect(body.items).toEqual([]);
    });

    it('POST /vacancies/:id/analysis writes them; a bad one rejects the analysis too', async () => {
      const id = await queued('https://example.com/jobs/1');
      const path = `/api/v1/vacancies/${id}/analysis`;

      await api
        .post(path)
        .send({ ...analysis, tags: ['  '] })
        .expect(422);
      const { body: untouched } = await api.get(`/api/v1/vacancies/${id}`).expect(200);
      expect(untouched).toMatchObject({ status: 'NEW', matchScore: null, tags: [] });

      await api
        .post(path)
        .send({ ...analysis, tags: ['Remote'] })
        .expect(200);
      expect(await tagNames(id)).toEqual(['Remote']);
    });

    it('POST /vacancies/analysis writes them per item; one bad name rejects all', async () => {
      const first = await queued('https://example.com/jobs/1');
      const second = await queued('https://example.com/jobs/2');
      const send = (tags: string[]) =>
        api.post('/api/v1/vacancies/analysis').send({
          analyses: [
            { id: first, ...analysis, tags: ['Remote'] },
            { id: second, ...analysis, tags },
          ],
        });

      await send(['  ']).expect(422);
      expect((await api.get('/api/v1/tags').expect(200)).body).toEqual([]);

      await send(['EU']).expect(200);
      expect(await tagNames(first)).toEqual(['Remote']);
      expect(await tagNames(second)).toEqual(['EU']);
    });

    it('400s more names than a vacancy holds', async () => {
      const id = await queued('https://example.com/jobs/1');
      await api
        .post(`/api/v1/vacancies/${id}/analysis`)
        .send({ ...analysis, tags: names(TAGS_PER_VACANCY_MAX + 1) })
        .expect(400);
    });

    it('400s null tags, not a 500', async () => {
      const id = await queued('https://example.com/jobs/1');
      await api
        .post(`/api/v1/vacancies/${id}/analysis`)
        .send({ ...analysis, tags: null })
        .expect(400);
    });
  });

  describe('access', () => {
    it('401s every route without a session or a key', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/tags').expect(401);
      await request(server).post('/api/v1/tags').send({ name: 'Remote' }).expect(401);
      await request(server).patch('/api/v1/tags/1').send({ name: 'Remote' }).expect(401);
      await request(server).delete('/api/v1/tags/1').expect(401);
      await request(server)
        .post('/api/v1/vacancies/tags')
        .send({ items: [{ vacancyId: 1, add: ['Remote'] }] })
        .expect(401);
    });

    it('takes an API key on every write, as its owner', async () => {
      const { key, userId } = await createApiKey(app);
      const vacancyId = await queued('https://example.com/jobs/1', userId);
      const call = (method: 'post' | 'patch' | 'delete', path: string) =>
        request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${key}`);

      const { body: tag } = await call('post', '/api/v1/tags').send({ name: 'EU' }).expect(201);
      await call('patch', `/api/v1/tags/${tag.id}`).send({ tone: 'GOOD' }).expect(200);
      await call('post', '/api/v1/vacancies/tags')
        .send({ items: [{ vacancyId, add: ['Remote'] }] })
        .expect(204);
      await call('delete', `/api/v1/tags/${tag.id}`).expect(204);

      expect(await prisma.tag.findMany({ where: { userId }, select: { name: true } })).toEqual([
        { name: 'Remote' },
      ]);
    });
  });
});
