import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Raw incoming headers for a ZodValidationPipe.
 *
 * Nest's `@Headers(pipe)` treats the first argument as a header name, so a
 * dedicated decorator is required to pipe the whole header map.
 */
export const RequestHeaders = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Request['headers'] => {
    return ctx.switchToHttp().getRequest<Request>().headers;
  }
);
