import { describe, it, expect } from 'vitest';
import { placeholder } from './index';

describe('fixtures package', () => {
  it('exports placeholder', () => {
    expect(placeholder).toBe('fixtures');
  });
});
