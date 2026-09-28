import { Recommendation, VacancyStatus } from '@job-search-copilot/core';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

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
}
