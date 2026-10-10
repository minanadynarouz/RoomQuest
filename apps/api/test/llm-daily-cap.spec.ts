import './llm-daily-cap-env';
import type { Server } from 'node:http';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import {
  LevelRequest,
  LevelResponse,
  type SurfaceGraph,
} from '@roomquest/schema';
import { Logger } from 'nestjs-pino';
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
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/create-app';
import {
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
  type DirectorChatFactory,
} from '../src/director/models';
import { planToLlmJson } from '../src/director/test-fakes';
import { PrismaService } from '../src/prisma/prisma.service';
import { migrateTestDatabase, testDatabaseUrl } from './postgres';

const CLIENT_VERSION = '0.0.1';
const DATE = '2026-10-10';
const MAX = 5;

const dbUrl = testDatabaseUrl();
const validJson = planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN);

function httpServer(app: NestExpressApplication): Server {
  return app.getHttpServer();
}

function deviceId(n: number): string {
  return `550e8400-e29b-41d4-a716-${(0x446655440000 + n).toString(16)}`;
}

function levelsPost(app: NestExpressApplication, n: number) {
  return request(httpServer(app))
    .post('/api/v1/levels')
    .set('X-Device-Id', deviceId(n))
    .set('X-Client-Version', CLIENT_VERSION);
}

function graphWithHash(roomHash: string): SurfaceGraph {
  return { ...SYNTHETIC_LIVING_ROOM, roomHash };
}

function levelBody(roomHash: string, date = DATE): LevelRequest {
  return LevelRequest.parse({
    graph: graphWithHash(roomHash),
    date,
    tier: 'easy',
  });
}

function hashFor(n: number): string {
  return `c0de${n.toString(16).padStart(8, '0')}`;
}

describe.skipIf(dbUrl === undefined && process.env.CI !== 'true')(
  'POST /api/v1/levels daily Gemini cap (postgres)',
  () => {
    let app!: NestExpressApplication;
    let nowMs = Date.UTC(2026, 9, 10, 12, 0, 0);
    const createPrimary = vi.fn(() => {
      return new FakeListChatModel({ responses: [validJson] });
    });

    beforeAll(async () => {
      const resolved = testDatabaseUrl();
      if (resolved === undefined) {
        throw new Error(
          'TEST_DATABASE_URL is required in CI (postgres:17 service on the test job)'
        );
      }
      migrateTestDatabase(resolved);

      const factory: DirectorChatFactory = { createPrimary };
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(DIRECTOR_CHAT_FACTORY)
        .useValue(factory)
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
      delete process.env.GOOGLE_API_KEY;
      delete process.env.LLM_DAILY_MAX;
      delete process.env.DATABASE_URL;
      delete process.env.DIRECT_URL;
      process.env.DIRECTOR_MODE = 'mock';
      vi.unstubAllEnvs();
    });

    beforeEach(async () => {
      nowMs = Date.UTC(2026, 9, 10, 12, 0, 0);
      createPrimary.mockClear();
      const prisma = app.get(PrismaService);
      const client = prisma.getClient();
      if (client !== null) {
        await client.sessionResult.deleteMany();
        await client.levelCache.deleteMany();
        await client.llmDailyUsage.deleteMany();
      }
    });

    it('skips Gemini after the UTC daily cap and reports quota-cooldown', async () => {
      for (let i = 0; i < MAX; i += 1) {
        const res = await levelsPost(app, i)
          .send(levelBody(hashFor(i)))
          .expect(200);
        const parsed = LevelResponse.parse(res.body as unknown);
        expect(parsed.source).toBe('llm');
        expect(parsed.fallbackReason).toBeUndefined();
      }

      const blocked = await levelsPost(app, MAX)
        .send(levelBody(hashFor(MAX)))
        .expect(200);
      const blockedParsed = LevelResponse.parse(blocked.body as unknown);
      expect(blockedParsed.source).toBe('procedural');
      expect(blockedParsed.fallbackReason).toBe('llm-quota');

      const again = await levelsPost(app, MAX + 1)
        .send(levelBody(hashFor(MAX + 1)))
        .expect(200);
      expect(LevelResponse.parse(again.body as unknown).fallbackReason).toBe(
        'llm-quota'
      );

      expect(createPrimary).toHaveBeenCalledTimes(MAX);

      const health = await request(httpServer(app))
        .get('/api/health')
        .expect(200);
      expect(health.body).toMatchObject({
        llm: 'quota-cooldown',
        llmToday: { used: MAX, max: MAX },
      });
    });

    it('does not count cache hits against the daily cap', async () => {
      const first = await levelsPost(app, 20)
        .send(levelBody(hashFor(20)))
        .expect(200);
      expect(LevelResponse.parse(first.body as unknown).source).toBe('llm');

      const second = await levelsPost(app, 21)
        .send(levelBody(hashFor(20)))
        .expect(200);
      expect(LevelResponse.parse(second.body as unknown).source).toBe('cache');

      expect(createPrimary).toHaveBeenCalledTimes(1);

      const health = await request(httpServer(app))
        .get('/api/health')
        .expect(200);
      expect(
        (health.body as { llmToday: { used: number } }).llmToday.used
      ).toBe(1);
    });

    it('rolls over the counter at UTC midnight via the injected clock', async () => {
      nowMs = Date.UTC(2026, 9, 10, 23, 59, 30);
      const late = await levelsPost(app, 30)
        .send(levelBody(hashFor(30), '2026-10-10'))
        .expect(200);
      expect(LevelResponse.parse(late.body as unknown).source).toBe('llm');

      nowMs = Date.UTC(2026, 9, 11, 0, 0, 1);
      const early = await levelsPost(app, 31)
        .send(levelBody(hashFor(31), '2026-10-11'))
        .expect(200);
      expect(LevelResponse.parse(early.body as unknown).source).toBe('llm');

      expect(createPrimary).toHaveBeenCalledTimes(2);

      const health = await request(httpServer(app))
        .get('/api/health')
        .expect(200);
      expect(health.body).toMatchObject({
        llm: 'up',
        llmToday: { used: 1, max: MAX },
      });
    });

    it('does not let concurrent misses overshoot the cap', async () => {
      const bodies = Array.from({ length: 12 }, (_, i) =>
        levelBody(hashFor(40 + i))
      );
      const responses = await Promise.all(
        bodies.map((body, i) =>
          levelsPost(app, 40 + i)
            .send(body)
            .expect(200)
        )
      );
      const parsed = responses.map((res) =>
        LevelResponse.parse(res.body as unknown)
      );
      const llm = parsed.filter((row) => row.source === 'llm');
      const quota = parsed.filter(
        (row) =>
          row.source === 'procedural' && row.fallbackReason === 'llm-quota'
      );
      expect(llm).toHaveLength(MAX);
      expect(quota).toHaveLength(12 - MAX);
      expect(createPrimary).toHaveBeenCalledTimes(MAX);

      const health = await request(httpServer(app))
        .get('/api/health')
        .expect(200);
      expect(
        (health.body as { llmToday: { used: number } }).llmToday.used
      ).toBe(MAX);
    });
  }
);
