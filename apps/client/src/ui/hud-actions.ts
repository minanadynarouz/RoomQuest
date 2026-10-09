/**
 * HUD button actions (F-07). Kept out of HudSystem so session wiring
 * can be unit-tested without IWSDK.
 */
export interface HudActions {
  pause: () => void;
  resume: () => void;
  replay: () => void;
  exit: () => void;
}
