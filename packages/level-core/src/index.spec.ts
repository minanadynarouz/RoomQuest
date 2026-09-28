import { describe, it, expect } from 'vitest';
import { buildSurfaceGraph } from './surface-pipeline';

describe('level-core', () => {
  it('exports buildSurfaceGraph', () => {
    expect(buildSurfaceGraph).toBeDefined();
  });
});
