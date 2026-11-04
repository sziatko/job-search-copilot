import { TagService } from '@job-search-copilot/core';
import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TagsController } from './tags.controller';

@Module({
  controllers: [TagsController],
  providers: [
    {
      // Same pattern as VacanciesModule.
      provide: TagService,
      useFactory: (prisma: PrismaService) => new TagService(prisma.client),
      inject: [PrismaService],
    },
  ],
})
export class TagsModule {}
