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
import { buildRepairMessage, buildUserMessage } from './messages';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';

describe('director prompts', () => {
  it('exports a prompt version used in the cache key', () => {
    expect(PROMPT_VERSION).toBe('v1.0');
  });

  it('keeps a byte-stable system prefix (provider prompt caching)', () => {
    expect(SYSTEM_PREFIX).toBe(SYSTEM_PREFIX);
    expect(Buffer.byteLength(SYSTEM_PREFIX, 'utf8')).toBe(
      Buffer.byteLength(SYSTEM_PREFIX, 'utf8')
    );
    expect(SYSTEM_PREFIX).toContain('Roomquest game director');
    expect(SYSTEM_PREFIX).toContain(KIT_CATALOG_PROMPT);
    expect(SYSTEM_PREFIX).toContain(FEW_SHOT_FOREST_JSON);
    expect(SYSTEM_PREFIX).toContain(FEW_SHOT_DESERT_JSON);
    expect(SYSTEM_PREFIX).toContain('"theme":"forest"');
    expect(SYSTEM_PREFIX).toContain('"theme":"desert"');
  });

  it('lists every KIT_CATALOG piece with constraints', () => {
    for (const id of PIECE_IDS) {
      expect(KIT_CATALOG_PROMPT).toContain(id);
    }
    expect(KIT_CATALOG_PROMPT).toContain(
      `minArea=${String(KIT_CATALOG.village_hut.minArea)}m²`
    );
  });

  it('puts only graph/seed/tier/recentThemes in the user message', () => {
    const user = buildUserMessage({
      graph: SYNTHETIC_LIVING_ROOM,
      seed: 'f1a2b3c4d5e6-2026-10-14',
      tier: 'easy',
      recentThemes: ['forest'],
    });
    const parsed = JSON.parse(user) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(
      ['graph', 'recentThemes', 'seed', 'tier'].sort()
    );
    expect(user).not.toContain('Roomquest game director');
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
