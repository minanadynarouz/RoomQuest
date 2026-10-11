import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DIRECTOR_THINKING,
  DEFAULT_DIRECTOR_THINKING_ID,
  isUnsupportedThinkingLevelError,
  rememberUnsupportedThinkingLevel,
  resetUnsupportedThinkingLevels,
  resolveDirectorThinkingId,
  thinkingConfigFor,
  thinkingConfigForId,
} from './thinking';

describe('director thinking', () => {
  afterEach(() => {
    resetUnsupportedThinkingLevels();
  });

  it('defaults DIRECTOR_THINKING to low', () => {
    expect(DEFAULT_DIRECTOR_THINKING_ID).toBe('low');
    expect(DEFAULT_DIRECTOR_THINKING).toEqual({ thinkingLevel: 'LOW' });
    expect(resolveDirectorThinkingId(undefined)).toBe('low');
    expect(resolveDirectorThinkingId('')).toBe('low');
    expect(resolveDirectorThinkingId('  ')).toBe('low');
  });

  it('accepts minimal, low, and default', () => {
    expect(resolveDirectorThinkingId('minimal')).toBe('minimal');
    expect(resolveDirectorThinkingId('LOW')).toBe('low');
    expect(resolveDirectorThinkingId('default')).toBe('default');
  });

  it('rejects unknown ids', () => {
    expect(() => resolveDirectorThinkingId('budget0')).toThrow(
      /minimal, low, or default/
    );
  });

  it('maps ids to Gemini thinkingConfig (MINIMAL even though 2.3.2 types omit it)', () => {
    expect(thinkingConfigForId('minimal')).toEqual({
      thinkingLevel: 'MINIMAL',
    });
    expect(thinkingConfigForId('low')).toEqual({ thinkingLevel: 'LOW' });
    expect(thinkingConfigForId('default')).toBeUndefined();
    expect(thinkingConfigFor(undefined)).toBeUndefined();
    expect(thinkingConfigFor({ thinkingLevel: 'MINIMAL' })).toEqual({
      thinkingLevel: 'MINIMAL',
    });
  });

  it('omits a thinking level after Gemini rejects it', () => {
    rememberUnsupportedThinkingLevel('LOW');
    expect(thinkingConfigForId('low')).toBeUndefined();
    expect(thinkingConfigFor({ thinkingLevel: 'LOW' })).toBeUndefined();
    expect(thinkingConfigForId('minimal')).toEqual({
      thinkingLevel: 'MINIMAL',
    });
  });

  it('detects Gemini 400 thinking-level errors', () => {
    const err = Object.assign(
      new Error('[400 Bad Request] Thinking level MINIMAL is not supported'),
      { status: 400 }
    );
    expect(isUnsupportedThinkingLevelError(err)).toBe(true);
    expect(isUnsupportedThinkingLevelError(new Error('quota'))).toBe(false);
  });
});
