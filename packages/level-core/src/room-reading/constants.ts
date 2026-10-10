/** Minimum time the sweep stays visible after a real `/levels` request. */
export const ROOM_READING_MIN_VISIBLE_S = 1.2;

/** Fade-out after the last pulse once the request has settled. */
export const ROOM_READING_FADE_S = 0.4;

/** One gentle pulse per surface (injected delta time). */
export const ROOM_READING_PULSE_S = 0.5;

/** Schema max surface count — preallocate the sweep order. */
export const ROOM_READING_MAX_SURFACES = 12;
