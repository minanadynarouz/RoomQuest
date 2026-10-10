import { describe, expect, it } from 'vitest';
import { IWER_GRAPHS, IWER_ROOM_IDS, SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { toJsonSchema, type LevelPlan, type SurfaceGraph } from '@roomquest/schema';
import { generatePlan } from '../generate/generate-plan';
import { quantizeUv, surfaceHints } from '../placement/slots';
import { orderSurfacesByArea } from '../room-reading/order';
import { pieceFitsSurface } from '../validate/piece-fits';
import { validatePlan } from '../validate/validate-plan';
import { compactGraphForPrompt, promptGraphJsonBytes } from './compact-graph';
import {
  hintedSlotIds,
  listHintedSlots,
  PlacementSlotId,
  resolveSlotIds,
  type LevelPlanWithSlots,
  type PlacementInput,
} from './slot-ids';

function clonePlan(plan: LevelPlan): LevelPlan {
  return structuredClone(plan);
}

function slotPlacements(compact: ReturnType<typeof compactGraphForPrompt>): {
  id: string;
  surfaceId: string;
  u: number;
  v: number;
}[] {
  const rows: { id: string; surfaceId: string; u: number; v: number }[] = [];
  for (const node of compact.nodes) {
    for (const slot of node.slots ?? []) {
      rows.push({
        id: slot.id,
        surfaceId: node.id,
        u: slot.u,
        v: slot.v,
      });
    }
  }
  return rows;
}

function toSlotPlacement(placement: LevelPlan['placements'][number], slot: string): PlacementInput {
  const next: PlacementInput = {
    id: placement.id,
    piece: placement.piece,
    slot,
    playerBuilt: placement.playerBuilt,
    links: [...placement.links],
  };
  if (placement.to !== undefined) {
    next.to = placement.to;
  }
  return next;
}

function replaceMatchingSlots(
  plan: LevelPlan,
  graph: SurfaceGraph,
  seed?: string
): { plan: LevelPlanWithSlots; replaced: number } {
  const catalog = listHintedSlots(graph, seed === undefined ? undefined : { seed });
  const used = new Set<string>();
  let replaced = 0;
  const placements: PlacementInput[] = plan.placements.map((placement) => {
    const [qu, qv] = quantizeUv(placement.u, placement.v);
    const exact = catalog.find(
      (slot) =>
        slot.surfaceId === placement.surface &&
        slot.u === qu &&
        slot.v === qv &&
        !used.has(slot.id)
    );
    const sameSurface = catalog.find(
      (slot) =>
        slot.surfaceId === placement.surface &&
        slot.fits.includes(placement.piece) &&
        !used.has(slot.id)
    );
    const match = exact ?? sameSurface;
    if (!match) {
      return {
        id: placement.id,
        piece: placement.piece,
        surface: placement.surface,
        to: placement.to,
        u: placement.u,
        v: placement.v,
        playerBuilt: placement.playerBuilt,
        links: [...placement.links],
      };
    }
    used.add(match.id);
    replaced += 1;
    return toSlotPlacement(placement, match.id);
  });
  return { plan: { ...plan, placements }, replaced };
}

function validPlan(graph: SurfaceGraph, seed: string, tier: 'easy' | 'normal'): LevelPlan {
  const plan = generatePlan(graph, seed, tier);
  expect(validatePlan(plan, graph).ok).toBe(true);
  return plan;
}

describe('hinted slot ids', () => {
  it('are stable across repeated calls and unique s<n> in area-desc order', () => {
    const graph = SYNTHETIC_LIVING_ROOM;
    const a = compactGraphForPrompt(graph, { hints: true });
    const b = compactGraphForPrompt(graph, { hints: true });
    expect(a).toEqual(b);
    expect(hintedSlotIds(graph)).toEqual(hintedSlotIds(graph));

    const ids = hintedSlotIds(graph);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(ids.map((_, index) => `s${String(index + 1)}`));

    const compactIds = slotPlacements(a).map((slot) => slot.id);
    expect(new Set(compactIds).size).toBe(compactIds.length);
    expect([...compactIds].sort()).toEqual([...ids].sort());

    const largest = orderSurfacesByArea(graph)[0];
    const floor = a.nodes.find((node) => node.id === largest);
    expect(floor?.slots?.[0]?.id).toBe('s1');
  });

  it('keeps u/v on each slot so the hints-with-u/v arm still works', () => {
    const hinted = compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, { hints: true });
    for (const node of hinted.nodes) {
      const full = SYNTHETIC_LIVING_ROOM.nodes.find((item) => item.id === node.id);
      expect(full).toBeDefined();
      if (!full) {
        continue;
      }
      const raw = surfaceHints(full, SYNTHETIC_LIVING_ROOM);
      expect(node.slots?.map((slot) => [slot.u, slot.v])).toEqual(raw.slots);
      for (const slot of node.slots ?? []) {
        expect(slot).toEqual({ id: slot.id, u: slot.u, v: slot.v });
      }
    }
  });

  it('does not mutate the graph', () => {
    const before = structuredClone(SYNTHETIC_LIVING_ROOM);
    compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, { hints: true });
    hintedSlotIds(SYNTHETIC_LIVING_ROOM);
    expect(SYNTHETIC_LIVING_ROOM).toEqual(before);
  });
});

describe('hintedSlotIds', () => {
  it('matches compactGraphForPrompt ids, including with a seed', () => {
    const graph = SYNTHETIC_LIVING_ROOM;
    const plain = compactGraphForPrompt(graph, { hints: true });
    expect(hintedSlotIds(graph)).toEqual(
      listHintedSlots(graph).map((slot) => slot.id)
    );
    const fromCompact = orderSurfacesByArea(graph).flatMap((id) => {
      const node = plain.nodes.find((item) => item.id === id);
      return (node?.slots ?? []).map((slot) => slot.id);
    });
    expect(hintedSlotIds(graph)).toEqual(fromCompact);

    const seeded = compactGraphForPrompt(graph, { hints: true, seed: 'alpha' });
    const seededIds = orderSurfacesByArea(graph).flatMap((id) => {
      const node = seeded.nodes.find((item) => item.id === id);
      return (node?.slots ?? []).map((slot) => slot.id);
    });
    expect(hintedSlotIds(graph, { seed: 'alpha' })).toEqual(seededIds);
  });
});

describe('seeded slots', () => {
  it('is stable for the same seed and rebuilds identically in resolveSlotIds', () => {
    const graph = SYNTHETIC_LIVING_ROOM;
    const seed = 'slot-seed-7';
    const a = compactGraphForPrompt(graph, { hints: true, seed });
    const b = compactGraphForPrompt(graph, { hints: true, seed });
    expect(a).toEqual(b);
    expect(listHintedSlots(graph, { seed })).toEqual(
      listHintedSlots(graph, { seed })
    );

    const plan = validPlan(graph, 'seed-round-host', 'easy');
    const { plan: withSlots, replaced } = replaceMatchingSlots(plan, graph, seed);
    expect(replaced).toBeGreaterThan(0);
    const before = structuredClone(withSlots);
    const resolved = resolveSlotIds(withSlots, graph, { seed });
    expect(withSlots).toEqual(before);
    expect(resolved.issues).toEqual([]);
    expect(validatePlan(resolved.plan, graph).ok).toBe(true);
  });

  it('usually offers different slots across 10 seeds on each IWER room', () => {
    const rows: { room: string; distinct: number }[] = [];
    for (const room of IWER_ROOM_IDS) {
      const graph = IWER_GRAPHS[room];
      const keys = new Set<string>();
      for (let i = 0; i < 10; i += 1) {
        const compact = compactGraphForPrompt(graph, {
          hints: true,
          seed: `variety-${String(i)}`,
        });
        keys.add(
          JSON.stringify(
            compact.nodes.map((node) =>
              (node.slots ?? []).map((slot) => [slot.u, slot.v])
            )
          )
        );
      }
      rows.push({ room, distinct: keys.size });
      console.log(
        `seeded slot variety ${room}: ${String(keys.size)} distinct sets / 10 seeds`
      );
    }
    expect(rows.some((row) => row.distinct >= 2)).toBe(true);
    expect(rows).toHaveLength(IWER_ROOM_IDS.length);
  });
});

describe('resolveSlotIds round trip', () => {
  it('round-trips a valid generatePlan on each IWER room', () => {
    for (const room of IWER_ROOM_IDS) {
      const graph = IWER_GRAPHS[room];
      const plan = generatePlan(graph, `slot-id-rt-${room}`, 'normal');
      expect(validatePlan(plan, graph).ok).toBe(true);
      const before = structuredClone(plan);
      const { plan: withSlots, replaced } = replaceMatchingSlots(plan, graph);
      expect(plan).toEqual(before);
      expect(replaced).toBeGreaterThan(0);
      const resolved = resolveSlotIds(withSlots, graph);
      expect(resolved.issues).toEqual([]);
      expect(validatePlan(resolved.plan, graph).ok).toBe(true);
    }
  });

  it('leaves surface+u/v placements untouched', () => {
    const graph = SYNTHETIC_LIVING_ROOM;
    const plan = validPlan(graph, 'uv-untouched', 'easy');
    const catalog = listHintedSlots(graph);
    const first = catalog[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    const mixed: LevelPlanWithSlots = {
      ...plan,
      placements: plan.placements.map((placement, index) =>
        index === 0 ? toSlotPlacement(placement, first.id) : placement
      ),
    };
    const resolved = resolveSlotIds(mixed, graph);
    expect(resolved.plan.placements.slice(1)).toEqual(plan.placements.slice(1));
    const head = resolved.plan.placements[0];
    expect(head?.surface).toBe(first.surfaceId);
    expect(head?.u).toBe(first.u);
    expect(head?.v).toBe(first.v);
  });
});

describe('resolveSlotIds issues', () => {
  it('reports unknown slot id, piece mismatch, and duplicate slot', () => {
    const graph = SYNTHETIC_LIVING_ROOM;
    const plan = validPlan(graph, 'slot-id-errors', 'easy');
    const catalog = listHintedSlots(graph);
    const couch = catalog.find((slot) => {
      const node = graph.nodes.find((item) => item.id === slot.surfaceId);
      return node?.label === 'couch' && !slot.fits.includes('village_hut');
    });
    expect(couch).toBeDefined();
    const known = catalog[0];
    expect(known).toBeDefined();
    if (!couch || !known) {
      return;
    }

    const hut = plan.placements.find((item) => item.piece === 'village_hut');
    const gem = plan.placements.find((item) => item.piece === 'gem');
    const shrine = plan.placements.find((item) => item.piece === 'crystal_shrine');
    expect(hut && gem && shrine).toBeTruthy();
    if (!hut || !gem || !shrine) {
      return;
    }

    const unknown = resolveSlotIds(
      {
        ...plan,
        placements: plan.placements.map((item) =>
          item.id === gem.id ? toSlotPlacement(item, 's999') : item
        ),
      },
      graph
    );
    expect(unknown.issues.map((item) => item.code)).toContain('UNKNOWN_SLOT');
    expect(unknown.issues[0]?.slotId).toBe('s999');

    const mismatch = resolveSlotIds(
      {
        ...plan,
        placements: plan.placements.map((item) =>
          item.id === hut.id ? toSlotPlacement(item, couch.id) : item
        ),
      },
      graph
    );
    expect(mismatch.issues.map((item) => item.code)).toContain(
      'SLOT_PIECE_MISMATCH'
    );

    const duplicate = resolveSlotIds(
      {
        ...plan,
        placements: plan.placements.map((item) =>
          item.id === gem.id || item.id === shrine.id
            ? toSlotPlacement(item, known.id)
            : item
        ),
      },
      graph
    );
    expect(duplicate.issues.map((item) => item.code)).toContain('DUPLICATE_SLOT');
  });
});

describe('PlacementSlotId zod fragment', () => {
  it('is Gemini-safe: slot is a plain string with no pattern', () => {
    const parsed = PlacementSlotId.parse({
      id: 'p1',
      piece: 'gem',
      slot: 's3',
      to: null,
      playerBuilt: false,
      links: [],
    });
    expect(parsed.slot).toBe('s3');
    const json = toJsonSchema(PlacementSlotId);
    expect(JSON.stringify(json)).not.toContain('"pattern"');
    const slotSchema = (json.properties as Record<string, unknown> | undefined)
      ?.slot;
    expect(slotSchema).toEqual({ type: 'string' });
  });
});

describe('IWER hinted slots vs validatePlan', () => {
  it('placing each fitting piece on every hinted slot in all 5 IWER rooms passes placement checks', () => {
    const codes = new Set([
      'UNKNOWN_SURFACE',
      'LABEL_NOT_ALLOWED',
      'HEIGHT_OUT_OF_RANGE',
      'AREA_TOO_SMALL',
      'SLOPE_TOO_STEEP',
      'OUT_OF_REACH',
    ]);
    const failures: string[] = [];
    let checked = 0;
    for (const room of IWER_ROOM_IDS) {
      const graph = IWER_GRAPHS[room];
      const hinted = compactGraphForPrompt(graph, { hints: true });
      const host = generatePlan(graph, `${graph.roomHash}-iwer-slot`, 'easy');
      for (const node of hinted.nodes) {
        for (const piece of node.fits ?? []) {
          const full = graph.nodes.find((item) => item.id === node.id);
          expect(full).toBeDefined();
          if (full) {
            expect(pieceFitsSurface(piece, full, graph)).toBe(true);
          }
          for (const slot of node.slots ?? []) {
            checked += 1;
            const plan = clonePlan(host);
            const existing = plan.placements.find((item) => item.piece === piece);
            const target = existing ?? plan.placements[0];
            if (!target) {
              continue;
            }
            target.piece = piece;
            target.surface = node.id;
            target.u = slot.u;
            target.v = slot.v;
            if (piece === 'village_hut') {
              plan.start = node.id;
            }
            if (piece === 'crystal_shrine') {
              plan.goal = node.id;
            }
            const issues = validatePlan(plan, graph).issues.filter(
              (item) =>
                item.placementId === target.id && codes.has(item.code)
            );
            if (issues.length > 0) {
              failures.push(
                `${room} ${node.id} ${piece} ${slot.id}: ${issues.map((item) => item.code).join(',')}`
              );
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(failures.slice(0, 8)).toEqual([]);
    expect(failures).toHaveLength(0);
  });
});

describe('placement list size (u/v vs slot id)', () => {
  it('reports JSON byte difference for a typical normal-tier plan', () => {
    const graph = IWER_GRAPHS.office_small;
    const plan = validPlan(graph, 'size-normal-tier', 'normal');
    const catalog = listHintedSlots(graph);
    const uvList = plan.placements.map((placement) => {
      const row: Record<string, unknown> = {
        id: placement.id,
        piece: placement.piece,
        surface: placement.surface,
        u: placement.u,
        v: placement.v,
        playerBuilt: placement.playerBuilt,
        links: placement.links,
      };
      if (placement.to !== undefined) {
        row.to = placement.to;
      }
      return row;
    });
    const slotList = plan.placements.map((placement, index) => {
      const match =
        catalog.find(
          (slot) =>
            slot.surfaceId === placement.surface &&
            slot.fits.includes(placement.piece)
        ) ?? catalog[index % Math.max(catalog.length, 1)];
      const row: Record<string, unknown> = {
        id: placement.id,
        piece: placement.piece,
        slot: match?.id ?? `s${String(index + 1)}`,
        playerBuilt: placement.playerBuilt,
        links: placement.links,
      };
      if (placement.to !== undefined) {
        row.to = placement.to;
      }
      return row;
    });
    const uvBytes = promptGraphJsonBytes(uvList);
    const slotBytes = promptGraphJsonBytes(slotList);
    const saved = uvBytes - slotBytes;
    const pct = uvBytes === 0 ? 0 : (saved / uvBytes) * 100;
    console.log(
      `normal-tier placement list ${graph.roomHash}: u/v ${String(uvBytes)} → slot-id ${String(slotBytes)} bytes (−${String(saved)}, ${pct.toFixed(1)}%) n=${String(plan.placements.length)}`
    );
    expect(slotBytes).toBeLessThan(uvBytes);
    expect(saved).toBeGreaterThan(0);
  });
});
