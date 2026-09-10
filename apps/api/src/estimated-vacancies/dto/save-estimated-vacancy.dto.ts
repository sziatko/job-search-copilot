import { RECOMMENDATION_INPUT_VALUES } from '@job-search-copilot/core';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class SaveEstimatedVacancyDto {
  @IsString()
  @IsNotEmpty()
  company!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  applyUrl!: string;

  @IsString()
  @IsNotEmpty()
  fullText!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  matchScore!: number;

  /** Accepts the canonical English value or its Ukrainian equivalent — normalized in EstimatedVacancyService.save(). */
  @IsIn(RECOMMENDATION_INPUT_VALUES)
  recommendation!: string;

  @IsString()
  @IsNotEmpty()
  estimationComment!: string;
}
