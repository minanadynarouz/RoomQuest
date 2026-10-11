/**
 * Client helpers for `RelaxedRule` and `room-unplayable` from
 * `@roomquest/schema`.
 */

import { FallbackReason, RelaxedRule } from '@roomquest/schema';

export const ROOM_UNPLAYABLE = FallbackReason.enum['room-unplayable'];

export type RoomUnplayableReason = typeof ROOM_UNPLAYABLE;

export function readRelaxed(source: unknown): RelaxedRule[] {
  if (source === null || typeof source !== 'object') {
    return [];
  }
  const raw = (source as { relaxed?: unknown }).relaxed;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: RelaxedRule[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const parsed = RelaxedRule.safeParse(item);
    if (!parsed.success || seen.has(parsed.data)) {
      continue;
    }
    seen.add(parsed.data);
    out.push(parsed.data);
  }
  return out;
}

export function mergeRelaxed(...sources: unknown[]): RelaxedRule[] {
  const out: RelaxedRule[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    for (const id of readRelaxed(source)) {
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function readErrorCode(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }
  const error = (payload as { error?: unknown }).error;
  if (error === null || typeof error !== 'object') {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

export function isRoomUnplayableResponse(
  status: number,
  payload: unknown
): boolean {
  return status === 422 && readErrorCode(payload) === 'ROOM_UNPLAYABLE';
}
