import {
  Recommendation,
  VACANCY_SORTS,
  VacancySort,
  VacancyStatus,
} from '@job-search-copilot/core';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListVacanciesQueryDto {
  @IsOptional()
  @IsEnum(Recommendation)
  recommendation?: Recommendation;

  /** `?status=A,B` — any of them. A repeated `?status=A&status=B` works too. */
  @IsOptional()
  @Transform(({ value }) => (value == null ? value : String(value).split(',')))
  @IsEnum(VacancyStatus, { each: true })
  status?: VacancyStatus[];

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  /** The web's paging (ADR-0030); not with `offset` — the controller 400s. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  @IsOptional()
  @IsIn(VACANCY_SORTS)
  sort?: VacancySort;
}
