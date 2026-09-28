/**
 * XR session initialization and launch
 * Ticket X-01: IWSDK AR spike
 */

import { World, SessionMode } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PlaneTestSystem } from './systems/PlaneTestSystem.js';

let worldInstance: World | null = null;

/**
 * Launch the XR session.
 * Called by the frontend's "Enter your room" button.
 * 
 * Requirements (X-01):
 * - immersive AR session (passthrough)
 * - offer: "none" (no auto-offer)
 * - hand tracking required
 * - features: sceneUnderstanding, grabbing with useHandPinchForGrab: true,
 *   gaze, spatialUI
 * - locomotion off
 */
export async function launchXR(): Promise<World> {
  if (worldInstance) {
    await worldInstance.launchXR();
    return worldInstance;
  }

  // Override project options for the spike requirements
  const xrOptions = {
    ...projectOptions,
    xr: {
      sessionMode: SessionMode.ImmersiveAR,
      offer: 'none' as const,
      features: {
        handTracking: { required: true },
        planeDetection: true,
        meshDetection: true,
        anchors: true,
        hitTest: true,
        gazeTracking: true,
      },
    },
    features: {
      locomotion: false,
      grabbing: {
        useHandPinchForGrab: true,
      },
      sceneUnderstanding: true,
      environmentRaycast: true,
      gaze: {
        logDiagnostics: true,
      },
      spatialUI: {
        kit: 'horizon' as const,
      },
    },
  };

  worldInstance = await World.create(
    document.getElementById('scene-container') as HTMLDivElement,
    xrOptions,
  );

  // Register test system for X-01 spike
  worldInstance.registerSystem(PlaneTestSystem, { priority: 10 });

  // Launch the XR session
  await worldInstance.launchXR();

  return worldInstance;
}

/**
 * Get the current world instance (if initialized)
 */
export function getWorld(): World | null {
  return worldInstance;
}
