import {
  KIT_CATALOG,
  type SurfaceGraph,
  type SurfaceNode,
} from '@roomquest/schema';
import { placementToPose, type WorldPose } from '../placement/pose';
import type { VillageAnchorFallbackReason, VillageAnchorStorage } from './types';
import {
  isVillageAnchorStorageAvailable,
  readVillageAnchorHandle,
} from './storage';

const HUT = KIT_CATALOG.village_hut;
const TABLE_LABELS = new Set(HUT.allowedSurfaces ?? ['table', 'desk']);

function fitsHut(node: SurfaceNode): boolean {
  if (!TABLE_LABELS.has(node.label)) return false;
  if (HUT.minArea !== undefined && node.area < HUT.minArea) return false;
  if (HUT.minHeight !== undefined && node.topHeight < HUT.minHeight) {
    return false;
  }
  if (HUT.maxHeight !== undefined && node.topHeight > HUT.maxHeight) {
    return false;
  }
  return true;
}

function compareTables(a: SurfaceNode, b: SurfaceNode): number {
  if (b.area !== a.area) return b.area - a.area;
  if (a.angleFromForward !== b.angleFromForward) {
    return a.angleFromForward - b.angleFromForward;
  }
  return a.id.localeCompare(b.id);
}

/**
 * Largest table/desk that can host a `village_hut`. If none meet the kit
 * constraints, the largest table/desk still wins so restore-failure has a
 * place to land. Returns `null` only when the graph has no table/desk.
 */
export function chooseLargestTable(graph: SurfaceGraph): SurfaceNode | null {
  const tables = graph.nodes.filter((node) => TABLE_LABELS.has(node.label));
  if (tables.length === 0) return null;
  const fitting = tables.filter(fitsHut);
  const pool = fitting.length > 0 ? fitting : tables;
  const ranked = [...pool].sort(compareTables);
  return ranked[0] ?? null;
}

/** Hut pose at the centre of {@link chooseLargestTable}, or `null`. */
export function villageFallbackPose(graph: SurfaceGraph): WorldPose | null {
  const table = chooseLargestTable(graph);
  if (!table) return null;
  return placementToPose(graph, { surface: table.id, u: 0.5, v: 0.5 });
}

export interface VillageAnchorChoiceInput {
  storage: VillageAnchorStorage | null | undefined;
  persistentAnchorsSupported: boolean;
  graph: SurfaceGraph;
}

/**
 * Decide restore vs largest-table fallback. Pure: no XR, no timers.
 *
 * Restore only when storage is available, a UUID handle is present, and the
 * runtime advertised persistent-anchor APIs. Otherwise fall back.
 */
export function chooseVillageAnchorPlacement(
  input: VillageAnchorChoiceInput
): {
  kind: 'restore' | 'fallback';
  handle: string | null;
  reason: VillageAnchorFallbackReason | null;
  surfaceId: string | null;
} {
  const table = chooseLargestTable(input.graph);
  const surfaceId = table?.id ?? null;

  if (!isVillageAnchorStorageAvailable(input.storage)) {
    return {
      kind: 'fallback',
      handle: null,
      reason: 'storage-unavailable',
      surfaceId,
    };
  }

  if (!input.persistentAnchorsSupported) {
    return {
      kind: 'fallback',
      handle: readVillageAnchorHandle(input.storage),
      reason: 'anchors-unsupported',
      surfaceId,
    };
  }

  const handle = readVillageAnchorHandle(input.storage);
  if (!handle) {
    return {
      kind: 'fallback',
      handle: null,
      reason: 'no-stored-handle',
      surfaceId,
    };
  }

  return {
    kind: 'restore',
    handle,
    reason: null,
    surfaceId,
  };
}
