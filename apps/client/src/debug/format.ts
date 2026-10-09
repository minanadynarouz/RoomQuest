/**
 * Screenshot-friendly overlay copy. ASCII only (UIKitML glyph coverage).
 */

import type { RqPerfStats } from './stats.js';

export interface DebugLine {
  id: string;
  text: string;
}

function padLabel(label: string, width = 10): string {
  return label.length >= width ? label : label + ' '.repeat(width - label.length);
}

export function formatDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

export function formatFps(fps: number): string {
  if (!Number.isFinite(fps) || fps <= 0) return '-';
  return String(Math.round(fps));
}

export function formatLatency(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '-';
  return `${String(Math.round(ms))}ms`;
}

export function formatDebugLines(stats: RqPerfStats): DebugLine[] {
  return [
    { id: 'debug-fps', text: `${padLabel('fps')}${formatFps(stats.fps)}` },
    {
      id: 'debug-draws',
      text: `${padLabel('draws')}${String(stats.drawCalls)}`,
    },
    {
      id: 'debug-tris',
      text: `${padLabel('tris')}${String(stats.triangles)}`,
    },
    {
      id: 'debug-surfaces',
      text: `${padLabel('surfaces')}${String(stats.surfaces)}`,
    },
    {
      id: 'debug-source',
      text: `${padLabel('source')}${formatDash(stats.source)}`,
    },
    {
      id: 'debug-latency',
      text: `${padLabel('latency')}${formatLatency(stats.latencyMs)}`,
    },
    {
      id: 'debug-repairs',
      text: `${padLabel('repairs')}${String(stats.repairs)}`,
    },
    {
      id: 'debug-fallback',
      text: `${padLabel('fallback')}${formatDash(stats.fallbackReason)}`,
    },
    {
      id: 'debug-issues',
      text: `${padLabel('issues')}${String(stats.validationIssues)}`,
    },
  ];
}

export function formatDebugBlock(stats: RqPerfStats): string {
  return ['PERF', ...formatDebugLines(stats).map((line) => line.text)].join('\n');
}
