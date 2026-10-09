import {
  createSystem,
  PokeInteractable,
  Pressed,
  RayInteractable,
  type Entity,
  type Object3D,
} from '@iwsdk/core';
import {
  SLIME_STAR_COUNT,
  canExplorerPassSlime,
  createSlimeRuntime,
  isSlimeAwake,
  isSlimeGroggy,
  slimePatrolConfig,
  slimeStarScale,
  slimeStarsVisible,
  stunSlime,
  tickSlime,
  writePatrolLocalOffset,
  writeSlimeBodyScale,
  writeStarPose,
  type SlimeBodyScale,
  type SlimeExplorerLocal,
  type SlimePatrolConfig,
  type SlimeRuntime,
  type SlimeStarPose,
} from '@roomquest/level-core';
import type { SurfaceGraph } from '@roomquest/schema';
import type { GameStore } from '../../game/index.js';
import { getExplorerTarget } from '../../ui/explorer-target.js';
import { emitSlimeStunned, isSlimeStunStillActive } from '../slime/stun.js';
import type { LevelBuilderSystem } from './LevelBuilderSystem.js';

interface BoundSlime {
  runtime: SlimeRuntime;
  config: SlimePatrolConfig;
  object: Object3D;
  body: Object3D | null;
  stars: Object3D | null;
  home: { x: number; y: number; z: number; yaw: number };
  entity: Entity;
}

export interface SlimeDebugApi {
  stun: (placementId: string) => boolean;
  boundCount: () => number;
  isAwake: (placementId: string) => boolean;
  isGroggy?: (placementId: string) => boolean;
  canPass: (placementId: string) => boolean;
}

/**
 * Patrol + stun for slime pieces. Near poke (`PokeInteractable`) and far
 * ray+pinch (`RayInteractable`) share {@link emitSlimeStunned} with autoSolve.
 */
export class SlimeSystem extends createSystem(
  {
    pressed: { required: [Pressed] },
  },
  {}
) {
  private builder: LevelBuilderSystem | null = null;
  private store: GameStore | null = null;
  private graph: SurfaceGraph | null = null;
  private eventCursor = 0;
  private readonly bound = new Map<string, BoundSlime>();
  private readonly entities = new Set<Entity>();
  private readonly pointerDown = new Map<Entity, () => void>();
  private readonly tmpOffset = { x: 0, z: 0 };
  private readonly tmpStar: SlimeStarPose = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly tmpExplorer = { x: 0, y: 0, z: 0 };
  private readonly tmpLocal: SlimeExplorerLocal = { x: 0, y: 0, z: 0 };
  private readonly tmpScale: SlimeBodyScale = {
    x: 1,
    y: 1,
    z: 1,
    tiltX: 0,
  };

  configure(options: { builder: LevelBuilderSystem; store: GameStore }): void {
    this.builder = options.builder;
    this.store = options.store;
  }

  bindGraph(graph: SurfaceGraph | null): void {
    this.graph = graph;
    if (this.builder?.getMounted()) {
      this.rebind();
    }
  }

  init(): void {
    this.queries.pressed.subscribe('qualify', (entity) => {
      this.onPressed(entity);
    });
    this.cleanupFuncs.push(() => {
      this.unbindAll();
    });
  }

  onLevelRebuilt(): void {
    this.rebind();
  }

  debugApi(): SlimeDebugApi {
    return {
      stun: (placementId) => this.activateStun(placementId),
      boundCount: () => this.bound.size,
      isAwake: (placementId) => {
        const row = this.bound.get(placementId);
        return row ? isSlimeAwake(row.runtime) : true;
      },
      isGroggy: (placementId) => {
        const row = this.bound.get(placementId);
        return row ? isSlimeGroggy(row.runtime) : false;
      },
      canPass: (placementId) => {
        const row = this.bound.get(placementId);
        return row ? canExplorerPassSlime(row.runtime) : false;
      },
    };
  }

  update(delta: number, time: number): void {
    this.drainEvents();
    const store = this.store;
    if (store?.phase !== 'playing') return;
    this.step(delta, time);
  }

  private rebind(): void {
    this.unbindAll();
    const events = this.store?.events ?? [];
    // Skip the historical log. Replaying slimeStunned after slimeWoke would
    // restun without a new poke (HUD Replay clears events; this path does not).
    this.eventCursor = events.length;
    const mounted = this.builder?.getMounted();
    const graph = this.graph;
    if (!mounted) return;
    for (const piece of mounted.pieces) {
      if (piece.placement.piece !== 'slime') continue;
      const entity = this.builder?.getPieceEntity(piece.placement.id);
      if (!entity) continue;
      const node = graph?.nodes.find(
        (surface) => surface.id === piece.placement.surface
      );
      const config = slimePatrolConfig(
        node?.size[0] ?? 1,
        node?.size[1] ?? 0.6
      );
      this.bindSlime(entity, piece.object, piece.placement.id, config);
      const row = this.bound.get(piece.placement.id);
      if (!row) continue;
      if (isSlimeStunStillActive(events, piece.placement.id)) {
        stunSlime(row.runtime);
      } else if (latestSlimeEventIsWoke(events, piece.placement.id)) {
        row.runtime.groggy = true;
        row.runtime.groggyElapsedS = 0;
      }
    }
  }

  private unbindAll(): void {
    for (const [entity, handler] of this.pointerDown) {
      entity.object3D?.removeEventListener('pointerdown', handler);
    }
    this.pointerDown.clear();
    this.entities.clear();
    this.bound.clear();
  }

  private bindSlime(
    entity: Entity,
    object: Object3D,
    placementId: string,
    config: SlimePatrolConfig
  ): void {
    if (!entity.hasComponent(RayInteractable)) {
      entity.addComponent(RayInteractable);
    }
    if (!entity.hasComponent(PokeInteractable)) {
      entity.addComponent(PokeInteractable);
    }
    const object3D = entity.object3D ?? object;
    object3D.pointerEvents = 'auto';
    object3D.pointerEventsOrder = 8;
    const onDown = (): void => {
      const id = object3D.userData.placementId;
      if (typeof id === 'string') this.activateStun(id);
    };
    object3D.addEventListener('pointerdown', onDown);
    this.pointerDown.set(entity, onDown);
    this.entities.add(entity);

    this.bound.set(placementId, {
      runtime: createSlimeRuntime(placementId),
      config,
      object,
      body: object3DFromUserData(object.userData.body) ?? object,
      stars: object3DFromUserData(object.userData.stars),
      home: {
        x: object.position.x,
        y: object.position.y,
        z: object.position.z,
        yaw: object.rotation.y,
      },
      entity,
    });
  }

  private onPressed(entity: Entity): void {
    if (!this.entities.has(entity)) return;
    const id = entity.object3D?.userData.placementId;
    if (typeof id !== 'string') return;
    this.activateStun(id);
  }

  private activateStun(placementId: string): boolean {
    const store = this.store;
    if (store?.phase !== 'playing') return false;
    const row = this.bound.get(placementId);
    if (!row) {
      return emitSlimeStunned(store, placementId);
    }
    const newly = stunSlime(row.runtime);
    if (!newly) return false;
    return emitSlimeStunned(store, placementId);
  }

  private drainEvents(): void {
    const store = this.store;
    if (!store) return;
    const events = store.events;
    while (this.eventCursor < events.length) {
      const event = events[this.eventCursor];
      this.eventCursor += 1;
      if (!event) continue;
      if (event.type !== 'slimeStunned') continue;
      if (!isSlimeStunStillActive(events, event.placementId)) continue;
      const row = this.bound.get(event.placementId);
      if (!row) continue;
      if (row.runtime.stunRemainingS <= 0) {
        stunSlime(row.runtime);
      }
    }
  }

  private step(dt: number, timeS: number): void {
    const store = this.store;
    if (!store) return;
    const occupancy = this.writeExplorerLocal();
    for (const row of this.bound.values()) {
      this.writeRowLocal(row, occupancy);
      const result = tickSlime(
        row.runtime,
        dt,
        row.config,
        occupancy ? this.tmpLocal : undefined
      );
      if (result === 'woke') {
        store.slimeWoke(row.runtime.placementId);
      }
      this.syncVisual(row, timeS);
    }
  }

  /**
   * Fills {@link tmpExplorer} when an explorer target exists. Per-slime
   * local conversion happens in {@link writeRowLocal} so each slime's home
   * pose is used without allocating.
   */
  private writeExplorerLocal(): boolean {
    const target = getExplorerTarget();
    if (!target) return false;
    target.getWorldPosition(this.tmpExplorer);
    return true;
  }

  private writeRowLocal(row: BoundSlime, hasExplorer: boolean): void {
    if (!hasExplorer) return;
    const yaw = row.home.yaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const dx = this.tmpExplorer.x - row.home.x;
    const dy = this.tmpExplorer.y - row.home.y;
    const dz = this.tmpExplorer.z - row.home.z;
    this.tmpLocal.x = dx * cos + dz * sin;
    this.tmpLocal.z = -dx * sin + dz * cos;
    this.tmpLocal.y = dy;
  }

  private syncVisual(row: BoundSlime, timeS: number): void {
    writePatrolLocalOffset(row.runtime, row.config, this.tmpOffset);
    const yaw = row.home.yaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const localX = this.tmpOffset.x;
    const localZ = this.tmpOffset.z;
    row.object.position.set(
      row.home.x + localX * cos - localZ * sin,
      row.home.y,
      row.home.z + localX * sin + localZ * cos
    );

    writeSlimeBodyScale(row.runtime, this.tmpScale);
    if (row.body) {
      row.body.scale.set(this.tmpScale.x, this.tmpScale.y, this.tmpScale.z);
      row.body.rotation.x = this.tmpScale.tiltX;
    }
    const stars = row.stars;
    if (!stars) return;
    const showStars = slimeStarsVisible(row.runtime);
    stars.visible = showStars;
    const starScale = showStars ? slimeStarScale(row.runtime) : 1;
    stars.scale.set(starScale, starScale, starScale);
    if (!showStars) return;
    const children = stars.children;
    for (let i = 0; i < SLIME_STAR_COUNT; i += 1) {
      const star = children[i];
      if (!star) continue;
      writeStarPose(i, timeS, this.tmpStar);
      star.position.set(this.tmpStar.x, this.tmpStar.y, this.tmpStar.z);
      star.rotation.set(0, this.tmpStar.yaw, 0.4);
    }
  }
}

function latestSlimeEventIsWoke(
  events: readonly { type: string; placementId?: string }[],
  placementId: string
): boolean {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.placementId !== placementId) continue;
    return event.type === 'slimeWoke';
  }
  return false;
}

function object3DFromUserData(value: unknown): Object3D | null {
  if (!value || typeof value !== 'object') return null;
  if (!('visible' in value) || !('position' in value)) return null;
  return value as Object3D;
}
