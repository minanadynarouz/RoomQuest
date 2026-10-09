/**
 * Live F-06 overlay the HUD reads each frame (onboarding / gaze hint).
 * Written by GuidanceSystem; no allocation after the singleton is created.
 */

export interface GuidanceOverlay {
  onboardingActive: boolean;
  skipVisible: boolean;
  hintVisible: boolean;
  arrowVisible: boolean;
  angleDeg: number;
  looking: boolean;
  line: string | null;
  skipOnboarding: () => void;
}

const overlay: GuidanceOverlay = {
  onboardingActive: false,
  skipVisible: false,
  hintVisible: false,
  arrowVisible: false,
  angleDeg: 0,
  looking: false,
  line: null,
  skipOnboarding: () => {
    /* bound by GuidanceSystem */
  },
};

export function readGuidanceOverlay(): GuidanceOverlay {
  return overlay;
}

export function writeGuidanceOverlay(
  next: Omit<GuidanceOverlay, 'skipOnboarding'>
): void {
  overlay.onboardingActive = next.onboardingActive;
  overlay.skipVisible = next.skipVisible;
  overlay.hintVisible = next.hintVisible;
  overlay.arrowVisible = next.arrowVisible;
  overlay.angleDeg = next.angleDeg;
  overlay.looking = next.looking;
  overlay.line = next.line;
}

export function bindSkipOnboarding(fn: () => void): void {
  overlay.skipOnboarding = fn;
}

export function resetGuidanceOverlay(): void {
  overlay.onboardingActive = false;
  overlay.skipVisible = false;
  overlay.hintVisible = false;
  overlay.arrowVisible = false;
  overlay.angleDeg = 0;
  overlay.looking = false;
  overlay.line = null;
  overlay.skipOnboarding = () => {
    /* unbound */
  };
}
