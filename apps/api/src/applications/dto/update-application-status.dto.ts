import { ApplicationStatus } from '@job-search-copilot/core';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;

  /** Appended to the existing statusComment (joined with " / "), not overwritten. */
  @IsOptional()
  @IsString()
  statusComment?: string;
}
