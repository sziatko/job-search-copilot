import { PIPELINE_STATUSES, type PipelineStatus } from '@job-search-copilot/core';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * The API only exposes the by-id path: the /vacancies page always knows the
 * Vacancy id of the row it is applying to. The by-(company,title) find-or-create
 * path is MCP only.
 */
export class RecordApplicationDto {
  @IsInt()
  @Min(1)
  vacancyId!: number;

  @IsOptional()
  @IsString()
  salaryInApplication?: string;

  @IsOptional()
  @IsBoolean()
  usedTailoredResume?: boolean;

  /** Added as a USER comment on the vacancy. */
  @IsOptional()
  @IsString()
  comment?: string;

  /** Where the application already is; APPLIED is journaled first either way. */
  @IsOptional()
  @IsIn(PIPELINE_STATUSES)
  status?: PipelineStatus;
}
