import { AIMessage } from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';
import { jsonFromRaw, stripCodeFences, textFromRaw } from './structured-chat';

describe('jsonFromRaw', () => {
  it('parses a ```json fenced reply', () => {
    const fenced = ['```json', '{"th":"forest","pl":[]}', '```'].join('\n');
    expect(jsonFromRaw(new AIMessage(fenced))).toEqual({
      th: 'forest',
      pl: [],
    });
  });

  it('parses a bare ``` fence', () => {
    const fenced = ['```', '{"th":"desert"}', '```'].join('\n');
    expect(jsonFromRaw({ content: fenced })).toEqual({ th: 'desert' });
  });

  it('still parses unfenced JSON', () => {
    expect(jsonFromRaw('{"th":"snow"}')).toEqual({ th: 'snow' });
  });
});

describe('textFromRaw', () => {
  it('reads AIMessage content strings', () => {
    expect(textFromRaw(new AIMessage('{"th":"sky"}'))).toBe('{"th":"sky"}');
    expect(textFromRaw({ content: '{"nope":true}' })).toBe('{"nope":true}');
  });
});

describe('stripCodeFences', () => {
  it('returns the inner body of a json fence', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
