import {
  createSystem,
  PokeInteractable,
  Pressed,
  RayInteractable,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import {
  GATE_OPEN_ANGLE_RAD,
  GATE_OPEN_DURATION_S,
  LEVER_PULL_ANGLE_RAD,
  LEVER_PULL_DURATION_S,
  gateLeafRotationX,
  gateOpenProgress,
  leverHandleRotationX,
} from '@roomquest/level-core';
import type { GameStore } from '../../game/index.js';
import { pullLever } from '../lever/activate.js';
import type { LevelBuilderSystem } from './LevelBuilderSystem.js';

interface AxisAnim {
  object: Object3D;
  elapsed: number;
  duration: number;
  openAngle: number;
  kind: 'gate' | 'lever';
}

export interface GateLeverDebugApi {
  pull: (leverId: string) => boolean;
}

/**
 * Near poke (`PokeInteractable`) and far ray+pinch (`RayInteractable`) on
 * levers. Opening a lever honours `links` and plays a no-alloc gate animation.
 */
export class GateLeverSystem extends createSystem(
  {
    pressed: { required: [Pressed] },
  },
  {}
) {
  private builder: LevelBuilderSystem | null = null;
  private store: GameStore | null = null;
  private eventCursor = 0;
  private readonly anims = new Map<string, AxisAnim>();
  private readonly boundLevers = new Set<Entity>();

  configure(options: { builder: LevelBuilderSystem; store: GameStore }): void {
    this.builder = options.builder;
    this.store = options.store;
  }

  init(): void {
    this.queries.pressed.subscribe('qualify', (entity) => {
      this.onPressed(entity);
    });
    this.cleanupFuncs.push(() => {
      this.anims.clear();
      this.boundLevers.clear();
    });
  }

  onLevelRebuilt(): void {
    this.onLevelBuilt();
  }

  debugApi(): GateLeverDebugApi {
    return {
      pull: (leverId) => this.activateLever(leverId),
    };
  }

  update(delta: number, _time: number): void {
    this.drainEvents();
    this.stepAnims(delta);
  }

  private onLevelBuilt(): void {
    this.anims.clear();
    this.eventCursor = 0;
    this.boundLevers.clear();
    const mounted = this.builder?.getMounted();
    if (!mounted) return;
    for (const piece of mounted.pieces) {
      if (piece.placement.piece !== 'lever') continue;
      const entity = this.builder?.getPieceEntity(piece.placement.id);
      if (!entity) continue;
      if (!entity.hasComponent(RayInteractable)) {
        entity.addComponent(RayInteractable);
      }
      if (!entity.hasComponent(PokeInteractable)) {
        entity.addComponent(PokeInteractable);
      }
      this.boundLevers.add(entity);
    }
  }

  private onPressed(entity: Entity): void {
    if (!this.boundLevers.has(entity)) return;
    const id = entity.object3D?.userData.placementId;
    if (typeof id !== 'string') return;
    this.activateLever(id);
  }

  private activateLever(leverId: string): boolean {
    const store = this.store;
    const plan = store?.plan;
    if (!store || !plan) return false;
    if (store.phase !== 'playing') {
      return false;
    }
    return pullLever(store, plan, leverId);
  }

  private drainEvents(): void {
    const store = this.store;
    if (!store) return;
    const events = store.events;
    while (this.eventCursor < events.length) {
      const event = events[this.eventCursor];
      this.eventCursor += 1;
      if (!event) continue;
      if (event.type === 'gateOpened') {
        this.beginGate(event.placementId);
      } else if (event.type === 'leverPulled') {
        this.beginLever(event.placementId);
      }
    }
  }

  private beginGate(placementId: string): void {
    const piece = this.findPiece(placementId);
    if (piece?.placement.piece !== 'gate') return;
    const leaf =
      object3DFromUserData(piece.object.userData.leaf) ?? piece.object;
    this.anims.set(placementId, {
      object: leaf,
      elapsed: 0,
      duration: GATE_OPEN_DURATION_S,
      openAngle: GATE_OPEN_ANGLE_RAD,
      kind: 'gate',
    });
  }

  private beginLever(placementId: string): void {
    const piece = this.findPiece(placementId);
    if (piece?.placement.piece !== 'lever') return;
    const handle =
      object3DFromUserData(piece.object.userData.handle) ?? piece.object;
    this.anims.set(placementId, {
      object: handle,
      elapsed: 0,
      duration: LEVER_PULL_DURATION_S,
      openAngle: LEVER_PULL_ANGLE_RAD,
      kind: 'lever',
    });
  }

  private stepAnims(dt: number): void {
    for (const anim of this.anims.values()) {
      if (anim.elapsed >= anim.duration) continue;
      anim.elapsed += dt;
      const t = gateOpenProgress(anim.elapsed, anim.duration);
      const angle =
        anim.kind === 'gate'
          ? gateLeafRotationX(t, anim.openAngle)
          : leverHandleRotationX(t, anim.openAngle);
      anim.object.rotation.x = angle;
    }
  }

  private findPiece(placementId: string) {
    const pieces = this.builder?.getMounted()?.pieces;
    if (!pieces) return undefined;
    for (const piece of pieces) {
      if (piece.placement.id === placementId) return piece;
    }
    return undefined;
  }
}

function object3DFromUserData(value: unknown): Object3D | null {
  if (!value || typeof value !== 'object') return null;
  if (!('rotation' in value)) return null;
  return value as Object3D;
}
