import 'reflect-metadata';
import { getPrisma } from '@job-search-copilot/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './test-app';

// Paths only: the DTO properties come from the CLI plugin, which vitest's SWC does not run.
describe('API docs (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
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
    // The three machine routes take an API key; Swagger's Authorize button sends it.
    expect(res.body.paths['/api/v1/vacancies/intake'].post.security).toEqual([{ bearer: [] }]);
    expect(res.body.paths['/api/v1/vacancies'].get.security).toBeUndefined();
  });

  it('serves the Swagger UI', async () => {
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });
});
