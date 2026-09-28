import { PIPELINE_STATUSES, type PipelineStatus } from '@job-search-copilot/core';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListApplicationsQueryDto {
  @IsOptional()
  @IsIn(PIPELINE_STATUSES)
  status?: PipelineStatus;

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
}
