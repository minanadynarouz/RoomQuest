/**
 * XR boot entry point
 * This is the stub interface for launching the XR game.
 * The 3D developer will fill in the actual implementation.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

let world: Awaited<ReturnType<typeof World.create>> | null = null;

/**
 * Launch the XR experience
 */
export async function launchXR(): Promise<void> {
  if (world) {
    console.warn('[XR] World already created');
    return;
  }

  const container = document.getElementById('xr-container');
  if (!container) {
    throw new Error('XR container not found');
  }

  world = await World.create(container, projectOptions);
  
  console.log('[XR] World created, launching XR session...');
  
  world.launchXR();
}
