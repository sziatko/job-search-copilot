import { MAX_LENGTH, Recommendation } from '@job-search-copilot/core';
import { IsEnum, IsInt, IsNotEmpty, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { HTTP_URL } from './intake-vacancies.dto';

export class SaveVacancyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LENGTH.name)
  company!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LENGTH.name)
  title!: string;

  /** As MCP's `.url()`: a non-link is a 400 here, not a synthetic `tracker://` row. */
  @IsUrl(HTTP_URL)
  applyUrl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LENGTH.fullText)
  fullText!: string;

  @IsInt()
  @Min(0)
  @Max(100)
  matchScore!: number;

  @IsEnum(Recommendation)
  recommendation!: Recommendation;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LENGTH.note)
  estimationComment!: string;
}
