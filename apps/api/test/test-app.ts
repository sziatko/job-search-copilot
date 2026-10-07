import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { type Auth, getPrisma } from '@job-search-copilot/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { makeSignature } from 'better-auth/crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup-app';

/** The app as main.ts boots it: Nest's body parser off (AuthModule owns parsing). */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app, app.get(ConfigService));
  await app.init();
  return app;
}

/**
 * A signed-in user's session cookie: a `User` and a `Session` row in the test DB, and
 * the token signed the way Better Auth signs its cookie (what its `testUtils` plugin
 * does, without putting a test plugin in `createAuth`). Delete users in `afterAll`.
 */
export async function signIn(app: NestExpressApplication): Promise<string> {
  const user = await getPrisma().user.create({
    data: { id: randomUUID(), name: 'Test User', email: `${randomUUID()}@example.com` },
  });
  const ctx = await app.get<AuthService<Auth>>(AuthService).instance.$context;
  const { token } = await ctx.internalAdapter.createSession(user.id);
  return `${ctx.authCookies.sessionToken.name}=${token}.${await makeSignature(token, ctx.secret)}`;
}

/** supertest with the session cookie on every request. */
export async function signedInAgent(app: NestExpressApplication) {
  return request.agent(app.getHttpServer()).set('Cookie', await signIn(app));
}

export type Api = Awaited<ReturnType<typeof signedInAgent>>;
