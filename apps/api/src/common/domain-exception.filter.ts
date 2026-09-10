import { DomainError } from '@job-search-copilot/core';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Maps a @job-search-copilot/core DomainError (a caller mistake) to 422 instead of
 * letting it fall through to Nest's default 500. Registered globally in main.ts.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: DomainError, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    this.logger.warn(`${exception.name}: ${exception.message}`);
    res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      error: exception.name,
      message: exception.message,
    });
  }
}
