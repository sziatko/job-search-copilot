import { MAX_LENGTH } from '@job-search-copilot/core';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** The apply modal's fields, re-opened for editing. A field left out is untouched;
 * `null` or a blank string clears it (ApplicationService.update). `comment` is not a
 * field: a non-blank one is added as a comment — USER, or AGENT from an API key. */
export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.name)
  salaryInApplication?: string | null;

  @IsOptional()
  @IsBoolean()
  usedTailoredResume?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.note)
  comment?: string | null;
}
