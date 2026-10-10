import { describe, expect, it } from 'vitest';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import type { SurfaceGraph, SurfaceNode } from '@roomquest/schema';
import { EXTRA_TEST_GRAPHS } from '../generate/test-graphs';
import { compactGraphForPrompt, promptGraphJsonBytes } from './compact-graph';

const DROPPED_GRAPH_KEYS = ['version', 'roomHash', 'floorY'] as const;
const DROPPED_NODE_KEYS = ['kind', 'yaw'] as const;

function noisyLivingRoom(): SurfaceGraph {
  const node = (index: number, base: SurfaceNode): SurfaceNode => ({
    ...base,
    topHeight: base.topHeight + 0.0001234 + index * 1e-7,
    centroid: [
      base.centroid[0] + 0.00098765,
      base.centroid[1] + 0.00011111,
      base.centroid[2] - 0.00022222,
    ],
    size: [base.size[0] + 0.00033333, base.size[1] + 0.00044444],
    yaw: Math.PI / 3 + index * 0.00056789,
    area: base.area + 0.00055555,
    angleFromForward: base.angleFromForward + 0.49,
  });

  return {
    ...SYNTHETIC_LIVING_ROOM,
    floorY: 0.0000001,
    nodes: SYNTHETIC_LIVING_ROOM.nodes.map((n, i) => node(i, n)),
    edges: SYNTHETIC_LIVING_ROOM.edges.map((edge, i) => ({
      ...edge,
      gap: edge.gap + 0.00066666 + i * 1e-6,
      dh: edge.dh - 0.00077777,
    })),
  };
}

function twelveNodeNoisyGraph(): SurfaceGraph {
  const base = noisyLivingRoom();
  const nodes = [...base.nodes];
  const edges = [...base.edges];
  for (let i = 6; i <= 12; i += 1) {
    nodes.push({
      id: `s${String(i)}`,
      label: 'table',
      kind: 'merged',
      topHeight: 0.751234567,
      centroid: [i * 0.400000001, 0.750000009, 1.000000013],
      size: [0.600000021, 0.600000034],
      yaw: 1.23456789,
      area: 0.360000089,
      reach: 'ray',
      angleFromForward: 15.49,
    });
    edges.push({
      a: 's1',
      b: `s${String(i)}`,
      gap: 0.200000045,
      dh: -0.000000012,
      kind: 'adjacent',
    });
  }
  return { ...base, nodes, edges };
}

describe('compactGraphForPrompt', () => {
  it('drops scan metadata and keeps placement fields', () => {
    const compact = compactGraphForPrompt(SYNTHETIC_LIVING_ROOM);

    expect(compact.mode).toBe('scene');
    for (const key of DROPPED_GRAPH_KEYS) {
      expect(compact).not.toHaveProperty(key);
    }

    expect(compact.nodes).toHaveLength(SYNTHETIC_LIVING_ROOM.nodes.length);
    const first = compact.nodes[0];
    expect(first).toEqual({
      id: 's1',
      label: 'table',
      topHeight: 0.75,
      centroid: [0, 0.75, -1],
      size: [1, 0.6],
      area: 0.6,
      reach: 'hand',
      angleFromForward: 0,
    });
    for (const key of DROPPED_NODE_KEYS) {
      expect(first).not.toHaveProperty(key);
    }

    expect(compact.edges).toEqual([
      { a: 's1', b: 's2', gap: 0.6, dh: -0.3, kind: 'plank' },
      { a: 's1', b: 's3', gap: 0.5, dh: -0.25, kind: 'plank' },
      { a: 's2', b: 's4', gap: 0.1, dh: 0.15, kind: 'adjacent' },
      { a: 's1', b: 's5', gap: 0, dh: -0.75, kind: 'ramp' },
      { a: 's3', b: 's5', gap: 0, dh: -0.5, kind: 'ramp' },
      { a: 's2', b: 's5', gap: 0, dh: -0.45, kind: 'adjacent' },
    ]);
  });

  it('quantizes noisy floats and does not mutate the input', () => {
    const input = noisyLivingRoom();
    const before = structuredClone(input);
    const compact = compactGraphForPrompt(input);

    expect(input).toEqual(before);
    expect(compact.nodes[0]?.topHeight).toBe(0.75);
    expect(compact.nodes[0]?.centroid).toEqual([0, 0.75, -1]);
    expect(compact.nodes[0]?.size).toEqual([1, 0.6]);
    expect(compact.nodes[0]?.area).toBe(0.6);
    expect(compact.nodes[0]?.angleFromForward).toBe(0);
    expect(compact.edges[0]?.gap).toBe(0.6);
    expect(compact.edges[0]?.dh).toBe(-0.3);
    expect(JSON.stringify(compact)).not.toContain('000123');
    expect(JSON.stringify(compact)).not.toMatch(/-0[,}\]]/);
  });

  it('is deterministic', () => {
    const graph = noisyLivingRoom();
    expect(compactGraphForPrompt(graph)).toEqual(compactGraphForPrompt(graph));
  });

  it('normalizes signed zero after quantization', () => {
    const graph: SurfaceGraph = {
      ...SYNTHETIC_LIVING_ROOM,
      nodes: SYNTHETIC_LIVING_ROOM.nodes.map((node, index) =>
        index === 0 ? { ...node, centroid: [-0.004, -0.001, -0.002] } : node
      ),
      edges: SYNTHETIC_LIVING_ROOM.edges.map((edge, index) =>
        index === 0 ? { ...edge, gap: -0.001, dh: -0.004 } : edge
      ),
    };
    const compact = compactGraphForPrompt(graph);
    const centroid = compact.nodes[0]?.centroid;
    expect(centroid).toEqual([0, 0, 0]);
    expect(centroid?.some((value) => Object.is(value, -0))).toBe(false);
    expect(compact.edges[0]?.gap).toBe(0);
    expect(Object.is(compact.edges[0]?.gap, -0)).toBe(false);
    expect(compact.edges[0]?.dh).toBe(0);
  });

  it.each([
    { name: 'synthetic_living_room', graph: SYNTHETIC_LIVING_ROOM },
    ...EXTRA_TEST_GRAPHS,
    { name: 'twelve_node_noisy', graph: twelveNodeNoisyGraph() },
  ])('shrinks JSON for $name', ({ graph }) => {
    const fullBytes = promptGraphJsonBytes(graph);
    const compactBytes = promptGraphJsonBytes(compactGraphForPrompt(graph));
    const saved = fullBytes - compactBytes;
    const pct = (saved / fullBytes) * 100;

    expect(compactBytes).toBeLessThan(fullBytes);
    expect(saved).toBeGreaterThan(0);
    // Living-room fixture is already clean; still drop version/hash/kind/yaw.
    expect(pct).toBeGreaterThan(10);

    console.log(
      `compactGraphForPrompt ${graph.roomHash} ${String(fullBytes)} → ${String(compactBytes)} bytes (−${String(saved)}, ${pct.toFixed(1)}%)`
    );
  });

  it('omits hint fields by default and when hints is false', () => {
    const plain = compactGraphForPrompt(SYNTHETIC_LIVING_ROOM);
    expect(compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, {})).toEqual(plain);
    expect(compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, { hints: false })).toEqual(
      plain
    );
    for (const node of plain.nodes) {
      expect(node).not.toHaveProperty('fits');
      expect(node).not.toHaveProperty('uv');
      expect(node).not.toHaveProperty('slots');
    }
  });

  it('adds compact per-surface fits, uv, and slots when hints is true', () => {
    const hinted = compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, { hints: true });
    expect(hinted.nodes).toHaveLength(SYNTHETIC_LIVING_ROOM.nodes.length);
    const table = hinted.nodes.find((node) => node.id === 's1');
    expect(table?.fits).toContain('village_hut');
    expect(table?.fits).toContain('gem');
    expect(table?.uv).toHaveLength(4);
    expect(table?.slots?.length).toBeGreaterThan(0);
    expect(table?.slots?.length).toBeLessThanOrEqual(4);
    for (const value of table?.uv ?? []) {
      expect(value).toBe(Number(value.toFixed(2)));
    }
    for (const slot of table?.slots ?? []) {
      expect(slot.id).toMatch(/^s\d+$/);
      expect(slot.u).toBe(Number(slot.u.toFixed(2)));
      expect(slot.v).toBe(Number(slot.v.toFixed(2)));
    }
    const couch = hinted.nodes.find((node) => node.id === 's2');
    expect(couch?.fits).not.toContain('village_hut');
    expect(couch?.fits).toContain('slime');
  });

  it('hinted output is deterministic', () => {
    const a = compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, { hints: true });
    const b = compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, { hints: true });
    expect(a).toEqual(b);
  });

  it('assigns unique s<n> slot ids that are stable across calls', () => {
    const a = compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, { hints: true });
    const b = compactGraphForPrompt(SYNTHETIC_LIVING_ROOM, { hints: true });
    const ids = a.nodes.flatMap((node) => (node.slots ?? []).map((slot) => slot.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^s\d+$/.test(id))).toBe(true);
    expect(b.nodes.map((node) => node.slots)).toEqual(
      a.nodes.map((node) => node.slots)
    );
  });
});
