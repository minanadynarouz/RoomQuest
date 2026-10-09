import type { PieceId } from '@roomquest/schema';
import type { Object3D } from '@iwsdk/core';
import type { GreyboxKit } from './kit.js';
import { createVillageHut } from './village-hut.js';
import { createCrystalShrine } from './crystal-shrine.js';
import { createPlankBridge } from './plank-bridge.js';
import { createRamp } from './ramp.js';
import { createMovingPlatform } from './moving-platform.js';
import { createGate } from './gate.js';
import { createLever } from './lever.js';
import { createGem } from './gem.js';
import { createSlime } from './slime.js';
import { createPortal } from './portal.js';

type PieceFactory = (kit: GreyboxKit) => Object3D;

const FACTORIES: Record<PieceId, PieceFactory> = {
  village_hut: createVillageHut,
  crystal_shrine: createCrystalShrine,
  plank_bridge: createPlankBridge,
  ramp: createRamp,
  moving_platform: createMovingPlatform,
  gate: createGate,
  lever: createLever,
  gem: createGem,
  slime: createSlime,
  portal: createPortal,
};

/** Build one greybox piece. Base of the returned Object3D is at y = 0. */
export function createPiece(piece: PieceId, kit: GreyboxKit): Object3D {
  return FACTORIES[piece](kit);
}

export function pieceFactoryIds(): PieceId[] {
  return Object.keys(FACTORIES) as PieceId[];
}
