import { compactGraphForPrompt } from '@roomquest/level-core';
import type { SurfaceGraph } from '@roomquest/schema';

/**
 * Single call site for the room graph in the user message.
 *
 * Swap the body to `return graph` to send the full SurfaceGraph (debug).
 * Validation, repair and procedural fallback always use the posted
 * request graph, never this return value.
 */
export function graphForPrompt(graph: SurfaceGraph): unknown {
  return compactGraphForPrompt(graph);
}
