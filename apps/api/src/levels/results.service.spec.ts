import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { procLevelKey, type ResultRequest } from '@roomquest/schema';
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
): Promise<{ service: ResultsService; insert: typeof insert }> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ResultsService,
      { provide: SessionResultRepository, useValue: { insert } },
    ],
  }).compile();
  return { service: moduleRef.get(ResultsService), insert };
}

describe('ResultsService', () => {
  it('returns { stored:true, id } when the row is inserted', async () => {
    const { service } = await serviceWith(
      vi.fn(() => Promise.resolve({ kind: 'stored' as const, id: 'res_1' }))
    );
    await expect(service.submit('abc123def4567890', body)).resolves.toEqual({
      stored: true,
      id: 'res_1',
    });
  });

  it('returns { stored:false } when there is no database', async () => {
    const { service } = await serviceWith(
      vi.fn(() => Promise.resolve({ kind: 'deferred' as const }))
    );
    await expect(service.submit('abc123def4567890', body)).resolves.toEqual({
      stored: false,
    });
  });

  it('throws UNKNOWN_LEVEL when the cache key is missing', async () => {
    const { service } = await serviceWith(
      vi.fn(() => Promise.resolve({ kind: 'unknown' as const }))
    );
    await expect(service.submit('missing-key', body)).rejects.toBeInstanceOf(
      UnknownLevelException
    );
  });

  it('stores a proc: key without treating it as unknown', async () => {
    const insert = vi.fn(() =>
      Promise.resolve({ kind: 'stored' as const, id: 'res_proc' })
    );
    const { service } = await serviceWith(insert);
    const key = procLevelKey('f1a2b3c4d5e6-2026-10-14', 'easy');
    await expect(service.submit(key, body)).resolves.toEqual({
      stored: true,
      id: 'res_proc',
    });
    expect(insert).toHaveBeenCalledWith({
      ...body,
      levelKey: key,
    });
  });

  it('returns 400 when a proc: key is used with a non-procedural planSource', async () => {
    const insert = vi.fn(() =>
      Promise.resolve({ kind: 'stored' as const, id: 'nope' })
    );
    const { service } = await serviceWith(insert);
    const key = procLevelKey('seed-1', 'normal');
    await expect(
      service.submit(key, { ...body, planSource: 'llm' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(insert).not.toHaveBeenCalled();
  });

  it('returns 400 for a malformed proc: key', async () => {
    const insert = vi.fn(() =>
      Promise.resolve({ kind: 'stored' as const, id: 'nope' })
    );
    const { service } = await serviceWith(insert);
    await expect(service.submit('proc:not-a-tier', body)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(insert).not.toHaveBeenCalled();
  });
});
