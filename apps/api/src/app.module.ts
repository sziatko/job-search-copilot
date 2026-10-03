import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApplicationsModule } from './applications/applications.module';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { StatsModule } from './stats/stats.module';
import { VacanciesModule } from './vacancies/vacancies.module';

@Module({
  imports: [
    // The .env file is loaded by src/load-env.ts before this module is imported;
    // ConfigModule just validates + serves the already-populated process.env.
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
    PrismaModule,
    HealthModule,
    VacanciesModule,
    ApplicationsModule,
    StatsModule,
  ],
})
export class AppModule {}
