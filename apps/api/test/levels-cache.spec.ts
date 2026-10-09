import './cache-env';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { generatePlan } from '@roomquest/level-core';
import {
  LevelRequest,
  LevelResponse,
  type SurfaceGraph,
} from '@roomquest/schema';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { makeDailySeed } from '../src/levels/daily-seed';
import { migrateTestDatabase, testDatabaseUrl } from './postgres';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440013';
const CLIENT_VERSION = '0.0.1';
const DATE = '2026-12-01';

const dbUrl = testDatabaseUrl();

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

function levelsPost(app: INestApplication) {
  return request(httpServer(app))
    .post('/api/v1/levels')
    .set('X-Device-Id', DEVICE_ID)
    .set('X-Client-Version', CLIENT_VERSION);
}

/** Same roomHash/ids (same cache key) but placements from the original plan fail. */
function invalidateSurfaces(graph: SurfaceGraph): SurfaceGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      label: 'floor',
      topHeight: 0,
      area: 0.05,
      size: [0.2, 0.2] as [number, number],
    })),
  };
}

describe.skipIf(dbUrl === undefined && process.env.CI !== 'true')(
  'POST /api/v1/levels cache (postgres)',
  () => {
    let app!: INestApplication;
    const url = dbUrl ?? '';

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

    it('returns source cache on a repeat request in under 300 ms warm', async () => {
      expect(url.length).toBeGreaterThan(0);
      const body = LevelRequest.parse({
        graph: SYNTHETIC_LIVING_ROOM,
        date: DATE,
        tier: 'easy',
      });

      const first = await levelsPost(app).send(body).expect(200);
      const firstParsed = LevelResponse.parse(first.body as unknown);
      expect(firstParsed.source).toBe('procedural');

      const second = await levelsPost(app).send(body).expect(200);
      const secondParsed = LevelResponse.parse(second.body as unknown);
      expect(secondParsed.source).toBe('cache');
      expect(secondParsed.plan).toEqual(firstParsed.plan);
      expect(secondParsed.latencyMs).toBeLessThan(300);
    });

    it('regenerates when a cached plan fails validatePlan against a changed graph', async () => {
      const original = LevelRequest.parse({
        graph: SYNTHETIC_LIVING_ROOM,
        date: DATE,
        tier: 'easy',
      });
      const first = await levelsPost(app).send(original).expect(200);
      expect(LevelResponse.parse(first.body as unknown).source).toBe(
        'procedural'
      );

      const changed = LevelRequest.parse({
        graph: invalidateSurfaces(SYNTHETIC_LIVING_ROOM),
        date: DATE,
        tier: 'easy',
      });
      const second = await levelsPost(app).send(changed).expect(200);
      const parsed = LevelResponse.parse(second.body as unknown);
      expect(parsed.source).not.toBe('cache');
      expect(parsed.source).toBe('procedural');
    });

    it('uses a different seed for a different date', async () => {
      const day1 = LevelRequest.parse({
        graph: SYNTHETIC_LIVING_ROOM,
        date: '2026-12-01',
        tier: 'easy',
      });
      const day2 = LevelRequest.parse({
        graph: SYNTHETIC_LIVING_ROOM,
        date: '2026-12-02',
        tier: 'easy',
      });
      const a = await levelsPost(app).send(day1).expect(200);
      const b = await levelsPost(app).send(day2).expect(200);
      const parsedA = LevelResponse.parse(a.body as unknown);
      const parsedB = LevelResponse.parse(b.body as unknown);
      expect(parsedA.cacheKey).not.toBe(parsedB.cacheKey);
      expect(parsedA.plan).toEqual(
        generatePlan(
          SYNTHETIC_LIVING_ROOM,
          makeDailySeed(SYNTHETIC_LIVING_ROOM.roomHash, day1.date),
          'easy'
        )
      );
      expect(parsedB.plan).toEqual(
        generatePlan(
          SYNTHETIC_LIVING_ROOM,
          makeDailySeed(SYNTHETIC_LIVING_ROOM.roomHash, day2.date),
          'easy'
        )
      );
      expect(parsedA.plan).not.toEqual(parsedB.plan);
    });
  }
);
