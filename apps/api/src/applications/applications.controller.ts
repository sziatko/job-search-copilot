import { ApplicationService, type CommentSource } from '@job-search-copilot/core';
import {
  Body,
  Controller,
  Get,
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
import { ListApplicationsQueryDto } from './dto/list-applications.dto';
import { RecordApplicationDto } from './dto/record-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

/** A session or an API key (ADR-0039). */
@Controller('applications')
@AllowAnonymous()
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ApplicationsController {
  constructor(private readonly applications: ApplicationService) {}

  /**
   * Records an application against an already-known Vacancy id. Always 201
   * (no idempotency key — applying to a vacancy already in the pipeline is a 422,
   * see the service). The application's id is the vacancy's.
   * The body is an envelope: { application, resolution, vacancyCreated } — the web
   * needs `resolution` in the JSON, not a header.
   */
  @Post()
  async record(
    @CurrentUserId() userId: string,
    @Body() dto: RecordApplicationDto,
    @CallerSource() source: CommentSource,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.applications.record(userId, dto, source);
    res.status(201);
    res.setHeader('Location', `/api/v1/applications/${result.application.id}`);
    return result;
  }

  /** `{ items, total, nextCursor }`; paged by `cursor` (ADR-0030). */
  @Get()
  list(@CurrentUserId() userId: string, @Query() query: ListApplicationsQueryDto) {
    return this.applications.list(userId, query);
  }

  @Get(':id')
  async getById(@CurrentUserId() userId: string, @Param('id', ParseIntPipe) id: number) {
    const application = await this.applications.getById(userId, id);
    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return application;
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationStatusDto,
    @CallerSource() source: CommentSource,
  ) {
    return this.applications.updateStatus(userId, id, dto.status, dto.comment, source);
  }

  @Patch(':id')
  update(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationDto,
    @CallerSource() source: CommentSource,
  ) {
    return this.applications.update(userId, id, dto, source);
  }
}
