import { describe, it, expect } from 'vitest';
import { buildSurfaceGraph } from './surface-pipeline';
import { placementToPose, SURFACE_INSET_M } from './placement';
import { generatePlan, repairPlan, validatePlan, explorerPath } from './index';
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
});
