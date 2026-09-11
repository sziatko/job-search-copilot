import { ApplicationStatus } from '@job-search-copilot/core';
import { IsEnum } from 'class-validator';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status!: ApplicationStatus;
}
