import { StatsService } from '@job-search-copilot/core';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StatsController } from './stats.controller';

@Module({
  controllers: [StatsController],
  providers: [
    {
      // Same pattern as ApplicationsModule.
      provide: StatsService,
      useFactory: (prisma: PrismaService) => new StatsService(prisma.client),
      inject: [PrismaService],
    },
  ],
})
export class StatsModule {}
