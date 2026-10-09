import { describe, expect, it } from 'vitest';
import {
  formatBeatLabel,
  formatHudTime,
  formatIsoDate,
  formatStarsLabel,
  formatTomorrowLine,
  formatWinStats,
  HUD_COPY,
} from './copy.js';

describe('HUD copy', () => {
  it('is short, English, and brand-free', () => {
    const blob = [
      HUD_COPY.surveyingTitle,
      HUD_COPY.surveyingBodySurveying,
      HUD_COPY.noSurfacesTitle,
      HUD_COPY.noSurfacesBody,
      HUD_COPY.pauseTitle,
      HUD_COPY.winTitle,
      HUD_COPY.retry,
      HUD_COPY.resume,
      HUD_COPY.replay,
    ].join(' ');
    expect(blob).not.toMatch(/meta|quest|horizon|iwsdk|roomquest/i);
    expect(HUD_COPY.noSurfacesBody.length).toBeLessThan(80);
    expect(HUD_COPY.surveyingBodySurveying.length).toBeLessThan(40);
  });

  it('formats time as m:ss', () => {
    expect(formatHudTime(0)).toBe('0:00');
    expect(formatHudTime(124_000)).toBe('2:04');
  });

  it('formats local ISO dates without a time zone shift', () => {
    expect(formatIsoDate(new Date(2026, 9, 9))).toBe('2026-10-09');
  });

  it('formats win lines', () => {
    expect(formatStarsLabel(1)).toBe('1 star');
    expect(formatStarsLabel(3)).toBe('3 stars');
    expect(formatWinStats(4, 185_000)).toBe('Gems 4 - 3:05');
    expect(formatTomorrowLine('2026-10-10')).toBe(
      'New quest tomorrow - 2026-10-10'
    );
    expect(formatBeatLabel(0, 3)).toBe('Beat 1 of 3');
  });
});
