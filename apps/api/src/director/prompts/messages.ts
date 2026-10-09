import type { SurfaceGraph, Theme, Tier } from '@roomquest/schema';

export function buildUserMessage(input: {
  graph: SurfaceGraph;
  seed: string;
  tier: Tier;
  recentThemes?: Theme[];
}): string {
  return JSON.stringify({
    graph: input.graph,
    seed: input.seed,
    tier: input.tier,
    recentThemes: input.recentThemes ?? [],
  });
}

export function buildRepairMessage(
  issues: readonly { code: string; message: string }[],
  previous: unknown
): string {
  const lines = issues.map(
    (issue) => `- ${issue.code}: ${issue.message}`
  );
  return [
    'The previous plan failed validation. Return a complete corrected LevelPlan that fixes every issue.',
    'Issues:',
    lines.join('\n'),
    'Previous plan:',
    JSON.stringify(previous),
  ].join('\n');
}
