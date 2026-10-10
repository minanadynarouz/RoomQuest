import type { SurfaceGraph, Theme, Tier } from '@roomquest/schema';
import {
  DEFAULT_DIRECTOR_PLACEMENT,
  type DirectorPlacement,
} from '../placement';
import { graphForPrompt } from './graph-for-prompt';
import { graphWaiverLines } from './graph-waivers';
import { buildPromptVariation } from './variation';

export function buildUserMessage(input: {
  graph: SurfaceGraph;
  seed: string;
  tier: Tier;
  recentThemes?: Theme[];
  placement?: DirectorPlacement;
}): string {
  const placement = input.placement ?? DEFAULT_DIRECTOR_PLACEMENT;
  // Graph last so the static prefix (system + seed/tier/themes) can cache.
  // Seed-derived variation and #60 graph waivers sit next to the graph,
  // after that static prefix — they must not touch SYSTEM_PREFIX.
  return JSON.stringify({
    seed: input.seed,
    tier: input.tier,
    recentThemes: input.recentThemes ?? [],
    placement,
    variation: buildPromptVariation(input.seed, input.graph),
    waivers: graphWaiverLines(input.graph),
    graph: graphForPrompt(
      input.graph,
      placement === 'slot' ? { hints: true, seed: input.seed } : undefined
    ),
  });
}

export function buildRepairMessage(
  issues: readonly { code: string; message: string }[],
  previous: unknown
): string {
  const lines = issues.map((issue) => `- ${issue.code}: ${issue.message}`);
  return [
    'The previous plan failed validation. Return a complete corrected compact LevelPlan (th+pl) that fixes every issue.',
    'Issues:',
    lines.join('\n'),
    'Previous plan:',
    JSON.stringify(previous),
  ].join('\n');
}
