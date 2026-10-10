import { describe, expect, it } from 'vitest';
import { IWER_GRAPHS, IWER_ROOM_IDS } from '@roomquest/fixtures';
import { KIT_CATALOG, type Tier } from '@roomquest/schema';
import { repairPlan } from '../repair/repair-plan';
import {
  horizontalDistance,
  MIN_PATH_DISTANCE_M,
} from '../validate/graph-utils';
import { validatePlan } from '../validate/validate-plan';
import { generatePlan } from './generate-plan';

const TIERS: readonly Tier[] = ['easy', 'normal'];
const SEED_COUNT = 20;

function hutFits(node: {
  label: string;
  area: number;
  topHeight: number;
  angleFromForward: number;
}): boolean {
  const hut = KIT_CATALOG.village_hut;
  if (hut.allowedSurfaces && !hut.allowedSurfaces.includes(node.label as never)) {
    return false;
  }
  if (hut.minArea !== undefined && node.area < hut.minArea) {
    return false;
  }
  if (hut.minHeight !== undefined && node.topHeight < hut.minHeight) {
    return false;
  }
  if (hut.maxHeight !== undefined && node.topHeight > hut.maxHeight) {
    return false;
  }
  if (
    hut.maxAngleFromForward !== undefined &&
    node.angleFromForward > hut.maxAngleFromForward
  ) {
    return false;
  }
  return true;
}

describe('IWER graph generatePlan', () => {
  it('summarizes each room’s hut surfaces and pair distance', () => {
    for (const room of IWER_ROOM_IDS) {
      const graph = IWER_GRAPHS[room];
      const hutNodes = graph.nodes.filter(hutFits);
      const maxDist = graph.nodes.reduce((best, a) => {
        const local = graph.nodes.reduce(
          (m, b) => Math.max(m, horizontalDistance(a, b)),
          0
        );
        return Math.max(best, local);
      }, 0);
      console.log(
        `[iwer-graph] ${room} nodes=${String(graph.nodes.length)} ` +
          `validHuts=${hutNodes.map((n) => n.id).join(',') || 'none'} ` +
          `maxPairDist=${maxDist.toFixed(3)}m minPath=${String(MIN_PATH_DISTANCE_M)} ` +
          `labels=${graph.nodes.map((n) => `${n.id}:${n.label}@${String(n.angleFromForward)}°/${n.reach}`).join(' ')}`
      );
    }
    expect(IWER_ROOM_IDS).toHaveLength(5);
  });

  it('runs generatePlan → validate → repairPlan → validate on 20 seeds × 2 tiers', () => {
    const lines: string[] = [];
    const afterFailures: string[] = [];

    for (const room of IWER_ROOM_IDS) {
      const graph = IWER_GRAPHS[room];
      for (const tier of TIERS) {
        let validBefore = 0;
        let validAfter = 0;
        const beforeCodes = new Map<string, number>();
        const afterCodes = new Map<string, number>();
        let sampleBefore = '';
        let sampleAfter = '';

        for (let i = 0; i < SEED_COUNT; i += 1) {
          const seed = `${graph.roomHash}-2026-10-${String(10 + (i % 20)).padStart(2, '0')}-${String(i)}`;
          const generated = generatePlan(graph, seed, tier);
          const before = validatePlan(generated, graph);
          if (before.ok) {
            validBefore += 1;
          } else {
            for (const code of new Set(before.issues.map((item) => item.code))) {
              beforeCodes.set(code, (beforeCodes.get(code) ?? 0) + 1);
            }
            if (!sampleBefore) {
              sampleBefore = `${seed}: ${before.issues.map((item) => item.code).join(',')}`;
            }
          }

          const repaired = repairPlan(generated, graph);
          if (repaired.result.ok) {
            validAfter += 1;
          } else {
            const codes = repaired.result.issues.map((item) => item.code);
            for (const code of new Set(codes)) {
              afterCodes.set(code, (afterCodes.get(code) ?? 0) + 1);
            }
            if (!sampleAfter) {
              sampleAfter = `${seed}: ${codes.join(',')}`;
            }
            afterFailures.push(`${room} ${tier} ${seed}: ${codes.join(',')}`);
          }
        }

        const fmt = (map: Map<string, number>): string =>
          [...map.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([code, n]) => `${code}×${String(n)}`)
            .join(' ') || '—';

        lines.push(
          `${room} ${tier}: before ${String(validBefore)}/${String(SEED_COUNT)} ` +
            `(${fmt(beforeCodes)}) after ${String(validAfter)}/${String(SEED_COUNT)} ` +
            `(${fmt(afterCodes)})`
        );
        if (sampleBefore) {
          lines.push(`  before ${sampleBefore}`);
        }
        if (sampleAfter) {
          lines.push(`  after ${sampleAfter}`);
        }
      }
    }

    console.log(`[iwer-stats]\n${lines.join('\n')}`);
    expect(afterFailures.slice(0, 12), lines.join('\n')).toEqual([]);
    expect(afterFailures).toHaveLength(0);
  });
});
