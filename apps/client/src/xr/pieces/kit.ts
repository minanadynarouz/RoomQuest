import type { PieceId, Theme } from '@roomquest/schema';
import {
  Group,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type BufferGeometry,
  type Object3D,
} from '@iwsdk/core';
import type { PieceFootprint } from './geometry.js';
import { paletteFor, type ToyPalette } from './palette.js';
import { InstancePool } from './instance-pool.js';
import { createVillageHutGeometry } from './village-hut.js';
import { createCrystalShrineGeometry } from './crystal-shrine.js';
import { createPlankBridgeGeometry } from './plank-bridge.js';
import { createRampGeometry } from './ramp.js';
import { createMovingPlatformGeometry } from './moving-platform.js';
import { createGateGeometry } from './gate.js';
import { createLeverGeometry } from './lever.js';
import { createGemGeometry } from './gem.js';
import { createSlimeGeometry } from './slime.js';
import { createPortalGeometry } from './portal.js';

const MAX_GEMS = 16;
const MAX_PLANKS = 8;

type GeometryFactory = (palette: ToyPalette) => BufferGeometry;

const GEOMETRY_FACTORIES: Record<PieceId, GeometryFactory> = {
  village_hut: createVillageHutGeometry,
  crystal_shrine: createCrystalShrineGeometry,
  plank_bridge: createPlankBridgeGeometry,
  ramp: createRampGeometry,
  moving_platform: createMovingPlatformGeometry,
  gate: createGateGeometry,
  lever: createLeverGeometry,
  gem: createGemGeometry,
  slime: createSlimeGeometry,
  portal: createPortalGeometry,
};

export interface GreyboxKitOptions {
  theme: Theme;
}

/**
 * Shared greybox resources for one level build.
 * One MeshStandardMaterial (vertex colours) plus instance pools for gems
 * and planks. Unique piece types reuse a cached merged BufferGeometry.
 */
export class GreyboxKit {
  readonly theme: Theme;
  readonly palette: ToyPalette;
  readonly material: MeshStandardMaterial;
  readonly debugLineMaterial: LineBasicMaterial;
  readonly gemPool: InstancePool;
  readonly plankPool: InstancePool;
  private readonly geometries = new Map<PieceId, BufferGeometry>();
  private readonly extraGeometries = new Map<string, BufferGeometry>();
  private hitMaterial: MeshBasicMaterial | null = null;

  constructor(options: GreyboxKitOptions) {
    this.theme = options.theme;
    this.palette = paletteFor(options.theme);
    this.material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.55,
      metalness: 0.08,
    });
    this.debugLineMaterial = new LineBasicMaterial({
      color: 0x7ec8e3,
      toneMapped: false,
    });

    const gemGeo = this.geometry('gem');
    const plankGeo = this.geometry('plank_bridge');
    this.gemPool = new InstancePool(gemGeo, this.material, MAX_GEMS);
    this.plankPool = new InstancePool(plankGeo, this.material, MAX_PLANKS);
    this.gemPool.mesh.name = 'gems';
    this.plankPool.mesh.name = 'planks';
  }

  geometry(piece: PieceId): BufferGeometry {
    const cached = this.geometries.get(piece);
    if (cached) return cached;
    const factory = GEOMETRY_FACTORIES[piece];
    const geo = factory(this.palette);
    this.geometries.set(piece, geo);
    return geo;
  }

  /** Extra cached geos (gate leaf, lever hit) disposed with the kit. */
  cachedGeometry(
    key: string,
    factory: (palette: ToyPalette) => BufferGeometry
  ): BufferGeometry {
    const cached = this.extraGeometries.get(key);
    if (cached) return cached;
    const geo = factory(this.palette);
    this.extraGeometries.set(key, geo);
    return geo;
  }

  /** Shared near-invisible collider material. Visible so pointers can hit it. */
  interactHitMaterial(): MeshBasicMaterial {
    if (!this.hitMaterial) {
      this.hitMaterial = new MeshBasicMaterial({
        color: 0x88ffaa,
        transparent: true,
        opacity: 0.04,
        depthWrite: false,
        toneMapped: false,
      });
    }
    return this.hitMaterial;
  }

  createMeshPiece(piece: PieceId, footprint: PieceFootprint): Object3D {
    const mesh = new Mesh(this.geometry(piece), this.material);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.name = piece;
    const root = new Group();
    root.name = piece;
    root.add(mesh);
    root.userData.footprint = footprint;
    root.userData.piece = piece;
    return root;
  }

  createInstancedPiece(
    piece: 'gem' | 'plank_bridge',
    footprint: PieceFootprint
  ): Object3D {
    const pool = piece === 'gem' ? this.gemPool : this.plankPool;
    const proxy = pool.alloc();
    proxy.name = piece;
    proxy.userData.footprint = footprint;
    proxy.userData.piece = piece;
    return proxy;
  }

  syncInstances(): void {
    this.gemPool.sync();
    this.plankPool.sync();
  }

  resetInstances(): void {
    this.gemPool.reset();
    this.plankPool.reset();
  }

  /**
   * Dispose pooled meshes, cached geometries and the shared materials.
   * Call only when the kit is no longer used by any placed piece.
   */
  dispose(): void {
    this.resetInstances();
    this.gemPool.dispose();
    this.plankPool.dispose();
    for (const geo of this.geometries.values()) {
      geo.dispose();
    }
    this.geometries.clear();
    for (const geo of this.extraGeometries.values()) {
      geo.dispose();
    }
    this.extraGeometries.clear();
    this.hitMaterial?.dispose();
    this.hitMaterial = null;
    this.material.dispose();
    this.debugLineMaterial.dispose();
  }
}

export function createGreyboxKit(theme: Theme): GreyboxKit {
  return new GreyboxKit({ theme });
}
