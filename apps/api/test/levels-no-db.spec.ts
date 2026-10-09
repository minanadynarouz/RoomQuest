import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { LevelRequest, LevelResponse } from '@roomquest/schema';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/create-app';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440012';
const CLIENT_VERSION = '0.0.1';

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

const body = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-03-01',
  tier: 'easy',
});

describe('POST /api/v1/levels without a database', () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('DIRECTOR_MODE', 'mock');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('DIRECT_URL', '');
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('still serves 200', async () => {
    const res = await request(httpServer(app))
      .post('/api/v1/levels')
      .set('X-Device-Id', DEVICE_ID)
      .set('X-Client-Version', CLIENT_VERSION)
      .send(body)
      .expect(200);
    const parsed = LevelResponse.parse(res.body as unknown);
    expect(parsed.source).toBe('procedural');
  });
});
