import { MAX_LENGTH } from '@job-search-copilot/core';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** An http(s) link with its scheme, the only kind core stores (`normalizeApplyUrl`).
 * Limit: validator's 2083-character cap applies; set `validate_length: false` if a
 * collector's tracking links ever outgrow it. */
export const HTTP_URL = { protocols: ['http', 'https'], require_protocol: true };

const NOT_BLANK = '$property must not be blank';

/** Every field core needs is required here: core skips an entry without them (a blank
 * name too), which a caller would read as a duplicate (ADR-0033). */
class IntakeEntryDto {
  @IsUrl(HTTP_URL)
  url!: string;

  @IsString()
  @Matches(/\S/, { message: NOT_BLANK })
  @MaxLength(MAX_LENGTH.name)
  company!: string;

  @IsString()
  @Matches(/\S/, { message: NOT_BLANK })
  @MaxLength(MAX_LENGTH.name)
  title!: string;

  /** Where it was found (`justjoin`, `linkedin`, …). */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.name)
  source?: string;

  /** The posting text: stored on a new vacancy, or on a match that has none. */
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.fullText)
  fullText?: string;
}

/** `POST /vacancies/intake` — one transaction per call. */
export class IntakeVacanciesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => IntakeEntryDto)
  entries!: IntakeEntryDto[];
}
