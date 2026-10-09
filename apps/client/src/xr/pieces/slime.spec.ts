import { describe, expect, it } from 'vitest';
import { createGreyboxKit } from './kit.js';
import { SLIME_MESH_COUNT, createSlime } from './slime.js';

describe('createSlime factory', () => {
  it('builds a fixed mesh set so groggy cannot add draw calls', () => {
    const kit = createGreyboxKit('forest');
    const slime = createSlime(kit);
    let meshCount = 0;
    slime.traverse((obj) => {
      if ((obj as { isMesh?: boolean }).isMesh) meshCount += 1;
    });
    expect(meshCount).toBe(SLIME_MESH_COUNT);
    expect(SLIME_MESH_COUNT).toBe(7);

    const body = slime.userData.body as { name?: string; material?: unknown };
    const stars = slime.userData.stars as {
      name?: string;
      children: { material?: unknown }[];
    };
    const hit = slime.userData.hit as { name?: string; visible?: boolean };
    expect(body.name).toBe('slime-body');
    expect(body.material).toBe(kit.material);
    expect(stars.name).toBe('slime-stars');
    expect(stars.children).toHaveLength(5);
    expect(stars.children[0]?.material).toBe(kit.material);
    expect(hit.name).toBe('slime-hit');
    expect(hit.visible).toBe(false);
    kit.dispose();
  });
});
