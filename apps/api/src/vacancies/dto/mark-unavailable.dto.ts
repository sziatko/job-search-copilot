import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class MarkUnavailableItemDto {
  @IsInt()
  @Min(1)
  id!: number;

  /** Why the posting is gone ("LinkedIn: no longer accepting applications"); the comment. */
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

/** `POST /vacancies/unavailable` — one transaction; a row out of the queue is skipped. */
export class MarkUnavailableDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => MarkUnavailableItemDto)
  items!: MarkUnavailableItemDto[];
}
