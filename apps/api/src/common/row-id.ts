import { INT4_MAX } from '@job-search-copilot/core';
import { type ArgumentMetadata, applyDecorators, ParseIntPipe } from '@nestjs/common';
import { IsInt, Max, Min } from 'class-validator';

/**
 * A row's id on a path. Past Int4 Postgres refuses it, a 500, so it is malformed like `abc`.
 * The global `ValidationPipe` has already applied `+value`: `abc` arrives as NaN, `1e3` as
 * 1000, and `0` or `-1` are ids that simply do not exist, a 404.
 */
export class ParseIdPipe extends ParseIntPipe {
  override async transform(value: unknown, metadata: ArgumentMetadata) {
    const id = (await super.transform(value, metadata)) as number;
    if (Math.abs(id) > INT4_MAX) throw this.exceptionFactory('Validation failed (id past Int4)');
    return id;
  }
}

/** A row's id in a body or a query; see `ParseIdPipe`. */
export function IsRowId() {
  return applyDecorators(IsInt(), Min(1), Max(INT4_MAX));
}
