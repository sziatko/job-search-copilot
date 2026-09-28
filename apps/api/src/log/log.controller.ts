import { VacancyLogService } from '@job-search-copilot/core';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CheckLogDto } from './dto/check-log.dto';

@Controller('log')
export class LogController {
  constructor(private readonly log: VacancyLogService) {}

  /** Check-and-record (ADR-0026): returns `{ new: [url as sent, ...] }`, and those
   * entries are written by this call. 200, not 201 — a batch can be all duplicates. */
  @Post('check')
  @HttpCode(200)
  check(@Body() dto: CheckLogDto) {
    return this.log.checkMany(dto.entries);
  }
}
