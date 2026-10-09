/**
 * Single client URL-flag parser (X-03, extended in F-05).
 *
 * Tiny and import-light so landing can read `?emulator=` / `?room=` / `?fixture=`
 * without pulling IWSDK, schema, or the overlay. `?debug=1` is the perf flag
 * shared by X-03 surface outlines and the F-05 overlay.
 *
 * F-03 `director` / `seed` / `date` stay in `game/director/flags.ts`: folding
 * them in would import director types (schema) into this module and make
 * `game/` depend on `xr/` (and this file's `window` default), breaking F-02
 * purity.
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

export interface ClientFlags {
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
 * Parse client URL flags from a query string.
 * `debug` (the perf overlay + surface outlines) is on only for `1`.
 */
export function readClientFlags(
  search = typeof window === 'undefined' ? '' : window.location.search
): ClientFlags {
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

export function emulatorRoomFromFlags(flags: ClientFlags): EmulatorRoom {
  return flags.room ?? 'living_room';
}

export function isSyntheticLivingRoomFixture(
  flags: Pick<ClientFlags, 'fixture'>
): boolean {
  return flags.fixture === FIXTURE_SYNTHETIC_LIVING_ROOM;
}

/**
 * `window.__rq` is exposed in Vite dev or when `?debug=1` is set.
 * The overlay itself is gated on `flags.debug` only.
 */
export function shouldExposeDebugHooks(
  flags: Pick<ClientFlags, 'debug'>,
  isDev: boolean
): boolean {
  return flags.debug || isDev;
}
