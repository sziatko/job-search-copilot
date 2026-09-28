import { VacancyLogService } from '@job-search-copilot/core';
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { CheckLogDto } from './dto/check-log.dto';
import { ListLogQueryDto } from './dto/list-log.dto';

@Controller('log')
export class LogController {
  constructor(private readonly log: VacancyLogService) {}

  /** The web's `/log` table: `{ items, total, nextCursor }`, newest first. */
  @Get()
  list(@Query() { q, cursor, limit }: ListLogQueryDto) {
    return this.log.list({ search: q, cursor, limit });
  }

  /** Check-and-record (ADR-0026): returns `{ new: [url as sent, ...] }`, and those
   * entries are written by this call. 200, not 201 — a batch can be all duplicates. */
  @Post('check')
  @HttpCode(200)
  check(@Body() dto: CheckLogDto) {
    return this.log.checkMany(dto.entries);
  }
}
