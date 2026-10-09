import { createSystem, type Object3D } from '@iwsdk/core';
import {
  findPortalPair,
  portalFlashScale,
  PORTAL_TELEPORT_DURATION_S,
} from '@roomquest/level-core';
import type { GameStore } from '../../game/index.js';
import type { LevelBuilderSystem } from './LevelBuilderSystem.js';

interface FlashSlot {
  used: boolean;
  object: Object3D | null;
  elapsed: number;
  restX: number;
  restY: number;
  restZ: number;
}

/**
 * Simple scale-flash when the explorer uses a portal pair. Injected `dt`
 * only; no per-frame allocations.
 */
export class PortalSystem extends createSystem({}, {}) {
  private builder: LevelBuilderSystem | null = null;
  private store: GameStore | null = null;
  private eventCursor = 0;
  private readonly flashes: FlashSlot[] = [makeFlash(), makeFlash()];

  configure(options: { builder: LevelBuilderSystem; store: GameStore }): void {
    this.builder = options.builder;
    this.store = options.store;
  }

  init(): void {
    this.cleanupFuncs.push(() => {
      this.resetFlashes();
    });
  }

  update(delta: number, _time: number): void {
    this.drainEvents();
    this.stepFlashes(delta);
  }

  private drainEvents(): void {
    const store = this.store;
    if (!store) return;
    const events = store.events;
    while (this.eventCursor < events.length) {
      const event = events[this.eventCursor];
      this.eventCursor += 1;
      if (event?.type === 'portalUsed') {
        this.beginFlash(event.placementId);
      }
    }
  }

  private beginFlash(placementId: string): void {
    const plan = this.store?.plan;
    const pair = plan ? findPortalPair(plan) : null;
    const ids = pair
      ? pair.aId === pair.bId
        ? [pair.aId]
        : [pair.aId, pair.bId]
      : [placementId];
    let flashIndex = 0;
    for (const id of ids) {
      const object = this.objectOf(id);
      if (!object) continue;
      const slot = this.flashes[flashIndex];
      if (!slot) break;
      flashIndex += 1;
      slot.used = true;
      slot.object = object;
      slot.elapsed = 0;
      slot.restX = object.scale.x;
      slot.restY = object.scale.y;
      slot.restZ = object.scale.z;
    }
  }

  private stepFlashes(dt: number): void {
    for (const slot of this.flashes) {
      if (!slot.used || !slot.object) continue;
      slot.elapsed += dt;
      const s = portalFlashScale(slot.elapsed, PORTAL_TELEPORT_DURATION_S);
      slot.object.scale.set(slot.restX * s, slot.restY * s, slot.restZ * s);
      if (slot.elapsed >= PORTAL_TELEPORT_DURATION_S) {
        slot.object.scale.set(slot.restX, slot.restY, slot.restZ);
        slot.used = false;
        slot.object = null;
      }
    }
  }

  private objectOf(placementId: string): Object3D | null {
    const pieces = this.builder?.getMounted()?.pieces;
    if (!pieces) return null;
    for (const piece of pieces) {
      if (piece.placement.id === placementId) {
        return piece.object;
      }
    }
    return null;
  }

  private resetFlashes(): void {
    for (const slot of this.flashes) {
      if (slot.used && slot.object) {
        slot.object.scale.set(slot.restX, slot.restY, slot.restZ);
      }
      slot.used = false;
      slot.object = null;
      slot.elapsed = 0;
    }
    this.eventCursor = 0;
  }
}

function makeFlash(): FlashSlot {
  return {
    used: false,
    object: null,
    elapsed: 0,
    restX: 1,
    restY: 1,
    restZ: 1,
  };
}
