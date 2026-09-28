import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** Raw strings on purpose: core normalizes (ADR-0026). An entry whose url is missing
 * or not http(s) is skipped by core, not rejected here. */
class LogEntryDto {
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  title?: string;
}

export class CheckLogDto {
  // Same ceiling as the MCP batch tool: one transaction per call.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LogEntryDto)
  entries!: LogEntryDto[];
}
