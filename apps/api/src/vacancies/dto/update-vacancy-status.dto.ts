import { MAX_LENGTH, VacancyStatus } from '@job-search-copilot/core';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVacancyStatusDto {
  @IsEnum(VacancyStatus)
  status!: VacancyStatus;

  /** Added as a comment on the vacancy — Save for later's note. USER, or AGENT from an
   * API key. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.note)
  comment?: string;
}
