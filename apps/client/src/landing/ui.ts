/**
 * Landing page UI controller
 */

import type { CapabilityResult } from './capability-check';

export interface LandingUIElements {
  landingPage: HTMLElement;
  enterButton: HTMLButtonElement;
  statusMessage: HTMLElement;
  loadingSpinner: HTMLElement;
  tryEmulatorLink: HTMLAnchorElement;
}

export function getLandingUIElements(): LandingUIElements {
  const landingPage = document.getElementById('landing-page');
  const enterButton = document.getElementById('enter-button');
  const statusMessage = document.getElementById('status-message');
  const loadingSpinner = document.getElementById('loading-spinner');
  const tryEmulatorLink = document.getElementById('try-emulator-link');

  if (!landingPage || !enterButton || !statusMessage || !loadingSpinner || !tryEmulatorLink) {
    throw new Error('Required landing page elements not found');
  }

  return {
    landingPage,
    enterButton: enterButton as HTMLButtonElement,
    statusMessage,
    loadingSpinner,
    tryEmulatorLink: tryEmulatorLink as HTMLAnchorElement,
  };
}

export function showLoadingState(ui: LandingUIElements): void {
  ui.enterButton.disabled = true;
  ui.loadingSpinner.classList.remove('hidden');
  ui.statusMessage.textContent = 'Loading...';
  ui.statusMessage.classList.remove('text-red-300', 'text-green-300');
  ui.statusMessage.classList.add('text-white');
}

export function showSupportedState(ui: LandingUIElements, xrChunkReady: boolean): void {
  if (xrChunkReady) {
    ui.enterButton.disabled = false;
    ui.loadingSpinner.classList.add('hidden');
    ui.statusMessage.textContent = 'Ready to enter';
    ui.statusMessage.classList.remove('text-red-300');
    ui.statusMessage.classList.add('text-green-300');
  } else {
    ui.enterButton.disabled = true;
    ui.loadingSpinner.classList.remove('hidden');
    ui.statusMessage.textContent = 'Preparing experience...';
    ui.statusMessage.classList.remove('text-red-300', 'text-green-300');
    ui.statusMessage.classList.add('text-white');
  }
}

export function showUnsupportedState(ui: LandingUIElements, message: string): void {
  ui.enterButton.disabled = true;
  ui.enterButton.classList.add('opacity-50', 'cursor-not-allowed');
  ui.loadingSpinner.classList.add('hidden');
  ui.statusMessage.textContent = message;
  ui.statusMessage.classList.remove('text-green-300');
  ui.statusMessage.classList.add('text-red-300');
  
  ui.tryEmulatorLink.classList.remove('hidden');
}

export function showErrorState(ui: LandingUIElements, message: string): void {
  ui.enterButton.disabled = true;
  ui.loadingSpinner.classList.add('hidden');
  ui.statusMessage.textContent = message;
  ui.statusMessage.classList.remove('text-green-300');
  ui.statusMessage.classList.add('text-red-300');
}

export function updateCapabilityUI(ui: LandingUIElements, result: CapabilityResult, xrChunkReady: boolean): void {
  switch (result.state) {
    case 'checking':
      showLoadingState(ui);
      break;
    case 'supported':
      showSupportedState(ui, xrChunkReady);
      break;
    case 'unsupported':
      showUnsupportedState(ui, result.message || 'WebXR AR is not supported');
      break;
    case 'error':
      showErrorState(ui, result.message || 'Error checking support');
      break;
  }
}
