import { describe, it, expect } from 'vitest';
import {
  FallbackReason,
  LevelRequest,
  LevelResponse,
  ResultRequest,
  ResultResponse,
  ResultDeferred,
  RESULT_TIME_MS_MAX,
  ApiError,
  RateLimitError,
} from './api.js';

describe('API schemas', () => {
  describe('LevelRequest', () => {
    const validRequest = {
      graph: {
        version: 1 as const,
        roomHash: 'a1b2c3d4e5f6',
        mode: 'scene' as const,
        floorY: 0,
        nodes: [
          {
            id: 's1',
            label: 'table' as const,
            kind: 'plane' as const,
            topHeight: 0.75,
            centroid: [1.0, 0.75, -0.5] as [number, number, number],
            size: [1.2, 0.8] as [number, number],
            yaw: 0,
            area: 0.96,
            reach: 'hand' as const,
            angleFromForward: 15,
          },
          {
            id: 's2',
            label: 'couch' as const,
            kind: 'mesh' as const,
            topHeight: 0.45,
            centroid: [2.5, 0.45, -1.0] as [number, number, number],
            size: [2.0, 0.9] as [number, number],
            yaw: 1.57,
            area: 1.8,
            reach: 'ray' as const,
            angleFromForward: 45,
          },
        ],
        edges: [
          {
            a: 's1',
            b: 's2',
            gap: 0.5,
            dh: -0.3,
            kind: 'plank' as const,
          },
        ],
      },
      date: '2026-10-14',
      tier: 'easy' as const,
    };

    it('accepts valid level request', () => {
      const result = LevelRequest.parse(validRequest);
      expect(result.date).toBe('2026-10-14');
      expect(result.tier).toBe('easy');
    });

    it('validates date format YYYY-MM-DD', () => {
      expect(() =>
        LevelRequest.parse({ ...validRequest, date: '2026-10-14' }),
      ).not.toThrow();
      expect(() =>
        LevelRequest.parse({ ...validRequest, date: '2026-1-14' }),
      ).toThrow();
      expect(() =>
        LevelRequest.parse({ ...validRequest, date: '10/14/2026' }),
      ).toThrow();
      expect(() =>
        LevelRequest.parse({ ...validRequest, date: 'invalid' }),
      ).toThrow();
    });

    it('accepts optional recentThemes', () => {
      const withThemes = {
        ...validRequest,
        recentThemes: ['forest' as const, 'desert' as const],
      };
      const result = LevelRequest.parse(withThemes);
      expect(result.recentThemes).toHaveLength(2);
    });

    it('validates max 3 recent themes', () => {
      const threeThemes = {
        ...validRequest,
        recentThemes: [
          'forest' as const,
          'desert' as const,
          'snow' as const,
        ],
      };
      expect(() => LevelRequest.parse(threeThemes)).not.toThrow();

      const fourThemes = {
        ...validRequest,
        recentThemes: [
          'forest' as const,
          'desert' as const,
          'snow' as const,
          'sky' as const,
        ],
      };
      expect(() => LevelRequest.parse(fourThemes)).toThrow();
    });
  });

  describe('LevelResponse', () => {
    const validResponse = {
      plan: {
        seed: 'r7f2-2026-10-14',
        theme: 'forest' as const,
        title: 'The Fallen Sun Crystal',
        start: 's1',
        goal: 's4',
        parTimeMs: 240000,
        placements: [
          {
            id: 'p1',
            piece: 'village_hut' as const,
            surface: 's1',
            u: 0.3,
            v: 0.5,
          },
          {
            id: 'p2',
            piece: 'plank_bridge' as const,
            surface: 's1',
            to: 's4',
            u: 1,
            v: 0.5,
            playerBuilt: true,
          },
          {
            id: 'p3',
            piece: 'gate' as const,
            surface: 's4',
            u: 0.2,
            v: 0.5,
          },
          {
            id: 'p4',
            piece: 'crystal_shrine' as const,
            surface: 's4',
            u: 0.8,
            v: 0.5,
          },
        ],
        beats: [
          { goal: 'Bridge the gap to the couch', uses: ['p2'] },
          { goal: 'Open the gate', uses: ['p3'] },
        ],
        dialogue: [
          {
            trigger: 'intro' as const,
            line: 'The sun crystal fell onto the couch!',
          },
        ],
      },
      source: 'llm' as const,
      cacheKey: 'abc123def456',
      model: 'gemini-3.8-flash',
      promptVersion: 'v1',
      latencyMs: 2345,
      repairs: [],
    };

    it('accepts valid level response', () => {
      const result = LevelResponse.parse(validResponse);
      expect(result.source).toBe('llm');
      expect(result.cacheKey).toBe('abc123def456');
    });

    it('accepts optional model field', () => {
      const withoutModel = { ...validResponse, model: undefined };
      const result = LevelResponse.parse(withoutModel);
      expect(result.model).toBeUndefined();
    });

    it('accepts repairs array', () => {
      const withRepairs = {
        ...validResponse,
        repairs: ['Fixed invalid placement p5', 'Clamped u coordinate'],
      };
      const result = LevelResponse.parse(withRepairs);
      expect(result.repairs).toHaveLength(2);
    });

    it('accepts optional fallbackReason llm-quota', () => {
      const withReason = {
        ...validResponse,
        source: 'procedural' as const,
        fallbackReason: 'llm-quota' as const,
      };
      const result = LevelResponse.parse(withReason);
      expect(result.fallbackReason).toBe('llm-quota');
      expect(LevelResponse.parse(validResponse).fallbackReason).toBeUndefined();
      expect(() =>
        LevelResponse.parse({ ...validResponse, fallbackReason: 'timeout' })
      ).toThrow();
    });
  });

  describe('FallbackReason', () => {
    it('accepts llm-quota only', () => {
      expect(FallbackReason.parse('llm-quota')).toBe('llm-quota');
      expect(() => FallbackReason.parse('timeout')).toThrow();
    });
  });

  describe('ResultRequest', () => {
    const validResult = {
      deviceId: '550e8400-e29b-41d4-a716-446655440000',
      stars: 3,
      gems: 4,
      timeMs: 180000,
      completed: true,
      planSource: 'llm' as const,
    };

    it('accepts valid result request', () => {
      const result = ResultRequest.parse(validResult);
      expect(result.stars).toBe(3);
      expect(result.gems).toBe(4);
      expect(result.deviceId).toBe(validResult.deviceId);
    });

    it('requires a UUID v4 deviceId', () => {
      expect(() =>
        ResultRequest.parse({ ...validResult, deviceId: 'not-a-uuid' }),
      ).toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, deviceId: undefined }),
      ).toThrow();
    });

    it('validates stars range (0..3)', () => {
      expect(() =>
        ResultRequest.parse({ ...validResult, stars: 0 }),
      ).not.toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, stars: 3 }),
      ).not.toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, stars: -1 }),
      ).toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, stars: 4 }),
      ).toThrow();
    });

    it('validates gems is a non-negative integer', () => {
      expect(() =>
        ResultRequest.parse({ ...validResult, gems: 0 }),
      ).not.toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, gems: 6 }),
      ).not.toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, gems: -1 }),
      ).toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, gems: 1.5 }),
      ).toThrow();
    });

    it('validates timeMs is a positive integer with a 1 hour max', () => {
      expect(() =>
        ResultRequest.parse({ ...validResult, timeMs: 1 }),
      ).not.toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, timeMs: RESULT_TIME_MS_MAX }),
      ).not.toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, timeMs: 0 }),
      ).toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, timeMs: -1 }),
      ).toThrow();
      expect(() =>
        ResultRequest.parse({ ...validResult, timeMs: 1.5 }),
      ).toThrow();
      expect(() =>
        ResultRequest.parse({
          ...validResult,
          timeMs: RESULT_TIME_MS_MAX + 1,
        }),
      ).toThrow();
    });

    it('accepts every LevelResponse source as planSource', () => {
      for (const planSource of ['cache', 'llm', 'llm_repaired', 'procedural'] as const) {
        expect(() =>
          ResultRequest.parse({ ...validResult, planSource }),
        ).not.toThrow();
      }
    });
  });

  describe('ResultResponse', () => {
    it('accepts a stored id', () => {
      const parsed = ResultResponse.parse({ id: 'clxyz0123456789' });
      expect(parsed.id).toBe('clxyz0123456789');
    });

    it('rejects an empty id', () => {
      expect(() => ResultResponse.parse({ id: '' })).toThrow();
    });
  });

  describe('ResultDeferred', () => {
    it('accepts stored:false', () => {
      expect(ResultDeferred.parse({ stored: false }).stored).toBe(false);
    });

    it('rejects stored:true', () => {
      expect(() => ResultDeferred.parse({ stored: true })).toThrow();
    });
  });

  describe('ApiError', () => {
    it('accepts valid error', () => {
      const error = {
        error: {
          code: 'INVALID_REQUEST' as const,
          message: 'Invalid surface graph',
          issues: [{ path: ['graph'], message: 'Required' }],
        },
      };
      const result = ApiError.parse(error);
      expect(result.error.code).toBe('INVALID_REQUEST');
    });

    it('accepts all error codes', () => {
      const codes = [
        'INVALID_REQUEST',
        'RATE_LIMITED',
        'INTERNAL',
        'UNKNOWN_LEVEL',
      ];
      codes.forEach((code) => {
        expect(() =>
          ApiError.parse({ error: { code, message: 'test' } }),
        ).not.toThrow();
      });
    });

    it('accepts optional issues array', () => {
      const withIssues = {
        error: {
          code: 'INVALID_REQUEST' as const,
          message: 'Validation failed',
          issues: [{ path: ['graph'], message: 'Invalid' }],
        },
      };
      expect(() => ApiError.parse(withIssues)).not.toThrow();

      const withoutIssues = {
        error: {
          code: 'INTERNAL' as const,
          message: 'Server error',
        },
      };
      expect(() => ApiError.parse(withoutIssues)).not.toThrow();
    });
  });

  describe('RateLimitError', () => {
    it('accepts valid rate limit error', () => {
      const error = {
        error: {
          code: 'RATE_LIMITED' as const,
          message: 'Too many requests',
          retryAfterS: 3600,
        },
      };
      const result = RateLimitError.parse(error);
      expect(result.error.retryAfterS).toBe(3600);
    });

    it('validates retryAfterS is non-negative', () => {
      const error = {
        error: {
          code: 'RATE_LIMITED' as const,
          message: 'Too many requests',
          retryAfterS: 0,
        },
      };
      expect(() => RateLimitError.parse(error)).not.toThrow();

      const negative = {
        error: {
          code: 'RATE_LIMITED' as const,
          message: 'Too many requests',
          retryAfterS: -1,
        },
      };
      expect(() => RateLimitError.parse(negative)).toThrow();
    });
  });
});
