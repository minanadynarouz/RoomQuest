/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;
const DEFAULT_STOCK_ASSET_BASE =
  'https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@0.4.2/assets';
const configuredStockAssetBase =
  import.meta.env.VITE_IWSDK_EXAMPLE_ASSET_BASE_URL?.trim();
const stockAssetBase = (
  configuredStockAssetBase || DEFAULT_STOCK_ASSET_BASE
).replace(/\/+$/u, '');

function stockAssetUrl(assetId: string, fileName: string): string {
  return `${stockAssetBase}/${assetId}/${fileName}`;
}

export default defineAssets({
  'environment-desk': {
    url: stockAssetUrl('environment-desk', 'environmentDesk.gltf'),
    type: AssetType.GLTF,
    name: 'Environment Desk',
    priority: 'lazy',
  },
  'plant-sansevieria': {
    url: stockAssetUrl('plant-sansevieria', 'plantSansevieria.gltf'),
    type: AssetType.GLTF,
    name: 'Plant Sansevieria',
    priority: 'lazy',
  },
  robot: {
    url: stockAssetUrl('robot', 'robot.gltf'),
    type: AssetType.GLTF,
    name: 'Robot',
    priority: 'lazy',
  },
  'welcome-panel': {
    url: publicAssetUrl('ui/welcome.uikitml'),
    type: AssetType.UIKitML,
    name: 'Welcome Panel',
  },
  'hud-surveying': {
    url: publicAssetUrl('ui/hud-surveying.uikitml'),
    type: AssetType.UIKitML,
    name: 'HUD Surveying',
  },
  'hud-dialogue': {
    url: publicAssetUrl('ui/hud-dialogue.uikitml'),
    type: AssetType.UIKitML,
    name: 'HUD Dialogue',
  },
  'hud-beat': {
    url: publicAssetUrl('ui/hud-beat.uikitml'),
    type: AssetType.UIKitML,
    name: 'HUD Beat Goal',
  },
  'hud-no-surfaces': {
    url: publicAssetUrl('ui/hud-no-surfaces.uikitml'),
    type: AssetType.UIKitML,
    name: 'HUD No Surfaces',
  },
  'hud-pause': {
    url: publicAssetUrl('ui/hud-pause.uikitml'),
    type: AssetType.UIKitML,
    name: 'HUD Pause',
  },
  'hud-win': {
    url: publicAssetUrl('ui/hud-win.uikitml'),
    type: AssetType.UIKitML,
    name: 'HUD Win',
  },
  'debug-overlay': {
    url: publicAssetUrl('ui/debug-overlay.uikitml'),
    type: AssetType.UIKitML,
    name: 'Debug Overlay',
    priority: 'lazy',
  },
  'webxr-banner': {
    url: publicAssetUrl('gltf/webxr-banner/banner.gltf'),
    type: AssetType.GLTF,
    name: 'WebXR Banner',
    priority: 'lazy',
  },
  'sfx-grab': {
    url: publicAssetUrl('audio/grab.ogg'),
    type: AssetType.Audio,
    name: 'SFX Grab',
    priority: 'lazy',
  },
  'sfx-snap': {
    url: publicAssetUrl('audio/snap.ogg'),
    type: AssetType.Audio,
    name: 'SFX Snap',
    priority: 'lazy',
  },
  'sfx-lever': {
    url: publicAssetUrl('audio/lever.ogg'),
    type: AssetType.Audio,
    name: 'SFX Lever',
    priority: 'lazy',
  },
  'sfx-gate': {
    url: publicAssetUrl('audio/gate.ogg'),
    type: AssetType.Audio,
    name: 'SFX Gate',
    priority: 'lazy',
  },
  'sfx-stun': {
    url: publicAssetUrl('audio/stun.ogg'),
    type: AssetType.Audio,
    name: 'SFX Stun',
    priority: 'lazy',
  },
  'sfx-gem': {
    url: publicAssetUrl('audio/gem.ogg'),
    type: AssetType.Audio,
    name: 'SFX Gem',
    priority: 'lazy',
  },
  'sfx-win': {
    url: publicAssetUrl('audio/win.ogg'),
    type: AssetType.Audio,
    name: 'SFX Win',
    priority: 'lazy',
  },
  'sfx-chirp': {
    url: publicAssetUrl('audio/chirp.ogg'),
    type: AssetType.Audio,
    name: 'SFX Chirp',
    priority: 'lazy',
  },
  'sfx-blocked': {
    url: publicAssetUrl('audio/blocked.ogg'),
    type: AssetType.Audio,
    name: 'SFX Blocked',
    priority: 'lazy',
  },
  'sfx-beat': {
    url: publicAssetUrl('audio/beat.ogg'),
    type: AssetType.Audio,
    name: 'SFX Beat',
    priority: 'lazy',
  },
});
