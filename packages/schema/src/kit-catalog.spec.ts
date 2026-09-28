import { describe, it, expect } from 'vitest';
import {
  KIT_CATALOG,
  getPieceConstraints,
  isPieceId,
} from './kit-catalog.js';
import { PIECE_IDS } from './piece.js';

describe('KIT_CATALOG', () => {
  it('contains all 10 MVP pieces', () => {
    const expectedPieces = [
      'village_hut',
      'crystal_shrine',
      'plank_bridge',
      'ramp',
      'moving_platform',
      'gate',
      'lever',
      'gem',
      'slime',
      'portal',
    ];

    expectedPieces.forEach((piece) => {
      expect(KIT_CATALOG[piece as keyof typeof KIT_CATALOG]).toBeDefined();
    });

    expect(Object.keys(KIT_CATALOG)).toHaveLength(10);
  });

  it('has correct constraints for village_hut (PRD §4.2)', () => {
    const hut = KIT_CATALOG.village_hut;
    expect(hut.id).toBe('village_hut');
    expect(hut.allowedSurfaces).toContain('table');
    expect(hut.allowedSurfaces).toContain('desk');
    expect(hut.minArea).toBe(0.3);
    expect(hut.minHeight).toBe(0.4);
    expect(hut.maxHeight).toBe(1.1);
    expect(hut.maxAngleFromForward).toBe(50);
  });

  it('has correct constraints for crystal_shrine', () => {
    const shrine = KIT_CATALOG.crystal_shrine;
    expect(shrine.id).toBe('crystal_shrine');
    expect(shrine.role).toBe('Goal');
    expect(shrine.maxPerLevel).toBe(1);
    expect(shrine.allowedSurfaces).toBeNull(); // any horizontal
  });

  it('has correct constraints for plank_bridge (PRD §4.2)', () => {
    const plank = KIT_CATALOG.plank_bridge;
    expect(plank.minGap).toBe(0.1);
    expect(plank.maxGap).toBe(0.9);
    expect(plank.maxDeltaHeight).toBe(0.25);
    expect(plank.requiresSecondSurface).toBe(true);
  });

  it('has correct constraints for ramp (PRD §4.2)', () => {
    const ramp = KIT_CATALOG.ramp;
    expect(ramp.maxDeltaHeight).toBe(0.6);
    expect(ramp.requiresSecondSurface).toBe(true);
  });

  it('has correct constraints for moving_platform (PRD §4.2)', () => {
    const platform = KIT_CATALOG.moving_platform;
    expect(platform.allowedSurfaces).toContain('table');
    expect(platform.allowedSurfaces).toContain('desk');
    expect(platform.allowedSurfaces).toContain('floor');
    expect(platform.maxPerLevel).toBe(1);
  });

  it('has correct constraints for gate (PRD §4.2)', () => {
    const gate = KIT_CATALOG.gate;
    expect(gate.mustBeOnPath).toBe(true);
  });

  it('has correct constraints for lever (PRD §4.2)', () => {
    const lever = KIT_CATALOG.lever;
    expect(lever.maxReachDistance).toBe(0.7);
    expect(lever.maxAngleFromForward).toBe(50);
  });

  it('has correct constraints for slime (PRD §4.2)', () => {
    const slime = KIT_CATALOG.slime;
    expect(slime.allowedSurfaces).toContain('couch');
    expect(slime.allowedSurfaces).toContain('bed');
    expect(slime.allowedSurfaces).toContain('table');
    expect(slime.minArea).toBe(0.5);
  });

  it('has correct constraints for portal (PRD §4.2)', () => {
    const portal = KIT_CATALOG.portal;
    expect(portal.requiresSecondSurface).toBe(true);
    expect(portal.maxPerLevel).toBe(2); // pair
    expect(portal.maxAngleFromForward).toBe(50);
  });

  describe('getPieceConstraints', () => {
    it('returns constraints for valid piece id', () => {
      const constraints = getPieceConstraints('village_hut');
      expect(constraints.id).toBe('village_hut');
      expect(constraints.role).toBe('Start point');
    });

    it('returns constraints for all piece ids', () => {
      PIECE_IDS.forEach((id) => {
        const constraints = getPieceConstraints(id);
        expect(constraints.id).toBe(id);
      });
    });
  });

  describe('isPieceId', () => {
    it('returns true for valid piece ids', () => {
      PIECE_IDS.forEach((id) => {
        expect(isPieceId(id)).toBe(true);
      });
    });

    it('returns false for invalid ids', () => {
      expect(isPieceId('invalid')).toBe(false);
      expect(isPieceId('rope_bridge')).toBe(false); // post-MVP
      expect(isPieceId('')).toBe(false);
    });
  });

  it('is structured for easy post-MVP additions', () => {
    // The catalog uses a typed record with const arrays for PIECE_IDS
    // Adding new pieces requires:
    // 1. Add to PIECE_IDS array
    // 2. Add entry to KIT_CATALOG
    // This structure makes additions easy while maintaining type safety
    expect(typeof KIT_CATALOG).toBe('object');
    expect(Array.isArray(PIECE_IDS)).toBe(true);
  });

  it('ensures all catalog entries match PIECE_IDS', () => {
    const catalogIds = Object.keys(KIT_CATALOG).sort();
    const pieceIds = PIECE_IDS.slice().sort();
    expect(catalogIds).toEqual(pieceIds);
  });
});
