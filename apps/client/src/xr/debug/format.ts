/**
 * Screenshot-friendly overlay copy. ASCII only (UIKitML glyph coverage).
 */

import type { RqPerfStats } from './stats.js';

export interface DebugLine {
  id: string;
  text: string;
}

function padLabel(label: string, width = 9): string {
  return label.length >= width
    ? `${label} `
    : label + ' '.repeat(width - label.length);
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

const DEBUG_LINES: DebugLine[] = [
  { id: 'debug-fps', text: '' },
  { id: 'debug-draws', text: '' },
  { id: 'debug-tris', text: '' },
  { id: 'debug-surfaces', text: '' },
  { id: 'debug-source', text: '' },
  { id: 'debug-latency', text: '' },
  { id: 'debug-repairs', text: '' },
  { id: 'debug-fallback', text: '' },
  { id: 'debug-issues', text: '' },
  { id: 'debug-director', text: '' },
  { id: 'debug-reqid', text: '' },
  { id: 'debug-repaired', text: '' },
  { id: 'debug-relaxed', text: '' },
];

function setLineText(index: number, text: string): void {
  const line = DEBUG_LINES[index];
  if (line) line.text = text;
}

export function formatDebugLines(stats: RqPerfStats): DebugLine[] {
  setLineText(0, `${padLabel('fps')}${formatFps(stats.fps)}`);
  setLineText(1, `${padLabel('draws')}${String(stats.drawCalls)}`);
  setLineText(2, `${padLabel('tris')}${String(stats.triangles)}`);
  setLineText(3, `${padLabel('surfaces')}${String(stats.surfaces)}`);
  setLineText(4, `${padLabel('source')}${formatDash(stats.source)}`);
  setLineText(5, `${padLabel('latency')}${formatLatency(stats.latencyMs)}`);
  setLineText(6, `${padLabel('repairs')}${String(stats.repairs)}`);
  setLineText(7, `${padLabel('fallback')}${formatDash(stats.fallbackReason)}`);
  setLineText(8, `${padLabel('issues')}${String(stats.validationIssues)}`);
  setLineText(9, `${padLabel('director')}${formatDash(stats.directorStatus)}`);
  setLineText(10, `${padLabel('reqId')}${formatDash(stats.requestId)}`);
  setLineText(11, `${padLabel('repaired')}${formatDash(stats.repairedBy)}`);
  setLineText(
    12,
    `${padLabel('relaxed')}${formatDash(stats.relaxed.join(','))}`
  );
  return DEBUG_LINES;
}

export function formatDebugBlock(stats: RqPerfStats): string {
  return ['PERF', ...formatDebugLines(stats).map((line) => line.text)].join(
    '\n'
  );
}
