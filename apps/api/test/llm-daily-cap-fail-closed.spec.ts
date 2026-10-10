import './llm-daily-cap-fail-closed-env';
import type { Server } from 'node:http';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { LevelRequest, LevelResponse } from '@roomquest/schema';
import { Logger as PinoLogger } from 'nestjs-pino';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/create-app';
import {
  LLM_DAILY_USAGE,
  type LlmDailyUsage,
} from '../src/director/daily-usage';
import {
  DIRECTOR_CHAT_FACTORY,
  type DirectorChatFactory,
} from '../src/director/models';
import { planToLlmJson } from '../src/director/test-fakes';

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440022';
const CLIENT_VERSION = '0.0.1';

const validBody = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-10',
  tier: 'easy',
});

function httpServer(app: NestExpressApplication): Server {
  return app.getHttpServer();
}

describe('daily Gemini cap fail-closed without a database', () => {
  let app: NestExpressApplication | undefined;

  beforeEach(() => {
    process.env.DIRECTOR_MODE = 'live';
    process.env.GOOGLE_API_KEY = 'test-google-key';
    process.env.NODE_ENV = 'test';
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_URL;
    delete process.env.LLM_DAILY_MAX;
  });

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('skips Gemini, returns llm-quota, and logs once when DATABASE_URL is unset', async () => {
    const createPrimary = vi.fn(() => {
      return new FakeListChatModel({
        responses: [planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN)],
      });
    });
    const factory: DirectorChatFactory = { createPrimary };
    const warnings: string[] = [];
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(function (
      this: Logger,
      message: unknown
    ) {
      warnings.push(typeof message === 'string' ? message : String(message));
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DIRECTOR_CHAT_FACTORY)
      .useValue(factory)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      bodyParser: false,
    });
    app.useLogger(app.get(PinoLogger));
    configureApp(app);
    await app.init();

    const first = await request(httpServer(app))
      .post('/api/v1/levels')
      .set('X-Device-Id', DEVICE_ID)
      .set('X-Client-Version', CLIENT_VERSION)
      .send(validBody)
      .expect(200);
    const firstParsed = LevelResponse.parse(first.body as unknown);
    expect(firstParsed.source).toBe('procedural');
    expect(firstParsed.fallbackReason).toBe('llm-quota');

    const second = await request(httpServer(app))
      .post('/api/v1/levels')
      .set('X-Device-Id', DEVICE_ID)
      .set('X-Client-Version', CLIENT_VERSION)
      .send({
        ...validBody,
        graph: { ...validBody.graph, roomHash: 'aabbccddeeff' },
      })
      .expect(200);
    expect(LevelResponse.parse(second.body as unknown).fallbackReason).toBe(
      'llm-quota'
    );

    expect(createPrimary).not.toHaveBeenCalled();

    const health = await request(httpServer(app))
      .get('/api/health')
      .expect(200);
    expect(health.body).toMatchObject({
      db: 'disabled',
      llm: 'quota-cooldown',
      llmToday: { used: 0, max: 150 },
    });

    const capUnavailable = warnings.filter((line) =>
      line.includes('director.llm_daily_cap unavailable')
    );
    expect(capUnavailable.length).toBe(1);

    const usage = app.get<LlmDailyUsage>(LLM_DAILY_USAGE);
    expect(await usage.consume()).toBe('unavailable');
  });

  it('skips Gemini when DATABASE_URL points at a closed port', async () => {
    process.env.DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:1/roomquest';
    process.env.DIRECT_URL =
      'postgresql://postgres:postgres@127.0.0.1:1/roomquest';

    const createPrimary = vi.fn(() => {
      throw new Error('must not construct a live model when the DB is down');
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DIRECTOR_CHAT_FACTORY)
      .useValue({ createPrimary } satisfies DirectorChatFactory)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      bodyParser: false,
    });
    app.useLogger(app.get(PinoLogger));
    configureApp(app);
    await app.init();

    const res = await request(httpServer(app))
      .post('/api/v1/levels')
      .set('X-Device-Id', DEVICE_ID)
      .set('X-Client-Version', CLIENT_VERSION)
      .send(validBody)
      .expect(200);
    const parsed = LevelResponse.parse(res.body as unknown);
    expect(parsed.source).toBe('procedural');
    expect(parsed.fallbackReason).toBe('llm-quota');
    expect(createPrimary).not.toHaveBeenCalled();

    const health = await request(httpServer(app))
      .get('/api/health')
      .expect(200);
    expect((health.body as { db: string; llm: string }).db).toBe('down');
    expect((health.body as { llm: string }).llm).toBe('quota-cooldown');
  });
});
