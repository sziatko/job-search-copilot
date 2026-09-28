import { VacancyService } from '@job-search-copilot/core';
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
import { ListVacanciesQueryDto } from './dto/list-vacancies.dto';
import { SaveVacancyDto } from './dto/save-vacancy.dto';
import { UpdateVacancyStatusDto } from './dto/update-vacancy-status.dto';

@Controller('vacancies')
export class VacanciesController {
  constructor(private readonly vacancies: VacancyService) {}

  /**
   * Idempotent by applyUrl (a vacancy is analyzed once — see ADR-0005):
   * a new vacancy → 201 + Location; an applyUrl that already exists → 200 and the
   * stored record untouched. Stays a POST — the id is server-assigned, so there's
   * no client-known URI to PUT to.
   */
  @Post()
  async save(@Body() dto: SaveVacancyDto, @Res({ passthrough: true }) res: Response) {
    const { created, vacancy } = await this.vacancies.save(dto);
    if (created) {
      res.status(201);
      res.setHeader('Location', `/api/v1/vacancies/${vacancy.id}`);
    } else {
      res.status(200);
    }
    return vacancy;
  }

  /** `{ items, total, nextCursor }`; paged by `offset` or `cursor`, not both (ADR-0030). */
  @Get()
  list(@Query() query: ListVacanciesQueryDto) {
    if (query.cursor !== undefined && query.offset !== undefined) {
      throw new BadRequestException('cursor and offset cannot be combined');
    }
    return this.vacancies.list(query);
  }

  @Get(':id')
  async getById(@Param('id', ParseIntPipe) id: number) {
    const vacancy = await this.vacancies.getById(id);
    if (!vacancy) {
      throw new NotFoundException(`Vacancy ${id} not found`);
    }
    return vacancy;
  }

  @Patch(':id/status')
  async updateStatus(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVacancyStatusDto) {
    const vacancy = await this.vacancies.updateStatus(id, dto.status);
    if (!vacancy) {
      throw new NotFoundException(`Vacancy ${id} not found`);
    }
    return vacancy;
  }
}
