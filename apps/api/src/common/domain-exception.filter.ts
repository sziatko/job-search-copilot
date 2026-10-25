import {
  AlreadyAnalysedError,
  DomainError,
  RateLimitedError,
  VacancyNotFoundError,
} from '@job-search-copilot/core';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/** The DomainErrors that are not a 422. */
const STATUS_OF = new Map<unknown, HttpStatus>([
  [AlreadyAnalysedError, HttpStatus.CONFLICT],
  [VacancyNotFoundError, HttpStatus.NOT_FOUND],
  // Thrown by ApiKeyGuard's verifyApiKey: filters catch a guard's exceptions too.
  [RateLimitedError, HttpStatus.TOO_MANY_REQUESTS],
]);

/**
 * Maps a @job-search-copilot/core DomainError (a caller mistake) to a client error —
 * 422 unless STATUS_OF says otherwise — instead of letting it fall through to Nest's
 * default 500. Registered globally in setup-app.ts.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const status = STATUS_OF.get(exception.constructor) ?? HttpStatus.UNPROCESSABLE_ENTITY;
    this.logger.warn(`${exception.name}: ${exception.message}`);
    res.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }
}
