/**
 * Game store tests - F-02
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createGameStore, TransitionError } from './store.js';
import type { Clock } from './types.js';
import type { LevelPlan } from '@roomquest/schema';

describe('createGameStore', () => {
  // Mock clock for deterministic tests
  let mockTime: number;
  let mockClock: Clock;

  beforeEach(() => {
    mockTime = 0;
    mockClock = {
      now: () => mockTime,
    };
  });

  const createMockPlan = (overrides?: Partial<LevelPlan>): LevelPlan => ({
    seed: 'test-seed',
    theme: 'forest',
    title: 'Test Level',
    start: 's1',
    goal: 's2',
    placements: [
      {
        id: 'p1',
        piece: 'village_hut',
        surface: 's1',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p2',
        piece: 'crystal_shrine',
        surface: 's2',
        u: 0.5,
        v: 0.5,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p3',
        piece: 'gem',
        surface: 's1',
        u: 0.3,
        v: 0.3,
        playerBuilt: false,
        links: [],
      },
      {
        id: 'p4',
        piece: 'gem',
        surface: 's2',
        u: 0.7,
        v: 0.7,
        playerBuilt: false,
        links: [],
      },
    ],
    beats: [
      { goal: 'Reach the shrine', uses: ['p1', 'p2'] },
      { goal: 'Collect gems', uses: ['p3', 'p4'] },
    ],
    dialogue: [{ trigger: 'intro', line: 'Welcome!' }],
    ...overrides,
  });

  describe('initial state', () => {
    it('starts in landing phase', () => {
      const store = createGameStore({ clock: mockClock });
      expect(store.phase).toBe('landing');
    });

    it('has null plan initially', () => {
      const store = createGameStore({ clock: mockClock });
      expect(store.plan).toBeNull();
    });

    it('has empty events initially', () => {
      const store = createGameStore({ clock: mockClock });
      expect(store.events).toEqual([]);
    });

    it('has zero elapsed time initially', () => {
      const store = createGameStore({ clock: mockClock });
      expect(store.elapsedMs).toBe(0);
    });
  });

  describe('phase transitions', () => {
    it('allows landing → requesting', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      expect(store.phase).toBe('requesting');
    });

    it('allows requesting → surveying', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      expect(store.phase).toBe('surveying');
    });

    it('allows surveying → building', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      const plan = createMockPlan();
      store.startBuilding(plan, { parTimeMs: 180000 });
      expect(store.phase).toBe('building');
      expect(store.plan).toEqual(plan);
    });

    it('allows building → playing', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      expect(store.phase).toBe('playing');
    });

    it('allows playing → paused', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      store.pause();
      expect(store.phase).toBe('paused');
    });

    it('allows paused → playing (resume)', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      store.pause();
      store.resume();
      expect(store.phase).toBe('playing');
    });

    it('allows playing → won', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      store.win();
      expect(store.phase).toBe('won');
    });

    it('allows won → building (replay)', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      const plan = createMockPlan();
      store.startBuilding(plan);
      store.startPlaying();
      store.win();
      store.replay();
      expect(store.phase).toBe('building');
      expect(store.plan).toEqual(plan);
    });

    it('allows won → landing (exit)', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      store.win();
      store.exit();
      expect(store.phase).toBe('landing');
      expect(store.plan).toBeNull();
    });

    it('allows paused → building (restart)', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      const plan = createMockPlan();
      store.startBuilding(plan);
      store.startPlaying();
      store.pause();
      store.replay();
      expect(store.phase).toBe('building');
    });

    it('allows requesting → noSurfaces', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.noSurfaces();
      expect(store.phase).toBe('noSurfaces');
    });

    it('allows surveying → noSurfaces', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.noSurfaces();
      expect(store.phase).toBe('noSurfaces');
    });

    it('allows any phase → error', () => {
      const phases = ['landing', 'requesting', 'surveying', 'building', 'playing'] as const;
      
      phases.forEach((startPhase) => {
        const store = createGameStore({ clock: mockClock });
        
        // Navigate to the target phase
        if (startPhase !== 'landing') store.requestLevel();
        if (startPhase === 'surveying' || startPhase === 'building' || startPhase === 'playing') {
          store.startSurveying();
        }
        if (startPhase === 'building' || startPhase === 'playing') {
          store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
        }
        if (startPhase === 'playing') {
          store.startPlaying();
        }
        
        store.error('Test error');
        expect(store.phase).toBe('error');
        expect(store.state.error).toBe('Test error');
      });
    });
  });

  describe('invalid transitions', () => {
    describe('with warn mode (default)', () => {
      it('logs warning and does not transition on invalid transition', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {
          /* intentionally empty for test */
        });
        const store = createGameStore({ clock: mockClock });

        // Try to go from landing directly to playing
        store.startPlaying();
        
        expect(store.phase).toBe('landing');
        expect(consoleWarn).toHaveBeenCalledWith(
          expect.stringContaining('Invalid transition from landing to playing')
        );

        consoleWarn.mockRestore();
      });

      it('prevents building → surveying', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {
          /* intentionally empty for test */
        });
        const store = createGameStore({ clock: mockClock });
        
        store.requestLevel();
        store.startSurveying();
        store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
        store.startSurveying();
        
        expect(store.phase).toBe('building');
        expect(consoleWarn).toHaveBeenCalled();
        
        consoleWarn.mockRestore();
      });

      it('prevents won → requesting', () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {
          /* intentionally empty for test */
        });
        const store = createGameStore({ clock: mockClock });
        
        store.requestLevel();
        store.startSurveying();
        store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
        store.startPlaying();
        store.win();
        store.requestLevel();
        
        expect(store.phase).toBe('won');
        expect(consoleWarn).toHaveBeenCalled();
        
        consoleWarn.mockRestore();
      });
    });

    describe('with error mode', () => {
      it('throws TransitionError on invalid transition', () => {
        const store = createGameStore({ 
          clock: mockClock,
          onInvalidTransition: 'error'
        });

        expect(() => {
          store.startPlaying();
        }).toThrow(TransitionError);

        expect(store.phase).toBe('landing');
      });

      it('includes from and to phases in error', () => {
        const store = createGameStore({ 
          clock: mockClock,
          onInvalidTransition: 'error'
        });

        try {
          store.startPlaying();
        } catch (error) {
          expect(error).toBeInstanceOf(TransitionError);
          const transitionError = error as TransitionError;
          expect(transitionError.from).toBe('landing');
          expect(transitionError.to).toBe('playing');
        }
      });
    });
  });

  describe('timer behavior', () => {
    it('starts timer when entering playing phase', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 2000;
      expect(store.elapsedMs).toBe(1000);
    });

    it('accumulates time correctly', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      // Access elapsedMs to trigger recomputation
      let elapsed = store.elapsedMs;
      expect(elapsed).toBe(2000);
      
      mockTime = 5000;
      // Access again to get updated value
      elapsed = store.elapsedMs;
      expect(elapsed).toBe(4000);
    });

    it('freezes timer when paused', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      expect(store.elapsedMs).toBe(2000);
      
      store.pause();
      
      mockTime = 5000;
      expect(store.elapsedMs).toBe(2000); // Still 2000, not 4000
    });

    it('continues timer correctly after resume', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      store.pause();
      
      mockTime = 5000;
      expect(store.elapsedMs).toBe(2000);
      
      store.resume();
      
      mockTime = 7000;
      expect(store.elapsedMs).toBe(4000); // 2000 before pause + 2000 after resume
    });

    it('handles multiple pause/resume cycles', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 2000; // +1000
      store.pause();
      
      mockTime = 5000; // paused, no change
      store.resume();
      
      mockTime = 7000; // +2000
      store.pause();
      
      mockTime = 10000; // paused, no change
      store.resume();
      
      mockTime = 11000; // +1000
      
      expect(store.elapsedMs).toBe(4000); // 1000 + 2000 + 1000
    });

    it('stops timer on win', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      store.win();
      
      const timeAtWin = store.elapsedMs;
      
      mockTime = 5000;
      expect(store.elapsedMs).toBe(timeAtWin);
    });

    it('resets timer on replay', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      store.win();
      
      store.replay();
      expect(store.elapsedMs).toBe(0);
    });

    it('resets timer on exit', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      
      store.exit();
      expect(store.elapsedMs).toBe(0);
    });
  });

  describe('event emission', () => {
    it('emits pieceBuilt event with timestamp and beat index', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 2000;
      store.pieceBuilt('p1');
      
      expect(store.events).toHaveLength(1);
      expect(store.events[0]).toEqual({
        type: 'pieceBuilt',
        placementId: 'p1',
        timestamp: 2000,
        beatIndex: 0,
      });
    });

    it('emits gateOpened event', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      mockTime = 2000;
      store.gateOpened('gate1');
      
      expect(store.events).toHaveLength(1);
      expect(store.events[0]?.type).toBe('gateOpened');
    });

    it('emits slimeStunned event', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      store.slimeStunned('slime1');
      
      expect(store.events[0]?.type).toBe('slimeStunned');
    });

    it('emits gemCollected event and updates counter', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      expect(store.state.gemsCollected).toBe(0);
      
      store.gemCollected('gem1');
      expect(store.state.gemsCollected).toBe(1);
      
      store.gemCollected('gem2');
      expect(store.state.gemsCollected).toBe(2);
      
      store.gemCollected('gem3');
      expect(store.state.gemsCollected).toBe(3);
      
      expect(store.events.filter(e => e.type === 'gemCollected')).toHaveLength(3);
    });

    it('emits explorerBlocked event with reason', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      store.explorerBlocked('unbuiltGap');
      
      expect(store.events[0]).toMatchObject({
        type: 'explorerBlocked',
        reason: 'unbuiltGap',
      });
    });

    it('emits explorerOutOfView event', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      store.explorerOutOfView();
      
      expect(store.events[0]?.type).toBe('explorerOutOfView');
    });

    it('emits won event on win', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      mockTime = 5000;
      store.win();
      
      const wonEvent = store.events.find(e => e.type === 'won');
      expect(wonEvent).toBeDefined();
      expect(wonEvent?.timestamp).toBe(5000);
    });

    it('clears events on replay', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      store.pieceBuilt('p1');
      store.gemCollected('gem1');
      
      expect(store.events.length).toBeGreaterThan(0);
      
      store.win();
      store.replay();
      
      expect(store.events).toEqual([]);
      expect(store.state.gemsCollected).toBe(0);
    });
  });

  describe('beat tracking', () => {
    it('starts beat 0 when entering playing phase', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      expect(store.state.currentBeatIndex).toBe(0);
      expect(store.state.beatTimings).toHaveLength(1);
      expect(store.state.beatTimings[0]).toEqual({
        beatIndex: 0,
        startTime: 1000,
        durationMs: null,
      });
    });

    it('advances to next beat', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      store.advanceBeat();
      
      expect(store.state.currentBeatIndex).toBe(1);
      expect(store.state.beatTimings).toHaveLength(2);
      
      // First beat should be completed
      expect(store.state.beatTimings[0]?.durationMs).toBe(2000);
      
      // Second beat should be started
      expect(store.state.beatTimings[1]).toEqual({
        beatIndex: 1,
        startTime: 3000,
        durationMs: null,
      });
    });

    it('emits beatCompleted event when advancing', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      store.advanceBeat();
      
      const beatEvent = store.events.find(e => e.type === 'beatCompleted');
      expect(beatEvent).toBeDefined();
      expect(beatEvent).toMatchObject({
        type: 'beatCompleted',
        beatIndex: 0,
        durationMs: 2000,
        timestamp: 3000,
      });
    });

    it('tracks time per beat correctly', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 4000; // Beat 0: 3000ms
      store.advanceBeat();
      
      // Plan has 2 beats, so beat 1 is the last one
      // We can't advance beyond it
      mockTime = 9000;
      
      expect(store.state.beatTimings[0]?.durationMs).toBe(3000);
      expect(store.state.beatTimings[1]?.durationMs).toBeNull(); // Still in progress
    });

    it('does not advance beyond available beats', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {
        /* intentionally empty for test */
      });
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 }); // Has 2 beats
      
      store.startPlaying(); // Beat 0
      store.advanceBeat(); // Beat 1
      store.advanceBeat(); // No beat 2
      
      expect(store.state.currentBeatIndex).toBe(1);
      expect(consoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('No more beats to advance to')
      );
      
      consoleWarn.mockRestore();
    });
  });

  describe('stuck player signal', () => {
    it('returns null when no beat is active', () => {
      const store = createGameStore({ clock: mockClock });
      expect(store.stuckPlayerSignal).toBeNull();
    });

    it('returns signal with time on current beat', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 5000;
      const signal = store.stuckPlayerSignal;
      
      expect(signal).toEqual({
        beatIndex: 0,
        timeOnBeatMs: 4000,
        recentBlocks: [],
      });
    });

    it('includes recent blocked events for current beat', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 2000;
      store.explorerBlocked('unbuiltGap');
      
      mockTime = 3000;
      store.explorerBlocked('closedGate');
      
      mockTime = 4000;
      const signal = store.stuckPlayerSignal;
      
      expect(signal?.recentBlocks).toHaveLength(2);
      expect(signal?.recentBlocks[0]).toEqual({
        reason: 'unbuiltGap',
        timestamp: 2000,
      });
      expect(signal?.recentBlocks[1]).toEqual({
        reason: 'closedGate',
        timestamp: 3000,
      });
    });

    it('filters blocks from previous beats', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 2000;
      store.explorerBlocked('unbuiltGap');
      
      mockTime = 3000;
      store.advanceBeat(); // Move to beat 1
      
      mockTime = 4000;
      store.explorerBlocked('closedGate');
      
      const signal = store.stuckPlayerSignal;
      
      // Only the closedGate from beat 1 should be included
      expect(signal?.recentBlocks).toHaveLength(1);
      expect(signal?.recentBlocks[0]?.reason).toBe('closedGate');
    });

    it('returns null for completed beats', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 3000;
      store.advanceBeat();
      
      // Now check beat 0's signal (which is completed)
      const beat0Timing = store.state.beatTimings[0];
      expect(beat0Timing?.durationMs).not.toBeNull();
      
      // The signal is for the current beat (1), not completed beat 0
      expect(store.stuckPlayerSignal?.beatIndex).toBe(1);
    });
  });

  describe('result calculation', () => {
    it('returns null when no plan is loaded', () => {
      const store = createGameStore({ clock: mockClock });
      expect(store.result).toBeNull();
    });

    it('calculates 3 stars with good time and gems', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      store.gemCollected('gem1');
      store.gemCollected('gem2');
      store.gemCollected('gem3');
      
      mockTime = 1000 + 150000; // Under par
      store.win();
      
      expect(store.result).toMatchObject({
        stars: 3,
        gems: 3,
        timeMs: 150000,
        completed: true,
      });
    });

    it('calculates 2 stars with good time but few gems', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      store.gemCollected('gem1');
      
      mockTime = 1000 + 150000;
      store.win();
      
      expect(store.result?.stars).toBe(2);
    });

    it('calculates 2 stars with many gems but slow time', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      store.gemCollected('gem1');
      store.gemCollected('gem2');
      store.gemCollected('gem3');
      store.gemCollected('gem4');
      
      mockTime = 1000 + 200000; // Over par
      store.win();
      
      expect(store.result?.stars).toBe(2);
    });

    it('calculates 1 star with slow time and few gems', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      mockTime = 1000 + 200000;
      store.win();
      
      expect(store.result?.stars).toBe(1);
    });

    it('marks as completed only when won', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      expect(store.result?.completed).toBe(false);
      
      store.win();
      
      expect(store.result?.completed).toBe(true);
    });
  });

  describe('replay functionality', () => {
    it('keeps the same plan on replay', () => {
      const store = createGameStore({ clock: mockClock });
      const plan = createMockPlan();
      
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(plan);
      store.startPlaying();
      store.win();
      
      store.replay();
      
      expect(store.plan).toEqual(plan);
      expect(store.phase).toBe('building');
    });

    it('resets all counters on replay', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      
      mockTime = 1000;
      store.startPlaying();
      
      store.gemCollected('gem1');
      store.gemCollected('gem2');
      store.pieceBuilt('p1');
      
      mockTime = 5000;
      store.win();
      
      store.replay();
      
      expect(store.state.gemsCollected).toBe(0);
      expect(store.events).toEqual([]);
      expect(store.elapsedMs).toBe(0);
      expect(store.state.beatTimings).toEqual([]);
      expect(store.state.currentBeatIndex).toBe(0);
    });
  });

  describe('exit functionality', () => {
    it('returns to landing and clears all state', () => {
      const store = createGameStore({ clock: mockClock });
      store.requestLevel();
      store.startSurveying();
      store.startBuilding(createMockPlan(), { parTimeMs: 180000 });
      store.startPlaying();
      
      store.gemCollected('gem1');
      store.pieceBuilt('p1');
      
      store.exit();
      
      expect(store.phase).toBe('landing');
      expect(store.plan).toBeNull();
      expect(store.events).toEqual([]);
      expect(store.state.gemsCollected).toBe(0);
      expect(store.elapsedMs).toBe(0);
      expect(store.state.error).toBeNull();
    });
  });
});
