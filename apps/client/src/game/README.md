# Game Store (F-02) and Director Client (F-03)

Pure TypeScript state management for Roomquest using `@preact/signals-core`, plus the director client that races `POST /api/v1/levels` against a local generator.

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

- `pieceBuilt`, `leverPulled`, `gateOpened`, `slimeStunned`, `gemCollected`: Game actions
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

## Stars Formula (F-07)

Pure `calculateStars({ plan, gemsCollected, elapsedMs, completed })` in `stars.ts`.
No DOM / IWSDK.

Plan fields, when present:

- `parTimeMs` — time bar for 3 stars
- `gemTarget` — optional override (not on `LevelPlan` yet)

Defaults:

- par time: `180_000` ms if `parTimeMs` is missing or not a positive number
- gem target: count of `gem` placements; if that is 0, `3`

Scoring (`0..3`, matching `ResultRequest`):

```ts
0 stars: not completed (quit)
3 stars: completed AND time ≤ par AND gems ≥ gem target
2 stars: completed AND (time ≤ par OR gems ≥ gem target)
1 star:  completed AND neither
```

A gem target of `0` is treated as already satisfied.

## Stuck Player Signal

Read-only selector for future "adapt" agent:

```ts
interface StuckPlayerSignal {
  beatIndex: number;
  timeOnBeatMs: number;
  recentBlocks: { reason; timestamp }[];
}
```

Returns `null` when no beat is active or beat is completed.

## Usage

```ts
import { createGameStore } from './game';

const store = createGameStore({
  clock: customClock, // optional, defaults to performance.now()
  onInvalidTransition: 'warn', // or 'error'
});

// Phase transitions
store.requestLevel();
store.startSurveying();

// Building requires a plan (par time read from plan.parTimeMs)
const plan = getLevelPlan();
store.startBuilding(plan, { source, latencyMs, repairs, cacheKey });

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
console.log(store.planSource, store.directorLatencyMs); // F-03
```

## Director client (F-03)

Races `POST ${VITE_API_BASE_URL}/api/v1/levels` against `generatePlan` from
`@roomquest/level-core`. Headers: `X-Device-Id` (UUID v4) and
`X-Client-Version` (`0.1.0`). The API plan is used only if it arrives in
≤ 8 s, parses as `LevelResponse`, **and** passes `validatePlan` against the
scanned graph. If validation fails, `repairPlan` is tried first; only a
failed repair falls through to the racing `generatePlan`. API failures are
invisible to the player.

```
?director=live|mock|off   live (default) races the API; mock/off skip the network
?seed=                    overrides the local generator seed
?date=YYYY-MM-DD          overrides the daily date sent to the API
```

Daily seed (when `?seed=` is unset) is `roomHash-YYYY-MM-DD` using `?date=`
or the client's local date (FR-6). Tier defaults to `normal` — F-03 has no
`?tier=` flag.

A 200 that is schema-valid but placed on fixture surface ids (`s1`/`s2`/`s4`)
is the B-02 mock until B-05. `validatePlan` reports `UNKNOWN_SURFACE`; the
client tries `repairPlan`, then `generatePlan`. If repair cannot bind the
plan to the graph, `fallbackReason` is `graph-mismatch`, logged at info,
with typed issues on the store — not an error. `?director=off` uses
`generatePlan` only. `?director=mock` skips the network and still returns a
plan bound to the player's graph (`generatePlan`).

`{error:{code,message,issues}}` with `INVALID_REQUEST` or `INTERNAL` also
falls back. The code is stored as `apiErrorCode` for the debug overlay.

## Result posting (F-07)

After a win, and on quit (`completed: false`), the XR session posts
`POST /api/v1/levels/:levelKey/result` with body
`{ deviceId, stars, gems, timeMs, completed, planSource }` and the F-03
headers `X-Device-Id` / `X-Client-Version`. Failures (network, 202
`{stored:false}`, 400, 404, 429) are silent and do not change the HUD.

- Server levels: `levelKey` is the `LevelResponse.cacheKey`.
- Client procedural fallback (including `?director=off`): `levelKey` is
  `proc:<seed>:<tier>` with `planSource: "procedural"`.

Adapters live in `game/results/` until B-09 (`@roomquest/schema`
`procLevelKey` / `ResultRequest`) merges. Posts still fire in director=off.

`createDirectorClient` takes injected `fetch`, `generate`, `validate`,
`repair`, and device id. `createDirectorClientFromEnv` reads flags from a
query string and persists a UUID v4 in injected storage
(`roomquest:deviceId`).

Par time is clamped with `clampParTimeMs` when the store reads it from the
plan.

## Design Decisions

### 1. Par Time from Schema

**Decision**: Par time is read from `plan.parTimeMs` (required field in `LevelPlan` from `@roomquest/schema`).

**Rationale**:

- The B-01 schema package (PR #5) now includes `parTimeMs` as a required field with bounds 60000-480000ms (1-8 minutes)
- Backend's `level-core` clamps par time to these bounds during plan generation
- The store accepts an optional `parTimeMs` override in `startBuilding(plan, { parTimeMs })` for testing, but production code uses `clampParTimeMs(plan.parTimeMs)`

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

### 5. Local generator is `generatePlan` (B-04)

**Decision**: race `generatePlan(graph, seed, tier, { recentThemes? })` with
the API. Same `(graph, seed, tier)` always yields the same plan (~0.5 ms).
When a server plan fails `validatePlan`, try `repairPlan` first
(`source: 'llm_repaired'`, `fallbackReason: 'repaired'`). Only if repair
does not validate do we keep the procedural plan.

### 6. B-02 fixture-id mismatch is expected

**Decision**: a 200 `LevelResponse` whose placements reference fixture surface
ids (not the scanned graph) fails `validatePlan` with `UNKNOWN_SURFACE`.
Repair is tried; if it cannot produce a valid plan, `fallbackReason` is
`graph-mismatch`, logged at info, and never drives the store into `error`.
Typed issues are stored as `validationIssues` for the debug overlay. B-05
will emit graph-relative plans; until then `generatePlan` is the playable
path. `?director=mock` skips the API entirely so emulator sessions do not
depend on that mismatch.

## Purity Enforcement

The `purity.spec.ts` test scans all `game/` files to ensure zero DOM, IWSDK, or Three.js imports. This keeps the game logic:

- Framework-agnostic
- Fast to test
- Safe to refactor
- Easy to reason about
