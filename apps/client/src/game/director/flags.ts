/**
 * URL flag parsing for the director client - F-03
 * Pure: takes a query string, never reads window.
 *
 * Flags: ?director=live|mock|off, ?seed=, ?date=YYYY-MM-DD
 *
 * `?debug=`, `?emulator=`, `?room=` and `?fixture=` live in
 * `src/debug/url-flags.ts` so the landing chunk stays schema-free.
 */

import type { DirectorFlags, DirectorMode } from './types.js';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function isDirectorMode(value: string): value is DirectorMode {
  return value === 'live' || value === 'mock' || value === 'off';
}

/**
 * Parse director-related URL flags from a query string.
 * Unknown or missing `director` defaults to `live`.
 * Invalid `date` values are ignored.
 */
export function parseDirectorFlags(search: string): DirectorFlags {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);

  const rawDirector = params.get('director');
  const director: DirectorMode =
    rawDirector && isDirectorMode(rawDirector) ? rawDirector : 'live';

  const seed = params.get('seed')?.trim() || undefined;
  const dateRaw = params.get('date')?.trim();
  const date = dateRaw && DATE_RE.test(dateRaw) ? dateRaw : undefined;

  return { director, seed, date };
}
