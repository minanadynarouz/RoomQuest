import {
  PIECE_IDS,
  type PieceId,
  type SurfaceGraph,
  type SurfaceNode,
} from '@roomquest/schema';
import { createRng, type Rng } from '../generate/prng';
import { pieceFitsSurface } from '../validate/piece-fits';
import {
  footprintFitsSurface,
  largestFittingFootprint,
  orientFootprint,
  pieceFootprint,
  usableSize,
  type PieceFootprint,
} from './footprints';

const SLOT_CAP = 4;
const SNAP_SLOT_CAP = 16;
const EPS = 1e-6;

export interface UvRange {
  /** Inclusive usable u/v box: `[u0, v0, u1, v1]`, centimetre-rounded. */
  uv: [number, number, number, number];
  footprint: PieceFootprint;
}

export interface SurfaceHints {
  fits: PieceId[];
  uv: [number, number, number, number];
  slots: [number, number][];
}

function quantize(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) {
    return 0;
  }
  return Number(rounded.toFixed(2));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.5;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

/** Pieces whose KIT_CATALOG size / orientation rules accept `surface`. */
export function fittingPieces(
  surface: SurfaceNode,
  graph: SurfaceGraph
): PieceId[] {
  return PIECE_IDS.filter((piece) =>
    pieceFitsSurface(piece, surface, graph)
  );
}

/**
 * Usable u/v box inset by `footprint` (half-extent on each side).
 * `u,v ∈ [0,1]` already span the 3 cm pose inset (`placementToPose`).
 */
export function uvRangeForFootprint(
  surface: SurfaceNode,
  footprint: PieceFootprint
): [number, number, number, number] | null {
  const [uw, ud] = usableSize(surface);
  const oriented = orientFootprint(footprint, uw, ud);
  if (!oriented) {
    return null;
  }
  if (uw <= EPS || ud <= EPS) {
    return [0.5, 0.5, 0.5, 0.5];
  }
  const hu = oriented.w / 2 / uw;
  const hv = oriented.d / 2 / ud;
  if (hu > 0.5 + EPS || hv > 0.5 + EPS) {
    return null;
  }
  const u0 = clamp01(hu);
  const v0 = clamp01(hv);
  const u1 = clamp01(1 - hu);
  const v1 = clamp01(1 - hv);
  if (u0 > u1 + EPS || v0 > v1 + EPS) {
    return null;
  }
  return [u0, v0, u1, v1];
}

export function pieceUvRange(
  surface: SurfaceNode,
  piece: PieceId
): [number, number, number, number] | null {
  const [uw, ud] = usableSize(surface);
  const oriented = orientFootprint(pieceFootprint(piece), uw, ud);
  if (!oriented) {
    return null;
  }
  return uvRangeForFootprint(surface, oriented);
}

export function uvInside(
  u: number,
  v: number,
  range: readonly [number, number, number, number],
  slack = 1e-4
): boolean {
  return (
    u + slack >= range[0] &&
    v + slack >= range[1] &&
    u - slack <= range[2] &&
    v - slack <= range[3]
  );
}

function uniqueSorted(values: readonly number[]): number[] {
  const rounded = values.map(quantize);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of rounded) {
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  out.sort((a, b) => a - b);
  return out;
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function candidatesInRange(
  range: readonly [number, number, number, number]
): [number, number][] {
  const [u0, v0, u1, v1] = range;
  const uSpan = u1 - u0;
  const vSpan = v1 - v0;
  const uVals = uniqueSorted(
    uSpan < 0.02
      ? [(u0 + u1) / 2]
      : [u0, mix(u0, u1, 0.25), 0.5, mix(u0, u1, 0.75), u1]
  ).filter((u) => u + EPS >= u0 && u - EPS <= u1);
  const vVals = uniqueSorted(
    vSpan < 0.02
      ? [(v0 + v1) / 2]
      : [v0, mix(v0, v1, 0.25), 0.5, mix(v0, v1, 0.75), v1]
  ).filter((v) => v + EPS >= v0 && v - EPS <= v1);

  const points: [number, number][] = [];
  for (const u of uVals) {
    for (const v of vVals) {
      points.push([quantize(u), quantize(v)]);
    }
  }
  points.sort((a, b) => {
    const da = Math.hypot(a[0] - 0.5, a[1] - 0.5);
    const db = Math.hypot(b[0] - 0.5, b[1] - 0.5);
    return da - db || a[0] - b[0] || a[1] - b[1];
  });
  return points;
}

export function orientedFootprint(
  surface: SurfaceNode,
  piece: PieceId
): PieceFootprint | null {
  const [uw, ud] = usableSize(surface);
  return orientFootprint(pieceFootprint(piece), uw, ud);
}

export function footprintsOverlap(
  a: { u: number; v: number; fp: PieceFootprint },
  b: { u: number; v: number; fp: PieceFootprint },
  surface: SurfaceNode
): boolean {
  const [uw, ud] = usableSize(surface);
  if (uw <= EPS && ud <= EPS) {
    return true;
  }
  const ax = a.u * uw;
  const az = a.v * ud;
  const bx = b.u * uw;
  const bz = b.v * ud;
  const overlapU = Math.abs(ax - bx) + EPS < (a.fp.w + b.fp.w) / 2;
  const overlapV = Math.abs(az - bz) + EPS < (a.fp.d + b.fp.d) / 2;
  return overlapU && overlapV;
}

function shufflePoints(points: [number, number][], rng: Rng): void {
  for (let i = points.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1);
    const a = points[i];
    const b = points[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    points[i] = b;
    points[j] = a;
  }
}

function pickNonOverlapping(
  surface: SurfaceNode,
  range: readonly [number, number, number, number],
  footprint: PieceFootprint,
  cap: number,
  rng?: Rng
): [number, number][] {
  const points = candidatesInRange(range);
  if (rng !== undefined && points.length > 1) {
    shufflePoints(points, rng);
  }
  const slots: [number, number][] = [];
  for (const point of points) {
    if (slots.length >= cap) {
      break;
    }
    const next = { u: point[0], v: point[1], fp: footprint };
    const hits = slots.some((slot) =>
      footprintsOverlap(next, { u: slot[0], v: slot[1], fp: footprint }, surface)
    );
    if (!hits) {
      slots.push(point);
    }
  }
  if (slots.length === 0) {
    const mid: [number, number] = [
      quantize((range[0] + range[2]) / 2),
      quantize((range[1] + range[3]) / 2),
    ];
    slots.push(mid);
  }
  return slots;
}

export function listSlots(
  surface: SurfaceNode,
  footprint: PieceFootprint,
  cap = SLOT_CAP,
  rng?: Rng
): [number, number][] {
  const range = uvRangeForFootprint(surface, footprint);
  if (!range) {
    return [[0.5, 0.5]];
  }
  const quantized: [number, number, number, number] = [
    quantize(range[0]),
    quantize(range[1]),
    quantize(range[2]),
    quantize(range[3]),
  ];
  return pickNonOverlapping(surface, quantized, footprint, cap, rng);
}

export function listSlotsForPiece(
  surface: SurfaceNode,
  piece: PieceId,
  cap = SNAP_SLOT_CAP
): [number, number][] {
  const oriented = orientedFootprint(surface, piece);
  if (!oriented) {
    return [];
  }
  return listSlots(surface, oriented, cap);
}

export interface SurfaceHintOptions {
  /** When set, shuffle candidate u/v points with a seeded PRNG. */
  seed?: string;
}

/**
 * Per-surface director hints. `fits` follows {@link pieceFitsSurface};
 * `uv` / `slots` are inset by the largest geometrically fitting footprint.
 * Omit `seed` for the #61 candidate order; pass it to rotate/jitter.
 */
export function surfaceHints(
  surface: SurfaceNode,
  graph: SurfaceGraph,
  opts?: SurfaceHintOptions
): SurfaceHints {
  const fits = fittingPieces(surface, graph);
  const largest = largestFittingFootprint(
    surface,
    fits.filter((piece) => footprintFitsSurface(piece, surface))
  );
  const rng =
    opts?.seed !== undefined
      ? createRng(`${opts.seed}|hint-slot|${surface.id}`)
      : undefined;
  if (!largest) {
    return {
      fits,
      uv: [0, 0, 1, 1],
      slots: [[0.5, 0.5]],
    };
  }
  const range = uvRangeForFootprint(surface, largest) ?? [0, 0, 1, 1];
  const uv: [number, number, number, number] = [
    quantize(range[0]),
    quantize(range[1]),
    quantize(range[2]),
    quantize(range[3]),
  ];
  return {
    fits,
    uv,
    slots: listSlots(surface, largest, SLOT_CAP, rng),
  };
}

export function quantizeUv(u: number, v: number): [number, number] {
  return [quantize(clamp01(u)), quantize(clamp01(v))];
}
