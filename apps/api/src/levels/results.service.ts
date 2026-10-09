import { Inject, Injectable } from '@nestjs/common';
import type { ResultRequest } from '@roomquest/schema';
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
    cacheKey: string,
    body: ResultRequest
  ): Promise<SubmitResultOutcome> {
    const inserted = await this.results.insert({ cacheKey, ...body });
    if (inserted.kind === 'unknown') {
      throw new UnknownLevelException();
    }
    if (inserted.kind === 'deferred') {
      return { stored: false };
    }
    return { stored: true, id: inserted.id };
  }
}
