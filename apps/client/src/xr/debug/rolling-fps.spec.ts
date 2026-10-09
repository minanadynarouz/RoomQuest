import { describe, expect, it } from 'vitest';
import { RollingFps } from './rolling-fps.js';

describe('RollingFps', () => {
  it('returns 0 until two samples exist', () => {
    const fps = new RollingFps();
    expect(fps.fps(0)).toBe(0);
    fps.push(16.67);
    expect(fps.fps(16.67)).toBe(0);
  });

  it('reports ~60 fps for a 1 s 16.67 ms cadence', () => {
    const fps = new RollingFps();
    const dt = 1000 / 60;
    let t = 0;
    for (let i = 0; i < 60; i += 1) {
      t = i * dt;
      fps.push(t);
    }
    expect(fps.fps(t)).toBeCloseTo(60, 0);
  });

  it('drops samples older than the 1 s window', () => {
    const fps = new RollingFps();
    fps.push(0);
    fps.push(16);
    fps.push(2000);
    fps.push(2016);
    expect(fps.fps(2016)).toBeCloseTo(62.5, 0);
  });

  it('reports ~30 fps for a 33.3 ms cadence', () => {
    const fps = new RollingFps();
    const dt = 1000 / 30;
    let t = 0;
    for (let i = 0; i < 30; i += 1) {
      t = i * dt;
      fps.push(t);
    }
    expect(fps.fps(t)).toBeCloseTo(30, 0);
  });
});
