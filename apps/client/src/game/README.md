# Game Store (F-02)

Pure TypeScript state management for Roomquest using `@preact/signals-core`.

## Architecture

The game store is completely isolated from DOM, IWSDK, and Three.js dependencies. This makes it:
- **Testable**: Pure functions with injected clock for deterministic tests
- **Type-safe**: Explicit state machine with typed transitions
- **Observable**: Reactive signals for UI binding

## State Machine

```
landing → requesting → surveying → building → playing ⇄ paused → won | noSurfaces | error
                                     ↓          ↓                   ↓
                                    exit ←────────────────────────┘
```

### Phase Transitions

- `landing`: Initial state
- `requesting → surveying`: Level request sent
- `surveying → building`: Valid surfaces found  
- `building → playing`: Level built, timer starts
- `playing ⇄ paused`: Pause/resume
- `playing → won`: Goal reached
- `*→ error`: Error state (recoverable)
- `won/paused → building`: Replay (same plan)
- `won/paused/playing → landing`: Exit

Invalid transitions are rejected with a dev warning by default, or throw `TransitionError` in error mode.

## Timer

The timer uses an injected `Clock` interface for deterministic testing:

```ts
interface Clock {
  now(): number;
}
```

- Starts when entering `playing`
- Freezes on pause
- Resumes from paused elapsed time
- Stops on win
- Resets on replay/exit

## Events

All events carry:
- `timestamp`: Clock time when emitted
- `beatIndex`: Current beat index
- Type-specific data

Event types:
- `pieceBuilt`, `gateOpened`, `slimeStunned`, `gemCollected`: Game actions
- `explorerBlocked`: Blocked with reason (`unbuiltGap`, `closedGate`, `awakeSlime`)
- `explorerOutOfView`: Explorer outside player FoV
- `beatCompleted`: Beat finished with duration
- `won`: Level completed

## Beat Tracking

Beats track progression through the level:
- Start when entering `playing` (beat 0)
- Advance via `advanceBeat()`
- Each beat records start time and duration
- `beatCompleted` event emitted on advance

Time-per-beat data enables future "adapt" agent to detect stuck players.

## Stars Formula

```ts
3 stars: time ≤ par AND gems ≥ 3
2 stars: time ≤ par OR gems ≥ 3  
1 star:  otherwise
```

## Stuck Player Signal

Read-only selector for future "adapt" agent:

```ts
interface StuckPlayerSignal {
  beatIndex: number;
  timeOnBeatMs: number;
  recentBlocks: { reason, timestamp }[];
}
```

Returns `null` when no beat is active or beat is completed.

## Usage

```ts
import { createGameStore, defaultParTimeMs } from './game';

const store = createGameStore({
  clock: customClock, // optional, defaults to performance.now()
  onInvalidTransition: 'warn', // or 'error'
});

// Phase transitions
store.requestLevel();
store.startSurveying();

// Building requires a plan and par time
const plan = getLevelPlan();
const parTime = defaultParTimeMs(plan); // 180000ms for now
store.startBuilding(plan, { parTimeMs: parTime });

store.startPlaying();
store.pause();
store.resume();
store.win();
store.replay(); // Same plan and par time
store.exit(); // Return to landing

// Event emission
store.pieceBuilt('p1');
store.gemCollected('gem2');
store.explorerBlocked('unbuiltGap');

// Beat management
store.advanceBeat();

// Read state
console.log(store.phase); // Current phase
console.log(store.elapsedMs); // Timer value
console.log(store.result); // Stars, gems, time
console.log(store.stuckPlayerSignal); // For adapt agent
```

## Design Decisions

### 1. Par Time as Input Parameter

**Decision**: Par time is passed to `startBuilding()` as an optional parameter rather than being part of the `LevelPlan` schema.

**Rationale**: 
- The schema package (`@roomquest/schema`) is owned by backend ticket B-01 (PR #5) which is already under review
- Par time should be deterministic based on level structure, not LLM-chosen
- A `defaultParTimeMs()` helper provides a 180000ms (3 minute) constant as a placeholder until backend's `level-core` implements the deterministic calculation

### 2. Timer Implementation

The timer is a getter (`store.elapsedMs`) that calculates on access rather than a cached computed signal. This avoids reactivity issues with non-reactive clock sources in tests while still being efficient in production (frame-rate UI reads).

### 3. Exit Transitions

The spec said "Exit returns to landing" but didn't specify from which states. I allowed exit from:
- `playing`: Direct exit during gameplay
- `paused`: Exit from pause menu
- `won`: Exit from win screen
- `building`: Exit before starting (for consistency)

### 4. Event Typing

`beatCompleted` includes its own `beatIndex` and `timestamp` since it refers to the completed beat, not the current one. Other events use the current beat index.

## Purity Enforcement

The `purity.spec.ts` test scans all `game/` files to ensure zero DOM, IWSDK, or Three.js imports. This keeps the game logic:
- Framework-agnostic
- Fast to test
- Safe to refactor
- Easy to reason about
