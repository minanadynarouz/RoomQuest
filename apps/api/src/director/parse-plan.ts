import { clampParTimeMs } from '@roomquest/level-core';
import {
  LevelPlan,
  LevelPlanLLM,
  type PlacementLLM,
} from '@roomquest/schema';

function placementToInput(placement: PlacementLLM): Record<string, unknown> {
  const input: Record<string, unknown> = {
    id: placement.id,
    piece: placement.piece,
    surface: placement.surface,
    u: placement.u,
    v: placement.v,
    playerBuilt: placement.playerBuilt,
    links: placement.links.slice(0, 2),
  };
  if (placement.to !== null) {
    input.to = placement.to;
  }
  return input;
}

/** LevelPlanLLM → LevelPlan.parse input (`to: null` dropped, par clamped). */
export function llmPlanToInput(llm: LevelPlanLLM): Record<string, unknown> {
  return {
    seed: llm.seed,
    theme: llm.theme,
    title: llm.title,
    start: llm.start,
    goal: llm.goal,
    placements: llm.placements.map(placementToInput),
    beats: llm.beats,
    dialogue: llm.dialogue,
    parTimeMs: clampParTimeMs(llm.parTimeMs),
  };
}

export interface ParsedLlmPlan {
  llm?: LevelPlanLLM;
  plan?: LevelPlan;
  parseError?: string;
}

export function tryParseLlmPlan(raw: unknown): ParsedLlmPlan {
  const llmParsed = LevelPlanLLM.safeParse(raw);
  if (!llmParsed.success) {
    return {
      parseError: llmParsed.error.issues
        .map((issue) => issue.message)
        .join('; '),
    };
  }
  const planParsed = LevelPlan.safeParse(llmPlanToInput(llmParsed.data));
  if (!planParsed.success) {
    return {
      llm: llmParsed.data,
      parseError: planParsed.error.issues
        .map((issue) => issue.message)
        .join('; '),
    };
  }
  return { llm: llmParsed.data, plan: planParsed.data };
}
