import { createAuth } from '@job-search-copilot/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ApplicationsModule } from './applications/applications.module';
import { WellKnownController } from './auth/well-known.controller';
import { type Env, validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrismaService } from './prisma/prisma.service';
import { StatsModule } from './stats/stats.module';
import { VacanciesModule } from './vacancies/vacancies.module';

@Module({
  imports: [
    // The .env file is loaded by src/load-env.ts before this module is imported;
    // ConfigModule just validates + serves the already-populated process.env.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    PrismaModule,
    // Mounts /api/auth/* and a global guard: every route wants a session unless it is
    // @AllowAnonymous() or behind MachineTokenGuard (ADR-0034, ADR-0036).
    AuthModule.forRootAsync({
      inject: [PrismaService, ConfigService],
      useFactory: (prisma: PrismaService, config: ConfigService<Env, true>) => {
        const env = <K extends keyof Env>(key: K) => config.get(key, { infer: true });
        return {
          auth: createAuth(prisma.client, {
            secret: env('BETTER_AUTH_SECRET'),
            baseURL: env('BETTER_AUTH_URL'),
            webOrigin: env('WEB_ORIGIN'),
            google: {
              clientId: env('GOOGLE_CLIENT_ID'),
              clientSecret: env('GOOGLE_CLIENT_SECRET'),
            },
            linkedin: {
              clientId: env('LINKEDIN_CLIENT_ID'),
              clientSecret: env('LINKEDIN_CLIENT_SECRET'),
            },
            allowedEmails: env('AUTH_ALLOWED_EMAILS'),
            passkeyRpId: env('PASSKEY_RP_ID'),
            mcpUrl: env('MCP_PUBLIC_URL'),
          }),
          // Nest's own parser is off (bodyParser: false — Better Auth reads the raw body
          // on /api/auth/*); the module re-adds it for every other route. Express' default
          // is 100 KB; POST /vacancies/intake takes up to 100 postings with their text.
          bodyParser: { json: { limit: '5mb' } },
          // CORS is configureApp's, one config for every route (it also allows PATCH).
          disableTrustedOriginsCors: true,
        };
      },
    }),
    HealthModule,
    VacanciesModule,
    ApplicationsModule,
    StatsModule,
  ],
  controllers: [WellKnownController],
})
export class AppModule {}
