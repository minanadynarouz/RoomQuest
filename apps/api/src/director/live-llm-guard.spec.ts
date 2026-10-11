import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { LevelRequest } from '@roomquest/schema';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../config/env';
import { DirectorService } from './director.service';
import {
  assertLiveLlmAllowed,
  DIRECTOR_CHAT_FACTORY,
  defaultDirectorChatFactory,
  type DirectorChatFactory,
} from './models';

const request = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});

describe('live LLM safety guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('test setup removed GOOGLE_API_KEY and forced DIRECTOR_MODE=mock', () => {
    expect(process.env.RQ_ALLOW_LIVE_LLM).not.toBe('1');
    expect(process.env.GOOGLE_API_KEY).toBeUndefined();
    expect(process.env.DIRECTOR_MODE).toBe('mock');
  });

  it('a key in the env still produces mock mode (procedural, no model built)', async () => {
    vi.stubEnv('GOOGLE_API_KEY', 'AIza-looks-real-but-is-not');
    vi.stubEnv('DIRECTOR_MODE', 'mock');
    const createPrimary = vi.fn();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validate: (config: Record<string, unknown>) => validateEnv(config),
        }),
      ],
      providers: [
        DirectorService,
        {
          provide: DIRECTOR_CHAT_FACTORY,
          useValue: { createPrimary } satisfies DirectorChatFactory,
        },
      ],
    }).compile();
    const outcome = await moduleRef.get(DirectorService).run(request);
    expect(outcome.response.source).toBe('procedural');
    expect(outcome.response.fallbackReason).toBe('director-mock');
    expect(createPrimary).not.toHaveBeenCalled();
  });

  it('throws before constructing ChatGoogleGenerativeAI with a real-looking key under test', () => {
    expect(() =>
      defaultDirectorChatFactory.createPrimary({
        model: 'gemini-3.8-flash',
        apiKey: 'AIza-looks-real-but-is-not',
      })
    ).toThrow(/RQ_ALLOW_LIVE_LLM/);
  });

  it('only lets RQ_ALLOW_LIVE_LLM=1 lift the guard', () => {
    expect(() => { assertLiveLlmAllowed('AIza-x', { NODE_ENV: 'test' }); }
    ).toThrow();
    expect(() => { assertLiveLlmAllowed('AIza-x', { VITEST: 'true' }); }).toThrow();
    expect(() => { assertLiveLlmAllowed('AIza-x', { VITEST: 'true', RQ_ALLOW_LIVE_LLM: '1' }); }
    ).not.toThrow();
    expect(() => { assertLiveLlmAllowed('AIza-x', { NODE_ENV: 'production' }); }
    ).not.toThrow();
    expect(() => { assertLiveLlmAllowed('test-dummy', { VITEST: 'true' }); }
    ).not.toThrow();
  });
});
