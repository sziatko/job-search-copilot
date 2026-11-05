import { MAX_LENGTH } from '@job-search-copilot/core';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';
import { IsNestedItems } from '../../common/is-nested-items';
import { IsRowId } from '../../common/row-id';

export class MarkUnavailableItemDto {
  @IsRowId()
  id!: number;

  /** Why the posting is gone ("LinkedIn: no longer accepting applications"); the comment. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_LENGTH.note)
  reason!: string;
}

/** `POST /vacancies/unavailable` — one transaction; a row out of the queue is skipped. */
export class MarkUnavailableDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsNestedItems(() => MarkUnavailableItemDto)
  items!: MarkUnavailableItemDto[];
}
