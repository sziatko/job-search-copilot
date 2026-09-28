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

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
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
}
