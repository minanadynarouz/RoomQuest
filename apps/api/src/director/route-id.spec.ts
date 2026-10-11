import { FakeListChatModel } from '@langchain/core/utils/testing';
import {
  SYNTHETIC_LIVING_ROOM,
  SYNTHETIC_LIVING_ROOM_PLAN,
} from '@roomquest/fixtures';
import { LevelRequest } from '@roomquest/schema';
import { describe, expect, it } from 'vitest';
import { makeDailySeed } from '../levels/daily-seed';
import { runDirector } from './run-director';
import {
  planToLlmJson,
  planToSlotLlmJson,
  silentLogger,
  structuredFromFake,
  ThrowingFakeListChatModel,
} from './test-fakes';

const request = LevelRequest.parse({
  graph: SYNTHETIC_LIVING_ROOM,
  date: '2026-10-14',
  tier: 'easy',
});
const seed = makeDailySeed(request.graph.roomHash, request.date);

describe('LevelResponse.routeId only for route-arm plans', () => {
  it('uv arm: absent', async () => {
    const fake = new FakeListChatModel({
      responses: [planToLlmJson(SYNTHETIC_LIVING_ROOM_PLAN)],
    });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      placement: 'uv',
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('llm');
    expect('routeId' in outcome.response).toBe(false);
  });

  it('slot arm: absent', async () => {
    const fake = new FakeListChatModel({
      responses: [
        planToSlotLlmJson(SYNTHETIC_LIVING_ROOM_PLAN, request.graph, seed),
      ],
    });
    const outcome = await runDirector(request, {
      primary: structuredFromFake(fake),
      placement: 'slot',
      logger: silentLogger,
    });
    expect(outcome.response.source).not.toBe('procedural');
    expect('routeId' in outcome.response).toBe(false);
  });

  it('route arm provider error → procedural fallback: absent', async () => {
    const outcome = await runDirector(request, {
      primary: structuredFromFake(
        new ThrowingFakeListChatModel(new Error('provider down'))
      ),
      placement: 'route',
      logger: silentLogger,
    });
    expect(outcome.response.source).toBe('procedural');
    expect('routeId' in outcome.response).toBe(false);
  });
});
