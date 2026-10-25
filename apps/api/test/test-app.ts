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

/** The users `signIn` and `createApiKey` made in this file, not yet deleted. */
const users: string[] = [];

/** Deletes the vacancies of the users made here (an `afterEach`); comments and status
 * changes go with them. Other files' rows stay, so files can run at the same time. */
export async function deleteTestVacancies(): Promise<void> {
  await getPrisma().vacancy.deleteMany({ where: { userId: { in: users } } });
}

/** Deletes the users made here (an `afterAll`); sessions, keys and vacancies go with
 * them (ON DELETE CASCADE). */
export async function deleteTestUsers(): Promise<void> {
  await getPrisma().user.deleteMany({ where: { id: { in: users.splice(0) } } });
}

/** The app as main.ts boots it: Nest's body parser off (AuthModule owns parsing). */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app, app.get(ConfigService));
  await app.init();
  return app;
}

/**
 * A signed-in user: a `User` and a `Session` row in the test DB, and the session cookie,
 * the token signed the way Better Auth signs its cookie (what its `testUtils` plugin
 * does, without putting a test plugin in `createAuth`). `deleteTestUsers` deletes it.
 */
export async function signIn(
  app: NestExpressApplication,
): Promise<{ cookie: string; userId: string }> {
  const user = await getPrisma().user.create({
    data: { id: randomUUID(), name: 'Test User', email: `${randomUUID()}@example.com` },
  });
  users.push(user.id);
  const ctx = await app.get<AuthService<Auth>>(AuthService).instance.$context;
  const { token } = await ctx.internalAdapter.createSession(user.id);
  const value = `${token}.${await makeSignature(token, ctx.secret)}`;
  return { cookie: `${ctx.authCookies.sessionToken.name}=${value}`, userId: user.id };
}

/** supertest with the session cookie on every request; `userId` is whose data it sees. */
export async function signedInAgent(app: NestExpressApplication) {
  const { cookie, userId } = await signIn(app);
  return Object.assign(request.agent(app.getHttpServer()).set('Cookie', cookie), { userId });
}

export type Api = Awaited<ReturnType<typeof signedInAgent>>;

/** What /profile's "Create" does: a key for a new user, shown once; `userId` its owner. */
export async function createApiKey(app: NestExpressApplication) {
  const user = await getPrisma().user.create({
    data: { id: randomUUID(), name: 'Key Owner', email: `${randomUUID()}@example.com` },
  });
  users.push(user.id);
  const auth = app.get<AuthService<Auth>>(AuthService);
  const created = await auth.api.createApiKey({ body: { name: 'n8n', userId: user.id } });
  return { key: created.key, id: created.id, userId: user.id };
}
