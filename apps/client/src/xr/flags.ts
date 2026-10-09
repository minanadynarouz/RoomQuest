export const FIXTURE_SYNTHETIC_LIVING_ROOM = 'synthetic_living_room';

export interface ClientFlags {
  debug: boolean;
  fixture: string | null;
}

export function readClientFlags(
  search = typeof window === 'undefined' ? '' : window.location.search
): ClientFlags {
  const params = new URLSearchParams(search);
  const fixture = params.get('fixture');
  return {
    debug: params.get('debug') === '1',
    fixture: fixture && fixture.length > 0 ? fixture : null,
  };
}

export function isSyntheticLivingRoomFixture(flags: ClientFlags): boolean {
  return flags.fixture === FIXTURE_SYNTHETIC_LIVING_ROOM;
}
