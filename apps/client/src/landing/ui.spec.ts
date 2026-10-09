/**
 * Tests for landing page UI logic
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  getLandingUIElements,
  showLoadingState,
  showSupportedState,
  showUnsupportedState,
  updateCapabilityUI,
} from './ui';
import type { CapabilityResult } from './capability-check';

describe('landing-ui', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <body>
          <div id="landing-page"></div>
          <button id="enter-button"></button>
          <div id="status-message"></div>
          <div id="loading-spinner"></div>
          <a id="try-emulator-link" class="invisible pointer-events-none"></a>
        </body>
      </html>
    `);
    document = dom.window.document;
    global.document = document;
  });

  afterEach(() => {
    dom.window.close();
  });

  describe('getLandingUIElements', () => {
    it('should return all required UI elements', () => {
      const ui = getLandingUIElements();

      expect(ui.landingPage).toBeDefined();
      expect(ui.enterButton).toBeDefined();
      expect(ui.statusMessage).toBeDefined();
      expect(ui.loadingSpinner).toBeDefined();
      expect(ui.tryEmulatorLink).toBeDefined();
    });

    it('should throw if required elements are missing', () => {
      const button = document.getElementById('enter-button');
      button?.remove();

      expect(() => getLandingUIElements()).toThrow('Required landing page elements not found');
    });
  });

  describe('showLoadingState', () => {
    it('should disable button and show spinner', () => {
      const ui = getLandingUIElements();
      showLoadingState(ui);

      expect(ui.enterButton.disabled).toBe(true);
      expect(ui.loadingSpinner.classList.contains('hidden')).toBe(false);
      expect(ui.statusMessage.textContent).toBe('Loading...');
    });
  });

  describe('showSupportedState', () => {
    it('should enable button when XR chunk is ready', () => {
      const ui = getLandingUIElements();
      showSupportedState(ui, true);

      expect(ui.enterButton.disabled).toBe(false);
      expect(ui.loadingSpinner.classList.contains('hidden')).toBe(true);
      expect(ui.statusMessage.textContent).toBe('Ready to enter');
    });

    it('should keep button disabled when XR chunk is not ready', () => {
      const ui = getLandingUIElements();
      showSupportedState(ui, false);

      expect(ui.enterButton.disabled).toBe(true);
      expect(ui.loadingSpinner.classList.contains('hidden')).toBe(false);
      expect(ui.statusMessage.textContent).toBe('Preparing experience...');
    });
  });

  describe('showUnsupportedState', () => {
    it('should disable button and show error message', () => {
      const ui = getLandingUIElements();
      showUnsupportedState(ui, 'Test unsupported message');

      expect(ui.enterButton.disabled).toBe(true);
      expect(ui.statusMessage.textContent).toBe('Test unsupported message');
      expect(ui.tryEmulatorLink.classList.contains('hidden')).toBe(false);
      expect(ui.tryEmulatorLink.classList.contains('invisible')).toBe(false);
      expect(ui.tryEmulatorLink.classList.contains('pointer-events-none')).toBe(
        false
      );
    });
  });

  describe('updateCapabilityUI', () => {
    it('should show loading state for checking', () => {
      const ui = getLandingUIElements();
      const result: CapabilityResult = { state: 'checking' };
      updateCapabilityUI(ui, result, false);

      expect(ui.enterButton.disabled).toBe(true);
      expect(ui.statusMessage.textContent).toBe('Loading...');
    });

    it('should show supported state when supported', () => {
      const ui = getLandingUIElements();
      const result: CapabilityResult = { state: 'supported' };
      updateCapabilityUI(ui, result, true);

      expect(ui.enterButton.disabled).toBe(false);
      expect(ui.statusMessage.textContent).toBe('Ready to enter');
    });

    it('should show unsupported state when not supported', () => {
      const ui = getLandingUIElements();
      const result: CapabilityResult = { state: 'unsupported', message: 'Not supported' };
      updateCapabilityUI(ui, result, false);

      expect(ui.enterButton.disabled).toBe(true);
      expect(ui.statusMessage.textContent).toBe('Not supported');
      expect(ui.tryEmulatorLink.classList.contains('hidden')).toBe(false);
      expect(ui.tryEmulatorLink.classList.contains('invisible')).toBe(false);
    });
  });
});
