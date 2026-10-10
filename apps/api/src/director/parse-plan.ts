import {
  buildDialogue,
  clampParTimeMs,
  createRng,
  pickTitle,
  resolveSlotIds,
  type LevelPlanWithSlots,
  type PlacementInput,
} from '@roomquest/level-core';
import {
  LevelPlan,
  LevelPlanLLM,
  LevelPlanSlotLLM,
  PLAYER_BUILT_PIECE_IDS,
  type Beat,
  type Placement,
  type PlacementLLM,
  type PlacementSlotLLM,
  type SurfaceGraph,
  type Theme,
  type Tier,
} from '@roomquest/schema';
import {
  DEFAULT_DIRECTOR_PLACEMENT,
  type DirectorPlacement,
} from './placement';

export interface HydrateContext {
  seed: string;
  graph: SurfaceGraph;
  tier: Tier;
  placement?: DirectorPlacement;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function playerBuiltFor(piece: Placement['piece']): boolean {
  return PLAYER_BUILT_PIECE_IDS.has(piece);
}

function placementToInput(placement: PlacementLLM): Record<string, unknown> {
  const input: Record<string, unknown> = {
    id: placement.i,
    piece: placement.pc,
    surface: placement.s,
    u: placement.u,
    v: placement.v,
    playerBuilt: playerBuiltFor(placement.pc),
    links: placement.lk.slice(0, 2),
  };
  if (placement.t !== null) {
    input.to = placement.t;
  }
  return input;
}

function labelOf(graph: SurfaceGraph, id: string): string {
  return graph.nodes.find((node) => node.id === id)?.label ?? 'surface';
}

function beatsFromPlacements(placements: readonly Placement[]): Beat[] {
  const shrine = placements.find((item) => item.piece === 'crystal_shrine');
  const slime = placements.find((item) => item.piece === 'slime');
  const gem = placements.find((item) => item.piece === 'gem');
  const gate = placements.find((item) => item.piece === 'gate');
  const lever = placements.find((item) => item.piece === 'lever');
  const playerBuilt = placements
    .filter((item) => item.playerBuilt)
    .map((item) => item.id);
  const beats: Beat[] = [];
  if (playerBuilt.length > 0) {
    beats.push({
      goal: 'Bridge the gap',
      uses: [...playerBuilt],
    });
  }
  if (gate && lever) {
    beats.push({
      goal: 'Open the gate',
      uses: [lever.id, gate.id],
    });
  }
  if (slime && beats.length < 3) {
    beats.push({
      goal: 'Stun the slime',
      uses: [slime.id],
    });
  }
  if (shrine) {
    beats.push({
      goal: 'Reach the crystal shrine',
      uses: [shrine.id],
    });
  }
  while (beats.length < 2) {
    if (gem) {
      beats.unshift({
        goal: 'Collect a spark along the path',
        uses: [gem.id],
      });
    } else {
      beats.push({
        goal: 'Help the explorer onward',
        uses: shrine ? [shrine.id] : [],
      });
    }
  }
  return beats.slice(0, 4);
}

/** LevelPlanLLM → LevelPlan.parse input (derived fields filled by level-core). */
export function llmPlanToInput(
  llm: LevelPlanLLM,
  ctx: HydrateContext
): Record<string, unknown> {
  const placements = llm.pl.map(placementToInput);
  const hut = llm.pl.find((item) => item.pc === 'village_hut');
  const shrine = llm.pl.find((item) => item.pc === 'crystal_shrine');
  const start =
    hut?.s ?? ctx.graph.nodes[0]?.id ?? 's1';
  const goal =
    shrine?.s ?? ctx.graph.nodes[1]?.id ?? ctx.graph.nodes[0]?.id ?? 's2';
  const rng = createRng(`${ctx.seed}|${ctx.tier}|llm`);
  const title = pickTitle(llm.th, rng);
  const hydratedPlacements = placements as unknown as Placement[];
  return {
    seed: ctx.seed,
    theme: llm.th,
    title,
    start,
    goal,
    placements,
    beats: beatsFromPlacements(hydratedPlacements),
    dialogue: buildDialogue(llm.th, rng, {
      startLabel: labelOf(ctx.graph, start),
      goalLabel: labelOf(ctx.graph, goal),
    }),
    parTimeMs: clampParTimeMs(90_000 + placements.length * 20_000),
  };
}

/**
 * Expand a slim Gemini object into a LevelPlan-shaped record so local
 * `repairPlan` can coerce it when zod parse failed.
 */
export function expandSlimCandidate(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.pl)) {
    return raw;
  }
  const theme = raw.th;
  const rows: unknown[] = raw.pl;
  const placements = rows.map((item: unknown, index) => {
    if (!isRecord(item)) {
      return item;
    }
    const piece = item.pc;
    const to = item.t;
    const expanded: Record<string, unknown> = {
      id: typeof item.i === 'string' ? item.i : `p${String(index + 1)}`,
      piece,
      surface: item.s,
      u: item.u,
      v: item.v,
      playerBuilt:
        typeof piece === 'string' &&
        PLAYER_BUILT_PIECE_IDS.has(piece as Placement['piece']),
      links: Array.isArray(item.lk) ? item.lk : [],
    };
    if (typeof to === 'string') {
      expanded.to = to;
    }
    return expanded;
  });
  return {
    theme: theme as Theme | undefined,
    placements,
    seed: raw.seed,
    title: raw.title,
    start: raw.start,
    goal: raw.goal,
    beats: raw.beats,
    dialogue: raw.dialogue,
    parTimeMs: raw.parTimeMs,
  };
}

export interface ParsedLlmPlan {
  llm?: LevelPlanLLM;
  plan?: LevelPlan;
  parseError?: string;
}

function slotPlacementToInput(placement: PlacementSlotLLM): PlacementInput {
  const input: PlacementInput = {
    id: placement.i,
    piece: placement.pc,
    slot: placement.slot,
    playerBuilt: playerBuiltFor(placement.pc),
    links: placement.lk.slice(0, 2),
  };
  if (placement.t !== null) {
    input.to = placement.t;
  }
  return input;
}

function looksLikeSlotCandidate(raw: unknown): boolean {
  if (!isRecord(raw) || !Array.isArray(raw.pl) || raw.pl.length === 0) {
    return false;
  }
  const first = raw.pl[0];
  return isRecord(first) && typeof first.slot === 'string';
}

function slotPlanToInput(
  llm: LevelPlanSlotLLM,
  ctx: HydrateContext
): { input: Record<string, unknown>; resolveError?: string } {
  const rng = createRng(`${ctx.seed}|${ctx.tier}|llm`);
  const title = pickTitle(llm.th, rng);
  const draftPlacements = llm.pl.map(slotPlacementToInput);
  const draft: LevelPlanWithSlots = {
    seed: ctx.seed,
    theme: llm.th,
    title,
    start: ctx.graph.nodes[0]?.id ?? 's1',
    goal: ctx.graph.nodes[1]?.id ?? ctx.graph.nodes[0]?.id ?? 's2',
    placements: draftPlacements,
    beats: [
      { goal: 'Bridge the gap', uses: [] },
      { goal: 'Reach the crystal shrine', uses: [] },
    ],
    dialogue: [],
    parTimeMs: clampParTimeMs(90_000 + draftPlacements.length * 20_000),
  };
  const resolved = resolveSlotIds(draft, ctx.graph, { seed: ctx.seed });
  if (resolved.issues.length > 0) {
    return {
      input: {},
      resolveError: resolved.issues
        .map((issue) => `${issue.code}: ${issue.message}`)
        .join('; '),
    };
  }
  const hut = resolved.plan.placements.find(
    (item) => item.piece === 'village_hut'
  );
  const shrine = resolved.plan.placements.find(
    (item) => item.piece === 'crystal_shrine'
  );
  const start = hut?.surface ?? draft.start;
  const goal = shrine?.surface ?? draft.goal;
  return {
    input: {
      ...resolved.plan,
      start,
      goal,
      beats: beatsFromPlacements(resolved.plan.placements),
      dialogue: buildDialogue(llm.th, rng, {
        startLabel: labelOf(ctx.graph, start),
        goalLabel: labelOf(ctx.graph, goal),
      }),
      parTimeMs: clampParTimeMs(
        90_000 + resolved.plan.placements.length * 20_000
      ),
    },
  };
}

export function tryParseLlmPlan(
  raw: unknown,
  ctx: HydrateContext
): ParsedLlmPlan {
  const placement = ctx.placement ?? DEFAULT_DIRECTOR_PLACEMENT;
  const useSlot = placement === 'slot' || looksLikeSlotCandidate(raw);
  if (useSlot) {
    const slotParsed = LevelPlanSlotLLM.safeParse(raw);
    if (!slotParsed.success) {
      return {
        parseError: slotParsed.error.issues
          .map((issue) => issue.message)
          .join('; '),
      };
    }
    const slotted = slotPlanToInput(slotParsed.data, ctx);
    if (slotted.resolveError !== undefined) {
      return { parseError: `SCHEMA_RESOLVE: ${slotted.resolveError}` };
    }
    const planParsed = LevelPlan.safeParse(slotted.input);
    if (!planParsed.success) {
      return {
        parseError: planParsed.error.issues
          .map((issue) => issue.message)
          .join('; '),
      };
    }
    return { plan: planParsed.data };
  }

  const llmParsed = LevelPlanLLM.safeParse(raw);
  if (!llmParsed.success) {
    return {
      parseError: llmParsed.error.issues
        .map((issue) => issue.message)
        .join('; '),
    };
  }
  const planParsed = LevelPlan.safeParse(llmPlanToInput(llmParsed.data, ctx));
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
