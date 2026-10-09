/**
 * Wire-up helper for the director client - F-03
 * Callers pass search string, storage, and fetch from the browser layer.
 */

import { getOrCreateDeviceId } from './device-id.js';
import { createDirectorClient } from './client.js';
import { parseDirectorFlags } from './flags.js';
import { schemaValidate, stubGenerate } from './fallback.js';
import {
  DEFAULT_CLIENT_VERSION,
  type DirectorClient,
  type FetchLike,
  type GenerateFn,
  type KvStore,
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
  budgetMs?: number;
  randomUUID?: () => string;
}

/**
 * Build a director client from URL flags + persisted device id.
 */
export function createDirectorClientFromEnv(env: DirectorEnv): DirectorClient {
  const flags = parseDirectorFlags(env.search);
  const deviceId = getOrCreateDeviceId(env.storage, env.randomUUID);

  return createDirectorClient({
    fetch: env.fetch,
    apiBaseUrl: env.apiBaseUrl,
    deviceId,
    clientVersion: env.clientVersion ?? DEFAULT_CLIENT_VERSION,
    generate: env.generate ?? stubGenerate,
    validate: env.validate ?? schemaValidate,
    directorMode: flags.director,
    date: flags.date,
    seed: flags.seed,
    budgetMs: env.budgetMs,
  });
}
