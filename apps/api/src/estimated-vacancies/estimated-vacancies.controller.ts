import { EstimatedVacancyService } from '@job-search-copilot/core';
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
import { ListEstimatedVacanciesQueryDto } from './dto/list-estimated-vacancies.dto';
import { SaveEstimatedVacancyDto } from './dto/save-estimated-vacancy.dto';
import { UpdateUserActionDto } from './dto/update-user-action.dto';

@Controller('estimated-vacancies')
export class EstimatedVacanciesController {
  constructor(private readonly vacancies: EstimatedVacancyService) {}

  /**
   * Idempotent by applyUrl (a vacancy is analyzed once — see the T6 decision):
   * a new vacancy → 201 + Location; an applyUrl that already exists → 200 and the
   * stored record untouched. Stays a POST — the id is server-assigned, so there's
   * no client-known URI to PUT to.
   */
  @Post()
  async save(@Body() dto: SaveEstimatedVacancyDto, @Res({ passthrough: true }) res: Response) {
    const { created, vacancy } = await this.vacancies.save(dto);
    if (created) {
      res.status(201);
      res.setHeader('Location', `/api/v1/estimated-vacancies/${vacancy.id}`);
    } else {
      res.status(200);
    }
    return vacancy;
  }

  @Get()
  list(@Query() query: ListEstimatedVacanciesQueryDto) {
    return this.vacancies.list(query);
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    const vacancy = await this.vacancies.getById(id);
    if (!vacancy) {
      throw new NotFoundException(`EstimatedVacancy ${id} not found`);
    }
    return vacancy;
  }

  @Patch(':id/user-action')
  async updateUserAction(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserActionDto) {
    const vacancy = await this.vacancies.updateUserAction(id, dto.userAction);
    if (!vacancy) {
      throw new NotFoundException(`EstimatedVacancy ${id} not found`);
    }
    return vacancy;
  }
}
