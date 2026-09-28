import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

describe('Vacancy log (e2e)', () => {
  let app: INestApplication;
  const prisma = getPrisma();

  const check = (body: unknown) =>
    request(app.getHttpServer()).post('/api/v1/log/check').send(body);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterEach(async () => {
    await prisma.vacancyLogEntry.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('returns the raw urls of new entries (200); a repeat is not new', async () => {
    const raw = 'https://acme.com/jobs/1?utm_source=x';
    const first = await check({
      entries: [
        { url: raw, company: 'Acme', title: 'Dev' },
        { company: 'No', title: 'Link' },
      ],
    }).expect(200);
    expect(first.body).toEqual({ new: [raw] });

    const again = await check({ entries: [{ url: 'https://acme.com/jobs/1/' }] }).expect(200);
    expect(again.body).toEqual({ new: [] });
  });

  it('400s on an empty or oversized batch, or a non-string field', async () => {
    await check({ entries: [] }).expect(400);
    await check({
      entries: Array.from({ length: 101 }, (_, i) => ({ url: `https://a.com/${i}` })),
    }).expect(400);
    await check({ entries: [{ url: 42 }] }).expect(400);
  });

  it('GET lists newest first, searches, and pages by cursor', async () => {
    await check({
      entries: [
        { url: 'https://acme.com/jobs/1', company: 'Acme', title: 'Dev' },
        { url: 'https://beta.com/jobs/2', company: 'Beta', title: 'QA' },
        { url: 'https://acme.com/jobs/3', company: 'Acme', title: 'Lead' },
      ],
    }).expect(200);
    const server = app.getHttpServer();

    const first = await request(server).get('/api/v1/log?limit=2').expect(200);
    expect(first.body.total).toBe(3);
    expect(first.body.items.map((item: { url: string }) => item.url)).toEqual([
      'https://acme.com/jobs/3',
      'https://beta.com/jobs/2',
    ]);
    expect(first.body.nextCursor).toBe(first.body.items[1].id);

    const next = await request(server)
      .get(`/api/v1/log?limit=2&cursor=${first.body.nextCursor}`)
      .expect(200);
    expect(next.body).toMatchObject({
      items: [{ url: 'https://acme.com/jobs/1', company: 'Acme', title: 'Dev' }],
      total: 3,
      nextCursor: null,
    });

    const search = await request(server).get('/api/v1/log?q=BETA').expect(200);
    expect(search.body).toMatchObject({ items: [{ company: 'Beta' }], total: 1 });
  });

  it('GET 400s on a bad limit or cursor', async () => {
    const server = app.getHttpServer();
    await request(server).get('/api/v1/log?limit=101').expect(400);
    await request(server).get('/api/v1/log?limit=0').expect(400);
    await request(server).get('/api/v1/log?cursor=abc').expect(400);
  });
});
