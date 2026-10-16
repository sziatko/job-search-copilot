import { Recommendation } from '@job-search-copilot/core';
import { IsEnum, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min } from 'class-validator';
import { HTTP_URL } from './intake-vacancies.dto';

export class SaveVacancyDto {
  @IsString()
  @IsNotEmpty()
  company!: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  /** As MCP's `.url()`: a non-link is a 400 here, not a synthetic `tracker://` row. */
  @IsUrl(HTTP_URL)
  applyUrl!: string;

  @IsString()
  @IsNotEmpty()
  fullText!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  matchScore!: number;

  @IsEnum(Recommendation)
  recommendation!: Recommendation;

  @IsString()
  @IsNotEmpty()
  estimationComment!: string;
}
