import {
  hintedSlotIds,
  resolveSlotIds,
  type LevelPlanWithSlots,
  type SlotResolveIssue,
} from '@roomquest/level-core';
import {
  buildLevelPlanLLMSlotGeminiSchema,
  PieceId,
  Theme,
  type LevelPlanLLM,
  type SurfaceGraph,
} from '@roomquest/schema';
import { z } from 'zod';
import type { StructuredCallOptions } from './structured-chat';

/**
 * Loose parse of slot-mode output: `slot` is any string here so an id the
 * request never offered surfaces as `UNKNOWN_SLOT` from `resolveSlotIds`
 * (→ fallbackReason `slot-resolve-failed`) instead of a generic parse error.
 * The wire schema still constrains `slot` to the per-request enum.
 */
const SlotCandidate = z.object({
  th: Theme,
  pl: z
    .array(
      z.object({
        i: z.string(),
        pc: PieceId,
        slot: z.string(),
        t: z.string().nullable(),
        lk: z.array(z.string()),
      })
    )
    .min(4)
    .max(14),
});

export interface SlotRequestContext {
  slotIds: string[];
  callOptions: StructuredCallOptions;
}

/**
 * Per-request slot schema for `DIRECTOR_PLACEMENT=slot`. Returns undefined
 * when the graph offers no hinted slots (caller falls back to uv mode).
 */
export function buildSlotRequestContext(
  graph: SurfaceGraph,
  seed: string
): SlotRequestContext | undefined {
  const slotIds = hintedSlotIds(graph, { seed });
  if (slotIds.length === 0) {
    return undefined;
  }
  return {
    slotIds,
    callOptions: {
      responseSchema: buildLevelPlanLLMSlotGeminiSchema(slotIds),
      schemaName: 'LevelPlanLLMSlot',
    },
  };
}

export type SlotResolution =
  | { kind: 'ok'; candidate: LevelPlanLLM; issues: SlotResolveIssue[] }
  | { kind: 'parse-failed'; parseError: string }
  | { kind: 'resolve-failed'; issues: SlotResolveIssue[] };

/**
 * Turn a slot-mode Gemini candidate into the compact uv shape
 * (`LevelPlanLLM`) via level-core `resolveSlotIds`, so the rest of the
 * director (hydrate → validate → local repair) and the client see the
 * unchanged plan shape.
 */
export function resolveSlotCandidate(
  raw: unknown,
  graph: SurfaceGraph,
  seed: string
): SlotResolution {
  const parsed = SlotCandidate.safeParse(raw);
  if (!parsed.success) {
    return {
      kind: 'parse-failed',
      parseError: parsed.error.issues.map((issue) => issue.message).join('; '),
    };
  }
  const shell: LevelPlanWithSlots = {
    seed,
    theme: parsed.data.th,
    title: '',
    start: '',
    goal: '',
    beats: [],
    dialogue: [],
    parTimeMs: 0,
    placements: parsed.data.pl.map((row) => ({
      id: row.i,
      piece: row.pc,
      slot: row.slot,
      to: row.t,
      links: [...row.lk],
    })),
  };
  const resolved = resolveSlotIds(shell, graph, { seed });
  if (resolved.issues.some((issue) => issue.code === 'UNKNOWN_SLOT')) {
    return { kind: 'resolve-failed', issues: resolved.issues };
  }
  return {
    kind: 'ok',
    issues: resolved.issues,
    candidate: {
      th: parsed.data.th,
      pl: resolved.plan.placements.map((placement) => ({
        i: placement.id,
        pc: placement.piece,
        s: placement.surface,
        t: placement.to ?? null,
        u: placement.u,
        v: placement.v,
        lk: [...placement.links],
      })),
    },
  };
}
