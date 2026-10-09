import './health-up-env';
import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { LevelRequest, LevelResponse } from '@roomquest/schema';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/create-app';
import { migrateTestDatabase, testDatabaseUrl } from './postgres';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440015';
const CLIENT_VERSION = '0.0.1';

const dbUrl = testDatabaseUrl();

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

describe.skipIf(dbUrl === undefined && process.env.CI !== 'true')(
  'GET /api/health with a reachable database',
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

    it("reports db:'up' and GIT_SHA as version", async () => {
      const res = await request(httpServer(app)).get('/api/health').expect(200);
      const body = res.body as {
        status: string;
        version: string;
        db: string;
      };
      expect(body.status).toBe('ok');
      expect(body.db).toBe('up');
      expect(body.version).toBe('b09testsha');
    });

    it('still serves POST /api/v1/levels', async () => {
      const res = await request(httpServer(app))
        .post('/api/v1/levels')
        .set('X-Device-Id', DEVICE_ID)
        .set('X-Client-Version', CLIENT_VERSION)
        .send(
          LevelRequest.parse({
            graph: SYNTHETIC_LIVING_ROOM,
            date: '2026-12-16',
            tier: 'easy',
          })
        )
        .expect(200);
      expect(LevelResponse.parse(res.body as unknown).source).toBe(
        'procedural'
      );
    });
  }
);
