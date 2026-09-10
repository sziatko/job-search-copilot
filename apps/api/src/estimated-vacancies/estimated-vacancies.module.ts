import { EstimatedVacancyService } from '@job-search-copilot/core';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EstimatedVacanciesController } from './estimated-vacancies.controller';

@Module({
  controllers: [EstimatedVacanciesController],
  providers: [
    {
      // The domain service lives in @job-search-copilot/core (framework-agnostic, so
      // the MCP server can reuse it). Nest constructs it here with the DI-managed client.
      provide: EstimatedVacancyService,
      useFactory: (prisma: PrismaService) => new EstimatedVacancyService(prisma.client),
      inject: [PrismaService],
    },
  ],
})
export class EstimatedVacanciesModule {}
