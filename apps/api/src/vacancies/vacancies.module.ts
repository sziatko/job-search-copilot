import { VacancyIntakeService, VacancyService } from '@job-search-copilot/core';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VacanciesController } from './vacancies.controller';

@Module({
  controllers: [VacanciesController],
  providers: [
    {
      // The domain service lives in @job-search-copilot/core (framework-agnostic, so
      // the MCP server can reuse it). Nest constructs it here with the DI-managed client.
      provide: VacancyService,
      useFactory: (prisma: PrismaService) => new VacancyService(prisma.client),
      inject: [PrismaService],
    },
    {
      provide: VacancyIntakeService,
      useFactory: (prisma: PrismaService) => new VacancyIntakeService(prisma.client),
      inject: [PrismaService],
    },
  ],
})
export class VacanciesModule {}
