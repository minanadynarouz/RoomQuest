import { describe, it, expect } from 'vitest';
import { placeholder } from './index';

describe('level-core package', () => {
  it('exports placeholder', () => {
    expect(placeholder).toBe('level-core');
  });
});
