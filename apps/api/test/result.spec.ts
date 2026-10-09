import './cache-env';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import {
  LevelRequest,
  LevelResponse,
  ResultRequest,
  ResultResponse,
} from '@roomquest/schema';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { migrateTestDatabase, testDatabaseUrl } from './postgres';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440014';
const CLIENT_VERSION = '0.0.1';
const DATE = '2026-12-15';

const dbUrl = testDatabaseUrl();

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

function resultBody(planSource: ResultRequest['planSource'] = 'procedural') {
  return ResultRequest.parse({
    deviceId: DEVICE_ID,
    stars: 2,
    gems: 3,
    timeMs: 95_000,
    completed: true,
    planSource,
  });
}

describe.skipIf(dbUrl === undefined && process.env.CI !== 'true')(
  'POST /api/v1/levels/:cacheKey/result (postgres)',
  () => {
    let app!: INestApplication;

    beforeAll(async () => {
      const resolved = testDatabaseUrl();
      if (resolved === undefined) {
        throw new Error(
          'TEST_DATABASE_URL is required in CI (postgres:17 service on the test job)'
        );
      }
      migrateTestDatabase(resolved);
      app = await createApp();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
      vi.unstubAllEnvs();
    });

    beforeEach(async () => {
      const prisma = app.get(PrismaService);
      const client = prisma.getClient();
      if (client !== null) {
        await client.sessionResult.deleteMany();
        await client.levelCache.deleteMany();
      }
    });

    it('returns 201 { id } and persists the SessionResult', async () => {
      const level = await request(httpServer(app))
        .post('/api/v1/levels')
        .set('X-Device-Id', DEVICE_ID)
        .set('X-Client-Version', CLIENT_VERSION)
        .send(
          LevelRequest.parse({
            graph: SYNTHETIC_LIVING_ROOM,
            date: DATE,
            tier: 'easy',
          })
        )
        .expect(200);
      const parsedLevel = LevelResponse.parse(level.body as unknown);

      const res = await request(httpServer(app))
        .post(`/api/v1/levels/${parsedLevel.cacheKey}/result`)
        .send(resultBody(parsedLevel.source))
        .expect(201);
      const parsed = ResultResponse.parse(res.body as unknown);
      expect(parsed.id.length).toBeGreaterThan(0);

      const client = app.get(PrismaService).getClient();
      if (client === null) {
        throw new Error('expected a Prisma client in the postgres spec');
      }
      const row = await client.sessionResult.findUnique({
        where: { id: parsed.id },
      });
      expect(row).not.toBeNull();
      expect(row?.cacheKey).toBe(parsedLevel.cacheKey);
      expect(row?.deviceId).toBe(DEVICE_ID);
      expect(row?.stars).toBe(2);
      expect(row?.gems).toBe(3);
      expect(row?.completed).toBe(true);
      expect(row?.planSource).toBe(parsedLevel.source);
    });

    it('returns 404 UNKNOWN_LEVEL for an unknown cacheKey', async () => {
      const res = await request(httpServer(app))
        .post('/api/v1/levels/deadbeefdeadbeef/result')
        .send(resultBody())
        .expect(404);
      expect(res.body).toEqual({
        error: {
          code: 'UNKNOWN_LEVEL',
          message: 'Unknown cache key',
        },
      });
    });
  }
);
