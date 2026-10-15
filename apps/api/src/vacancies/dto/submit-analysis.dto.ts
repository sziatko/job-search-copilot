import { ANALYSIS_BATCH_MAX, Recommendation } from '@job-search-copilot/core';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** `POST /vacancies/:id/analysis` — the id is the path's. */
export class SubmitAnalysisDto {
  @IsInt()
  @Min(0)
  @Max(100)
  matchScore!: number;

  @IsEnum(Recommendation)
  recommendation!: Recommendation;

  /** Stored as the ANALYZER comment. */
  @IsString()
  @IsNotEmpty()
  estimationComment!: string;
}

export class SubmitAnalysisItemDto extends SubmitAnalysisDto {
  @IsInt()
  @Min(1)
  id!: number;
}

/** `POST /vacancies/analysis` — all or none, in one transaction. */
export class SubmitAnalysesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ANALYSIS_BATCH_MAX)
  @ValidateNested({ each: true })
  @Type(() => SubmitAnalysisItemDto)
  analyses!: SubmitAnalysisItemDto[];
}
