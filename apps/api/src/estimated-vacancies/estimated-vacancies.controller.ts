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
} from '@nestjs/common';
import { ListEstimatedVacanciesQueryDto } from './dto/list-estimated-vacancies.dto';
import { SaveEstimatedVacancyDto } from './dto/save-estimated-vacancy.dto';
import { UpdateUserActionDto } from './dto/update-user-action.dto';

@Controller('estimated-vacancies')
export class EstimatedVacanciesController {
  constructor(private readonly vacancies: EstimatedVacancyService) {}

  /**
   * Idempotent by applyUrl: POSTing a vacancy that already exists returns the
   * stored record untouched (see the T6 decision) rather than creating a duplicate
   * or overwriting. Stays a POST — the id is server-assigned, so there's no
   * client-known URI to PUT to.
   */
  @Post()
  save(@Body() dto: SaveEstimatedVacancyDto) {
    return this.vacancies.save(dto);
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
