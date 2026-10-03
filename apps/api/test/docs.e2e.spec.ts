import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

// Paths only: the DTO properties come from the CLI plugin, which vitest's SWC does not run.
describe('API docs (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app, app.get(ConfigService));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await getPrisma().$disconnect();
  });

  it('serves the OpenAPI document with the versioned routes', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining(['/api/v1/vacancies/intake', '/api/v1/vacancies/{id}/analysis']),
    );
  });

  it('serves the Swagger UI', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });
});
