import type { SurfaceGraph, Theme, Tier } from '@roomquest/schema';
import { graphForPrompt } from './graph-for-prompt';
import { buildPromptVariation } from './variation';

export function buildUserMessage(input: {
  graph: SurfaceGraph;
  seed: string;
  tier: Tier;
  recentThemes?: Theme[];
}): string {
  // Graph last so the static prefix (system + seed/tier/themes) can cache.
  // Seed-derived variation sits next to the graph, after that static prefix.
  return JSON.stringify({
    seed: input.seed,
    tier: input.tier,
    recentThemes: input.recentThemes ?? [],
    variation: buildPromptVariation(input.seed, input.graph),
    graph: graphForPrompt(input.graph),
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
