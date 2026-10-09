import { describe, it, expect } from 'vitest';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { SurfaceGraph } from '@roomquest/schema';

describe('Synthetic Living Room Fixture', () => {
  it('validates against the schema', () => {
    const result = SurfaceGraph.safeParse(SYNTHETIC_LIVING_ROOM);
    expect(result.success).toBe(true);
  });

  it('has expected structure', () => {
    expect(SYNTHETIC_LIVING_ROOM.version).toBe(1);
    expect(SYNTHETIC_LIVING_ROOM.roomHash).toBe('f1a2b3c4d5e6');
    expect(SYNTHETIC_LIVING_ROOM.mode).toBe('scene');
    expect(SYNTHETIC_LIVING_ROOM.nodes.length).toBe(5);
    expect(SYNTHETIC_LIVING_ROOM.edges.length).toBeGreaterThan(0);
  });

  it('has correct surface types', () => {
    const labels = SYNTHETIC_LIVING_ROOM.nodes.map((n: { label: string }) => n.label);
    expect(labels).toContain('table');
    expect(labels).toContain('couch');
    expect(labels).toContain('floor');
  });

  it('serializes to under 2KB', () => {
    const serialized = JSON.stringify(SYNTHETIC_LIVING_ROOM);
    expect(serialized.length).toBeLessThan(2048);
  });
});
