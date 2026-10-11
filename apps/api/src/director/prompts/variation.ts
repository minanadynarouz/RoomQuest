import { createRng } from '@roomquest/level-core';
import type { SurfaceGraph, Theme } from '@roomquest/schema';

export const THEME_WORDS = ['forest', 'desert', 'snow', 'sky'] as const;

export const ROUTE_DIRECTIONS = [
  'clockwise',
  'counter-clockwise',
  'low-to-high',
  'high-to-low',
] as const;

export type RouteDirection = (typeof ROUTE_DIRECTIONS)[number];

/**
 * Seed-derived variation constraint for the user message. Placed after the
 * static system prefix, next to the graph, so Gemini implicit caching of
 * SYSTEM_PREFIX stays byte-identical.
 */
export interface PromptVariation {
  themeWord: Theme;
  preferredStartSurface: string;
  routeDirection: RouteDirection;
}

export function buildPromptVariation(
  seed: string,
  graph: SurfaceGraph
): PromptVariation {
  const rng = createRng(`${seed}|prompt-variation`);
  const surfaceIds = graph.nodes.map((node) => node.id).sort();
  return {
    themeWord: rng.pick(THEME_WORDS, 'forest'),
    preferredStartSurface: rng.pick(surfaceIds, surfaceIds[0] ?? 's1'),
    routeDirection: rng.pick([...ROUTE_DIRECTIONS], 'clockwise'),
  };
}
