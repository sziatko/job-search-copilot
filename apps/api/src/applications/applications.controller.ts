import { ApplicationService } from '@job-search-copilot/core';
import {
  BadRequestException,
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
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUserId } from '../auth/api-key.guard';
import { ListApplicationsQueryDto } from './dto/list-applications.dto';
import { RecordApplicationDto } from './dto/record-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@Controller('applications')
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
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.applications.record(userId, dto);
    res.status(201);
    res.setHeader('Location', `/api/v1/applications/${result.application.id}`);
    return result;
  }

  /** `{ items, total, nextCursor }`; paged by `offset` or `cursor`, not both (ADR-0030). */
  @Get()
  list(@CurrentUserId() userId: string, @Query() query: ListApplicationsQueryDto) {
    if (query.cursor !== undefined && query.offset !== undefined) {
      throw new BadRequestException('cursor and offset cannot be combined');
    }
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
  async updateStatus(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    const application = await this.applications.updateStatus(
      userId,
      id,
      dto.status,
      dto.comment,
      'USER',
    );
    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return application;
  }

  @Patch(':id')
  async update(
    @CurrentUserId() userId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationDto,
  ) {
    const application = await this.applications.update(userId, id, dto);
    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return application;
  }
}
