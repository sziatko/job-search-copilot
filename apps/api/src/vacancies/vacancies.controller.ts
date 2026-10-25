import { type CommentSource, VacancyIntakeService, VacancyService } from '@job-search-copilot/core';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { ApiKeyGuard, CallerSource, CurrentUserId } from '../auth/api-key.guard';
import { IntakeVacanciesDto } from './dto/intake-vacancies.dto';
import { ListVacanciesQueryDto } from './dto/list-vacancies.dto';
import { SaveVacancyDto } from './dto/save-vacancy.dto';
import { SubmitAnalysesDto, SubmitAnalysisDto } from './dto/submit-analysis.dto';
import { UpdateVacancyStatusDto } from './dto/update-vacancy-status.dto';

/** A session or an API key (ADR-0039). */
@Controller('vacancies')
@AllowAnonymous()
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class VacanciesController {
  constructor(
    private readonly vacancies: VacancyService,
    private readonly intakeService: VacancyIntakeService,
  ) {}

  /**
   * Idempotent by applyUrl (the analysis is written once — ADR-0005, ADR-0033):
   * a new vacancy → 201 + Location; an applyUrl that already exists → 200, with this
   * analysis attached when the row had none (taken in by intake), else the stored
   * record untouched. Stays a POST — the id is server-assigned, so there's no
   * client-known URI to PUT to.
   */
  @Post()
  async save(
    @CurrentUserId() userId: string,
    @Body() dto: SaveVacancyDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { created, vacancy } = await this.vacancies.save(userId, dto);
    if (created) {
      res.status(201);
      res.setHeader('Location', `/api/v1/vacancies/${vacancy.id}`);
    } else {
      res.status(200);
    }
    return vacancy;
  }

  /**
   * Intake (ADR-0033), n8n's way in: `{ new: [url as sent, ...] }`, and those entries
   * are now NEW vacancies; every other entry was a duplicate (a match without text gets
   * the entry's). 200, not 201 — a batch can be all duplicates.
   */
  @Post('intake')
  @HttpCode(200)
  intake(@CurrentUserId() userId: string, @Body() dto: IntakeVacanciesDto) {
    return this.intakeService.intakeMany(userId, dto.entries);
  }

  /**
   * The analysis of a vacancy that has none yet (ADR-0033) → 200 and the row. From NEW
   * it moves the vacancy by the rule; any other status is untouched. Already analysed →
   * 409, unknown id → 404 (DomainExceptionFilter).
   */
  @Post(':id/analysis')
  @HttpCode(200)
  submitAnalysis(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitAnalysisDto,
  ) {
    return this.vacancies.submitAnalysis(userId, { id, ...dto });
  }

  /** Up to ANALYSIS_BATCH_MAX analyses, all or none → 200 and the rows, in order. */
  @Post('analysis')
  @HttpCode(200)
  submitAnalyses(@CurrentUserId() userId: string, @Body() dto: SubmitAnalysesDto) {
    return this.vacancies.submitAnalyses(userId, dto.analyses);
  }

  /** `{ items, total, nextCursor }`; paged by `cursor` (ADR-0030). */
  @Get()
  list(@CurrentUserId() userId: string, @Query() query: ListVacanciesQueryDto) {
    return this.vacancies.list(userId, query);
  }

  @Get(':id')
  async getById(@CurrentUserId() userId: string, @Param('id', ParseIntPipe) id: number) {
    const vacancy = await this.vacancies.getById(userId, id);
    if (!vacancy) {
      throw new NotFoundException(`Vacancy ${id} not found`);
    }
    return vacancy;
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVacancyStatusDto,
    @CallerSource() source: CommentSource,
  ) {
    return this.vacancies.updateStatus(userId, id, dto.status, dto.comment, source);
  }
}
