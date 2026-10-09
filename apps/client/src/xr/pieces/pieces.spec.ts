import { describe, it, expect } from 'vitest';
import { Box3, Group } from '@iwsdk/core';
import { PIECE_IDS } from '@roomquest/schema';
import { createGreyboxKit, createPiece, pieceFactoryIds } from './index.js';

describe('greybox piece factories', () => {
  it('exposes a factory for every PIECE_IDS entry', () => {
    expect(pieceFactoryIds().sort()).toEqual([...PIECE_IDS].sort());
  });

  it('returns an Object3D whose geometry base sits at y = 0', () => {
    const kit = createGreyboxKit('forest');
    const box = new Box3();
    for (const id of PIECE_IDS) {
      const geo = kit.geometry(id);
      geo.computeBoundingBox();
      const minY = geo.boundingBox?.min.y ?? Number.NaN;
      expect(minY, id).toBeCloseTo(0, 2);

      const object = createPiece(id, kit);
      expect(object).toBeTruthy();
      const root = new Group();
      root.add(object);
      box.setFromObject(object);
      if (id !== 'gem' && id !== 'plank_bridge') {
        expect(box.min.y, `${id} object min y`).toBeCloseTo(0, 2);
      }
    }
    kit.dispose();
  });

  it('shares one vertex-colour material and instances gems and planks', () => {
    const kit = createGreyboxKit('sky');
    const gemA = createPiece('gem', kit);
    const gemB = createPiece('gem', kit);
    const plank = createPiece('plank_bridge', kit);
    expect(kit.gemPool.mesh.material).toBe(kit.material);
    expect(kit.plankPool.mesh.material).toBe(kit.material);
    expect(kit.gemPool.mesh.count).toBe(2);
    expect(kit.plankPool.mesh.count).toBe(1);
    expect(gemA.userData.piece).toBe('gem');
    expect(gemB.userData.piece).toBe('gem');
    expect(plank.userData.piece).toBe('plank_bridge');
    kit.dispose();
  });

  it('builds a real mesh plank when instancing is disabled (tray grab bounds)', () => {
    const kit = createGreyboxKit('forest');
    const plank = createPiece('plank_bridge', kit, { instanced: false });
    expect(kit.plankPool.mesh.count).toBe(0);
    let hasMesh = false;
    plank.traverse((obj) => {
      if (obj !== plank && (obj as { isMesh?: boolean }).isMesh) {
        hasMesh = true;
      }
    });
    expect(hasMesh).toBe(true);
    kit.dispose();
  });

  it('builds a gate with an animatable leaf and a lever with a poke hit volume', () => {
    const kit = createGreyboxKit('forest');
    const gate = createPiece('gate', kit);
    const lever = createPiece('lever', kit);
    expect(gate.userData.leaf).toBeTruthy();
    expect(lever.userData.handle).toBeTruthy();
    let hit = false;
    lever.traverse((obj) => {
      if (obj.name === 'lever-hit') hit = true;
    });
    expect(hit).toBe(true);
    kit.dispose();
  });
});
