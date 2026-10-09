import { describe, it, expect } from 'vitest';
import {
  SurfaceGraph,
  LevelRequest,
  LevelResponse,
  ResultRequest,
  ResultResponse,
  procLevelKey,
  PIECE_IDS,
  KIT_CATALOG,
} from '@roomquest/schema';

describe('Schema smoke test (api)', () => {
  it('can import and parse SurfaceGraph', () => {
    const graph = {
      version: 1 as const,
      roomHash: 'test12345678',
      mode: 'scene' as const,
      floorY: 0,
      nodes: [
        {
          id: 's1',
          label: 'table' as const,
          kind: 'plane' as const,
          topHeight: 0.75,
          centroid: [0, 0.75, 0] as [number, number, number],
          size: [1, 1] as [number, number],
          yaw: 0,
          area: 1,
          reach: 'hand' as const,
          angleFromForward: 0,
        },
        {
          id: 's2',
          label: 'couch' as const,
          kind: 'plane' as const,
          topHeight: 0.45,
          centroid: [2, 0.45, 0] as [number, number, number],
          size: [2, 0.9] as [number, number],
          yaw: 0,
          area: 1.8,
          reach: 'ray' as const,
          angleFromForward: 30,
        },
      ],
      edges: [],
    };
    expect(() => SurfaceGraph.parse(graph)).not.toThrow();
  });

  it('can access PIECE_IDS', () => {
    expect(PIECE_IDS).toContain('village_hut');
    expect(PIECE_IDS).toContain('crystal_shrine');
    expect(PIECE_IDS).toHaveLength(10);
  });

  it('can access KIT_CATALOG', () => {
    expect(KIT_CATALOG.village_hut).toBeDefined();
    expect(KIT_CATALOG.village_hut.minArea).toBe(0.3);
  });

  it('can parse API types', () => {
    const graph = {
      version: 1 as const,
      roomHash: 'a1b2c3d4e5f6',
      mode: 'scene' as const,
      floorY: 0,
      nodes: [
        {
          id: 's1',
          label: 'table' as const,
          kind: 'plane' as const,
          topHeight: 0.75,
          centroid: [0, 0.75, 0] as [number, number, number],
          size: [1, 1] as [number, number],
          yaw: 0,
          area: 1,
          reach: 'hand' as const,
          angleFromForward: 0,
        },
        {
          id: 's2',
          label: 'couch' as const,
          kind: 'plane' as const,
          topHeight: 0.45,
          centroid: [2, 0.45, 0] as [number, number, number],
          size: [2, 0.9] as [number, number],
          yaw: 0,
          area: 1.8,
          reach: 'ray' as const,
          angleFromForward: 30,
        },
      ],
      edges: [],
    };

    const request = {
      graph,
      date: '2026-10-14',
      tier: 'easy' as const,
    };
    expect(() => LevelRequest.parse(request)).not.toThrow();

    const response = {
      plan: {
        seed: 'test-2026-10-14',
        theme: 'forest' as const,
        title: 'Test Level',
        start: 's1',
        goal: 's2',
        parTimeMs: 180000,
        placements: [
          {
            id: 'p1',
            piece: 'village_hut' as const,
            surface: 's1',
            u: 0.5,
            v: 0.5,
          },
          {
            id: 'p2',
            piece: 'crystal_shrine' as const,
            surface: 's2',
            u: 0.5,
            v: 0.5,
          },
          {
            id: 'p3',
            piece: 'plank_bridge' as const,
            surface: 's1',
            to: 's2',
            u: 0.8,
            v: 0.5,
            playerBuilt: true,
          },
          {
            id: 'p4',
            piece: 'gem' as const,
            surface: 's1',
            u: 0.3,
            v: 0.3,
          },
        ],
        beats: [
          { goal: 'Build the bridge', uses: ['p3'] },
          { goal: 'Reach the shrine', uses: ['p2'] },
        ],
        dialogue: [{ trigger: 'intro' as const, line: 'Welcome!' }],
      },
      source: 'procedural' as const,
      cacheKey: 'test-key',
      promptVersion: 'v1',
      latencyMs: 100,
      repairs: [],
    };
    expect(() => LevelResponse.parse(response)).not.toThrow();

    expect(() =>
      ResultRequest.parse({
        deviceId: '550e8400-e29b-41d4-a716-446655440000',
        stars: 2,
        gems: 1,
        timeMs: 90_000,
        completed: true,
        planSource: 'procedural',
      })
    ).not.toThrow();
    expect(() => ResultResponse.parse({ id: 'result_1' })).not.toThrow();
    expect(procLevelKey('seed-1', 'easy')).toBe('proc:seed-1:easy');
  });
});
