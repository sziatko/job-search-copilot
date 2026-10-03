import { ValidationPipe, VersioningType } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { DomainExceptionFilter } from './common/domain-exception.filter';
import type { Env } from './config/env.validation';

/**
 * App-wide wiring shared by main.ts (real boot) and the e2e suite, so the tests
 * exercise the same pipes/filters/routing the deployed app runs and the two can't drift.
 */
export function configureApp(app: NestExpressApplication, config: ConfigService<Env, true>): void {
  // Express' default is 100 KB; POST /vacancies/intake takes up to 100 postings with
  // their text (~0.5–1 MB). Registered before init, so Nest skips its own JSON parser.
  app.useBodyParser('json', { limit: '5mb' });

  const allowlist = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // Empty allowlist → reflect any origin (local dev). Set CORS_ORIGINS before deploy.
  app.enableCors({ origin: allowlist.length > 0 ? allowlist : true });

  // Everything lives under /api except /health, which infra (docker-compose,
  // load balancers) expects at the root.
  app.setGlobalPrefix('api', { exclude: ['health'] });
  // URI versioning: /api/v1/... . New breaking shapes get a v2 controller instead
  // of mutating v1 under clients' feet.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Swagger UI at /api/docs, the raw document at /api/docs-json. The DTO and comment
  // metadata comes from the CLI plugin in nest-cli.json, so it is there under
  // `nest build` / `nest start` only, not under vitest's SWC.
  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Job Search Copilot API').setVersion('1').build(),
    ),
    { useGlobalPrefix: true },
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  // Forward SIGTERM/SIGINT to onModuleDestroy hooks (PrismaService.$disconnect).
  app.enableShutdownHooks();
}
