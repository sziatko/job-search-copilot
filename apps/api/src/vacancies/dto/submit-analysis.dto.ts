import { ANALYSIS_BATCH_MAX, MAX_LENGTH, Recommendation } from '@job-search-copilot/core';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsNestedItems } from '../../common/is-nested-items';
import { IsRowId } from '../../common/row-id';
import { IsTagNames } from '../../tags/dto/tag-vacancies.dto';

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
  @MaxLength(MAX_LENGTH.note)
  estimationComment!: string;

  /** Names to put on the vacancy; a bad one rejects the analysis too. */
  @IsTagNames()
  tags?: string[];
}

export class SubmitAnalysisItemDto extends SubmitAnalysisDto {
  @IsRowId()
  id!: number;
}

/** `POST /vacancies/analysis` — all or none, in one transaction. */
export class SubmitAnalysesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ANALYSIS_BATCH_MAX)
  @IsNestedItems(() => SubmitAnalysisItemDto)
  analyses!: SubmitAnalysisItemDto[];
}
