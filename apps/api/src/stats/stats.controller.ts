import { StatsService } from '@job-search-copilot/core';
import { Controller, Get } from '@nestjs/common';

@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  /** The dashboard's numbers (ADR-0031): the funnel from the journal, the pipeline now. */
  @Get()
  get() {
    return this.stats.get();
  }
}
