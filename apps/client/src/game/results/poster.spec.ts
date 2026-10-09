/**
 * Result poster tests - F-07
 * Mocked fetch; UI is never affected by status or throw.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { procLevelKey } from '@roomquest/schema';
import { DEFAULT_CLIENT_VERSION, LEVELS_PATH } from '../director/types.js';
import { createResultPoster, resolveLevelKey, type ResultFetch } from './poster.js';

const DEVICE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function jsonResponse(
  status: number,
  payload: unknown
): Awaited<ReturnType<ResultFetch>> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  };
}

describe('resolveLevelKey', () => {
  it('builds proc:<seed>:<tier> for procedural (client fallback) levels', () => {
    expect(
      resolveLevelKey({
        planSource: 'procedural',
        cacheKey: 'procedural:room-2026-10-09',
        seed: 'room-2026-10-09',
        tier: 'normal',
      })
    ).toBe('proc:room-2026-10-09:normal');
  });

  it('uses cacheKey for server levels', () => {
    expect(
      resolveLevelKey({
        planSource: 'llm',
        cacheKey: 'abcd1234abcd1234',
        seed: 'room-2026-10-09',
        tier: 'normal',
      })
    ).toBe('abcd1234abcd1234');
  });

  it('uses cacheKey for repaired server plans', () => {
    expect(
      resolveLevelKey({
        planSource: 'llm_repaired',
        cacheKey: 'from-api',
        seed: 'x',
        tier: 'easy',
      })
    ).toBe('from-api');
  });

  it('returns null when a procedural seed is missing', () => {
    expect(
      resolveLevelKey({
        planSource: 'procedural',
        cacheKey: null,
        seed: null,
      })
    ).toBeNull();
  });
});

describe('createResultPoster', () => {
  let fetchFn: ResultFetch;
  const calls: { url: string; init: Parameters<ResultFetch>[1] }[] = [];

  beforeEach(() => {
    calls.length = 0;
    fetchFn = vi.fn((url, init) => {
      calls.push({ url, init });
      return Promise.resolve(jsonResponse(201, { id: 'sess-1' }));
    });
  });

  function poster() {
    return createResultPoster({
      fetch: fetchFn,
      apiBaseUrl: 'https://api.example',
      deviceId: DEVICE,
      clientVersion: DEFAULT_CLIENT_VERSION,
    });
  }

  it('POSTs /api/v1/levels/:levelKey/result with director headers', async () => {
    await poster().post({
      levelKey: 'cache-1',
      deviceId: DEVICE,
      stars: 3,
      gems: 4,
      timeMs: 120_000,
      completed: true,
      planSource: 'llm',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://api.example${LEVELS_PATH}/cache-1/result`
    );
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers['X-Device-Id']).toBe(DEVICE);
    expect(calls[0]?.init.headers['X-Client-Version']).toBe(
      DEFAULT_CLIENT_VERSION
    );
    expect(JSON.parse(calls[0]?.init.body ?? '{}')).toEqual({
      deviceId: DEVICE,
      stars: 3,
      gems: 4,
      timeMs: 120_000,
      completed: true,
      planSource: 'llm',
    });
  });

  it('encodes a proc level key in the path', async () => {
    const key = procLevelKey('room-hash-2026-10-09', 'normal');
    await poster().post({
      levelKey: key,
      deviceId: DEVICE,
      stars: 0,
      gems: 1,
      timeMs: 8_000,
      completed: false,
      planSource: 'procedural',
    });
    expect(calls[0]?.url).toContain(encodeURIComponent(key));
  });

  it('always sends planSource "procedural" for a proc: key', async () => {
    const key = procLevelKey('room-2026-10-09', 'easy');
    await poster().post({
      levelKey: key,
      deviceId: DEVICE,
      stars: 2,
      gems: 1,
      timeMs: 12_000,
      completed: true,
      planSource: 'llm',
    });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.init.body ?? '{}')).toMatchObject({
      planSource: 'procedural',
    });
    expect(calls[0]?.url).toContain(encodeURIComponent(key));
  });

  it('clamps 0 ms up so the body stays schema-valid', async () => {
    await poster().post({
      levelKey: 'cache-1',
      deviceId: DEVICE,
      stars: 0,
      gems: 0,
      timeMs: 0,
      completed: false,
      planSource: 'cache',
    });
    expect(JSON.parse(calls[0]?.init.body ?? '{}').timeMs).toBe(1);
  });

  it('skips fetch when the body cannot be validated', async () => {
    await poster().post({
      levelKey: 'cache-1',
      deviceId: 'not-a-uuid',
      stars: 3,
      gems: 1,
      timeMs: 1000,
      completed: true,
      planSource: 'llm',
    });
    expect(calls).toHaveLength(0);
  });

  it('skips fetch when a proc: key is malformed', async () => {
    await poster().post({
      levelKey: 'proc:bad',
      deviceId: DEVICE,
      stars: 1,
      gems: 0,
      timeMs: 1000,
      completed: true,
      planSource: 'procedural',
    });
    expect(calls).toHaveLength(0);
  });

  it.each([
    [202, { stored: false }],
    [400, { error: { code: 'INVALID_REQUEST', message: 'nope' } }],
    [404, { error: { code: 'UNKNOWN_LEVEL', message: 'missing' } }],
    [429, { error: { code: 'RATE_LIMITED', message: 'slow' } }],
  ])('swallows HTTP %s', async (status, payload) => {
    fetchFn = vi.fn(() => Promise.resolve(jsonResponse(status, payload)));
    await expect(
      createResultPoster({
        fetch: fetchFn,
        apiBaseUrl: 'https://api.example',
        deviceId: DEVICE,
      }).post({
        levelKey: 'cache-1',
        deviceId: DEVICE,
        stars: 2,
        gems: 2,
        timeMs: 90_000,
        completed: true,
        planSource: 'cache',
      })
    ).resolves.toBeUndefined();
  });

  it('swallows network errors', async () => {
    fetchFn = vi.fn(() => Promise.reject(new Error('offline')));
    await expect(
      createResultPoster({
        fetch: fetchFn,
        apiBaseUrl: 'https://api.example',
        deviceId: DEVICE,
      }).post({
        levelKey: 'cache-1',
        deviceId: DEVICE,
        stars: 1,
        gems: 0,
        timeMs: 50_000,
        completed: false,
        planSource: 'procedural',
      })
    ).resolves.toBeUndefined();
  });
});
