import { describe, expect, it } from 'vitest';
import {
  compactGraphForPrompt,
  hintedSlotIds,
  promptGraphJsonBytes,
  VALIDATION_LIMITS,
} from '@roomquest/level-core';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { KIT_CATALOG, PIECE_IDS } from '@roomquest/schema';
import { PROMPT_VERSION } from './version';
import { SYSTEM_PREFIX } from './system-prefix';
import { KIT_CATALOG_PROMPT } from './kit-catalog';
import { FEW_SHOT_DESERT_JSON, FEW_SHOT_FOREST_JSON } from './few-shots';
import { graphForPrompt } from './graph-for-prompt';
import { buildRepairMessage, buildUserMessage } from './messages';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';

describe('director prompts', () => {
  it('exports a prompt version used in the cache key', () => {
    expect(PROMPT_VERSION).toBe('v1.2');
  });

  it('keeps a byte-stable system prefix (provider prompt caching)', () => {
    expect(SYSTEM_PREFIX).toBe(SYSTEM_PREFIX);
    expect(Buffer.byteLength(SYSTEM_PREFIX, 'utf8')).toBe(
      Buffer.byteLength(SYSTEM_PREFIX, 'utf8')
    );
    expect(SYSTEM_PREFIX).toContain('Roomquest director');
    expect(SYSTEM_PREFIX).toContain(KIT_CATALOG_PROMPT);
    expect(SYSTEM_PREFIX).toContain(FEW_SHOT_FOREST_JSON);
    expect(SYSTEM_PREFIX).toContain(FEW_SHOT_DESERT_JSON);
    expect(SYSTEM_PREFIX).toContain('"th":"forest"');
    expect(SYSTEM_PREFIX).toContain('"th":"desert"');
  });

  it('lists every KIT_CATALOG piece with constraints', () => {
    for (const id of PIECE_IDS) {
      expect(KIT_CATALOG_PROMPT).toContain(id);
    }
    expect(KIT_CATALOG_PROMPT).toContain(
      `minArea=${String(KIT_CATALOG.village_hut.minArea)}m²`
    );
  });

  it('puts seed/tier/recentThemes first and the graph last', () => {
    const user = buildUserMessage({
      graph: SYNTHETIC_LIVING_ROOM,
      seed: 'f1a2b3c4d5e6-2026-10-14',
      tier: 'easy',
      recentThemes: ['forest'],
    });
    const parsed = JSON.parse(user) as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual([
      'seed',
      'tier',
      'recentThemes',
      'variation',
      'waivers',
      'graph',
    ]);
    expect(Array.isArray(parsed.waivers)).toBe(true);
    const variation = parsed.variation as {
      themeWord: string;
      preferredStartSurface: string;
      routeDirection: string;
    };
    expect(['forest', 'desert', 'snow', 'sky']).toContain(variation.themeWord);
    expect(SYNTHETIC_LIVING_ROOM.nodes.map((n) => n.id)).toContain(
      variation.preferredStartSurface
    );
    expect([
      'clockwise',
      'counter-clockwise',
      'low-to-high',
      'high-to-low',
    ]).toContain(variation.routeDirection);
    expect(user).not.toContain('Roomquest director');
  });

  it('derives variation from the seed and keeps SYSTEM_PREFIX byte-identical', () => {
    const a = JSON.parse(
      buildUserMessage({
        graph: SYNTHETIC_LIVING_ROOM,
        seed: 'f1a2b3c4d5e6-2026-10-01',
        tier: 'easy',
      })
    ) as { variation: unknown };
    const again = JSON.parse(
      buildUserMessage({
        graph: SYNTHETIC_LIVING_ROOM,
        seed: 'f1a2b3c4d5e6-2026-10-01',
        tier: 'easy',
      })
    ) as { variation: unknown };
    const b = JSON.parse(
      buildUserMessage({
        graph: SYNTHETIC_LIVING_ROOM,
        seed: 'f1a2b3c4d5e6-2026-10-02',
        tier: 'easy',
      })
    ) as { variation: unknown };
    expect(a.variation).toEqual(again.variation);
    expect(a.variation).not.toEqual(b.variation);
    expect(SYSTEM_PREFIX).toBe(SYSTEM_PREFIX);
    expect(SYSTEM_PREFIX).not.toContain('preferredStartSurface');
    expect(SYSTEM_PREFIX).not.toContain('themeWord');
    expect(SYSTEM_PREFIX).not.toContain('waivers');
  });

  it('graphForPrompt is the toggleable compactGraphForPrompt wrapper', () => {
    expect(graphForPrompt(SYNTHETIC_LIVING_ROOM)).toEqual(
      compactGraphForPrompt(SYNTHETIC_LIVING_ROOM)
    );
    expect(graphForPrompt(SYNTHETIC_LIVING_ROOM)).not.toBe(
      SYNTHETIC_LIVING_ROOM
    );
    expect(graphForPrompt(SYNTHETIC_LIVING_ROOM)).not.toHaveProperty('version');
    expect(SYNTHETIC_LIVING_ROOM).toHaveProperty('version');
  });

  it('sends compactGraphForPrompt output, not the raw SurfaceGraph', () => {
    const user = buildUserMessage({
      graph: SYNTHETIC_LIVING_ROOM,
      seed: 'f1a2b3c4d5e6-2026-10-14',
      tier: 'easy',
    });
    const parsed = JSON.parse(user) as { graph: unknown };
    expect(parsed.graph).toEqual(compactGraphForPrompt(SYNTHETIC_LIVING_ROOM));
    expect(parsed.graph).not.toHaveProperty('version');
    expect(parsed.graph).not.toHaveProperty('roomHash');
    expect(parsed.graph).not.toHaveProperty('floorY');
    const nodes = (parsed.graph as { nodes: Record<string, unknown>[] }).nodes;
    expect(nodes[0]).not.toHaveProperty('kind');
    expect(nodes[0]).not.toHaveProperty('yaw');

    const full = promptGraphJsonBytes(SYNTHETIC_LIVING_ROOM);
    const compact = promptGraphJsonBytes(parsed.graph);
    expect(compact).toBeLessThan(full);
  });

  it('includes issue messages in the repair follow-up', () => {
    const text = buildRepairMessage(
      [{ code: 'START_EQUALS_GOAL', message: 'start and goal are s1' }],
      { seed: 'x' }
    );
    expect(text).toContain('START_EQUALS_GOAL');
    expect(text).toContain('start and goal are s1');
    expect(text).toContain('"seed":"x"');
  });

  it('states the level-core numeric limits in the static prefix', () => {
    const L = VALIDATION_LIMITS;
    for (const needle of [
      `step height Δh≤${String(L.plankMaxStepHeightM)}m`,
      `Plank gap ${String(L.plankMinGapM)}–${String(L.plankMaxGapM)}m`,
      `Ramp Δh≤${String(L.rampMaxStepHeightM)}m`,
      `min floor run ≥${String(L.rampFloorRunPerDh)}×Δh`,
      `≤${String(L.maxSlopeDeg)}° from forward`,
      `≥${String(L.minPathDistanceM)}m (min path distance)`,
      `reach ${L.playerReach.join('|')}`,
      `within ${String(L.leverMaxReachM)}m`,
      'Beats must be completable in order',
    ]) {
      expect(SYSTEM_PREFIX).toContain(needle);
    }
  });

  it('keeps SYSTEM_PREFIX free of request data and byte-identical across rooms/placements', () => {
    const bytes = Buffer.from(SYSTEM_PREFIX, 'utf8');
    for (const id of IWER_ROOM_IDS) {
      const graph = IWER_GRAPHS[id];
      for (const placement of ['uv', 'slot'] as const) {
        const user = buildUserMessage({
          graph,
          seed: `${graph.roomHash}-2026-10-14`,
          tier: 'normal',
          placement,
        });
        expect(SYSTEM_PREFIX).not.toContain(graph.roomHash);
        expect(user).not.toContain('Roomquest director');
      }
    }
    expect(Buffer.from(SYSTEM_PREFIX, 'utf8').equals(bytes)).toBe(true);
  });

  it('adds slot hints to the user message only in slot mode', () => {
    const seed = 'f1a2b3c4d5e6-2026-10-14';
    const slot = JSON.parse(
      buildUserMessage({
        graph: SYNTHETIC_LIVING_ROOM,
        seed,
        tier: 'easy',
        placement: 'slot',
      })
    ) as { graph: { nodes: { slots?: { id: string }[] }[] } };
    const ids = slot.graph.nodes.flatMap(
      (node) => node.slots?.map((item) => item.id) ?? []
    );
    expect(ids.sort()).toEqual(
      hintedSlotIds(SYNTHETIC_LIVING_ROOM, { seed }).sort()
    );
    const uv = buildUserMessage({
      graph: SYNTHETIC_LIVING_ROOM,
      seed,
      tier: 'easy',
    });
    expect(uv).not.toContain('"slots"');
  });
});
