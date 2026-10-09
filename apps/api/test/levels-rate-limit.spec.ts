import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { LevelRequest } from '@roomquest/schema';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/create-app';
import { CACHE_MISS_LIMIT } from '../src/levels/rate-limit.constants';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440011';
const CLIENT_VERSION = '0.0.1';

interface RateLimitedBody {
  error: {
    code: string;
    message?: string;
    retryAfterS: number;
  };
}

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

describe('POST /api/v1/levels cache-miss rate limit', () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DIRECTOR_MODE', 'mock');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DIRECT_URL', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it(`returns 429 with retryAfterS on miss ${String(CACHE_MISS_LIMIT + 1)} from one device`, async () => {
    for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
      const body = LevelRequest.parse({
        graph: SYNTHETIC_LIVING_ROOM,
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        tier: 'easy',
      });
      await request(httpServer(app))
        .post('/api/v1/levels')
        .set('X-Device-Id', DEVICE_ID)
        .set('X-Client-Version', CLIENT_VERSION)
        .send(body)
        .expect(200);
    }

    const over = LevelRequest.parse({
      graph: SYNTHETIC_LIVING_ROOM,
      date: '2026-01-31',
      tier: 'easy',
    });
    const res = await request(httpServer(app))
      .post('/api/v1/levels')
      .set('X-Device-Id', DEVICE_ID)
      .set('X-Client-Version', CLIENT_VERSION)
      .send(over)
      .expect(429);

    const payload = res.body as RateLimitedBody;
    expect(payload.error.code).toBe('RATE_LIMITED');
    expect(payload.error.retryAfterS).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toBe(String(payload.error.retryAfterS));
  });
});
