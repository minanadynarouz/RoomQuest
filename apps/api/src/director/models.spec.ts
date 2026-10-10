import { describe, expect, it } from 'vitest';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { defaultDirectorChatFactory } from './models';
import { DEFAULT_DIRECTOR_MODEL } from './director.constants';

describe('defaultDirectorChatFactory', () => {
  it('constructs a Gemini chat model without invoking it', () => {
    const primary = defaultDirectorChatFactory.createPrimary({
      model: DEFAULT_DIRECTOR_MODEL,
      apiKey: 'test-google-key',
    });
    expect(primary).toBeInstanceOf(ChatGoogleGenerativeAI);
  });
});
