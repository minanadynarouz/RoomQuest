import { describe, expect, it } from 'vitest';
import { IWER_GRAPHS } from '@roomquest/fixtures';
import {
  graphCanSeparateHutAndShrine,
  graphHasCatalogHut,
  graphHasPlayableView,
  pickHutSurface,
} from './graph-capacity';

describe('graph capacity', () => {
  it('flags IWER rooms that lack a catalog hut or a 0.8 m pair', () => {
    expect(graphHasCatalogHut(IWER_GRAPHS.living_room)).toBe(false);
    expect(graphHasPlayableView(IWER_GRAPHS.living_room)).toBe(false);
    expect(graphCanSeparateHutAndShrine(IWER_GRAPHS.living_room)).toBe(true);

    expect(graphHasCatalogHut(IWER_GRAPHS.meeting_room)).toBe(true);
    expect(graphCanSeparateHutAndShrine(IWER_GRAPHS.meeting_room)).toBe(false);

    expect(graphHasCatalogHut(IWER_GRAPHS.music_room)).toBe(false);
    expect(graphHasCatalogHut(IWER_GRAPHS.office_large)).toBe(false);
    expect(graphHasCatalogHut(IWER_GRAPHS.office_small)).toBe(true);
    expect(graphCanSeparateHutAndShrine(IWER_GRAPHS.office_small)).toBe(true);
  });

  it('prefers a table over the floor when no catalog hut exists', () => {
    const hut = pickHutSurface(IWER_GRAPHS.living_room.nodes);
    expect(hut?.label).toBe('table');
    expect(hut?.id).not.toBe('s12');

    const music = pickHutSurface(IWER_GRAPHS.music_room.nodes);
    expect(music?.id).toBe('s5');
    expect(music?.label).toBe('table');
  });
});
