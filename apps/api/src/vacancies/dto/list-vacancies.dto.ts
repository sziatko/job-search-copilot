import {
  Recommendation,
  VACANCY_SORTS,
  VacancySort,
  VacancyStatus,
} from '@job-search-copilot/core';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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

  /** Every row of this name's company, whatever its spelling (ADR-0032). */
  @IsOptional()
  @IsString()
  sameCompanyAs?: string;

  /** `true` / `false` — with or without posting text. Anything else is a 400. */
  @IsOptional()
  @Transform(({ value }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  hasText?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** The paging (ADR-0030): the previous page's `nextCursor`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;

  @IsOptional()
  @IsIn(VACANCY_SORTS)
  sort?: VacancySort;
}
