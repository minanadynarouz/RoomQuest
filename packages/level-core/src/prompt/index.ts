/**
 * Prompt helpers for the LangChain director (B-08).
 *
 * Compact the scanned SurfaceGraph before it enters the user message so
 * input tokens stay near the ~2k budget. Validation still uses the full
 * graph.
 */

export { compactGraphForPrompt, promptGraphJsonBytes } from './compact-graph';
export type {
  CompactGraphOptions,
  CompactPromptEdge,
  CompactPromptGraph,
  CompactPromptNode,
} from './compact-graph';
export {
  hintedSlotIds,
  hintedSurfaces,
  listHintedSlots,
  PlacementSlotId,
  resolveSlotIds,
} from './slot-ids';
export type {
  CompactHintedSlot,
  HintedSlotRecord,
  HintedSurface,
  LevelPlanWithSlots,
  PlacementInput,
  ResolveSlotIdsResult,
  SlotResolveIssue,
  SlotResolveIssueCode,
  SlotResolveOptions,
} from './slot-ids';
