import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitedException } from './rate-limited.exception';

interface ErrorEnvelope {
  error: {
    code: string;
    message?: string;
    issues?: unknown;
    retryAfterS?: unknown;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }
  return typeof value.error.code === 'string';
}

function isPayloadTooLarge(exception: unknown): boolean {
  return isRecord(exception) && exception.type === 'entity.too.large';
}

/**
 * Maps Nest / Express errors onto the architecture §6 envelope.
 * 400: `{error:{code,message,issues}}`
 * 500: `{error:{code:'INTERNAL'}}` with no stack, no message.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (isPayloadTooLarge(exception)) {
      response.status(413).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request body exceeds 16 KB limit',
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      if (status === 429) {
        writeRateLimited(response, body, exception);
        return;
      }

      if (isErrorEnvelope(body)) {
        response.status(status).json(body);
        return;
      }

      if (status >= 500) {
        this.logger.error(exception.message, exception.stack);
        response.status(500).json({
          error: { code: 'INTERNAL' },
        });
        return;
      }

      const message =
        typeof body === 'string'
          ? body
          : isRecord(body) && typeof body.message === 'string'
            ? body.message
            : exception.message;

      response.status(status).json({
        error: {
          code: status === 400 ? 'INVALID_REQUEST' : 'INTERNAL',
          message,
          ...(status === 400 ? { issues: [] } : {}),
        },
      });
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.message : 'Unhandled exception',
      exception instanceof Error ? exception.stack : undefined
    );
    response.status(500).json({
      error: { code: 'INTERNAL' },
    });
  }
}

function writeRateLimited(
  response: Response,
  body: unknown,
  exception: HttpException
): void {
  const retryAfterS = retryAfterSeconds(body, exception, response);
  response.setHeader('Retry-After', String(retryAfterS));
  if (isErrorEnvelope(body) && isRecord(body.error)) {
    const error = {
      code: 'RATE_LIMITED',
      message:
        typeof body.error.message === 'string'
          ? body.error.message
          : 'Too many requests',
      retryAfterS,
    };
    response.status(HttpStatus.TOO_MANY_REQUESTS).json({ error });
    return;
  }
  response.status(HttpStatus.TOO_MANY_REQUESTS).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      retryAfterS,
    },
  });
}

function retryAfterSeconds(
  body: unknown,
  exception: HttpException,
  response: Response
): number {
  if (exception instanceof RateLimitedException) {
    return exception.retryAfterS;
  }
  if (isErrorEnvelope(body) && isRecord(body.error)) {
    const value = body.error.retryAfterS;
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      return Math.ceil(value);
    }
  }
  const header = response.getHeader('Retry-After');
  if (typeof header === 'string') {
    const parsed = Number.parseInt(header, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  if (typeof header === 'number' && Number.isFinite(header) && header >= 0) {
    return Math.ceil(header);
  }
  return 3600;
}
