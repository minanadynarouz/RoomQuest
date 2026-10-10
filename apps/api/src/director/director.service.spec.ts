import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { validatePlan } from '@roomquest/level-core';
import { LevelRequest, LevelResponse } from '@roomquest/schema';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import { describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../config/env';
import { DirectorService } from './director.service';
import { DIRECTOR_CHAT_FACTORY, type DirectorChatFactory } from './models';
import { PROMPT_VERSION } from './prompts';
import { LLM_QUOTA_BREAKER } from './quota-breaker';
import { planToLlmJson } from './test-fakes';

const request = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});

async function serviceWithEnv(
  env: Record<string, string>,
  factory?: DirectorChatFactory,
  quotaOpen = false
): Promise<DirectorService> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validate: (config: Record<string, unknown>) =>
          validateEnv({ ...config, ...env }),
      }),
    ],
    providers: [
      DirectorService,
      {
        provide: DIRECTOR_CHAT_FACTORY,
        useValue:
          factory ??
          ({
            createPrimary: vi.fn(),
          } satisfies DirectorChatFactory),
      },
      {
        provide: LLM_QUOTA_BREAKER,
        useValue: { isOpen: () => quotaOpen },
      },
    ],
  }).compile();
  return moduleRef.get(DirectorService);
}

describe('DirectorService', () => {
  it('serves a graph-bound procedural plan when DIRECTOR_MODE=mock', async () => {
    const director = await serviceWithEnv({ DIRECTOR_MODE: 'mock' });
    const response = await director.plan(request);
    const parsed = LevelResponse.parse(response);
    expect(parsed.source).toBe('procedural');
    expect(parsed.relaxed).toEqual([]);
    expect(validatePlan(parsed.plan, request.graph).ok).toBe(true);
    expect(parsed.plan.start).toBeTruthy();
    expect(request.graph.nodes.some((node) => node.id === parsed.plan.start)).toBe(
      true
    );
    expect(parsed.promptVersion).toBe(PROMPT_VERSION);
    expect(parsed.model).toBeUndefined();
  });

  it('falls back to procedural when live mode has no Google key', async () => {
    const createPrimary = vi.fn(() => {
      throw new Error('must not construct a live model without a key');
    });
    const factory: DirectorChatFactory = {
      createPrimary,
    };
    const director = await serviceWithEnv({ DIRECTOR_MODE: 'live' }, factory);
    const response = await director.plan(request);
    const parsed = LevelResponse.parse(response);
    expect(parsed.source).toBe('procedural');
    expect(createPrimary).not.toHaveBeenCalled();
    expect(parsed.model).toBeUndefined();
  });

  it('uses the injected fake chat model in live mode with a dummy key', async () => {
    const fake = new FakeListChatModel({
      responses: [planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN)],
    });
    const factory: DirectorChatFactory = {
      createPrimary: () => fake,
    };
    const director = await serviceWithEnv(
      { DIRECTOR_MODE: 'live', GOOGLE_API_KEY: 'test-google-key' },
      factory
    );
    const response = await director.plan(request);
    expect(LevelResponse.parse(response).source).toBe('llm');
  });

  it('skips Gemini and returns procedural llm-quota while the breaker is open', async () => {
    const createPrimary = vi.fn(() => {
      throw new Error('must not construct a live model during quota cooldown');
    });
    const director = await serviceWithEnv(
      { DIRECTOR_MODE: 'live', GOOGLE_API_KEY: 'test-google-key' },
      { createPrimary },
      true
    );
    const response = await director.plan(request);
    const parsed = LevelResponse.parse(response);
    expect(parsed.source).toBe('procedural');
    expect(parsed.fallbackReason).toBe('llm-quota');
    expect(createPrimary).not.toHaveBeenCalled();
  });
});
