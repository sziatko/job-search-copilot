import { VacancyStatus } from '@job-search-copilot/core';
import { IsEnum } from 'class-validator';

export class UpdateVacancyStatusDto {
  @IsEnum(VacancyStatus)
  status!: VacancyStatus;
}
