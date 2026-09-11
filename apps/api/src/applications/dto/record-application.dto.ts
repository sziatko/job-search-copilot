import { ApplicationStatus } from '@job-search-copilot/core';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * The API only exposes the by-id path: the /vacancies page always knows the
 * EstimatedVacancy id of the row it is marking APPLIED. The by-(company,title)
 * find-or-create path is MCP / import only.
 */
export class RecordApplicationDto {
  @IsInt()
  @Min(1)
  estimatedVacancyId!: number;

  @IsOptional()
  @IsString()
  salaryInListing?: string;

  @IsOptional()
  @IsBoolean()
  usedTailoredResume?: boolean;

  @IsOptional()
  @IsString()
  userComment?: string;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;
}
