import { createSystem, type Entity } from '@iwsdk/core';
import {
  applyDirectorStatus,
  createRoomReadingRuntime,
  isRoomReadingBusy,
  isRoomReadingVisible,
  orderSurfacesByArea,
  roomReadingIntensity,
  roomReadingSurfaceId,
  tickRoomReading,
  wanderPath,
  type RoomReadingRuntime,
} from '@roomquest/level-core';
import type { SurfaceGraph, SurfaceNode } from '@roomquest/schema';
import {
  onDirectorRequest,
  type DirectorRequestState,
  type GameStore,
} from '../../game/index.js';
import { createRoomReadingHighlight } from '../room-reading/highlight.js';
import type { ExplorerSystem } from './ExplorerSystem.js';

export interface RoomReadingDebugApi {
  visible: () => boolean;
  phase: () => string;
  surfaceId: () => string | null;
  intensity: () => number;
  mockInFlight: (durationMs?: number) => void;
}

const DEFAULT_MOCK_IN_FLIGHT_MS = 3000;

/**
 * Soft surface sweep + Pip sniff while the director `/levels` request is
 * in flight. One shared highlight mesh; hidden (`visible = false`) when idle.
 */
export class RoomReadingSystem extends createSystem({}, {}) {
  private store: GameStore | null = null;
  private explorer: ExplorerSystem | null = null;
  private graph: SurfaceGraph | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly runtime: RoomReadingRuntime = createRoomReadingRuntime();
  private highlight = createRoomReadingHighlight();
  private entity: Entity | null = null;
  private lastSurfaceId: string | null = null;
  private pipSurfaceId: string | null = null;
  private readonly settleWaiters: (() => void)[] = [];
  private mockTimer: ReturnType<typeof setTimeout> | null = null;

  configure(options: { store: GameStore; explorer: ExplorerSystem }): void {
    this.store = options.store;
    this.explorer = options.explorer;
    this.unsubscribe?.();
    const stopDirector = onDirectorRequest(options.store, (state) => {
      this.onDirector(state);
    });
    const stopEvents = options.store.subscribeEvents((event) => {
      if (event.type === 'roomUnplayable') {
        this.onRoomUnplayable();
      }
    });
    this.unsubscribe = () => {
      stopDirector();
      stopEvents();
    };
  }

  init(): void {
    this.highlight.mesh.visible = false;
    this.entity = this.world.createTransformEntity(this.highlight.mesh, {
      persistent: true,
    });
    this.cleanupFuncs.push(() => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.clearMockTimer();
      this.highlight.dispose();
      this.entity?.dispose({ disposeResources: false });
      this.entity = null;
      this.flushSettled();
    });
  }

  bindGraph(graph: SurfaceGraph): void {
    this.graph = graph;
  }

  whenSettled(): Promise<void> {
    if (!isRoomReadingBusy(this.runtime)) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.settleWaiters.push(resolve);
    });
  }

  debugApi(): RoomReadingDebugApi {
    return {
      visible: () => isRoomReadingVisible(this.runtime),
      phase: () => this.runtime.phase,
      surfaceId: () => roomReadingSurfaceId(this.runtime),
      intensity: () => roomReadingIntensity(this.runtime),
      mockInFlight: (durationMs = DEFAULT_MOCK_IN_FLIGHT_MS) => {
        this.startMockInFlight(durationMs);
      },
    };
  }

  update(delta: number, _time: number): void {
    tickRoomReading(this.runtime, delta);
    this.syncHighlight();
    this.syncPip();
    if (!isRoomReadingBusy(this.runtime)) {
      this.flushSettled();
    }
  }

  private onRoomUnplayable(): void {
    const graph = this.graph;
    const explorer = this.explorer;
    if (!graph || !explorer || graph.nodes.length === 0) {
      return;
    }
    const order = orderSurfacesByArea(graph);
    const openId = order[order.length - 1] ?? order[0];
    if (!openId) {
      return;
    }
    const node = nodeOf(graph, openId);
    if (!node) {
      return;
    }
    const target = surfaceCenter(graph, node);
    const from = this.pipSurfaceId ?? order[0];
    if (from && from !== openId) {
      const path = wanderPath(graph, from, openId);
      if (path && path.segments.length > 0) {
        explorer.beginWander(path);
        this.pipSurfaceId = openId;
        return;
      }
    }
    explorer.faceToward(target.x, target.z);
  }

  private onDirector(state: DirectorRequestState): void {
    const order = this.graph ? orderSurfacesByArea(this.graph) : [];
    applyDirectorStatus(this.runtime, state.status, order);
    if (state.status === 'idle') {
      this.lastSurfaceId = null;
      this.pipSurfaceId = null;
      this.explorer?.stopWander();
    }
    this.syncHighlight();
    this.syncPip();
    if (!isRoomReadingBusy(this.runtime)) {
      this.flushSettled();
    }
  }

  private syncHighlight(): void {
    const graph = this.graph;
    const id = roomReadingSurfaceId(this.runtime);
    const intensity = roomReadingIntensity(this.runtime);
    if (!graph || !id || intensity <= 0) {
      this.highlight.hide();
      return;
    }
    const node = nodeOf(graph, id);
    if (!node) {
      this.highlight.hide();
      return;
    }
    this.highlight.apply(graph, node, intensity);
  }

  private syncPip(): void {
    const graph = this.graph;
    const explorer = this.explorer;
    const id = roomReadingSurfaceId(this.runtime);
    if (!graph || !explorer || !id || !isRoomReadingBusy(this.runtime)) {
      return;
    }
    if (id === this.lastSurfaceId) {
      return;
    }
    this.lastSurfaceId = id;
    const node = nodeOf(graph, id);
    if (!node) {
      return;
    }
    const target = surfaceCenter(graph, node);
    if (this.pipSurfaceId === null) {
      explorer.placeAt(target.x, target.y, target.z, node.yaw);
      this.pipSurfaceId = id;
      return;
    }
    if (this.pipSurfaceId === id) {
      return;
    }
    const path = wanderPath(graph, this.pipSurfaceId, id);
    if (path && path.segments.length > 0) {
      explorer.beginWander(path);
      this.pipSurfaceId = id;
      return;
    }
    explorer.faceToward(target.x, target.z);
  }

  private startMockInFlight(durationMs: number): void {
    const store = this.store;
    if (!store) return;
    this.clearMockTimer();
    store.beginDirectorRequest();
    this.mockTimer = setTimeout(() => {
      this.mockTimer = null;
      store.endDirectorRequest({
        status: 'resolved',
        source: 'llm',
      });
    }, durationMs);
  }

  private clearMockTimer(): void {
    if (this.mockTimer !== null) {
      clearTimeout(this.mockTimer);
      this.mockTimer = null;
    }
  }

  private flushSettled(): void {
    while (this.settleWaiters.length > 0) {
      const wait = this.settleWaiters.pop();
      wait?.();
    }
  }
}

function nodeOf(graph: SurfaceGraph, id: string): SurfaceNode | undefined {
  for (const node of graph.nodes) {
    if (node.id === id) {
      return node;
    }
  }
  return undefined;
}

function surfaceCenter(
  graph: SurfaceGraph,
  node: SurfaceNode
): { x: number; y: number; z: number } {
  return {
    x: node.centroid[0],
    y: graph.floorY + node.topHeight,
    z: node.centroid[2],
  };
}
