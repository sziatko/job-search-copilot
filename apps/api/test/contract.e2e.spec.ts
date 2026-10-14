import 'reflect-metadata';
import { getPrisma, VacancyIntakeService } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
// The web's own schemas, imported as they are (the `@` alias in vitest.config.mts) —
// what its api.ts files parse each response with.
import {
  applicationListItemSchema,
  applicationPageSchema,
  recordApplicationResponseSchema,
} from '@/pages/applications/types';
import { statsSchema } from '@/pages/dashboard/types';
import {
  vacancyDetailSchema,
  vacancyListItemSchema,
  vacancyPageSchema,
} from '@/pages/vacancies/types';
import { type Api, createTestApp, signedInAgent } from './test-app';

/**
 * The web↔API contract (invariant 5): the web's zod schemas are hand-written, and its
 * MSW handlers serve what its tests made up, so a renamed API field leaves both suites
 * green. Here every response the web parses goes through the web's schema.
 */
describe('Web↔API contract (e2e)', () => {
  let app: NestExpressApplication;
  let api: Api;
  const prisma = getPrisma();
  /** The three shapes: no analysis and no text, no analysis with text, analysed. */
  let bare: number;
  let textOnly: number;
  let full: number;

  // `schema.parse` as the web's parseResponse does; a mismatch throws zod's issues. An
  // empty page passes any item schema, so a page must carry rows.
  function parsesPage(
    schema: typeof vacancyPageSchema | typeof applicationPageSchema,
    body: unknown,
  ) {
    expect(schema.parse(body).items.length).toBeGreaterThan(0);
  }

  async function intake(url: string, company: string, fullText?: string): Promise<number> {
    await new VacancyIntakeService(prisma).intake(api.userId, {
      url,
      company,
      title: 'Frontend Engineer',
      fullText,
    });
    return (await prisma.vacancy.findFirstOrThrow({ where: { applyUrl: url } })).id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    api = await signedInAgent(app);
  });

  beforeEach(async () => {
    bare = await intake('https://example.com/jobs/bare', 'Acme');
    textOnly = await intake('https://example.com/jobs/text', 'Acme Polska', 'Posting. '.repeat(30));
    const res = await api
      .post('/api/v1/vacancies')
      .send({
        company: 'Beta Corp',
        title: 'Backend Engineer',
        applyUrl: 'https://example.com/jobs/full',
        fullText: 'Full vacancy text.',
        matchScore: 80,
        recommendation: 'APPLY',
        estimationComment: 'Strong match.',
      })
      .expect(201);
    full = res.body.id;
  });

  afterEach(async () => {
    await prisma.vacancy.deleteMany();
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await app.close();
    await prisma.$disconnect();
  });

  it('GET /vacancies: vacancyPageSchema, unfiltered and with each filter the web sends', async () => {
    const all = await api.get('/api/v1/vacancies?limit=100').expect(200);
    parsesPage(vacancyPageSchema, all.body);
    expect(all.body.total).toBe(3);

    for (const query of [
      'status=NEW,NOT_REVIEWED',
      'search=acme',
      'sameCompanyAs=acme',
      'hasText=true',
      'hasText=false',
      'sort=recommended',
    ]) {
      const res = await api.get(`/api/v1/vacancies?limit=100&${query}`).expect(200);
      parsesPage(vacancyPageSchema, res.body);
    }
  });

  it('GET /vacancies/:id: vacancyDetailSchema for each shape', async () => {
    await api
      .patch(`/api/v1/vacancies/${full}/status`)
      .send({ status: 'SAVED_FOR_LATER', comment: 'Later.' })
      .expect(200);
    for (const id of [bare, textOnly, full]) {
      const res = await api.get(`/api/v1/vacancies/${id}`).expect(200);
      vacancyDetailSchema.parse(res.body);
    }
  });

  it('PATCH /vacancies/:id/status: vacancyListItemSchema', async () => {
    for (const [id, status] of [
      [full, 'SAVED_FOR_LATER'],
      [bare, 'FILTERED_OUT'],
      [textOnly, 'FILTERED_OUT'],
    ] as const) {
      const res = await api
        .patch(`/api/v1/vacancies/${id}/status`)
        .send({ status, comment: 'A note.' })
        .expect(200);
      vacancyListItemSchema.parse(res.body);
    }
  });

  it('the applications endpoints and /stats: their schemas', async () => {
    // An analysed one in APPLIED, an unanalysed one set straight past it (no appliedAt).
    const recorded = await api
      .post('/api/v1/applications')
      .send({ vacancyId: full, salaryInApplication: '100 PLN/h', comment: 'Sent.' })
      .expect(201);
    recordApplicationResponseSchema.parse(recorded.body);
    const past = await api
      .post('/api/v1/applications')
      .send({ vacancyId: bare, status: 'INTERVIEW' })
      .expect(201);
    recordApplicationResponseSchema.parse(past.body);
    // One timed out, so `state=timedOut` has a row.
    await prisma.vacancy.update({
      where: { id: bare },
      data: { statusChangedAt: new Date(Date.now() - 40 * 86_400_000) },
    });

    for (const query of [
      '',
      'state=active',
      'state=timedOut',
      'status=APPLIED',
      'search=beta',
      'sameCompanyAs=acme',
    ]) {
      const res = await api.get(`/api/v1/applications?limit=100&${query}`).expect(200);
      parsesPage(applicationPageSchema, res.body);
    }

    const moved = await api
      .patch(`/api/v1/applications/${full}/status`)
      .send({ status: 'AWAITING' })
      .expect(200);
    applicationListItemSchema.parse(moved.body);
    const edited = await api
      .patch(`/api/v1/applications/${full}`)
      .send({ salaryInApplication: null, usedTailoredResume: true, comment: 'Edited.' })
      .expect(200);
    applicationListItemSchema.parse(edited.body);

    const stats = await api.get('/api/v1/stats').expect(200);
    expect(statsSchema.parse(stats.body).recent.length).toBeGreaterThan(0);
  });
});
