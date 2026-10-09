import { describe, expect, it } from 'vitest';
import { checkHudPose, leashedHudOffset } from '../../ui/placement.js';
import { DEBUG_PANEL_OFFSET } from './placement.js';

describe('debug overlay placement', () => {
  it('sits to the side of the HUD and stays readable', () => {
    const eye: [number, number, number] = [0, 1.5, 0];
    const forward: [number, number, number] = [0, 0, -1];
    const panel: [number, number, number] = [
      eye[0] + DEBUG_PANEL_OFFSET[0],
      eye[1] + DEBUG_PANEL_OFFSET[1],
      eye[2] + DEBUG_PANEL_OFFSET[2],
    ];
    const check = checkHudPose(eye, forward, panel);
    expect(check.belowEye).toBe(true);
    expect(check.ok).toBe(true);

    const hud = leashedHudOffset();
    expect(DEBUG_PANEL_OFFSET[0]).not.toBe(hud[0]);
    expect(Math.abs(DEBUG_PANEL_OFFSET[0])).toBeGreaterThan(0.2);
    expect(DEBUG_PANEL_OFFSET[1]).toBeLessThan(hud[1]);
  });
});
