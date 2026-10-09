import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  ResultLevelKey,
  isProcLevelKey,
  type ResultRequest,
} from '@roomquest/schema';
import { UnknownLevelException } from '../common/unknown-level.exception';
import { SessionResultRepository } from './session-result.repository';

export type SubmitResultOutcome =
  | { stored: true; id: string }
  | { stored: false };

@Injectable()
export class ResultsService {
  constructor(
    @Inject(SessionResultRepository)
    private readonly results: SessionResultRepository
  ) {}

  async submit(
    levelKey: string,
    body: ResultRequest
  ): Promise<SubmitResultOutcome> {
    const key = parseResultLevelKey(levelKey);
    if (isProcLevelKey(key) && body.planSource !== 'procedural') {
      throw new BadRequestException({
        error: {
          code: 'INVALID_REQUEST' as const,
          message: 'proc: keys require planSource "procedural"',
          issues: [],
        },
      });
    }

    const inserted = await this.results.insert({ levelKey: key, ...body });
    if (inserted.kind === 'unknown') {
      throw new UnknownLevelException();
    }
    if (inserted.kind === 'deferred') {
      return { stored: false };
    }
    return { stored: true, id: inserted.id };
  }
}

function parseResultLevelKey(levelKey: string): ResultLevelKey {
  const parsed = ResultLevelKey.safeParse(levelKey);
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
