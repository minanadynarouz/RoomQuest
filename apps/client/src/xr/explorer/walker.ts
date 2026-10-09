import type { ExplorerPath, PathBlocker } from '@roomquest/level-core';
import type { LevelPlan, Placement } from '@roomquest/schema';
import type { GameStore } from '../../game/index.js';

export const EXPLORER_SPEED_MPS = 0.15;
export const BOB_AMPLITUDE_M = 0.008;
export const BOB_FREQ_HZ = 1.4;
const TELEPORT_S = 0.35;
const ARRIVE_EPS = 1e-4;

export type ExplorerStateName =
  'idle' | 'walking' | 'blocked' | 'riding' | 'teleporting' | 'celebrating';

export interface ExplorerPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export class ExplorerWalker {
  readonly speedMps: number;
  private path: ExplorerPath;
  private plan: LevelPlan | null;
  private store: GameStore | null;
  private stateName: ExplorerStateName = 'idle';
  private blockedReason: PathBlocker | undefined;
  private segmentIndex = 0;
  private t = 0;
  private x = 0;
  private y = 0;
  private z = 0;
  private yaw = 0;
  private eventCursor = 0;
  private readonly built = new Set<string>();
  private readonly openGates = new Set<string>();
  private readonly stunned = new Set<string>();
  private readonly gems = new Set<string>();
  private readonly aligned = new Set<string>();
  private readonly portalsUsed = new Set<string>();
  private reachedShrine = false;
  private teleportAge = 0;
  private lastOutOfView = false;
  private emittedBlocker = false;
  private won = false;
  private placementsById = new Map<string, Placement>();

  constructor(speedMps = EXPLORER_SPEED_MPS) {
    this.speedMps = speedMps;
    this.path = { waypoints: [], segments: [] };
    this.plan = null;
    this.store = null;
  }

  begin(path: ExplorerPath, plan: LevelPlan, store: GameStore): void {
    this.path = path;
    this.plan = plan;
    this.store = store;
    this.stateName = 'idle';
    this.blockedReason = undefined;
    this.segmentIndex = 0;
    this.t = 0;
    this.eventCursor = 0;
    this.built.clear();
    this.openGates.clear();
    this.stunned.clear();
    this.gems.clear();
    this.aligned.clear();
    this.portalsUsed.clear();
    this.reachedShrine = false;
    this.teleportAge = 0;
    this.lastOutOfView = false;
    this.emittedBlocker = false;
    this.won = false;
    this.placementsById = new Map();
    for (const placement of plan.placements) {
      this.placementsById.set(placement.id, placement);
      if (
        (placement.piece === 'plank_bridge' ||
          placement.piece === 'ramp' ||
          placement.piece === 'portal' ||
          placement.piece === 'moving_platform') &&
        !placement.playerBuilt
      ) {
        this.built.add(placement.id);
      }
    }
    const first = path.waypoints[0];
    if (first) {
      this.x = first.pose.position[0];
      this.y = first.pose.position[1];
      this.z = first.pose.position[2];
      this.yaw = first.pose.yaw;
    }
  }

  get state(): ExplorerStateName {
    return this.stateName;
  }

  get reason(): PathBlocker | undefined {
    return this.blockedReason;
  }

  /** Placement owning the current hop (platform / portal / gap), if any. */
  get activePlacementId(): string | undefined {
    const segment = this.path.segments[this.segmentIndex];
    return segment?.placementId;
  }

  get pose(): ExplorerPose {
    return { x: this.x, y: this.y, z: this.z, yaw: this.yaw };
  }

  writePose(out: ExplorerPose): void {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    out.yaw = this.yaw;
  }

  getWorldPosition(out: { x: number; y: number; z: number }): {
    x: number;
    y: number;
    z: number;
  } {
    out.x = this.x;
    out.y = this.y;
    out.z = this.z;
    return out;
  }

  bobOffset(timeS: number): number {
    if (this.stateName !== 'walking' && this.stateName !== 'riding') {
      return 0;
    }
    return Math.sin(timeS * BOB_FREQ_HZ * Math.PI * 2) * BOB_AMPLITUDE_M;
  }

  update(dt: number, _timeS: number): void {
    this.drainEvents();
    const store = this.store;
    if (!store) {
      this.stateName = 'idle';
      return;
    }
    if (store.phase === 'won' || this.won) {
      this.stateName = 'celebrating';
      return;
    }
    if (store.phase !== 'playing') {
      if (this.stateName !== 'blocked') {
        this.stateName = 'idle';
      }
      return;
    }
    this.maybeAdvanceBeats();
    this.step(dt);
    this.maybeAdvanceBeats();
    this.maybeWin();
  }

  checkOutOfView(outOfView: boolean): void {
    if (outOfView && !this.lastOutOfView) {
      this.store?.explorerOutOfView();
    }
    this.lastOutOfView = outOfView;
  }

  private drainEvents(): void {
    const store = this.store;
    if (!store) return;
    const events = store.events;
    while (this.eventCursor < events.length) {
      const event = events[this.eventCursor];
      this.eventCursor += 1;
      if (!event) continue;
      if (event.type === 'pieceBuilt') {
        this.built.add(event.placementId);
      } else if (event.type === 'gateOpened') {
        this.openGates.add(event.placementId);
      } else if (event.type === 'slimeStunned') {
        this.stunned.add(event.placementId);
      } else if (event.type === 'gemCollected') {
        this.gems.add(event.placementId);
      } else if (event.type === 'platformAligned') {
        this.aligned.add(event.placementId);
      } else if (event.type === 'pieceMoved' && !event.aligned) {
        this.aligned.delete(event.placementId);
      }
    }
  }

  private step(dt: number): void {
    const segments = this.path.segments;
    if (segments.length === 0) {
      this.stateName = 'idle';
      return;
    }
    if (this.segmentIndex >= segments.length) {
      this.collectAtCurrent();
      this.stateName = this.won ? 'celebrating' : 'idle';
      return;
    }
    const segment = segments[this.segmentIndex];
    if (!segment) {
      this.stateName = 'idle';
      return;
    }
    if (!this.blockerCleared(segment.blocker, segment.placementId)) {
      this.enterBlocked(segment.blocker);
      return;
    }
    this.emittedBlocker = false;
    this.blockedReason = undefined;
    this.stateName = motionFor(segment.kind);

    if (segment.kind === 'portal') {
      if (this.teleportAge === 0 && segment.placementId) {
        this.emitPortalUsed(segment.placementId);
      }
      this.teleportAge += dt;
      if (this.teleportAge >= TELEPORT_S) {
        this.arrive(segment.toIndex);
        this.teleportAge = 0;
        this.segmentIndex += 1;
        this.t = 0;
      }
      return;
    }

    const from = this.path.waypoints[segment.fromIndex];
    const to = this.path.waypoints[segment.toIndex];
    if (!from || !to) {
      this.segmentIndex += 1;
      this.t = 0;
      return;
    }
    const dx = to.pose.position[0] - from.pose.position[0];
    const dy = to.pose.position[1] - from.pose.position[1];
    const dz = to.pose.position[2] - from.pose.position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < ARRIVE_EPS) {
      this.arrive(segment.toIndex);
      this.segmentIndex += 1;
      this.t = 0;
      return;
    }
    this.t += (this.speedMps * dt) / dist;
    if (this.t >= 1) {
      this.arrive(segment.toIndex);
      this.segmentIndex += 1;
      this.t = 0;
      return;
    }
    this.x = from.pose.position[0] + dx * this.t;
    this.y = from.pose.position[1] + dy * this.t;
    this.z = from.pose.position[2] + dz * this.t;
    this.yaw = Math.atan2(dx, dz);
  }

  private arrive(waypointIndex: number): void {
    const waypoint = this.path.waypoints[waypointIndex];
    if (!waypoint) return;
    this.x = waypoint.pose.position[0];
    this.y = waypoint.pose.position[1];
    this.z = waypoint.pose.position[2];
    this.yaw = waypoint.pose.yaw;
    const id = waypoint.placementId;
    if (!id) return;
    const placement = this.placementsById.get(id);
    if (!placement) return;
    if (placement.piece === 'gem' && !this.gems.has(id)) {
      this.gems.add(id);
      this.store?.gemCollected(id);
    }
    if (placement.piece === 'crystal_shrine') {
      this.reachedShrine = true;
    }
  }

  private collectAtCurrent(): void {
    const last = this.path.waypoints[this.path.waypoints.length - 1];
    if (last?.placementId) {
      const placement = this.placementsById.get(last.placementId);
      if (placement?.piece === 'crystal_shrine') {
        this.reachedShrine = true;
      }
    }
  }

  private enterBlocked(reason: PathBlocker | undefined): void {
    if (!reason) return;
    this.stateName = 'blocked';
    this.blockedReason = reason;
    if (!this.emittedBlocker) {
      this.store?.explorerBlocked(reason);
      this.emittedBlocker = true;
    }
  }

  private blockerCleared(
    blocker: PathBlocker | undefined,
    placementId: string | undefined
  ): boolean {
    if (!blocker) return true;
    if (blocker === 'unbuiltGap') {
      return placementId ? this.built.has(placementId) : false;
    }
    if (blocker === 'closedGate') {
      return placementId ? this.openGates.has(placementId) : false;
    }
    if (blocker === 'unalignedPlatform') {
      return placementId ? this.aligned.has(placementId) : false;
    }
    return placementId ? this.stunned.has(placementId) : false;
  }

  private emitPortalUsed(placementId: string): void {
    if (this.portalsUsed.has(placementId)) return;
    this.portalsUsed.add(placementId);
    this.store?.portalUsed(placementId);
  }

  private maybeAdvanceBeats(): void {
    const store = this.store;
    const plan = this.plan;
    if (!store || !plan) return;
    let guard = 0;
    while (guard < plan.beats.length) {
      guard += 1;
      const index = store.state.currentBeatIndex;
      const timing = store.state.beatTimings.find((b) => b.beatIndex === index);
      if (timing?.durationMs !== null && timing !== undefined) {
        break;
      }
      const beat = plan.beats[index];
      if (!beat) break;
      if (!this.beatSatisfied(beat.uses)) break;
      const isLast = index >= plan.beats.length - 1;
      if (isLast) {
        store.completeCurrentBeat();
        break;
      }
      store.advanceBeat();
    }
  }

  private beatSatisfied(uses: readonly string[]): boolean {
    for (const id of uses) {
      const placement = this.placementsById.get(id);
      if (!placement) return false;
      if (!this.placementSatisfied(placement)) return false;
    }
    return true;
  }

  private placementSatisfied(placement: Placement): boolean {
    switch (placement.piece) {
      case 'plank_bridge':
      case 'ramp':
      case 'portal':
        return !placement.playerBuilt || this.built.has(placement.id);
      case 'moving_platform':
        return (
          (!placement.playerBuilt || this.built.has(placement.id)) &&
          this.aligned.has(placement.id)
        );
      case 'gate':
        return this.openGates.has(placement.id);
      case 'lever':
        if (placement.links.length === 0) return true;
        return placement.links.every((link) => this.openGates.has(link));
      case 'gem':
        return this.gems.has(placement.id);
      case 'slime':
        return this.stunned.has(placement.id);
      case 'crystal_shrine':
        return this.reachedShrine;
      case 'village_hut':
        return true;
      default:
        return true;
    }
  }

  private maybeWin(): void {
    const store = this.store;
    const plan = this.plan;
    if (!store || !plan || this.won) return;
    if (!this.reachedShrine) return;
    if (store.phase !== 'playing') return;
    const allDone = plan.beats.every((_, index) => {
      const timing = store.state.beatTimings.find((b) => b.beatIndex === index);
      return timing?.durationMs !== null && timing !== undefined;
    });
    if (!allDone) return;
    this.won = true;
    this.stateName = 'celebrating';
    store.win();
  }
}

function motionFor(
  kind: ExplorerPath['segments'][number]['kind']
): ExplorerStateName {
  if (kind === 'portal') return 'teleporting';
  if (kind === 'moving_platform') return 'riding';
  return 'walking';
}
