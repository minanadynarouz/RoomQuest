export {
  SLIME_BODY_WIDTH_M,
  SLIME_MIN_SURFACE_AREA_M2,
  SLIME_PATROL_SPEED_MPS,
  SLIME_STAR_COUNT,
  SLIME_STAR_HEIGHT_M,
  SLIME_STAR_RADIUS_M,
  SLIME_STAR_SPIN_RAD_S,
  SLIME_STUN_DURATION_S,
  SLIME_SQUISH_SCALE_Y,
} from './constants';
export {
  canExplorerPassSlime,
  createSlimeRuntime,
  isSlimeAwake,
  slimeBodyScaleY,
  slimePatrolConfig,
  stunSlime,
  tickSlime,
  writePatrolLocalOffset,
  writeStarPose,
} from './patrol';
export type {
  SlimePatrolAxis,
  SlimePatrolConfig,
  SlimeRuntime,
  SlimeStarPose,
  SlimeTickResult,
} from './types';
