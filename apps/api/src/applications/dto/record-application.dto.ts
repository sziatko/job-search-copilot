import { MAX_LENGTH, PIPELINE_STATUSES, type PipelineStatus } from '@job-search-copilot/core';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

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
  @MaxLength(MAX_LENGTH.name)
  salaryInApplication?: string;

  @IsOptional()
  @IsBoolean()
  usedTailoredResume?: boolean;

  /** Added as a comment on the vacancy: USER, or AGENT from an API key. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.note)
  comment?: string;

  /** Where the application already is; APPLIED is journaled first either way. */
  @IsOptional()
  @IsIn(PIPELINE_STATUSES)
  status?: PipelineStatus;
}
