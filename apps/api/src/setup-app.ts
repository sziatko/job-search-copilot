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
  // The body parsers (JSON up to 5 MB) are AuthModule's — see app.module.ts; the app is
  // created with `bodyParser: false`.

  // The session cookie rides cross-origin from the web (localhost:5173 → :3000), so
  // credentials, and an exact origin: credentials never go with a reflected one.
  app.enableCors({ origin: config.get('WEB_ORIGIN', { infer: true }), credentials: true });

  // Everything lives under /api except /health, which infra (docker-compose,
  // load balancers) expects at the root, and the OAuth metadata, which RFC 8414 puts there.
  app.setGlobalPrefix('api', {
    exclude: ['health', '.well-known/oauth-authorization-server/api/auth'],
  });
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
      new DocumentBuilder()
        .setTitle('Job Search Copilot API')
        .setVersion('1')
        // An API key (`jsc_…`, from /profile) on the domain routes (ADR-0039).
        .addBearerAuth()
        .build(),
    ),
    { useGlobalPrefix: true },
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  // Forward SIGTERM/SIGINT to onModuleDestroy hooks (PrismaService.$disconnect).
  app.enableShutdownHooks();
}
