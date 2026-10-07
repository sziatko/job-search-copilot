import './load-env';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { Env } from './config/env.validation';
import { configureApp } from './setup-app';

async function bootstrap() {
  // Better Auth reads /api/auth/*'s raw body; AuthModule re-adds the parsers elsewhere.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  configureApp(app, config);
  const port = config.get('API_PORT', { infer: true });
  await app.listen(port);
  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

bootstrap().catch((err: unknown) => {
  Logger.error('Failed to start API', err instanceof Error ? err.stack : String(err), 'Bootstrap');
  process.exit(1);
});
