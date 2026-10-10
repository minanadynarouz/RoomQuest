/**
 * Wire-up helper for the director client - F-03
 * Callers pass search string, storage, and fetch from the browser layer.
 */

import {
  generatePlan,
  snapPlacementsToSlots,
  validatePlan,
} from '@roomquest/level-core';
import { getOrCreateDeviceId } from './device-id.js';
import { createDirectorClient } from './client.js';
import { parseDirectorFlags } from './flags.js';
import {
  DEFAULT_CLIENT_VERSION,
  type DirectorClient,
  type DirectorRequestEndInfo,
  type FetchLike,
  type GenerateFn,
  type KvStore,
  type RepairFn,
  type ValidateFn,
} from './types.js';

export interface DirectorEnv {
  search: string;
  storage: KvStore;
  fetch: FetchLike;
  apiBaseUrl: string;
  clientVersion?: string;
  generate?: GenerateFn;
  validate?: ValidateFn;
  repair?: RepairFn;
  budgetMs?: number;
  randomUUID?: () => string;
  onRequestStart?: () => void;
  onRequestEnd?: (info: DirectorRequestEndInfo) => void;
}

/**
 * Build a director client from URL flags + persisted device id.
 * Seed comes from `?seed=` or the daily `roomHash-YYYY-MM-DD` rule
 * (`?date=` or today). Tier defaults to `normal` (no `?tier=` flag).
 */
export function createDirectorClientFromEnv(env: DirectorEnv): DirectorClient {
  const flags = parseDirectorFlags(env.search);
  const deviceId = getOrCreateDeviceId(env.storage, env.randomUUID);

  return createDirectorClient({
    fetch: env.fetch,
    apiBaseUrl: env.apiBaseUrl,
    deviceId,
    clientVersion: env.clientVersion ?? DEFAULT_CLIENT_VERSION,
    generate: env.generate ?? generatePlan,
    validate: env.validate ?? validatePlan,
    repair: env.repair,
    snap: snapPlacementsToSlots,
    allowFixtureFallback:
      Boolean(new URLSearchParams(env.search).get('fixture')) ||
      import.meta.env.DEV,
    directorMode: flags.director,
    date: flags.date,
    seed: flags.seed,
    budgetMs: env.budgetMs,
    onRequestStart: env.onRequestStart,
    onRequestEnd: env.onRequestEnd,
  });
}
