import { describe, expect, it } from 'vitest';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { defaultDirectorChatFactory } from './models';
import {
  DEFAULT_DIRECTOR_MODEL,
  DEFAULT_FALLBACK_MODEL,
} from './director.constants';

describe('defaultDirectorChatFactory', () => {
  it('constructs Gemini and Anthropic chat models without invoking them', () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
    });
    const fallback = defaultDirectorChatFactory.createFallback({
      model: DEFAULT_FALLBACK_MODEL,
      apiKey: 'test-anthropic-key',
    });
    expect(primary).toBeInstanceOf(ChatGoogleGenerativeAI);
    expect(fallback).toBeInstanceOf(ChatAnthropic);
  });
});
