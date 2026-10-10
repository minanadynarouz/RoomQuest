/**
 * XR module exports
 */

export {
  launchXR,
  getWorld,
  getGameStore,
  registerRqHook,
  setExplorerAnchor,
  setExplorerTarget,
} from './boot.js';
export type { RqHooks, ExplorerTarget } from './boot.js';
export type { PlatformDebugApi } from './systems/PlatformRailSystem.js';
export { LevelBuilderSystem } from './systems/LevelBuilderSystem.js';
export { PlacementSystem } from './systems/PlacementSystem.js';
export { ExplorerSystem } from './systems/ExplorerSystem.js';
export { GateLeverSystem } from './systems/GateLeverSystem.js';
export { PlatformRailSystem } from './systems/PlatformRailSystem.js';
export { PortalSystem } from './systems/PortalSystem.js';
export { SlimeSystem } from './systems/SlimeSystem.js';
export { SurfaceGraphSystem } from './systems/SurfaceGraphSystem.js';
export { RoomReadingSystem } from './systems/RoomReadingSystem.js';
export { VillageAnchorSystem } from './systems/VillageAnchorSystem.js';
export { mountGreyboxLevel } from './level/mount-level.js';
export { countDrawCalls, countTriangles } from './level/draw-calls.js';
export { createPiece, createGreyboxKit } from './pieces/index.js';
export { HudSystem, bindHudStore, bindHudActions } from '../ui/HudSystem.js';
export { PlacementController } from './placement/controller.js';
