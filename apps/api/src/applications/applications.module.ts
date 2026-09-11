import { ApplicationService } from '@job-search-copilot/core';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationsController } from './applications.controller';

@Module({
  controllers: [ApplicationsController],
  providers: [
    {
      // Same pattern as EstimatedVacanciesModule — the framework-agnostic core
      // service, constructed here with the DI-managed Prisma client.
      provide: ApplicationService,
      useFactory: (prisma: PrismaService) => new ApplicationService(prisma.client),
      inject: [PrismaService],
    },
  ],
})
export class ApplicationsModule {}
