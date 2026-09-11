import { ApplicationService } from '@job-search-copilot/core';
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
} from '@nestjs/common';
import type { Response } from 'express';
import { ListApplicationsQueryDto } from './dto/list-applications.dto';
import { RecordApplicationDto } from './dto/record-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationService) {}

  /**
   * Records an application against an already-known EstimatedVacancy id. Always 201
   * (no idempotency key — re-applying to the same vacancy is a 422, see the service).
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

  @Get()
  list(@Query() query: ListApplicationsQueryDto) {
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
    const application = await this.applications.updateStatus(id, dto.status);
    if (!application) {
      throw new NotFoundException(`Application ${id} not found`);
    }
    return application;
  }
}
