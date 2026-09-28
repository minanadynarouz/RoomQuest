import { describe, it, expect } from 'vitest';
import { SurfaceGraph, LevelPlan } from '@roomquest/schema';
import { SYNTHETIC_LIVING_ROOM } from './graphs/synthetic-living-room.js';
import { SYNTHETIC_LIVING_ROOM_PLAN } from './plans/synthetic-living-room-plan.js';

describe('Fixtures', () => {
  describe('SYNTHETIC_LIVING_ROOM', () => {
    it('is a valid SurfaceGraph', () => {
      const result = SurfaceGraph.parse(SYNTHETIC_LIVING_ROOM);
      expect(result.version).toBe(1);
      expect(result.roomHash).toBe('f1a2b3c4d5e6');
    });

    it('has the expected structure', () => {
      expect(SYNTHETIC_LIVING_ROOM.nodes).toHaveLength(5);
      expect(SYNTHETIC_LIVING_ROOM.edges).toHaveLength(6);
      expect(SYNTHETIC_LIVING_ROOM.mode).toBe('scene');
    });

    it('includes varied surface types', () => {
      const labels = SYNTHETIC_LIVING_ROOM.nodes.map((n) => n.label);
      expect(labels).toContain('table');
      expect(labels).toContain('couch');
      expect(labels).toContain('desk');
      expect(labels).toContain('floor');
    });

    it('includes surfaces at different reaches', () => {
      const reaches = SYNTHETIC_LIVING_ROOM.nodes.map((n) => n.reach);
      expect(reaches).toContain('hand');
      expect(reaches).toContain('ray');
    });

    it('has valid edge kinds for testing', () => {
      const kinds = SYNTHETIC_LIVING_ROOM.edges.map((e) => e.kind);
      expect(kinds).toContain('plank');
      expect(kinds).toContain('adjacent');
      expect(kinds).toContain('ramp');
    });

    it('has stable roomHash', () => {
      // Hash should be exactly 12 hex chars
      expect(SYNTHETIC_LIVING_ROOM.roomHash).toHaveLength(12);
      expect(SYNTHETIC_LIVING_ROOM.roomHash).toMatch(/^[a-f0-9]{12}$/);
    });

    it('all nodes have valid heights', () => {
      SYNTHETIC_LIVING_ROOM.nodes.forEach((node) => {
        expect(node.topHeight).toBeGreaterThanOrEqual(0);
        expect(node.topHeight).toBeLessThanOrEqual(1.8);
      });
    });

    it('all nodes have minimum area', () => {
      SYNTHETIC_LIVING_ROOM.nodes.forEach((node) => {
        expect(node.area).toBeGreaterThanOrEqual(0.04);
      });
    });
  });

  describe('SYNTHETIC_LIVING_ROOM_PLAN', () => {
    it('is a valid LevelPlan', () => {
      const result = LevelPlan.parse(SYNTHETIC_LIVING_ROOM_PLAN);
      expect(result.seed).toBe('f1a2b3c4d5e6-2026-10-14');
    });

    it('has the expected structure', () => {
      expect(SYNTHETIC_LIVING_ROOM_PLAN.placements).toHaveLength(7);
      expect(SYNTHETIC_LIVING_ROOM_PLAN.beats).toHaveLength(3);
      expect(SYNTHETIC_LIVING_ROOM_PLAN.dialogue).toHaveLength(4);
    });

    it('includes village_hut as start', () => {
      const hut = SYNTHETIC_LIVING_ROOM_PLAN.placements.find(
        (p) => p.piece === 'village_hut',
      );
      expect(hut).toBeDefined();
      expect(hut?.surface).toBe(SYNTHETIC_LIVING_ROOM_PLAN.start);
    });

    it('includes crystal_shrine as goal', () => {
      const shrine = SYNTHETIC_LIVING_ROOM_PLAN.placements.find(
        (p) => p.piece === 'crystal_shrine',
      );
      expect(shrine).toBeDefined();
      expect(shrine?.surface).toBe(SYNTHETIC_LIVING_ROOM_PLAN.goal);
    });

    it('has player-built pieces', () => {
      const playerBuilt = SYNTHETIC_LIVING_ROOM_PLAN.placements.filter(
        (p) => p.playerBuilt,
      );
      expect(playerBuilt.length).toBeGreaterThan(0);
      expect(playerBuilt[0]?.piece).toBe('plank_bridge');
    });

    it('has lever-gate linkage', () => {
      const lever = SYNTHETIC_LIVING_ROOM_PLAN.placements.find(
        (p) => p.piece === 'lever',
      );
      const gate = SYNTHETIC_LIVING_ROOM_PLAN.placements.find(
        (p) => p.piece === 'gate',
      );

      expect(lever).toBeDefined();
      expect(gate).toBeDefined();
      expect(lever?.links).toContain(gate?.id);
    });

    it('all placements reference valid surfaces from the graph', () => {
      const surfaceIds = SYNTHETIC_LIVING_ROOM.nodes.map((n) => n.id);

      SYNTHETIC_LIVING_ROOM_PLAN.placements.forEach((placement) => {
        expect(surfaceIds).toContain(placement.surface);
        if (placement.to) {
          expect(surfaceIds).toContain(placement.to);
        }
      });
    });

    it('has gems for scoring', () => {
      const gems = SYNTHETIC_LIVING_ROOM_PLAN.placements.filter(
        (p) => p.piece === 'gem',
      );
      expect(gems.length).toBeGreaterThanOrEqual(2);
      expect(gems.length).toBeLessThanOrEqual(5);
    });

    it('has valid dialogue triggers', () => {
      const triggers = SYNTHETIC_LIVING_ROOM_PLAN.dialogue.map(
        (d) => d.trigger,
      );
      expect(triggers).toContain('intro');
      expect(triggers).toContain('win');
    });

    it('all dialogue lines respect max length', () => {
      SYNTHETIC_LIVING_ROOM_PLAN.dialogue.forEach((d) => {
        expect(d.line.length).toBeLessThanOrEqual(90);
      });
    });

    it('all beat goals respect max length', () => {
      SYNTHETIC_LIVING_ROOM_PLAN.beats.forEach((b) => {
        expect(b.goal.length).toBeLessThanOrEqual(80);
      });
    });

    it('title respects max length', () => {
      expect(SYNTHETIC_LIVING_ROOM_PLAN.title.length).toBeLessThanOrEqual(40);
    });
  });

  describe('Fixtures integration', () => {
    it('plan matches graph surfaces', () => {
      const graphSurfaceIds = SYNTHETIC_LIVING_ROOM.nodes.map((n) => n.id);
      const planSurfaceIds = new Set<string>();

      SYNTHETIC_LIVING_ROOM_PLAN.placements.forEach((p) => {
        planSurfaceIds.add(p.surface);
        if (p.to) planSurfaceIds.add(p.to);
      });

      planSurfaceIds.forEach((id) => {
        expect(graphSurfaceIds).toContain(id);
      });
    });

    it('plan seed includes graph roomHash', () => {
      expect(SYNTHETIC_LIVING_ROOM_PLAN.seed).toContain(
        SYNTHETIC_LIVING_ROOM.roomHash,
      );
    });
  });
});
