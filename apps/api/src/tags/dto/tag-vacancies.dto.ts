import { ANALYSIS_BATCH_MAX, TAGS_PER_VACANCY_MAX } from '@job-search-copilot/core';
import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * Tag names in a write, optional. More than a vacancy can hold is a 400 here, before any
 * query; a name's own rules and the limit counted with the vacancy's tags are core's 422.
 * Not @IsOptional, which lets `null` through to core, a 500.
 */
export function IsTagNames() {
  return applyDecorators(
    ValidateIf((_, value) => value !== undefined),
    IsArray(),
    ArrayMaxSize(TAGS_PER_VACANCY_MAX),
    IsString({ each: true }),
  );
}

export class TagVacanciesItemDto {
  // The cap: `lockVacancies` casts to bigint, so a number past it would be a 500. Past Int4
  // and under this is simply not found.
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  vacancyId!: number;

  /** A new name creates the tag. */
  @IsTagNames()
  add?: string[];

  /** An unknown name is ignored. Runs before `add`. */
  @IsTagNames()
  remove?: string[];
}

/** `POST /vacancies/tags` — all or none, in one transaction. */
export class TagVacanciesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ANALYSIS_BATCH_MAX)
  // @ValidateNested recurses into an array, so `[[{…}]]` would pass with no `vacancyId`.
  @IsObject({ each: true })
  @ValidateNested({ each: true })
  @Type(() => TagVacanciesItemDto)
  items!: TagVacanciesItemDto[];
}
