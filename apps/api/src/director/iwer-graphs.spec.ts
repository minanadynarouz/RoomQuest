import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { validatePlan } from '@roomquest/level-core';
import { LevelRequest, LevelResponse, type Tier } from '@roomquest/schema';
import { describe, expect, it, vi } from 'vitest';
import { validateEnv } from '../config/env';
import { DirectorService } from './director.service';
import { DIRECTOR_CHAT_FACTORY, type DirectorChatFactory } from './models';

const TIERS: readonly Tier[] = ['easy', 'normal'];
const SEED_COUNT = 20;

function seedDate(index: number): string {
  return `2026-10-${String(1 + (index % 28)).padStart(2, '0')}`;
}

async function serviceWithEnv(env: Record<string, string>): Promise<DirectorService> {
  const factory: DirectorChatFactory = {
    createPrimary: vi.fn(() => {
      throw new Error('IWER director tests must not construct a live model');
    }),
  };
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
      { provide: DIRECTOR_CHAT_FACTORY, useValue: factory },
    ],
  }).compile();
  return moduleRef.get(DirectorService);
}

async function assertBoundPlans(
  director: DirectorService,
  label: string
): Promise<void> {
  const failures: string[] = [];
  for (const room of IWER_ROOM_IDS) {
    const graph = IWER_GRAPHS[room];
    for (const tier of TIERS) {
      for (let i = 0; i < SEED_COUNT; i += 1) {
        const request = LevelRequest.parse({
          graph,
          date: seedDate(i),
          tier,
        });
        const response = await director.plan(request);
        const parsed = LevelResponse.parse(response);
        const result = validatePlan(parsed.plan, graph);
        if (!result.ok) {
          const codes = result.issues.map((item) => item.code).join(',');
          failures.push(`${label} ${room} ${tier} ${request.date}: ${codes}`);
        }
      }
    }
  }
  expect(failures.slice(0, 8), failures.join('\n')).toEqual([]);
  expect(failures).toHaveLength(0);
}

describe('IWER graphs through the server director', () => {
  it('mock director generate→validate→repair is valid for every room, tier, and 20 seeds', async () => {
    const director = await serviceWithEnv({ DIRECTOR_MODE: 'mock' });
    await assertBoundPlans(director, 'mock');
  });

  it('procedural fallback (live, no key) is valid for every room, tier, and 20 seeds', async () => {
    const director = await serviceWithEnv({ DIRECTOR_MODE: 'live' });
    await assertBoundPlans(director, 'procedural');
  });
});
