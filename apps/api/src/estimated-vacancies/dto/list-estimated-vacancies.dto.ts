import { Recommendation, UserAction } from '@job-search-copilot/core';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListEstimatedVacanciesQueryDto {
  @IsOptional()
  @IsEnum(Recommendation)
  recommendation?: Recommendation;

  @IsOptional()
  @IsEnum(UserAction)
  userAction?: UserAction;

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
