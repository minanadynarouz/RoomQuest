import { describe, it, expect } from 'vitest';
import {
  Placement,
  PlacementLLM,
  Beat,
  Dialogue,
  LevelPlan,
  LevelPlanLLM,
  Tier,
  PlanSource,
} from './level.js';
import type { Theme } from './level.js';
import { toJsonSchema, validateLLMSafeJsonSchema } from './json-schema.js';

describe('Level schemas', () => {
  describe('Placement', () => {
    const validPlacement = {
      id: 'p1',
      piece: 'village_hut' as const,
      surface: 's1',
      u: 0.5,
      v: 0.5,
    };

    it('accepts valid placement', () => {
      const result = Placement.parse(validPlacement);
      expect(result.playerBuilt).toBe(false); // default
      expect(result.links).toEqual([]); // default
    });

    it('validates u and v range (0..1)', () => {
      expect(() => Placement.parse({ ...validPlacement, u: 0 })).not.toThrow();
      expect(() => Placement.parse({ ...validPlacement, u: 1 })).not.toThrow();
      expect(() =>
        Placement.parse({ ...validPlacement, u: -0.1 }),
      ).toThrow();
      expect(() =>
        Placement.parse({ ...validPlacement, u: 1.1 }),
      ).toThrow();
    });

    it('validates max 2 links', () => {
      expect(() =>
        Placement.parse({ ...validPlacement, links: ['p2'] }),
      ).not.toThrow();
      expect(() =>
        Placement.parse({ ...validPlacement, links: ['p2', 'p3'] }),
      ).not.toThrow();
      expect(() =>
        Placement.parse({ ...validPlacement, links: ['p2', 'p3', 'p4'] }),
      ).toThrow();
    });

    it('accepts optional "to" surface', () => {
      const bridge = {
        ...validPlacement,
        piece: 'plank_bridge' as const,
        to: 's2',
      };
      const result = Placement.parse(bridge);
      expect(result.to).toBe('s2');
    });
  });

  describe('Beat', () => {
    it('accepts valid beat', () => {
      const beat = {
        goal: 'Bridge the gap to the couch',
        uses: ['p2'],
      };
      const result = Beat.parse(beat);
      expect(result).toEqual(beat);
    });

    it('validates goal max length (80 chars)', () => {
      const shortGoal = { goal: 'Short goal', uses: [] };
      expect(() => Beat.parse(shortGoal)).not.toThrow();

      const maxGoal = { goal: 'x'.repeat(80), uses: [] };
      expect(() => Beat.parse(maxGoal)).not.toThrow();

      const tooLong = { goal: 'x'.repeat(81), uses: [] };
      expect(() => Beat.parse(tooLong)).toThrow();
    });
  });

  describe('Dialogue', () => {
    it('accepts valid dialogue', () => {
      const dialogue = {
        trigger: 'intro' as const,
        line: 'The sun crystal fell onto the couch!',
      };
      const result = Dialogue.parse(dialogue);
      expect(result).toEqual(dialogue);
    });

    it('validates line max length (90 chars)', () => {
      const maxLine = {
        trigger: 'intro' as const,
        line: 'x'.repeat(90),
      };
      expect(() => Dialogue.parse(maxLine)).not.toThrow();

      const tooLong = {
        trigger: 'intro' as const,
        line: 'x'.repeat(91),
      };
      expect(() => Dialogue.parse(tooLong)).toThrow();
    });

    it('validates trigger types', () => {
      const triggers = ['intro', 'beat', 'stuck', 'win', 'gaze'];
      triggers.forEach((trigger) => {
        expect(() =>
          Dialogue.parse({ trigger, line: 'test' }),
        ).not.toThrow();
      });
      expect(() =>
        Dialogue.parse({ trigger: 'invalid', line: 'test' }),
      ).toThrow();
    });
  });

  describe('LevelPlan', () => {
    const validPlan = {
      seed: 'r7f2-2026-10-14',
      theme: 'forest' as const,
      title: 'The Fallen Sun Crystal',
      start: 's1',
      goal: 's4',
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
          line: 'The sun crystal fell onto the couch. Help me get there!',
        },
      ],
    };

    it('accepts valid level plan', () => {
      const result = LevelPlan.parse(validPlan);
      expect(result.seed).toBe('r7f2-2026-10-14');
      expect(result.placements).toHaveLength(4);
      expect(result.beats).toHaveLength(2);
    });

    it('validates title max length (40 chars)', () => {
      const maxTitle = { ...validPlan, title: 'x'.repeat(40) };
      expect(() => LevelPlan.parse(maxTitle)).not.toThrow();

      const tooLong = { ...validPlan, title: 'x'.repeat(41) };
      expect(() => LevelPlan.parse(tooLong)).toThrow();
    });

    it('validates placements count (4..14)', () => {
      const threePlacements = {
        ...validPlan,
        placements: validPlan.placements.slice(0, 3),
      };
      expect(() => LevelPlan.parse(threePlacements)).toThrow();

      const fourPlacements = { ...validPlan };
      expect(() => LevelPlan.parse(fourPlacements)).not.toThrow();

      const fourteenPlacements = {
        ...validPlan,
        placements: Array(14)
          .fill(null)
          .map((_, i) => ({
            ...validPlan.placements[0],
            id: `p${String(i + 1)}`,
          })),
      };
      expect(() => LevelPlan.parse(fourteenPlacements)).not.toThrow();

      const fifteenPlacements = {
        ...validPlan,
        placements: Array(15)
          .fill(null)
          .map((_, i) => ({
            ...validPlan.placements[0],
            id: `p${String(i + 1)}`,
          })),
      };
      expect(() => LevelPlan.parse(fifteenPlacements)).toThrow();
    });

    it('validates beats count (2..4)', () => {
      const oneBeat = { ...validPlan, beats: [validPlan.beats[0]] };
      expect(() => LevelPlan.parse(oneBeat)).toThrow();

      const twoBeat = { ...validPlan };
      expect(() => LevelPlan.parse(twoBeat)).not.toThrow();

      const fourBeats = {
        ...validPlan,
        beats: [
          ...validPlan.beats,
          { goal: 'Beat 3', uses: [] },
          { goal: 'Beat 4', uses: [] },
        ],
      };
      expect(() => LevelPlan.parse(fourBeats)).not.toThrow();

      const fiveBeats = {
        ...validPlan,
        beats: [
          ...fourBeats.beats,
          { goal: 'Beat 5', uses: [] },
        ],
      };
      expect(() => LevelPlan.parse(fiveBeats)).toThrow();
    });

    it('validates dialogue count (max 12)', () => {
      const maxDialogue = {
        ...validPlan,
        dialogue: Array(12)
          .fill(null)
          .map(() => ({ trigger: 'gaze' as const, line: 'hint' })),
      };
      expect(() => LevelPlan.parse(maxDialogue)).not.toThrow();

      const tooManyDialogue = {
        ...validPlan,
        dialogue: Array(13)
          .fill(null)
          .map(() => ({ trigger: 'gaze' as const, line: 'hint' })),
      };
      expect(() => LevelPlan.parse(tooManyDialogue)).toThrow();
    });

    it('validates theme enum', () => {
      const themes: Theme[] = ['forest', 'desert', 'snow', 'sky'];
      themes.forEach((theme) => {
        expect(() =>
          LevelPlan.parse({ ...validPlan, theme }),
        ).not.toThrow();
      });
      expect(() =>
        LevelPlan.parse({ ...validPlan, theme: 'invalid' }),
      ).toThrow();
    });
  });

  describe('LevelPlanLLM', () => {
    const validPlanLLM = {
      seed: 'r7f2-2026-10-14',
      theme: 'forest' as const,
      title: 'The Fallen Sun Crystal',
      start: 's1',
      goal: 's4',
      placements: [
        {
          id: 'p1',
          piece: 'village_hut' as const,
          surface: 's1',
          to: null,
          u: 0.3,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
        {
          id: 'p2',
          piece: 'plank_bridge' as const,
          surface: 's1',
          to: 's4',
          u: 1,
          v: 0.5,
          playerBuilt: true,
          links: [],
        },
        {
          id: 'p3',
          piece: 'gate' as const,
          surface: 's4',
          to: null,
          u: 0.2,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
        {
          id: 'p4',
          piece: 'crystal_shrine' as const,
          surface: 's4',
          to: null,
          u: 0.8,
          v: 0.5,
          playerBuilt: false,
          links: [],
        },
      ],
      beats: [
        { goal: 'Bridge the gap to the couch', uses: ['p2'] },
        { goal: 'Open the gate', uses: ['p3'] },
      ],
      dialogue: [
        {
          trigger: 'intro' as const,
          line: 'The sun crystal fell onto the couch. Help me get there!',
        },
      ],
    };

    it('accepts valid LLM plan', () => {
      const result = LevelPlanLLM.parse(validPlanLLM);
      expect(result.seed).toBe('r7f2-2026-10-14');
    });

    it('requires all fields (no defaults)', () => {
      const missingPlayerBuilt = {
        ...validPlanLLM,
        placements: [
          {
            id: 'p1',
            piece: 'village_hut' as const,
            surface: 's1',
            to: null,
            u: 0.3,
            v: 0.5,
            // playerBuilt: missing
            links: [],
          },
        ],
      };
      expect(() => PlacementLLM.parse(missingPlayerBuilt.placements[0])).toThrow();
    });

    it('uses null for optional fields instead of undefined', () => {
      const placement = validPlanLLM.placements[0];
      expect(placement).toBeDefined();
      expect(placement?.to).toBe(null);
      if (placement) {
        const result = PlacementLLM.parse(placement);
        expect(result.to).toBe(null);
      }
    });
  });

  describe('LevelPlanLLM JSON schema', () => {
    it('generates valid JSON schema', () => {
      const jsonSchema = toJsonSchema(LevelPlanLLM, {
        name: 'LevelPlanLLM',
      });
      expect(jsonSchema).toBeDefined();
      expect(typeof jsonSchema).toBe('object');
    });

    it('is LLM-safe (no prefixItems, pattern, anyOf, oneOf, default)', () => {
      const jsonSchema = toJsonSchema(LevelPlanLLM);
      const errors = validateLLMSafeJsonSchema(jsonSchema);

      // This is the critical test per B-01 requirements
      expect(errors).toHaveLength(0);
    });
  });

  describe('Enums', () => {
    it('validates Tier', () => {
      expect(Tier.parse('easy')).toBe('easy');
      expect(Tier.parse('normal')).toBe('normal');
      expect(() => Tier.parse('hard')).toThrow();
    });

    it('validates PlanSource', () => {
      expect(PlanSource.parse('cache')).toBe('cache');
      expect(PlanSource.parse('llm')).toBe('llm');
      expect(PlanSource.parse('llm_repaired')).toBe('llm_repaired');
      expect(PlanSource.parse('procedural')).toBe('procedural');
      expect(() => PlanSource.parse('manual')).toThrow();
    });
  });
});
