import {
  compactGraphForPrompt,
  type CompactGraphOptions,
} from '@roomquest/level-core';
import type { SurfaceGraph } from '@roomquest/schema';

/**
 * Single call site for the room graph in the user message.
 *
 * Slot mode passes `{ hints: true, seed }` so hinted slot ids sit in the
 * variable section after the cached prefix. Validation, repair and
 * procedural fallback always use the posted request graph.
 */
export function graphForPrompt(
  graph: SurfaceGraph,
  opts?: CompactGraphOptions
): unknown {
  return compactGraphForPrompt(graph, opts);
}
