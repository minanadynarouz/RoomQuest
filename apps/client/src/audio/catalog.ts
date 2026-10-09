/**
 * Public URLs for CC0 SFX. Fetched at play/preload time so they stay out of
 * the landing JS chunk.
 */

import type { SoundId } from './mapping.js';

function publicUrl(file: string): string {
  const raw = import.meta.env.BASE_URL;
  const prefix = raw.endsWith('/') ? raw : `${raw}/`;
  return `${prefix}${file.replace(/^\//u, '')}`;
}

export const SOUND_URLS: Record<SoundId, string> = {
  grab: publicUrl('audio/grab.ogg'),
  snap: publicUrl('audio/snap.ogg'),
  lever: publicUrl('audio/lever.ogg'),
  gate: publicUrl('audio/gate.ogg'),
  stun: publicUrl('audio/stun.ogg'),
  gem: publicUrl('audio/gem.ogg'),
  win: publicUrl('audio/win.ogg'),
  chirp: publicUrl('audio/chirp.ogg'),
  blocked: publicUrl('audio/blocked.ogg'),
  beat: publicUrl('audio/beat.ogg'),
};
