import type { SurfaceGraph, Theme, Tier } from '@roomquest/schema';
import { graphForPrompt } from './graph-for-prompt';
import { graphWaiverLines } from './graph-waivers';
import { buildPromptVariation } from './variation';

export function buildUserMessage(input: {
  graph: SurfaceGraph;
  seed: string;
  tier: Tier;
  recentThemes?: Theme[];
  /** `slot` adds hinted slot ids to the graph (after the static prefix). */
  placement?: 'uv' | 'slot';
}): string {
  // Graph last so the static prefix (system + seed/tier/themes) can cache.
  // Seed-derived variation and #60 graph waivers sit next to the graph,
  // after that static prefix — they must not touch SYSTEM_PREFIX.
  return JSON.stringify({
    seed: input.seed,
    tier: input.tier,
    recentThemes: input.recentThemes ?? [],
    variation: buildPromptVariation(input.seed, input.graph),
    waivers: graphWaiverLines(input.graph),
    graph: graphForPrompt(input.graph, {
      hints: input.placement === 'slot',
      seed: input.seed,
    }),
  });
}

export function buildRepairMessage(
  issues: readonly { code: string; message: string }[],
  previous: unknown
): string {
  const lines = issues.map((issue) => `- ${issue.code}: ${issue.message}`);
  return [
    'The previous plan failed validation. Return a complete corrected compact LevelPlan (th+pl) in the same response schema that fixes every issue.',
    'Issues:',
    lines.join('\n'),
    'Previous plan:',
    JSON.stringify(previous),
  ].join('\n');
}
