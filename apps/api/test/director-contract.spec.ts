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
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/create-app';
import {
  DIRECTOR_CHAT_FACTORY,
  DIRECTOR_RUNTIME,
  type DirectorChatFactory,
  type DirectorRuntime,
} from '../src/director/models';
import {
  HangingFakeListChatModel,
  planToLlmJson,
  SlowFakeListChatModel,
  ThrowingFakeListChatModel,
} from '../src/director/test-fakes';

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

  it('valid first try → 200 source llm', async () => {
    const fake = new FakeListChatModel({ responses: [validJson] });
    const parsed = await expectValid200({
      createPrimary: () => fake,
      createFallback: () => new FakeListChatModel({ responses: ['{}'] }),
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
      createFallback: () => new FakeListChatModel({ responses: ['{}'] }),
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
      createFallback: () => new FakeListChatModel({ responses: ['{}'] }),
    });
    expect(parsed.source).toBe('llm_repaired');
    expect(parsed.repairs).toContain('llm-repair');
  });

  it('timeout → 200 source procedural', async () => {
    const parsed = await expectValid200(
      {
        createPrimary: () => new HangingFakeListChatModel(),
        createFallback: () => new FakeListChatModel({ responses: ['{}'] }),
      },
      { budgetMs: 40 }
    );
    expect(parsed.source).toBe('procedural');
    expect(parsed.model).toBeUndefined();
    expect(parsed.plan.title).not.toBe('The Living Room Quest');
  });

  it('provider error → fallback model → 200 source llm', async () => {
    const parsed = await expectValid200({
      createPrimary: () =>
        new ThrowingFakeListChatModel(new Error('gemini down')),
      createFallback: () => new FakeListChatModel({ responses: [validJson] }),
    });
    expect(parsed.source).toBe('llm');
    expect(parsed.model).toBe('claude-haiku-4-5');
  });

  it('provider error with < 3 s left → 200 source procedural', async () => {
    let t = 0;
    const throwing = new ThrowingFakeListChatModel(new Error('gemini down'));
    throwing.onThrow = () => {
      t = 4500;
    };
    const parsed = await expectValid200(
      {
        createPrimary: () => throwing,
        createFallback: () => new FakeListChatModel({ responses: [validJson] }),
      },
      { budgetMs: 7000, fallbackMinRemainingMs: 3000, now: () => t }
    );
    expect(parsed.source).toBe('procedural');
    expect(parsed.model).toBeUndefined();
  });

  it('invalid twice → 200 source procedural', async () => {
    const fake = new FakeListChatModel({
      responses: [startEqualsGoalJson(), startEqualsGoalJson()],
    });
    const parsed = await expectValid200({
      createPrimary: () => fake,
      createFallback: () => new FakeListChatModel({ responses: ['{}'] }),
    });
    expect(parsed.source).toBe('procedural');
    expect(parsed.plan.title).not.toBe('The Living Room Quest');
  });

  it('slow first and repair calls → 200 procedural within the budget', async () => {
    const budgetMs = 400;
    const fake = new SlowFakeListChatModel({
      responses: [startEqualsGoalJson(), validJson],
      delaysMs: [40, 2000],
    });
    app = await bootLiveApp({
      factory: {
        createPrimary: () => fake,
        createFallback: () => new FakeListChatModel({ responses: ['{}'] }),
      },
      runtime: {
        budgetMs,
        proceduralReserveMs: 50,
        llmRepairMinRemainingMs: 30,
      },
    });
    const started = Date.now();
    const res = await levelsPost(app).send(validBody).expect(200);
    const elapsed = Date.now() - started;
    const parsed = LevelResponse.parse(res.body as unknown);
    expect(parsed.source).toBe('procedural');
    expect(parsed.model).toBeUndefined();
    expect(parsed.latencyMs).toBeLessThan(budgetMs);
    expect(elapsed).toBeLessThan(budgetMs);
  });
});
