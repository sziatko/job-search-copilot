import { MAX_LENGTH, VacancyStatus } from '@job-search-copilot/core';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateApplicationStatusDto {
  /** Any status: the UI limits the moves, the API does not. */
  @IsEnum(VacancyStatus)
  status!: VacancyStatus;

  /** Added as a comment on the vacancy: USER, or AGENT from an API key. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.note)
  comment?: string;
}
