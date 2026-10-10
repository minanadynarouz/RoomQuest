import './live-director-env';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { LevelRequest, LevelResponse, type LevelPlan } from '@roomquest/schema';
import type { Server } from 'node:http';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/create-app';
import {
  DIRECTOR_BUDGET_MS,
  DIRECTOR_LLM_WINDOW_MS,
} from '../src/director/director.constants';
import { LLM_DAILY_USAGE } from '../src/director/daily-usage';
import {
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
  type DirectorChatFactory,
  type DirectorRuntime,
} from '../src/director/models';
import {
  installDirectorFakeTimers,
  settleWithDirectorFakeTime,
} from '../src/director/test-clock';
import {
  HangingFakeListChatModel,
  planToLlmJson,
  SlowFakeListChatModel,
  ThrowingFakeListChatModel,
} from '../src/director/test-fakes';

const allowDailyUsage = {
  consume: (): Promise<'ok'> => Promise.resolve('ok'),
  snapshot: (): Promise<{
    used: number;
    max: number;
    failClosed: boolean;
  }> => Promise.resolve({ used: 0, max: 150, failClosed: false }),
  today: (): Promise<{ used: number; max: number }> =>
    Promise.resolve({ used: 0, max: 150 }),
};

const DEVICE_ID = '550e8400-e29b-41d4-a716-446655440000';
const CLIENT_VERSION = '0.0.1';

const validBody = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});

const validJson = planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN);

function dirtyLocalRepairJson(): string {
  const dirty: LevelPlan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
  dirty.placements.push({
    id: 'p-slime',
    piece: 'slime',
    surface: 's5',
    u: 0.5,
    v: 0.5,
    playerBuilt: false,
    links: [],
  });
  return planToLlmJson(dirty);
}

function startEqualsGoalJson(): string {
  const dirty: LevelPlan = structuredClone(SYNTHETIC_LIVING_ROOM_PLAN);
  dirty.goal = dirty.start;
  return planToLlmJson(dirty);
}

function httpServer(app: INestApplication): Server {
  return app.getHttpServer() as Server;
}

function levelsPost(app: INestApplication) {
  return request(httpServer(app))
    .post('/api/v1/levels')
    .set('X-Device-Id', DEVICE_ID)
    .set('X-Client-Version', CLIENT_VERSION);
}

async function bootLiveApp(options: {
  factory: DirectorChatFactory;
  runtime?: DirectorRuntime;
}): Promise<INestApplication> {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  builder.overrideProvider(DIRECTOR_CHAT_FACTORY).useValue(options.factory);
  builder.overrideProvider(LLM_DAILY_USAGE).useValue(allowDailyUsage);
  if (options.runtime !== undefined) {
    builder.overrideProvider(DIRECTOR_RUNTIME).useValue(options.runtime);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bufferLogs: true,
    bodyParser: false,
  });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.init();
  return app;
}

describe('POST /api/v1/levels director contract (B-05 live)', () => {
  let app: INestApplication | undefined;

  beforeAll(() => {
    expect(process.env.DIRECTOR_MODE).toBe('live');
    expect(process.env.GOOGLE_API_KEY).toBe('test-google-key');
  });

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
  });

  async function expectValid200(
    factory: DirectorChatFactory,
    runtime?: DirectorRuntime
  ): Promise<LevelResponse> {
    app = await bootLiveApp({ factory, runtime });
    const res = await levelsPost(app).send(validBody).expect(200);
    return LevelResponse.parse(res.body as unknown);
  }

  async function expectValid200WithFakeTime(
    factory: DirectorChatFactory,
    runtime?: DirectorRuntime
  ): Promise<LevelResponse> {
    app = await bootLiveApp({ factory, runtime });
    installDirectorFakeTimers();
    try {
      const res = await settleWithDirectorFakeTime(
        levelsPost(app).send(validBody).expect(200)
      );
      return LevelResponse.parse(res.body as unknown);
    } finally {
      vi.useRealTimers();
    }
  }

  it('valid first try → 200 source llm', async () => {
    const fake = new FakeListChatModel({ responses: [validJson] });
    const parsed = await expectValid200({
      createPrimary: () => fake,
    });
    expect(parsed.source).toBe('llm');
    expect(parsed.model).toBe('gemini-3.8-flash');
  });

  it('locally repaired → 200 source llm_repaired', async () => {
    const fake = new FakeListChatModel({
      responses: [dirtyLocalRepairJson()],
    });
    const parsed = await expectValid200({
      createPrimary: () => fake,
    });
    expect(parsed.source).toBe('llm_repaired');
    expect(parsed.repairs.length).toBeGreaterThan(0);
  });

  it('LLM-repaired → 200 source llm_repaired', async () => {
    const fake = new FakeListChatModel({
      responses: [startEqualsGoalJson(), validJson],
    });
    const parsed = await expectValid200({
      createPrimary: () => fake,
    });
    expect(parsed.source).toBe('llm_repaired');
    expect(parsed.repairs).toContain('llm-repair');
  });

  it('timeout → 200 source procedural', async () => {
    const parsed = await expectValid200WithFakeTime({
      createPrimary: () => new HangingFakeListChatModel(),
    });
    expect(parsed.source).toBe('procedural');
    expect(parsed.model).toBeUndefined();
    expect(parsed.plan.title).not.toBe('The Living Room Quest');
    expect(parsed.latencyMs).toBe(DIRECTOR_LLM_WINDOW_MS);
    expect(parsed.latencyMs).toBeLessThan(DIRECTOR_BUDGET_MS);
  });

  it('provider error → 200 source procedural within the budget', async () => {
    let t = 0;
    const throwing = new ThrowingFakeListChatModel(new Error('gemini down'));
    throwing.onThrow = () => {
      t = 400;
    };
    const parsed = await expectValid200(
      {
        createPrimary: () => throwing,
      },
      {
        budgetMs: DIRECTOR_BUDGET_MS,
        now: () => t,
      }
    );
    expect(parsed.source).toBe('procedural');
    expect(parsed.model).toBeUndefined();
    expect(parsed.latencyMs).toBeLessThan(DIRECTOR_BUDGET_MS);
  });

  it('invalid twice → 200 source procedural', async () => {
    const fake = new FakeListChatModel({
      responses: [startEqualsGoalJson(), startEqualsGoalJson()],
    });
    const parsed = await expectValid200({
      createPrimary: () => fake,
    });
    expect(parsed.source).toBe('procedural');
    expect(parsed.plan.title).not.toBe('The Living Room Quest');
  });

  it('slow first and repair calls → 200 procedural within the budget', async () => {
    const fake = new SlowFakeListChatModel({
      responses: [startEqualsGoalJson(), validJson],
      delaysMs: [3_000, 10_000],
    });
    const parsed = await expectValid200WithFakeTime({
      createPrimary: () => fake,
    });
    expect(parsed.source).toBe('procedural');
    expect(parsed.model).toBeUndefined();
    expect(parsed.latencyMs).toBe(DIRECTOR_LLM_WINDOW_MS);
    expect(parsed.latencyMs).toBeLessThan(DIRECTOR_BUDGET_MS);
  });
});
