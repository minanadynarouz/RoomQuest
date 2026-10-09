/**
 * Shared URL flag parser for F-05 / X-03.
 *
 * Tiny and import-light on purpose: landing may load this file, so it must
 * not pull schema, director, IWSDK, or the overlay. Director/seed/date stay
 * in `game/director/flags.ts` (F-03) because those types are not landing-safe.
 *
 * X-03 surface outlines and the F-05 overlay both read `debug` through here
 * (via `xr/flags.ts` → `parseUrlFlags`) so the flag is not parsed twice with
 * diverging rules.
 */

export const EMULATOR_ROOMS = [
  'living_room',
  'meeting_room',
  'music_room',
  'office_large',
  'office_small',
] as const;

export type EmulatorRoom = (typeof EMULATOR_ROOMS)[number];

export const FIXTURE_SYNTHETIC_LIVING_ROOM = 'synthetic_living_room';

export interface UrlFlags {
  debug: boolean;
  emulator: boolean;
  room: EmulatorRoom | null;
  fixture: string | null;
}

const EMULATOR_ROOM_SET: ReadonlySet<string> = new Set(EMULATOR_ROOMS);

function isEmulatorRoom(value: string): value is EmulatorRoom {
  return EMULATOR_ROOM_SET.has(value);
}

/**
 * Parse client URL flags from a query string. Pure: never reads `window`.
 * `debug` is on only for the exact value `1`.
 */
export function parseUrlFlags(search = ''): UrlFlags {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const fixture = params.get('fixture');
  const room = params.get('room');

  return {
    debug: params.get('debug') === '1',
    emulator: params.get('emulator') === '1',
    room: room && isEmulatorRoom(room) ? room : null,
    fixture: fixture && fixture.length > 0 ? fixture : null,
  };
}

export function emulatorRoomFromFlags(flags: UrlFlags): EmulatorRoom {
  return flags.room ?? 'living_room';
}

export function isSyntheticLivingRoomFixture(flags: Pick<UrlFlags, 'fixture'>): boolean {
  return flags.fixture === FIXTURE_SYNTHETIC_LIVING_ROOM;
}

/**
 * `window.__rq` is exposed in Vite dev or when `?debug=1` is set.
 * The overlay itself is gated on `flags.debug` only.
 */
export function shouldExposeDebugHooks(
  flags: Pick<UrlFlags, 'debug'>,
  isDev: boolean
): boolean {
  return flags.debug || isDev;
}
