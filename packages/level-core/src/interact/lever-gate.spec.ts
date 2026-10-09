import { describe, expect, it } from 'vitest';
import { SYNTHETIC_LIVING_ROOM_PLAN } from '@roomquest/fixtures';
import type { LevelPlan, Placement } from '@roomquest/schema';
import {
  GATE_OPEN_ANGLE_RAD,
  GATE_OPEN_DURATION_S,
  applyLeverPull,
  emptyLeverGateState,
  gateLeafRotationX,
  gateOpenProgress,
  leverHandleRotationX,
  resolveAllLeverLinks,
  resolveLeverGates,
} from './lever-gate';

const PLAN = SYNTHETIC_LIVING_ROOM_PLAN;

function withPlacements(extra: Placement[]): LevelPlan {
  return { ...PLAN, placements: [...PLAN.placements, ...extra] };
}

describe('resolveLeverGates', () => {
  it('honours the fixture lever → gate links', () => {
    expect(resolveLeverGates(PLAN, 'p4')).toEqual(['p3']);
    const all = resolveAllLeverLinks(PLAN);
    expect([...all.keys()]).toEqual(['p4']);
    expect(all.get('p4')).toEqual(['p3']);
  });

  it('drops unknown ids and non-gate targets', () => {
    const plan = withPlacements([]);
    const mutated: LevelPlan = {
      ...plan,
      placements: plan.placements.map((placement) =>
        placement.id === 'p4'
          ? { ...placement, links: ['p3', 'missing', 'p1', 'p3'] }
          : placement
      ),
    };
    expect(resolveLeverGates(mutated, 'p4')).toEqual(['p3']);
  });

  it('returns empty for a missing or non-lever id', () => {
    expect(resolveLeverGates(PLAN, 'p3')).toEqual([]);
    expect(resolveLeverGates(PLAN, 'nope')).toEqual([]);
  });
});

describe('applyLeverPull', () => {
  it('pulls once and opens only the linked gate', () => {
    const state = emptyLeverGateState();
    const first = applyLeverPull(state, PLAN, 'p4');
    expect(first.pulled).toBe(true);
    expect(first.openedGates).toEqual(['p3']);
    expect(state.pulledLevers.has('p4')).toBe(true);
    expect(state.openGates.has('p3')).toBe(true);

    const second = applyLeverPull(state, PLAN, 'p4');
    expect(second.pulled).toBe(false);
    expect(second.openedGates).toEqual([]);
  });

  it('does not open an unlinked gate', () => {
    const plan = withPlacements([
      {
        id: 'pGate2',
        piece: 'gate',
        surface: 's1',
        u: 0.1,
        v: 0.1,
        playerBuilt: false,
        links: [],
      },
    ]);
    const state = emptyLeverGateState();
    const result = applyLeverPull(state, plan, 'p4');
    expect(result.openedGates).toEqual(['p3']);
    expect(state.openGates.has('pGate2')).toBe(false);
  });

  it('ignores a non-lever pull', () => {
    const state = emptyLeverGateState();
    expect(applyLeverPull(state, PLAN, 'p3')).toEqual({
      pulled: false,
      openedGates: [],
    });
    expect(state.pulledLevers.size).toBe(0);
  });

  it('two levers can share a gate without double-opening', () => {
    const plan = withPlacements([
      {
        id: 'pLever2',
        piece: 'lever',
        surface: 's1',
        u: 0.15,
        v: 0.15,
        playerBuilt: false,
        links: ['p3'],
      },
    ]);
    const state = emptyLeverGateState();
    expect(applyLeverPull(state, plan, 'p4').openedGates).toEqual(['p3']);
    expect(applyLeverPull(state, plan, 'pLever2')).toEqual({
      pulled: true,
      openedGates: [],
    });
    expect(state.pulledLevers.has('pLever2')).toBe(true);
  });
});

describe('gateOpenProgress (injected time)', () => {
  it('is 0 at t=0, 1 at duration, and eases in between', () => {
    expect(gateOpenProgress(0)).toBe(0);
    expect(gateOpenProgress(-1)).toBe(0);
    expect(gateOpenProgress(GATE_OPEN_DURATION_S)).toBe(1);
    expect(gateOpenProgress(GATE_OPEN_DURATION_S + 4)).toBe(1);
    const mid = gateOpenProgress(GATE_OPEN_DURATION_S / 2);
    expect(mid).toBeGreaterThan(0.5);
    expect(mid).toBeLessThan(1);
    let elapsed = 0;
    const dt = 1 / 72;
    let last = 0;
    while (elapsed < GATE_OPEN_DURATION_S) {
      elapsed += dt;
      const next = gateOpenProgress(elapsed);
      expect(next).toBeGreaterThanOrEqual(last);
      last = next;
    }
    expect(last).toBe(1);
  });

  it('maps progress to leaf and lever angles without allocating', () => {
    expect(gateLeafRotationX(0)).toBe(0);
    expect(gateLeafRotationX(1)).toBe(GATE_OPEN_ANGLE_RAD);
    expect(leverHandleRotationX(0)).toBe(0);
    expect(leverHandleRotationX(1)).toBeGreaterThan(0);
  });
});
