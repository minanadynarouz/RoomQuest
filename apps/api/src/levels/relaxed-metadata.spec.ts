import { describe, expect, it } from 'vitest';
import {
  cacheMetadataFromRelaxed,
  parseRelaxedRules,
  relaxedFromCacheMetadata,
} from './relaxed-metadata';

describe('relaxed metadata', () => {
  it('parses and orders waiver ids', () => {
    expect(parseRelaxedRules(['portalFov', 'minPath', 'hutTable', 'minPath'])).toEqual(
      ['minPath', 'hutTable', 'portalFov']
    );
    expect(parseRelaxedRules(['nope', 1, null])).toEqual([]);
    expect(parseRelaxedRules(undefined)).toEqual([]);
  });

  it('reads relaxed out of LevelCache metadata', () => {
    expect(relaxedFromCacheMetadata({ relaxed: ['hutTable'] })).toEqual([
      'hutTable',
    ]);
    expect(relaxedFromCacheMetadata({})).toEqual([]);
    expect(relaxedFromCacheMetadata(null)).toEqual([]);
    expect(cacheMetadataFromRelaxed(['portalFov', 'minPath'])).toEqual({
      relaxed: ['minPath', 'portalFov'],
    });
  });
});
