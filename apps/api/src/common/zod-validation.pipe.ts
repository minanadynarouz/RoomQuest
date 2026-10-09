import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Reusable Zod 4 validation pipe. Apply per-parameter:
 * `@Body(new ZodValidationPipe(LevelRequest))`.
 *
 * nestjs-zod is not used: it does not yet support zod 4 cleanly with Nest 11.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_REQUEST' as const,
          message: 'Validation failed',
          issues: parsed.error.issues,
        },
      });
    }
    return parsed.data;
  }
}
