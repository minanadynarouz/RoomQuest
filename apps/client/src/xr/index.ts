/**
 * XR module exports
 * 
 * TEMPORARY SHIM for F-01 (landing page):
 * This file provides a minimal launchXR() stub until PR #3 (X-01 IWSDK AR spike)
 * merges. Once PR #3 is merged, this shim will be replaced with the real
 * implementation that exports { launchXR, getWorld } from './boot.js'.
 * 
 * The signature matches PR #3's interface so the landing page works with both.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

let worldInstance: World | null = null;

/**
 * Launch the XR session.
 * 
 * TEMPORARY: Minimal stub that creates a World and launches XR.
 * PR #3 will replace this with the full implementation including systems.
 */
export async function launchXR(): Promise<World> {
  if (worldInstance) {
    worldInstance.launchXR();
    return worldInstance;
  }

  const container = document.getElementById('xr-container');
  if (!container) {
    throw new Error('XR container not found');
  }

  worldInstance = await World.create(container, projectOptions);
  
  console.log('[XR Shim] World created, launching XR session...');
  
  worldInstance.launchXR();
  
  return worldInstance;
}

/**
 * Get the current World instance
 * 
 * TEMPORARY: Minimal stub. PR #3 provides the real implementation.
 */
export function getWorld(): World | null {
  return worldInstance;
}
