import { StatsService } from '@job-search-copilot/core';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApiKeyGuard, CurrentUserId } from '../auth/api-key.guard';

/** A session or an API key (ADR-0039). */
@Controller('stats')
@AllowAnonymous()
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** The dashboard's numbers (ADR-0031): the funnel from the journal, the pipeline now. */
  @Get()
  get(@CurrentUserId() userId: string) {
    return this.stats.get(userId);
  }
}
