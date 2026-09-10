import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { EstimatedVacanciesModule } from './estimated-vacancies/estimated-vacancies.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // On the host the app runs from apps/api while the real env lives at the repo
      // root. In Docker the vars are injected by compose and this file won't exist —
      // ConfigModule just skips a missing envFilePath and reads process.env.
      envFilePath: path.resolve(process.cwd(), '../../.env'),
      validate: validateEnv,
    }),
    PrismaModule,
    HealthModule,
    EstimatedVacanciesModule,
  ],
})
export class AppModule {}
