import { MAX_LENGTH } from '@job-search-copilot/core';
import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

/** The apply modal's fields, re-opened for editing. A field left out is untouched;
 * `null` or a blank string clears the salary (ApplicationService.update). `comment` is not a
 * field: a non-blank one is added as a comment — USER, or AGENT from an API key. */
export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.name)
  salaryInApplication?: string | null;

  // Not @IsOptional, which lets `null` through: a flag has nothing to clear to, and the
  // column is NOT NULL, so it would reach Prisma and be a 500.
  @ValidateIf((dto) => dto.usedTailoredResume !== undefined)
  @IsBoolean()
  usedTailoredResume?: boolean;

  @ValidateIf((dto) => dto.sentCoverLetter !== undefined)
  @IsBoolean()
  sentCoverLetter?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_LENGTH.note)
  comment?: string | null;
}
