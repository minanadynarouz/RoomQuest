import { describe, it, expect } from 'vitest';
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import {
  classifyPair,
  plankFits,
  portalFits,
  rampFits,
  reachableFrom,
  shortestPath,
  possibleLinks,
} from './links';
import { TINY_TWO_TABLES } from './test-graphs';

describe('path links', () => {
  it('classifies the living-room coffee-table to couch as a plank', () => {
    const s1 = SYNTHETIC_LIVING_ROOM.nodes.find((n) => n.id === 's1');
    const s2 = SYNTHETIC_LIVING_ROOM.nodes.find((n) => n.id === 's2');
    expect(s1 && s2).toBeTruthy();
    if (!s1 || !s2) {
      return;
    }
    const link = classifyPair(s1, s2, SYNTHETIC_LIVING_ROOM);
    expect(link?.kind).toBe('plank');
  });

  it('treats a floor hop with enough run as a ramp', () => {
    const s3 = SYNTHETIC_LIVING_ROOM.nodes.find((n) => n.id === 's3');
    const s5 = SYNTHETIC_LIVING_ROOM.nodes.find((n) => n.id === 's5');
    expect(s3 && s5).toBeTruthy();
    if (!s3 || !s5) {
      return;
    }
    expect(rampFits(s3, s5, 0, 0.5)).toBe(true);
    expect(rampFits(s3, s5, 0, 0.75)).toBe(false);
  });

  it('allows a portal only when both surfaces are in the 50° cone', () => {
    const s1 = SYNTHETIC_LIVING_ROOM.nodes[0];
    const s2 = SYNTHETIC_LIVING_ROOM.nodes[1];
    expect(s1 && s2).toBeTruthy();
    if (!s1 || !s2) {
      return;
    }
    expect(portalFits(s1, s2)).toBe(true);
    expect(portalFits(s1, { ...s2, angleFromForward: 80 })).toBe(false);
  });

  it('allows a portal on a capture with no in-view surfaces', () => {
    const s1 = SYNTHETIC_LIVING_ROOM.nodes[0];
    const s2 = SYNTHETIC_LIVING_ROOM.nodes[1];
    expect(s1 && s2).toBeTruthy();
    if (!s1 || !s2) {
      return;
    }
    const blind = {
      ...SYNTHETIC_LIVING_ROOM,
      nodes: SYNTHETIC_LIVING_ROOM.nodes.map((node) => ({
        ...node,
        angleFromForward: 80,
        reach: 'outOfView' as const,
      })),
    };
    expect(portalFits(s1, { ...s2, angleFromForward: 80 }, blind)).toBe(true);
  });

  it('plankFits matches catalog + geometric epsilon', () => {
    expect(plankFits(0.5, 0.2)).toBe(true);
    expect(plankFits(0.04, 0.1)).toBe(false);
    expect(plankFits(1.2, 0.1)).toBe(false);
    expect(plankFits(0.5, 0.4)).toBe(false);
    expect(plankFits(0.6, 0.3)).toBe(true);
  });

  it('shortestPath is deterministic and finds the tiny-room hop', () => {
    const links = possibleLinks(TINY_TWO_TABLES);
    const path = shortestPath('s1', 's2', links);
    expect(path).toEqual(['s1', 's2']);
    expect(shortestPath('s1', 's9', links)).toBeNull();
    expect(reachableFrom('s1', links).has('s2')).toBe(true);
  });
});
