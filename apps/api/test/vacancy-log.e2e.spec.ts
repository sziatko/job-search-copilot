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
    request(app.getHttpServer()).post('/api/v1/vacancy-log/check').send(body);

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
});
