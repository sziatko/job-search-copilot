import {
  APPLICATION_STATES,
  type ApplicationState,
  PIPELINE_STATUSES,
  type PipelineStatus,
} from '@job-search-copilot/core';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListApplicationsQueryDto {
  @IsOptional()
  @IsIn(PIPELINE_STATUSES)
  status?: PipelineStatus;

  /** The derived Active / Timeout split (ADR-0031); ANDs with `status`. */
  @IsOptional()
  @IsIn(APPLICATION_STATES)
  state?: ApplicationState;

  @IsOptional()
  @IsString()
  search?: string;

  /** Every row of this name's company, whatever its spelling (ADR-0032). */
  @IsOptional()
  @IsString()
  sameCompanyAs?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;

  /** The paging (ADR-0030): the previous page's `nextCursor`. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cursor?: number;
}
