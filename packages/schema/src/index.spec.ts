import { describe, it, expect } from 'vitest';
import { placeholder } from './index';

describe('schema package', () => {
  it('exports placeholder', () => {
    expect(placeholder).toBe('schema');
  });
});
