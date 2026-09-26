import { VacancyLogService } from '@job-search-copilot/core';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CheckVacancyLogDto } from './dto/check-vacancy-log.dto';

@Controller('vacancy-log')
export class VacancyLogController {
  constructor(private readonly log: VacancyLogService) {}

  /** Check-and-record (ADR-0026): returns `{ new: [url as sent, ...] }`, and those
   * entries are written by this call. 200, not 201 — a batch can be all duplicates. */
  @Post('check')
  @HttpCode(200)
  check(@Body() dto: CheckVacancyLogDto) {
    return this.log.checkMany(dto.entries);
  }
}
