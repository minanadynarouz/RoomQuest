import { compactGraphForPrompt } from '@roomquest/level-core';
import type { SurfaceGraph } from '@roomquest/schema';

export interface GraphForPromptOptions {
  /**
   * Include per-surface `fits`/`uv`/`slots` hints (DIRECTOR_PLACEMENT=slot).
   * Slot ids match `hintedSlotIds(graph, { seed })` / `resolveSlotIds`.
   */
  hints?: boolean;
  seed?: string;
}

/**
 * Single call site for the room graph in the user message.
 *
 * Swap the body to `return graph` to send the full SurfaceGraph (debug).
 * Validation, repair and procedural fallback always use the posted
 * request graph, never this return value.
 */
export function graphForPrompt(
  graph: SurfaceGraph,
  opts?: GraphForPromptOptions
): unknown {
  if (opts?.hints === true) {
    return compactGraphForPrompt(graph, { hints: true, seed: opts.seed });
  }
  return compactGraphForPrompt(graph);
}
