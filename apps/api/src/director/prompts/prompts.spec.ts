import { describe, expect, it } from 'vitest';
import {
  compactGraphForPrompt,
  promptGraphJsonBytes,
} from '@roomquest/level-core';
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
    expect(PROMPT_VERSION).toBe('v1.1');
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
});
