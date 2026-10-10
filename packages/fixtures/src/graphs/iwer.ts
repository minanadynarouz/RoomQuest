import { SurfaceGraph } from '@roomquest/schema';
import livingRoom from './iwer-living_room.json';
import meetingRoom from './iwer-meeting_room.json';
import musicRoom from './iwer-music_room.json';
import officeLarge from './iwer-office_large.json';
import officeSmall from './iwer-office_small.json';

/**
 * Live SurfaceGraph snapshots captured from the IWSDK/IWER emulator
 * (`?emulator=1&room=<id>&director=off&debug=1` via `__rq.surfaceGraph()`).
 */
export const IWER_ROOM_IDS = [
  'living_room',
  'meeting_room',
  'music_room',
  'office_large',
  'office_small',
] as const;

export type IwerRoomId = (typeof IWER_ROOM_IDS)[number];

export const IWER_LIVING_ROOM: SurfaceGraph = SurfaceGraph.parse(livingRoom);
export const IWER_MEETING_ROOM: SurfaceGraph = SurfaceGraph.parse(meetingRoom);
export const IWER_MUSIC_ROOM: SurfaceGraph = SurfaceGraph.parse(musicRoom);
export const IWER_OFFICE_LARGE: SurfaceGraph = SurfaceGraph.parse(officeLarge);
export const IWER_OFFICE_SMALL: SurfaceGraph = SurfaceGraph.parse(officeSmall);

export const IWER_GRAPHS: Record<IwerRoomId, SurfaceGraph> = {
  living_room: IWER_LIVING_ROOM,
  meeting_room: IWER_MEETING_ROOM,
  music_room: IWER_MUSIC_ROOM,
  office_large: IWER_OFFICE_LARGE,
  office_small: IWER_OFFICE_SMALL,
};
