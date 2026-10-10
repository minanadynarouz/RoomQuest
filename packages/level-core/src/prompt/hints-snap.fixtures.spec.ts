import { describe, expect, it } from 'vitest';
import {
  IWER_GRAPHS,
  IWER_ROOM_IDS,
  SYNTHETIC_LIVING_ROOM,
} from '@roomquest/fixtures';
import {
  PIECE_IDS,
  type LevelPlan,
  type PieceId,
  type SurfaceGraph,
  type Tier,
} from '@roomquest/schema';
import { generatePlan } from '../generate/generate-plan';
import { EXTRA_TEST_GRAPHS } from '../generate/test-graphs';
import { createRng } from '../generate/prng';
import { snapPlacementsToSlots } from '../repair/snap-slots';
import {
  graphCanSeparateHutAndShrine,
  graphHasCatalogHut,
} from '../validate/graph-capacity';
import { pieceFitsSurface } from '../validate/piece-fits';
import { validatePlan } from '../validate/validate-plan';
import { compactGraphForPrompt, promptGraphJsonBytes } from './compact-graph';

const EXISTING_ROOMS: { name: string; graph: SurfaceGraph }[] = [
  { name: 'synthetic_living_room', graph: SYNTHETIC_LIVING_ROOM },
  ...EXTRA_TEST_GRAPHS,
];

const IWER_ROOMS: { name: string; graph: SurfaceGraph }[] = IWER_ROOM_IDS.map(
  (id) => ({ name: `iwer_${id}`, graph: IWER_GRAPHS[id] })
);

const ALL_ROOMS = [...EXISTING_ROOMS, ...IWER_ROOMS];

const TIERS: readonly Tier[] = ['easy', 'normal'];
const SEED_COUNT = 10;

const PIECE_ISSUE_CODES = new Set([
  'UNKNOWN_SURFACE',
  'LABEL_NOT_ALLOWED',
  'HEIGHT_OUT_OF_RANGE',
  'AREA_TOO_SMALL',
  'SLOPE_TOO_STEEP',
  'OUT_OF_REACH',
]);

function clonePlan(plan: LevelPlan): LevelPlan {
  return structuredClone(plan);
}

function perturbPlan(
  plan: LevelPlan,
  graph: SurfaceGraph,
  seed: string
): LevelPlan {
  const rng = createRng(`perturb|${seed}`);
  const ids = graph.nodes.map((node) => node.id).sort((a, b) => a.localeCompare(b));
  const next = clonePlan(plan);
  next.placements = next.placements.map((placement) => {
    const moved = {
      ...placement,
      links: [...placement.links],
      u: placement.u + rng.next() * 1.3 - 0.35,
      v: placement.v + rng.next() * 1.3 - 0.35,
    };
    if (ids.length > 1 && rng.next() < 0.7) {
      const others = ids.filter((id) => id !== placement.surface);
      const pick = others[rng.nextInt(others.length)];
      if (pick) {
        moved.surface = pick;
      }
    }
    return moved;
  });
  return next;
}

function hostPlan(graph: SurfaceGraph): LevelPlan {
  return generatePlan(graph, `${graph.roomHash}-hint-host`, 'easy');
}

function placePieceAt(
  host: LevelPlan,
  piece: PieceId,
  surfaceId: string,
  slot: { u: number; v: number }
): { plan: LevelPlan; id: string } {
  const plan = clonePlan(host);
  const existing = plan.placements.find((item) => item.piece === piece);
  if (existing) {
    existing.surface = surfaceId;
    existing.u = slot.u;
    existing.v = slot.v;
    if (piece === 'village_hut') {
      plan.start = surfaceId;
    }
    if (piece === 'crystal_shrine') {
      plan.goal = surfaceId;
    }
    return { plan, id: existing.id };
  }
  const gem = plan.placements.find((item) => item.piece === 'gem');
  if (gem && plan.placements.length >= 14) {
    gem.piece = piece;
    gem.surface = surfaceId;
    gem.u = slot.u;
    gem.v = slot.v;
    gem.to = undefined;
    gem.links = [];
    return { plan, id: gem.id };
  }
  const id = `hint-${piece}`;
  plan.placements.push({
    id,
    piece,
    surface: surfaceId,
    u: slot.u,
    v: slot.v,
    playerBuilt: false,
    links: [],
  });
  return { plan, id };
}

describe('placement hints vs validatePlan', () => {
  it('fits matches pieceFitsSurface on every fixture surface', () => {
    for (const room of ALL_ROOMS) {
      const hinted = compactGraphForPrompt(room.graph, { hints: true });
      for (const node of hinted.nodes) {
        const full = room.graph.nodes.find((item) => item.id === node.id);
        expect(full).toBeDefined();
        if (!full) {
          continue;
        }
        expect(node.fits).toEqual(
          PIECE_IDS.filter((piece) =>
            pieceFitsSurface(piece, full, room.graph)
          )
        );
      }
    }
  });

  it('every hinted slot is validatePlan-clean for each fitting piece', () => {
    const failures: string[] = [];
    let checked = 0;
    for (const room of ALL_ROOMS) {
      const hinted = compactGraphForPrompt(room.graph, { hints: true });
      const host = hostPlan(room.graph);
      for (const node of hinted.nodes) {
        for (const piece of node.fits ?? []) {
          for (const slot of node.slots ?? []) {
            checked += 1;
            const { plan, id } = placePieceAt(host, piece, node.id, slot);
            const result = validatePlan(plan, room.graph);
            const issues = result.issues.filter(
              (item) =>
                item.placementId === id && PIECE_ISSUE_CODES.has(item.code)
            );
            if (issues.length > 0) {
              failures.push(
                `${room.name} ${node.id} ${piece} ${slot.id} ${String(slot.u)},${String(slot.v)}: ${issues.map((item) => item.code).join(',')}`
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

  it('reports hint JSON overhead per room', () => {
    const rows: { name: string; base: number; hinted: number; extra: number }[] =
      [];
    for (const room of ALL_ROOMS) {
      const base = promptGraphJsonBytes(compactGraphForPrompt(room.graph));
      const hinted = promptGraphJsonBytes(
        compactGraphForPrompt(room.graph, { hints: true })
      );
      rows.push({
        name: room.name,
        base,
        hinted,
        extra: hinted - base,
      });
      expect(hinted).toBeGreaterThan(base);
    }
    for (const row of rows) {
      console.log(
        `hint overhead ${row.name}: ${String(row.base)} → ${String(row.hinted)} bytes (+${String(row.extra)})`
      );
    }
    expect(rows).toHaveLength(ALL_ROOMS.length);
  });
});

function isFullQualityRoom(graph: SurfaceGraph): boolean {
  return graphHasCatalogHut(graph) && graphCanSeparateHutAndShrine(graph);
}

describe('snapPlacementsToSlots restore rate', () => {
  it('restores ≥ 95% of perturbed generatePlan outputs (2 tiers × 10 seeds)', () => {
    let attempted = 0;
    let restored = 0;
    let generatedOk = 0;
    let degradedAttempted = 0;
    let degradedRestored = 0;
    const failures: string[] = [];

    for (const room of ALL_ROOMS) {
      const fullQuality = isFullQualityRoom(room.graph);
      for (const tier of TIERS) {
        for (let i = 0; i < SEED_COUNT; i += 1) {
          const seed = `${room.graph.roomHash}-snap-${tier}-${String(i)}`;
          const plan = generatePlan(room.graph, seed, tier);
          if (!validatePlan(plan, room.graph).ok) {
            continue;
          }
          generatedOk += 1;
          const dirty = perturbPlan(plan, room.graph, seed);
          const snapped = snapPlacementsToSlots(dirty, room.graph);
          const result = validatePlan(snapped.plan, room.graph);
          if (fullQuality) {
            attempted += 1;
            if (result.ok) {
              restored += 1;
            } else {
              failures.push(
                `${room.name} ${tier} ${seed}: ${result.issues.map((item) => item.code).join(',')}`
              );
            }
          } else {
            degradedAttempted += 1;
            if (result.ok) {
              degradedRestored += 1;
            }
          }
        }
      }
    }

    const rate = attempted === 0 ? 0 : restored / attempted;
    const degradedRate =
      degradedAttempted === 0 ? 0 : degradedRestored / degradedAttempted;
    console.log(
      `snap restore ${String(restored)}/${String(attempted)}` +
        ` (${(rate * 100).toFixed(1)}%) from ${String(generatedOk)} valid generatePlan seeds` +
        ` across full-quality rooms (${String(ALL_ROOMS.length)} rooms × ${String(TIERS.length)} tiers × ${String(SEED_COUNT)} seeds)`
    );
    console.log(
      `snap restore degraded IWER ${String(degradedRestored)}/${String(degradedAttempted)}` +
        ` (${(degradedRate * 100).toFixed(1)}%)`
    );
    if (failures.length > 0) {
      console.log(`snap restore failures (first 12): ${failures.slice(0, 12).join(' | ')}`);
    }
    expect(attempted).toBeGreaterThan(0);
    expect(rate).toBeGreaterThanOrEqual(0.95);
  });
});
