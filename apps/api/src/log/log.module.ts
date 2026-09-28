import { VacancyLogService } from '@job-search-copilot/core';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LogController } from './log.controller';

@Module({
  controllers: [LogController],
  providers: [
    {
      // Same pattern as ApplicationsModule.
      provide: VacancyLogService,
      useFactory: (prisma: PrismaService) => new VacancyLogService(prisma.client),
      inject: [PrismaService],
    },
  ],
})
export class LogModule {}
