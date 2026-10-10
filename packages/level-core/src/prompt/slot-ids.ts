import {
  PieceId,
  type LevelPlan,
  type PieceId as PieceKind,
  type Placement,
  type SurfaceGraph,
} from '@roomquest/schema';
import { z } from 'zod';
import { surfaceHints } from '../placement/slots';
import { orderSurfacesByArea } from '../room-reading/order';

/**
 * Gemini-safe placement fragment: `slot` instead of surface+u+v.
 * Plain `z.string()` — no regex — so the Backend Developer can lift it
 * into `@roomquest/schema` behind a flag. Does not change {@link LevelPlan}.
 */
export const PlacementSlotId = z.object({
  id: z.string(),
  piece: PieceId,
  slot: z.string(),
  to: z.string().nullable(),
  playerBuilt: z.boolean(),
  links: z.array(z.string()),
});
export type PlacementSlotId = z.infer<typeof PlacementSlotId>;

/** Prompt-facing slot: graph-unique id plus centimetre-rounded u/v. */
export interface CompactHintedSlot {
  id: string;
  u: number;
  v: number;
}

export interface HintedSurface {
  fits: readonly PieceKind[];
  uv: [number, number, number, number];
  slots: CompactHintedSlot[];
}

export interface HintedSlotRecord {
  id: string;
  surfaceId: string;
  u: number;
  v: number;
  fits: readonly PieceKind[];
}

export interface SlotResolveOptions {
  seed?: string;
}

/** Placement that may use `slot: "s3"` instead of surface+u+v. */
export interface PlacementInput {
  id: string;
  piece: PieceKind;
  surface?: string;
  to?: string | null;
  u?: number;
  v?: number;
  slot?: string;
  playerBuilt?: boolean;
  links?: string[];
}

export type LevelPlanWithSlots = Omit<LevelPlan, 'placements'> & {
  placements: readonly PlacementInput[];
};

export const SLOT_RESOLVE_ISSUE_CODES = [
  'UNKNOWN_SLOT',
  'SLOT_PIECE_MISMATCH',
  'DUPLICATE_SLOT',
] as const;

export type SlotResolveIssueCode = (typeof SLOT_RESOLVE_ISSUE_CODES)[number];

export interface SlotResolveIssue {
  code: SlotResolveIssueCode;
  message: string;
  placementId?: string;
  slotId?: string;
}

export interface ResolveSlotIdsResult {
  plan: LevelPlan;
  issues: SlotResolveIssue[];
}

/**
 * Per-surface hint payload with graph-unique `s<n>` ids, numbered in
 * area-desc (ties by id) then per-surface slot order.
 */
export function hintedSurfaces(
  graph: SurfaceGraph,
  opts?: SlotResolveOptions
): Map<string, HintedSurface> {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const result = new Map<string, HintedSurface>();
  let n = 1;
  for (const surfaceId of orderSurfacesByArea(graph)) {
    const node = nodes.get(surfaceId);
    if (!node) {
      continue;
    }
    const hints = surfaceHints(node, graph, { seed: opts?.seed });
    const slots: CompactHintedSlot[] = [];
    for (const [u, v] of hints.slots) {
      slots.push({ id: `s${String(n)}`, u, v });
      n += 1;
    }
    result.set(surfaceId, { fits: hints.fits, uv: hints.uv, slots });
  }
  return result;
}

/** Flattened hinted slots in the same deterministic id order. */
export function listHintedSlots(
  graph: SurfaceGraph,
  opts?: SlotResolveOptions
): HintedSlotRecord[] {
  const bySurface = hintedSurfaces(graph, opts);
  const out: HintedSlotRecord[] = [];
  for (const surfaceId of orderSurfacesByArea(graph)) {
    const hinted = bySurface.get(surfaceId);
    if (!hinted) {
      continue;
    }
    for (const slot of hinted.slots) {
      out.push({
        id: slot.id,
        surfaceId,
        u: slot.u,
        v: slot.v,
        fits: hinted.fits,
      });
    }
  }
  return out;
}

/**
 * Ordered list of offered slot ids for a per-request string enum.
 * Same `(graph, seed)` as {@link compactGraphForPrompt} / {@link resolveSlotIds}.
 */
export function hintedSlotIds(
  graph: SurfaceGraph,
  opts?: SlotResolveOptions
): string[] {
  return listHintedSlots(graph, opts).map((slot) => slot.id);
}

function hasConcreteUv(placement: PlacementInput): boolean {
  return (
    typeof placement.surface === 'string' &&
    placement.surface.length > 0 &&
    typeof placement.u === 'number' &&
    Number.isFinite(placement.u) &&
    typeof placement.v === 'number' &&
    Number.isFinite(placement.v)
  );
}

function issueOf(
  code: SlotResolveIssueCode,
  message: string,
  extra: { placementId: string; slotId: string }
): SlotResolveIssue {
  return {
    code,
    message,
    placementId: extra.placementId,
    slotId: extra.slotId,
  };
}

function toPlacement(input: PlacementInput): Placement {
  const placement: Placement = {
    id: input.id,
    piece: input.piece,
    surface: input.surface ?? '',
    u: input.u ?? 0,
    v: input.v ?? 0,
    playerBuilt: input.playerBuilt ?? false,
    links: input.links ? [...input.links] : [],
  };
  if (input.to !== undefined && input.to !== null && input.to !== '') {
    placement.to = input.to;
  }
  return placement;
}

/**
 * Map `slot: "s3"` placements onto surface+u+v using the same hinted list
 * as the prompt. Existing surface+u+v placements are copied through.
 * Does not mutate `planWithSlots`.
 */
export function resolveSlotIds(
  planWithSlots: LevelPlanWithSlots,
  graph: SurfaceGraph,
  opts?: SlotResolveOptions
): ResolveSlotIdsResult {
  const catalog = listHintedSlots(graph, opts);
  const byId = new Map(catalog.map((slot) => [slot.id, slot]));
  const used = new Map<string, string>();
  const issues: SlotResolveIssue[] = [];
  const placements: Placement[] = [];

  for (const original of planWithSlots.placements) {
    if (hasConcreteUv(original)) {
      placements.push(toPlacement(original));
      continue;
    }
    const slotId = original.slot;
    if (typeof slotId !== 'string' || slotId.length === 0) {
      placements.push(toPlacement(original));
      continue;
    }
    const found = byId.get(slotId);
    if (!found) {
      issues.push(
        issueOf(
          'UNKNOWN_SLOT',
          `placement ${original.id} references unknown slot ${slotId}`,
          { placementId: original.id, slotId }
        )
      );
      placements.push(toPlacement(original));
      continue;
    }
    const first = used.get(slotId);
    if (first !== undefined) {
      issues.push(
        issueOf(
          'DUPLICATE_SLOT',
          `slot ${slotId} used by ${first} and ${original.id}`,
          { placementId: original.id, slotId }
        )
      );
    } else {
      used.set(slotId, original.id);
    }
    if (!found.fits.includes(original.piece)) {
      issues.push(
        issueOf(
          'SLOT_PIECE_MISMATCH',
          `piece ${original.piece} does not fit slot ${slotId} on ${found.surfaceId}`,
          { placementId: original.id, slotId }
        )
      );
    }
    placements.push(
      toPlacement({
        ...original,
        surface: found.surfaceId,
        u: found.u,
        v: found.v,
      })
    );
  }

  const plan: LevelPlan = {
    seed: planWithSlots.seed,
    theme: planWithSlots.theme,
    title: planWithSlots.title,
    start: planWithSlots.start,
    goal: planWithSlots.goal,
    placements,
    beats: planWithSlots.beats.map((beat) => ({
      goal: beat.goal,
      uses: [...beat.uses],
    })),
    dialogue: planWithSlots.dialogue.map((line) => ({
      trigger: line.trigger,
      line: line.line,
    })),
    parTimeMs: planWithSlots.parTimeMs,
  };

  return { plan, issues };
}
