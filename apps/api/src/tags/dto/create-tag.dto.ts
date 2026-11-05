import { TagTone } from '@job-search-copilot/core';
import { IsEnum, IsString, ValidateIf } from 'class-validator';

/** `POST /tags`. */
export class CreateTagDto {
  /** Blank or too long is core's 422 (`parseTagName`): it measures the tidied name. */
  @IsString()
  name!: string;

  /** Default `GREY`. Not @IsOptional, which lets `null` through, a 500. */
  @ValidateIf((dto) => dto.tone !== undefined)
  @IsEnum(TagTone)
  tone?: TagTone;
}
