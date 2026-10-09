import { Test } from '@nestjs/testing';
import type { ResultRequest } from '@roomquest/schema';
import { describe, expect, it, vi } from 'vitest';
import { UnknownLevelException } from '../common/unknown-level.exception';
import { ResultsService } from './results.service';
import { SessionResultRepository } from './session-result.repository';

const body: ResultRequest = {
  deviceId: '550e8400-e29b-41d4-a716-446655440000',
  stars: 2,
  gems: 3,
  timeMs: 90_000,
  completed: true,
  planSource: 'procedural',
};

async function serviceWith(
  insert: SessionResultRepository['insert']
): Promise<ResultsService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ResultsService,
      { provide: SessionResultRepository, useValue: { insert } },
    ],
  }).compile();
  return moduleRef.get(ResultsService);
}

describe('ResultsService', () => {
  it('returns { stored:true, id } when the row is inserted', async () => {
    const service = await serviceWith(
      vi.fn(() => Promise.resolve({ kind: 'stored' as const, id: 'res_1' }))
    );
    await expect(service.submit('abc123def4567890', body)).resolves.toEqual({
      stored: true,
      id: 'res_1',
    });
  });

  it('returns { stored:false } when there is no database', async () => {
    const service = await serviceWith(
      vi.fn(() => Promise.resolve({ kind: 'deferred' as const }))
    );
    await expect(service.submit('abc123def4567890', body)).resolves.toEqual({
      stored: false,
    });
  });

  it('throws UNKNOWN_LEVEL when the cache key is missing', async () => {
    const service = await serviceWith(
      vi.fn(() => Promise.resolve({ kind: 'unknown' as const }))
    );
    await expect(service.submit('missing-key', body)).rejects.toBeInstanceOf(
      UnknownLevelException
    );
  });
});
