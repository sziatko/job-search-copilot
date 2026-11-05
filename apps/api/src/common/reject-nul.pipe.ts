import { type ArgumentMetadata, BadRequestException, type PipeTransform } from '@nestjs/common';

const hasNul = (value: unknown): boolean =>
  typeof value === 'string'
    ? value.includes('\0')
    : typeof value === 'object' && value !== null && Object.values(value).some(hasNul);

/** A NUL in any string of a body or a query is a 400: Postgres refuses it, a 500. A custom
 * parameter (`CurrentUserId`, `CallerSource`) is the server's own, not input. */
export class RejectNulPipe implements PipeTransform {
  transform(value: unknown, { type }: ArgumentMetadata) {
    if ((type === 'body' || type === 'query') && hasNul(value)) {
      throw new BadRequestException('A string must not hold a NUL character');
    }
    return value;
  }
}
