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
  async record(@Body() dto: RecordApplicationDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.applications.record(dto);
    res.status(201);
    res.setHeader('Location', `/api/v1/applications/${result.application.id}`);
    return result;
  }

  /** `{ items, total, nextCursor }`; paged by `offset` or `cursor`, not both (ADR-0030). */
  @Get()
  list(@Query() query: ListApplicationsQueryDto) {
    if (query.cursor !== undefined && query.offset !== undefined) {
      throw new BadRequestException('cursor and offset cannot be combined');
    }
    return this.applications.list(query);
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    const application = await this.applications.getById(id);
    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return application;
  }

  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationStatusDto,
  ) {
    const application = await this.applications.updateStatus(id, dto.status, dto.comment, 'USER');
    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return application;
  }

  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateApplicationDto) {
    const application = await this.applications.update(id, dto);
    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return application;
  }
}
