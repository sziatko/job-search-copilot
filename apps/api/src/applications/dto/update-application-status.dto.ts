import { ApplicationStatus } from '@job-search-copilot/core';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;

  /** Added to the application's timeline as a new Comment row (ADR-0028). */
  @IsOptional()
  @IsString()
  statusComment?: string;
}
