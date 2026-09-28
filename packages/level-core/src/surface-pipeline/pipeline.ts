import type {
  SurfaceGraph,
  SurfaceNode,
  SurfaceEdge,
  SurfaceLabel,
  SurfaceReach,
} from '@roomquest/schema';
import type { SurfaceDescriptor } from './types';
import { sha256 } from './hash';

const CM = 0.01;
const M2 = 0.1;

/**
 * Round value to nearest 5 cm
 */
function roundTo5cm(value: number): number {
  return Math.round(value / 0.05) * 0.05;
}

/**
 * Round value to 0.1 m²
 */
function roundToM2(value: number): number {
  return Math.round(value / M2) * M2;
}

/**
 * Round value to cm
 */
function roundToCm(value: number): number {
  return Math.round(value / CM) * CM;
}

/**
 * Extract quaternion to Euler yaw (rotation around Y axis)
 */
function quaternionToYaw(q: [number, number, number, number]): number {
  const [x, y, z, w] = q;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}

/**
 * Calculate angle between two vectors in degrees
 */
function angleBetweenVectors(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dot =
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const magA = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  const magB = Math.sqrt(b[0] * b[0] + b[1] * b[1] + b[2] * b[2]);
  const cos = dot / (magA * magB);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

interface ProcessedSurface {
  descriptor: SurfaceDescriptor;
  topHeight: number;
  centroid: [number, number, number];
  size: [number, number];
  yaw: number;
  area: number;
  label: SurfaceLabel;
}

/**
 * Step 1-3: Extract, clean, and merge surfaces
 */
export function processSurfaces(
  descriptors: SurfaceDescriptor[],
  floorY: number,
  _startPose: { position: [number, number, number]; forward: [number, number, number] },
): ProcessedSurface[] {
  const processed: ProcessedSurface[] = [];

  for (const desc of descriptors) {
    if (desc.type === 'plane' && desc.orientation !== 'horizontal') {
      continue;
    }

    const pos = desc.pose.position;
    const topHeight = pos[1] - floorY;

    if (topHeight > 1.8) {
      continue;
    }

    if (topHeight >= 0.04) {
      const labelHeight = Math.abs(topHeight);
      if (labelHeight < 0.04) {
        continue;
      }
    }

    let size: [number, number];
    let area: number;

    if (desc.type === 'plane' && desc.extents) {
      size = [desc.extents.width, desc.extents.height];
      area = size[0] * size[1];
    } else if (desc.type === 'mesh' && desc.bounds) {
      const width = desc.bounds.max[0] - desc.bounds.min[0];
      const depth = desc.bounds.max[2] - desc.bounds.min[2];
      size = [width, depth];
      area = width * depth;
    } else {
      size = [0.5, 0.5];
      area = 0.25;
    }

    if (area < 0.04) {
      continue;
    }

    let label: SurfaceLabel;
    if (topHeight < 0.05) {
      label = 'floor';
    } else if (
      ['table', 'desk', 'couch', 'bed', 'shelf', 'storage'].includes(desc.label)
    ) {
      label = desc.label as SurfaceLabel;
    } else if (topHeight >= 0.35 && topHeight <= 0.55 && area >= 0.15) {
      label = 'seat_like';
    } else {
      label = 'other';
    }

    const yaw = quaternionToYaw(desc.pose.orientation);

    processed.push({
      descriptor: desc,
      topHeight: roundTo5cm(topHeight),
      centroid: [roundToCm(pos[0]), roundToCm(pos[1]), roundToCm(pos[2])],
      size,
      yaw,
      area: roundToM2(area),
      label,
    });
  }

  return mergeDuplicates(processed);
}

/**
 * Merge overlapping plane and mesh for the same object
 */
function mergeDuplicates(surfaces: ProcessedSurface[]): ProcessedSurface[] {
  const merged: ProcessedSurface[] = [];
  const used = new Set<number>();

  for (let i = 0; i < surfaces.length; i++) {
    if (used.has(i)) continue;

    const a = surfaces[i];
    if (!a) continue;

    let foundMerge = false;

    for (let j = i + 1; j < surfaces.length; j++) {
      if (used.has(j)) continue;

      const b = surfaces[j];
      if (!b) continue;

      const dist = Math.sqrt(
        (a.centroid[0] - b.centroid[0]) ** 2 +
          (a.centroid[1] - b.centroid[1]) ** 2 +
          (a.centroid[2] - b.centroid[2]) ** 2,
      );

      const areaOverlap = Math.min(a.area, b.area) / Math.max(a.area, b.area);

      if (dist < 0.3 && areaOverlap > 0.5) {
        const largerArea = a.area > b.area ? a : b;
        merged.push({
          ...largerArea,
          label: a.label !== 'other' ? a.label : b.label,
        });
        used.add(i);
        used.add(j);
        foundMerge = true;
        break;
      }
    }

    if (!foundMerge) {
      merged.push(a);
      used.add(i);
    }
  }

  return merged;
}

/**
 * Step 4: Compute reach classification
 */
function computeReach(
  surface: ProcessedSurface,
  startPose: { position: [number, number, number]; forward: [number, number, number] },
): { reach: SurfaceReach; angleFromForward: number } {
  const dx = surface.centroid[0] - startPose.position[0];
  const dy = surface.centroid[1] - startPose.position[1];
  const dz = surface.centroid[2] - startPose.position[2];

  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const toSurface: [number, number, number] = [dx, dy, dz];
  const angle = angleBetweenVectors(startPose.forward, toSurface);

  let reach: SurfaceReach;
  if (angle > 50) {
    reach = 'outOfView';
  } else if (dist <= 0.7) {
    reach = 'hand';
  } else {
    reach = 'ray';
  }

  return { reach, angleFromForward: Math.round(angle) };
}

/**
 * Step 5: Generate edges between surfaces
 */
function generateEdges(surfaces: ProcessedSurface[]): SurfaceEdge[] {
  const edges: SurfaceEdge[] = [];

  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const a = surfaces[i];
      const b = surfaces[j];
      if (!a || !b) continue;

      const dx = a.centroid[0] - b.centroid[0];
      const dz = a.centroid[2] - b.centroid[2];
      const horizontalDist = Math.sqrt(dx * dx + dz * dz);

      const gap = Math.max(
        0,
        horizontalDist - (a.size[0] + b.size[0]) / 2,
      );
      const dh = b.topHeight - a.topHeight;

      let kind: SurfaceEdge['kind'];

      if (gap < 0.05 && Math.abs(dh) < 0.1) {
        kind = 'adjacent';
      } else if (gap >= 0.1 && gap <= 0.9 && Math.abs(dh) <= 0.25) {
        kind = 'plank';
      } else if (gap >= 0.9 && gap <= 1.8 && Math.abs(dh) <= 0.4) {
        kind = 'rope';
      } else if (Math.abs(dh) >= 0.15 && Math.abs(dh) <= 0.6) {
        kind = 'ramp';
      } else {
        kind = 'portalOnly';
      }

      const aIndex = i + 1;
      const bIndex = j + 1;
      edges.push({
        a: `s${String(aIndex)}`,
        b: `s${String(bIndex)}`,
        gap: roundToCm(gap),
        dh: roundToCm(dh),
        kind,
      });
    }
  }

  return edges;
}

/**
 * Step 6: Compute stable room hash
 */
export async function computeRoomHash(surfaces: ProcessedSurface[]): Promise<string> {
  const sorted = [...surfaces]
    .sort((a, b) => b.area - a.area)
    .slice(0, 6);

  const fingerprint = sorted
    .map((s) => {
      const heightStr = s.topHeight.toFixed(2);
      const areaStr = s.area.toFixed(1);
      return `${s.label}|${heightStr}|${areaStr}`;
    })
    .join('|');

  const hash = await sha256(fingerprint);
  return hash.slice(0, 12);
}

/**
 * Step 7: Cap to top 12 surfaces and build the graph
 */
export async function buildSurfaceGraph(
  descriptors: SurfaceDescriptor[],
  floorY: number,
  startPose: { position: [number, number, number]; forward: [number, number, number] },
): Promise<SurfaceGraph> {
  const processed = processSurfaces(descriptors, floorY, startPose);

  if (processed.length < 2) {
    throw new Error('Insufficient surfaces (need at least 2)');
  }

  const scoredSurfaces = processed.map((s) => {
    const reachScore = s.label === 'floor' ? 0 : 1;
    const viewScore = computeReach(s, startPose).angleFromForward > 50 ? 0.5 : 1;
    const score = s.area * reachScore * viewScore;
    return { surface: s, score };
  });

  scoredSurfaces.sort((a, b) => b.score - a.score);
  const top12 = scoredSurfaces.slice(0, 12).map((x) => x.surface);

  const nodes: SurfaceNode[] = top12.map((s, i) => {
    const { reach, angleFromForward } = computeReach(s, startPose);
    const nodeIndex = i + 1;
    const nodeId = `s${String(nodeIndex)}`;
    return {
      id: nodeId,
      label: s.label,
      kind: 'plane',
      topHeight: s.topHeight,
      centroid: s.centroid,
      size: s.size,
      yaw: s.yaw,
      area: s.area,
      reach,
      angleFromForward,
    };
  });

  const edges = generateEdges(top12);
  const roomHash = await computeRoomHash(top12);

  return {
    version: 1,
    roomHash,
    mode: 'scene',
    floorY: roundToCm(floorY),
    nodes,
    edges,
  };
}
