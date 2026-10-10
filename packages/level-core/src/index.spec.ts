import { describe, it, expect } from 'vitest';
import { buildSurfaceGraph } from './surface-pipeline';
import { placementToPose, SURFACE_INSET_M } from './placement';
import {
  generatePlan,
  repairPlan,
  validatePlan,
  explorerPath,
  resolveLeverGates,
  applyLeverPull,
  tickSlime,
  stunSlime,
  canExplorerPassSlime,
  compactGraphForPrompt,
  graphCanSeparateHutAndShrine,
  graphHasCatalogHut,
  graphHasPlayableView,
  MAX_VIEW_ANGLE_DEG,
  MIN_PATH_DISTANCE_M,
  RAMP_FLOOR_RUN_FACTOR,
  BEAT_COMPLETABILITY,
  relaxedRulesFor,
  promptGraphJsonBytes,
  snapPlacementsToSlots,
  resolveSlotIds,
  hintedSlotIds,
  PlacementSlotId,
  orderSurfacesByArea,
  tickRoomReading,
  wanderPath,
} from './index';
import { findNearestSnapTarget, SNAP_RADIUS_M } from './snap';
import {
  chooseLargestTable,
  readVillageAnchorHandle,
  writeVillageAnchorHandle,
} from './anchor';

describe('level-core', () => {
  it('exports buildSurfaceGraph', () => {
    expect(buildSurfaceGraph).toBeDefined();
  });

  it('exports placementToPose and the 3 cm inset constant', () => {
    expect(placementToPose).toBeTypeOf('function');
    expect(SURFACE_INSET_M).toBe(0.03);
  });

  it('exports validatePlan, repairPlan, and generatePlan', () => {
    expect(validatePlan).toBeTypeOf('function');
    expect(repairPlan).toBeTypeOf('function');
    expect(generatePlan).toBeTypeOf('function');
  });

  it('exports findNearestSnapTarget and the 10 cm snap radius', () => {
    expect(findNearestSnapTarget).toBeTypeOf('function');
    expect(SNAP_RADIUS_M).toBe(0.1);
  });

  it('exports explorerPath', () => {
    expect(explorerPath).toBeTypeOf('function');
  });

  it('exports village-anchor fallback and storage helpers', () => {
    expect(chooseLargestTable).toBeTypeOf('function');
    expect(readVillageAnchorHandle).toBeTypeOf('function');
    expect(writeVillageAnchorHandle).toBeTypeOf('function');
  });

  it('exports lever-gate link helpers', () => {
    expect(resolveLeverGates).toBeTypeOf('function');
    expect(applyLeverPull).toBeTypeOf('function');
  });

  it('exports slime patrol, stun, and pass-check helpers', () => {
    expect(tickSlime).toBeTypeOf('function');
    expect(stunSlime).toBeTypeOf('function');
    expect(canExplorerPassSlime).toBeTypeOf('function');
  });

  it('exports compactGraphForPrompt for the director user message', () => {
    expect(compactGraphForPrompt).toBeTypeOf('function');
    expect(promptGraphJsonBytes).toBeTypeOf('function');
  });

  it('exports snapPlacementsToSlots as a local geometry repair', () => {
    expect(snapPlacementsToSlots).toBeTypeOf('function');
  });

  it('exports graph-capacity helpers used by director waiver lines', () => {
    expect(graphCanSeparateHutAndShrine).toBeTypeOf('function');
    expect(graphHasCatalogHut).toBeTypeOf('function');
    expect(graphHasPlayableView).toBeTypeOf('function');
    expect(relaxedRulesFor).toBeTypeOf('function');
    expect(MAX_VIEW_ANGLE_DEG).toBe(50);
    expect(MIN_PATH_DISTANCE_M).toBe(0.8);
    expect(RAMP_FLOOR_RUN_FACTOR).toBe(2);
    expect(BEAT_COMPLETABILITY.leverReach).toBe('hand|ray');
  });

  it('exports resolveSlotIds, hintedSlotIds, and PlacementSlotId', () => {
    expect(resolveSlotIds).toBeTypeOf('function');
    expect(hintedSlotIds).toBeTypeOf('function');
    expect(PlacementSlotId).toBeDefined();
    expect(
      PlacementSlotId.parse({
        id: 'p1',
        piece: 'gem',
        slot: 's1',
        to: null,
        playerBuilt: false,
        links: [],
      }).slot
    ).toBe('s1');
  });

  it('exports room-reading order, wander, and sequencer', () => {
    expect(orderSurfacesByArea).toBeTypeOf('function');
    expect(wanderPath).toBeTypeOf('function');
    expect(tickRoomReading).toBeTypeOf('function');
  });
});

describe('level-core platform exports (X-07)', () => {
  it('exports rail clamp, alignment, and portal flash', async () => {
    const mod = await import('./index');
    expect(mod.clampToRail).toBeTypeOf('function');
    expect(mod.isPlatformAligned).toBeTypeOf('function');
    expect(mod.buildPlatformRail).toBeTypeOf('function');
    expect(mod.portalFlashScale).toBeTypeOf('function');
    expect(mod.findPortalPair).toBeTypeOf('function');
    expect(mod.MAX_RAIL_LENGTH_M).toBe(1);
    expect(mod.PLATFORM_ALIGN_EPS_M).toBe(0.03);
  });
});
