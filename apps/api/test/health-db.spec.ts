import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/create-app';

interface HealthBody {
  status: string;
  version: string;
  db: string;
  llm: string;
  time: string;
}

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

describe('GET /api/health without DATABASE_URL', () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it("boots and reports db:'disabled'", async () => {
    const res = await request(httpServer(app)).get('/api/health').expect(200);
    const body = res.body as HealthBody;
    expect(body.status).toBe('ok');
    expect(body.db).toBe('disabled');
    expect(body.version.length).toBeGreaterThan(0);
  });

  it('POST /api/v1/levels/:cacheKey/result returns 202 stored:false', async () => {
    const res = await request(httpServer(app))
      .post('/api/v1/levels/0123456789abcdef/result')
      .send({
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        stars: 1,
        gems: 0,
        timeMs: 1_000,
        completed: false,
        planSource: 'procedural',
      });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ stored: false });
  });
});

describe('GET /api/health with DATABASE_URL pointing at a closed port', () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'test');
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:1/roomquest';
    process.env.DIRECT_URL =
      'postgresql://postgres:postgres@127.0.0.1:1/roomquest';
    app = await createApp();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it("boots and reports db:'down' without throwing", async () => {
    const res = await request(httpServer(app)).get('/api/health').expect(200);
    const body = res.body as HealthBody;
    expect(body.status).toBe('ok');
    expect(body.db).toBe('down');
  });

  it('still serves mock POST /api/v1/levels', async () => {
    const res = await request(httpServer(app))
      .post('/api/v1/levels')
      .set('X-Device-Id', '550e8400-e29b-41d4-a716-446655440000')
      .set('X-Client-Version', '0.0.1')
      .send({
        graph: {
          version: 1,
          roomHash: 'f1a2b3c4d5e6',
          mode: 'scene',
          floorY: 0,
          nodes: [
            {
              id: 's1',
              label: 'table',
              kind: 'plane',
              topHeight: 0.75,
              centroid: [0, 0.75, 0],
              size: [1, 1],
              yaw: 0,
              area: 1,
              reach: 'hand',
              angleFromForward: 0,
            },
            {
              id: 's2',
              label: 'couch',
              kind: 'plane',
              topHeight: 0.45,
              centroid: [2, 0.45, 0],
              size: [2, 0.9],
              yaw: 0,
              area: 1.8,
              reach: 'ray',
              angleFromForward: 30,
            },
          ],
          edges: [],
        },
        date: '2026-10-14',
        tier: 'easy',
      });
    expect(res.status).toBe(200);
    expect((res.body as { source: string }).source).toBe('procedural');
  });

  it('POST /api/v1/levels/:cacheKey/result returns 202 without throwing', async () => {
    const res = await request(httpServer(app))
      .post('/api/v1/levels/0123456789abcdef/result')
      .send({
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        stars: 1,
        gems: 0,
        timeMs: 1_000,
        completed: false,
        planSource: 'procedural',
      });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ stored: false });
  });
});
