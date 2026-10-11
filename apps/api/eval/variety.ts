import type { LevelPlan, SurfaceGraph } from '@roomquest/schema';

export interface PlanVariety {
  distinctSurfaces: number;
  distinctPieceTypes: number;
  pieceTypes: string[];
  surfaceLabels: string[];
}

/** Distinct placement surfaces / piece types, plus graph labels of those surfaces. */
export function planVariety(plan: LevelPlan, graph: SurfaceGraph): PlanVariety {
  const surfaces = new Set<string>();
  const pieces = new Set<string>();
  const labels = new Set<string>();
  const labelById = new Map(
    graph.nodes.map((node) => [node.id, node.label] as const)
  );

  for (const placement of plan.placements) {
    surfaces.add(placement.surface);
    pieces.add(placement.piece);
    const label = labelById.get(placement.surface);
    if (label !== undefined) {
      labels.add(label);
    }
    if (placement.to !== undefined) {
      surfaces.add(placement.to);
      const toLabel = labelById.get(placement.to);
      if (toLabel !== undefined) {
        labels.add(toLabel);
      }
    }
  }

  return {
    distinctSurfaces: surfaces.size,
    distinctPieceTypes: pieces.size,
    pieceTypes: [...pieces].sort(),
    surfaceLabels: [...labels].sort(),
  };
}

export function jaccard(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>
): number {
  if (a.size === 0 && b.size === 0) {
    return 1;
  }
  let inter = 0;
  for (const item of a) {
    if (b.has(item)) {
      inter += 1;
    }
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function meanPairwiseJaccard(
  sets: readonly ReadonlySet<string>[]
): number {
  if (sets.length < 2) {
    return 0;
  }
  let sum = 0;
  let n = 0;
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const left = sets[i];
      const right = sets[j];
      if (left === undefined || right === undefined) {
        continue;
      }
      sum += jaccard(left, right);
      n += 1;
    }
  }
  return n === 0 ? 0 : Math.round((sum / n) * 1000) / 1000;
}

export function unionSetsByRoom(
  runs: readonly {
    roomId: string;
    pieceTypes: readonly string[];
    surfaceLabels: readonly string[];
  }[]
): {
  pieceTypeSets: Set<string>[];
  surfaceLabelSets: Set<string>[];
} {
  const byRoom = new Map<
    string,
    { pieces: Set<string>; labels: Set<string> }
  >();
  for (const run of runs) {
    let acc = byRoom.get(run.roomId);
    if (acc === undefined) {
      acc = { pieces: new Set(), labels: new Set() };
      byRoom.set(run.roomId, acc);
    }
    for (const piece of run.pieceTypes) {
      acc.pieces.add(piece);
    }
    for (const label of run.surfaceLabels) {
      acc.labels.add(label);
    }
  }
  const rooms = [...byRoom.values()];
  return {
    pieceTypeSets: rooms.map((room) => room.pieces),
    surfaceLabelSets: rooms.map((room) => room.labels),
  };
}
