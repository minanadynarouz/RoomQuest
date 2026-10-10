/**
 * Prompt helpers for the LangChain director (B-08).
 *
 * Compact the scanned SurfaceGraph before it enters the user message so
 * input tokens stay near the ~2k budget. Validation still uses the full
 * graph.
 */

export { compactGraphForPrompt, promptGraphJsonBytes } from './compact-graph';
export type {
  CompactPromptEdge,
  CompactPromptGraph,
  CompactPromptNode,
} from './compact-graph';
