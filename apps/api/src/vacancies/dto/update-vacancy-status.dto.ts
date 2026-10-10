import { VacancyStatus } from '@job-search-copilot/core';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateVacancyStatusDto {
  @IsEnum(VacancyStatus)
  status!: VacancyStatus;

  /** Added as a USER comment on the vacancy — Save for later's note. */
  @IsOptional()
  @IsString()
  comment?: string;
}
