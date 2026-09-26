import { IsBoolean, IsOptional, IsString } from 'class-validator';

/** The apply modal's fields, re-opened for editing. A field left out is untouched;
 * `null` or a blank string clears it (ApplicationService.update). */
export class UpdateApplicationDto {
  @IsOptional()
  @IsString()
  salaryInListing?: string | null;

  @IsOptional()
  @IsBoolean()
  usedTailoredResume?: boolean;

  @IsOptional()
  @IsString()
  userComment?: string | null;
}
