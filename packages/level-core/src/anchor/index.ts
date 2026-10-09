export {
  VILLAGE_ANCHOR_STORAGE_KEY,
  type VillageAnchorDecision,
  type VillageAnchorDecisionKind,
  type VillageAnchorFallbackDecision,
  type VillageAnchorFallbackReason,
  type VillageAnchorRestoreDecision,
  type VillageAnchorStorage,
} from './types';
export {
  clearVillageAnchorHandle,
  isPersistentAnchorHandle,
  isVillageAnchorStorageAvailable,
  readVillageAnchorHandle,
  writeVillageAnchorHandle,
} from './storage';
export {
  chooseLargestTable,
  chooseVillageAnchorPlacement,
  villageFallbackPose,
  type VillageAnchorChoiceInput,
} from './fallback';
