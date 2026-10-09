import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { LevelRequest } from '@roomquest/schema';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/create-app';
import { DIRECTOR_RUNTIME } from '../src/director/models';
import {
  CACHE_MISS_LIMIT,
  CACHE_MISS_WINDOW_MS,
} from '../src/levels/rate-limit.constants';

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

function levelsPost(app: INestApplication, date: string) {
  const body = LevelRequest.parse({
    graph: SYNTHETIC_LIVING_ROOM,
    date,
    tier: 'easy',
  });
  return request(httpServer(app))
    .post('/api/v1/levels')
    .set('X-Device-Id', DEVICE_ID)
    .set('X-Client-Version', CLIENT_VERSION)
    .send(body);
}

describe('POST /api/v1/levels cache-miss rate limit', () => {
  let app: NestExpressApplication;
  let nowMs = 0;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DIRECTOR_MODE', 'mock');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DIRECT_URL', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DIRECTOR_RUNTIME)
      .useValue({ now: () => nowMs })
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      bodyParser: false,
    });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it(`returns 429 with retryAfterS on miss ${String(CACHE_MISS_LIMIT + 1)}, then allows after the hour`, async () => {
    for (let i = 0; i < CACHE_MISS_LIMIT; i += 1) {
      await levelsPost(app, `2026-01-${String(i + 1).padStart(2, '0')}`).expect(
        200
      );
    }

    const res = await levelsPost(app, '2026-01-31').expect(429);
    const payload = res.body as RateLimitedBody;
    expect(payload.error.code).toBe('RATE_LIMITED');
    expect(payload.error.retryAfterS).toBe(3600);
    expect(res.headers['retry-after']).toBe('3600');

    nowMs += CACHE_MISS_WINDOW_MS;
    await levelsPost(app, '2026-02-01').expect(200);
  });
});
