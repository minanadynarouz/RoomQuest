import { describe, expect, it } from 'vitest';
import { SYNTHETIC_PLATFORM_PORTAL_PLAN } from '@roomquest/fixtures';
import { PORTAL_TELEPORT_DURATION_S } from './constants';
import {
  findPortalPair,
  listPortalPlacements,
  portalFlashScale,
  portalPartnerId,
} from './portal';

describe('portal pair', () => {
  it('finds the fixture pair (max 1)', () => {
    const portals = listPortalPlacements(SYNTHETIC_PLATFORM_PORTAL_PLAN);
    expect(portals).toHaveLength(2);
    const pair = findPortalPair(SYNTHETIC_PLATFORM_PORTAL_PLAN);
    expect(pair).toEqual({ aId: 'p3', bId: 'p4' });
    expect(portalPartnerId(SYNTHETIC_PLATFORM_PORTAL_PLAN, 'p3')).toBe('p4');
    expect(portalPartnerId(SYNTHETIC_PLATFORM_PORTAL_PLAN, 'p4')).toBe('p3');
  });

  it('returns null when the plan has no portals', () => {
    const pair = findPortalPair({
      ...SYNTHETIC_PLATFORM_PORTAL_PLAN,
      placements: SYNTHETIC_PLATFORM_PORTAL_PLAN.placements.filter(
        (p) => p.piece !== 'portal'
      ),
    });
    expect(pair).toBeNull();
  });
});

describe('portalFlashScale', () => {
  it('is 1 at the ends and peaks mid-flash from injected time', () => {
    expect(portalFlashScale(0)).toBe(1);
    expect(portalFlashScale(PORTAL_TELEPORT_DURATION_S)).toBe(1);
    expect(portalFlashScale(-0.1)).toBe(1);
    const mid = portalFlashScale(PORTAL_TELEPORT_DURATION_S / 2);
    expect(mid).toBeGreaterThan(1.2);
    expect(mid).toBeLessThanOrEqual(1.35);
    const rising = portalFlashScale(0.05, 0.35);
    const falling = portalFlashScale(0.32, 0.35);
    expect(rising).toBeGreaterThan(1);
    expect(falling).toBeGreaterThan(1);
    expect(rising).toBeGreaterThan(falling);
  });
});
