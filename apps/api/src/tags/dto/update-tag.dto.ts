import { TagTone } from '@job-search-copilot/core';
import { IsEnum, IsString, ValidateIf } from 'class-validator';

/** `PATCH /tags/:id`. A field left out is untouched. Not @IsOptional, which lets `null`
 * through: neither field has anything to clear to, so it would be a 500. */
export class UpdateTagDto {
  /** Blank or too long is core's 422, as in `CreateTagDto`. */
  @ValidateIf((dto) => dto.name !== undefined)
  @IsString()
  name?: string;

  @ValidateIf((dto) => dto.tone !== undefined)
  @IsEnum(TagTone)
  tone?: TagTone;
}
