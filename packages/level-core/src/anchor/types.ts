/**
 * Village hut XRAnchor persistence (ticket X-09).
 *
 * Pure types — no DOM, IWSDK, or timers. The client injects storage so this
 * package stays browser-safe and unit-testable.
 */

/** Minimal key/value store. Matches `localStorage` plus an in-memory fake. */
export interface VillageAnchorStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** `localStorage` key for the persistent-anchor UUID. */
export const VILLAGE_ANCHOR_STORAGE_KEY = 'roomquest:villageAnchor';

export type VillageAnchorFallbackReason =
  | 'no-stored-handle'
  | 'restore-failed'
  | 'anchors-unsupported'
  | 'storage-unavailable'
  | 'no-table';

export type VillageAnchorDecisionKind = 'restore' | 'fallback';

export interface VillageAnchorRestoreDecision {
  kind: 'restore';
  handle: string;
}

export interface VillageAnchorFallbackDecision {
  kind: 'fallback';
  reason: VillageAnchorFallbackReason;
  surfaceId: string | null;
}

export type VillageAnchorDecision =
  | VillageAnchorRestoreDecision
  | VillageAnchorFallbackDecision;
