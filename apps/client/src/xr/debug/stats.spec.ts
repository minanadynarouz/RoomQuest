import { describe, expect, it } from 'vitest';
import { collectPerfStats, readRendererInfo } from './stats.js';

describe('collectPerfStats', () => {
  it('copies draw calls and triangles from renderer.info', () => {
    const renderer = {
      info: { render: { calls: 17, triangles: 18432 } },
    };
    expect(readRendererInfo(renderer)).toEqual({
      calls: 17,
      triangles: 18432,
    });
    const stats = collectPerfStats({
      nowMs: 1000,
      fps: 59.4,
      renderer,
      surfaceCount: 8,
      source: 'procedural',
      latencyMs: 12,
      repairs: ['fill-gap'],
      fallbackReason: 'timeout',
      validationIssues: 2,
    });
    expect(stats.drawCalls).toBe(renderer.info.render.calls);
    expect(stats.triangles).toBe(renderer.info.render.triangles);
    expect(stats.surfaces).toBe(8);
    expect(stats.source).toBe('procedural');
    expect(stats.latencyMs).toBe(12);
    expect(stats.repairs).toBe(1);
    expect(stats.fallbackReason).toBe('timeout');
    expect(stats.validationIssues).toBe(2);
    expect(stats.fps).toBe(59.4);
  });

  it('zeros missing renderer.info', () => {
    const stats = collectPerfStats({
      nowMs: 0,
      fps: 0,
      renderer: null,
      surfaceCount: 0,
      source: null,
      latencyMs: null,
      repairs: [],
      fallbackReason: null,
      validationIssues: 0,
    });
    expect(stats.drawCalls).toBe(0);
    expect(stats.triangles).toBe(0);
    expect(stats.source).toBeNull();
  });
});
