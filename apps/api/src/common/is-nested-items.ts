import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsObject, ValidateNested } from 'class-validator';

/** A batch's items. `@ValidateNested` recurses into an array, so without `@IsObject` an
 * item `[[{…}]]` would pass with every field unread. */
export function IsNestedItems(dto: () => new () => object) {
  return applyDecorators(IsObject({ each: true }), ValidateNested({ each: true }), Type(dto));
}
