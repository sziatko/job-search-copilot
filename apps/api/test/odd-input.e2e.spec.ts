import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RejectNulPipe } from '../src/common/reject-nul.pipe';
import {
  type Api,
  createApiKey,
  createTestApp,
  deleteTestUsers,
  deleteTestVacancies,
  signedInAgent,
} from './test-app';

const LAST_INT4 = 2147483647;
const PAST_INT4 = 2147483648;

const ANALYSIS = { matchScore: 80, recommendation: 'APPLY', estimationComment: 'Strong match.' };
const ENTRY = { url: 'https://example.com/jobs/odd', company: 'Acme', title: 'Backend Engineer' };

/** Every route with an id on its path, with a body that passes on its own. */
const ID_ROUTES = [
  ['get', '/api/v1/vacancies/:id', undefined],
  ['post', '/api/v1/vacancies/:id/analysis', ANALYSIS],
  ['patch', '/api/v1/vacancies/:id/status', { status: 'SAVED_FOR_LATER' }],
  ['get', '/api/v1/applications/:id', undefined],
  ['patch', '/api/v1/applications/:id/status', { status: 'SAVED_FOR_LATER' }],
  ['patch', '/api/v1/applications/:id', {}],
  ['patch', '/api/v1/tags/:id', { name: 'Renamed' }],
  ['delete', '/api/v1/tags/:id', undefined],
] as const;

describe('Odd input on REST (e2e)', () => {
  let app: NestExpressApplication;
  let api: Api;
  const prisma = getPrisma();

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

  describe('an id on a path', () => {
    const call = ([method, path, body]: (typeof ID_ROUTES)[number], id: unknown) =>
      api[method](path.replace(':id', String(id))).send(body);

    it.each(ID_ROUTES)('%s %s: the last Int4 is a plain 404', async (...route) => {
      await call(route, LAST_INT4).expect(404);
    });

    it.each(ID_ROUTES)('%s %s: past Int4 is a 400', async (...route) => {
      await call(route, PAST_INT4).expect(400);
    });

    it.each(ID_ROUTES)('%s %s: not a number is a 400', async (...route) => {
      await call(route, 'abc').expect(400);
    });

    it.each([
      ['below Int4', -2147483649, 400],
      ['far past Int4', '99999999999999999999', 400],
      ['zero', 0, 404],
      ['negative', -1, 404],
      ['in exponent form', '1e3', 404],
    ])('%s: %s is a %i', async (_, id, status) => {
      await call(ID_ROUTES[0], id).expect(status);
    });
  });

  describe('an id in a body or a query', () => {
    const fields: [string, (id: number) => request.Test, number][] = [
      [
        'id in POST /vacancies/analysis',
        (id) => api.post('/api/v1/vacancies/analysis').send({ analyses: [{ ...ANALYSIS, id }] }),
        404,
      ],
      [
        'id in POST /vacancies/unavailable',
        (id) => api.post('/api/v1/vacancies/unavailable').send({ items: [{ id, reason: 'Gone' }] }),
        200,
      ],
      [
        'vacancyId in POST /applications',
        (vacancyId) => api.post('/api/v1/applications').send({ vacancyId }),
        404,
      ],
      ['cursor in GET /vacancies', (cursor) => api.get('/api/v1/vacancies').query({ cursor }), 200],
      [
        'cursor in GET /applications',
        (cursor) => api.get('/api/v1/applications').query({ cursor }),
        200,
      ],
    ];

    it.each(fields)('%s: the last Int4 is ordinary', async (_, send, status) => {
      await send(LAST_INT4).expect(status);
    });

    it.each(fields)('%s: past Int4 is a 400', async (_, send) => {
      await send(PAST_INT4).expect(400);
    });
  });

  describe('a NUL character', () => {
    it.each<[string, () => request.Test]>([
      [
        'company in an intake entry',
        () =>
          api.post('/api/v1/vacancies/intake').send({ entries: [{ ...ENTRY, company: 'Ac\0me' }] }),
      ],
      ['the name of a new tag', () => api.post('/api/v1/tags').send({ name: 'Remote\0' })],
      [
        'a name in an array, in an item',
        () =>
          api.post('/api/v1/vacancies/tags').send({ items: [{ vacancyId: 1, add: ['Remote\0'] }] }),
      ],
      ['?search= on vacancies', () => api.get('/api/v1/vacancies').query({ search: 'Ac\0me' })],
      ['?search= on applications', () => api.get('/api/v1/applications').query({ search: '\0' })],
    ])('%s is a 400', async (_, send) => {
      await send().expect(400);
    });
  });

  describe('an array where an item belongs', () => {
    it.each<[string, string, object]>([
      ['analyses', '/api/v1/vacancies/analysis', { analyses: [[{ ...ANALYSIS, id: 1 }]] }],
      ['unavailable', '/api/v1/vacancies/unavailable', { items: [[{ id: 1, reason: 'Gone' }]] }],
      ['intake', '/api/v1/vacancies/intake', { entries: [[ENTRY]] }],
      ['tags', '/api/v1/vacancies/tags', { items: [[{ vacancyId: 1, add: ['Remote'] }]] }],
    ])('%s is a 400', async (_, path, body) => {
      await api.post(path).send(body).expect(400);
    });
  });

  describe('what the guards must leave alone', () => {
    it('an ordinary string passes unchanged', async () => {
      // A backslash and the letters, not the character.
      const company = 'Acme \\u0000 GmbH, Kraków';
      await api
        .post('/api/v1/vacancies/intake')
        .send({ entries: [{ ...ENTRY, company }] })
        .expect(200);

      const { body } = await api.get('/api/v1/vacancies').query({ search: 'Kraków' }).expect(200);
      expect(body.items.map((item: { company: string }) => item.company)).toEqual([company]);
    });

    it('a missing body is what it was', async () => {
      await api.post('/api/v1/vacancies/intake').expect(400);

      const { body: tag } = await api.post('/api/v1/tags').send({ name: 'Remote' }).expect(201);
      const { body } = await api.patch(`/api/v1/tags/${tag.id}`).expect(200);
      expect(body).toEqual(tag);
    });

    it('leaves a custom parameter alone', () => {
      expect(new RejectNulPipe().transform('Ac\0me', { type: 'custom' })).toBe('Ac\0me');
    });

    it('CurrentUserId and CallerSource still reach the handler', async () => {
      const { key } = await createApiKey(app);
      const withKey = request
        .agent(app.getHttpServer())
        .set('Authorization', `Bearer ${key}`) as unknown as Api;

      for (const [caller, source] of [
        [api, 'USER'],
        [withKey, 'AGENT'],
      ] as const) {
        await caller
          .post('/api/v1/vacancies/intake')
          .send({ entries: [ENTRY] })
          .expect(200);
        const { body: list } = await caller.get('/api/v1/vacancies').expect(200);
        // One row each: both took the same url in, each sees their own.
        expect(list.items).toHaveLength(1);

        const { body } = await caller
          .patch(`/api/v1/vacancies/${list.items[0].id}/status`)
          .send({ status: 'SAVED_FOR_LATER', comment: 'Later.' })
          .expect(200);
        expect(body.comments.at(-1)).toMatchObject({ body: 'Later.', source });
      }
    });
  });
});
