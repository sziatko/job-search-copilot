import { VacancyStatus } from '@job-search-copilot/core';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class UpdateApplicationStatusDto {
  /** Any status: the UI limits the moves, the API does not. */
  @IsEnum(VacancyStatus)
  status!: VacancyStatus;

  /** Added as a USER comment on the vacancy. */
  @IsOptional()
  @IsString()
  comment?: string;
}
