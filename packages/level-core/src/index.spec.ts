import { describe, it, expect } from 'vitest';
import { buildSurfaceGraph } from './surface-pipeline';
import { placementToPose, SURFACE_INSET_M } from './placement';
import { generatePlan, repairPlan, validatePlan } from './index';

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
});

