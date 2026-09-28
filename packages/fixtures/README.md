# @roomquest/fixtures

Surface graphs and level plans for testing and development.

## Structure

### `graphs/` - Surface Graphs

Surface graphs extracted from real environments and synthetic test data.

#### Synthetic Test Graph

- **`synthetic-living-room.ts`** - Hand-written test fixture with 5 surfaces (coffee table, couch, TV stand, side table, floor)

#### IWER Emulator Rooms

The following surface graphs will be exported from the 5 IWER emulator environments once the X-01 survey is complete. Each represents a real scanned environment with validated plane/mesh data:

- [ ] **`living_room.ts`** - Default AR starter environment (expected: ~8 tables, 2 couches, 6 walls)
- [ ] **`office_small.ts`** - Small office environment
- [ ] **`meeting_room.ts`** - Conference/meeting space
- [ ] **`music_room.ts`** - Music/entertainment room
- [ ] **`office_large.ts`** - Large office environment

**Status:** These fixtures will be added once:
1. The X-01 emulator survey documents surface counts and characteristics for each room in `docs/emulator-rooms.md`
2. The SurfaceGraphSystem is tested in each environment with `?exportGraph=1`
3. Each exported graph is validated against the schema and committed here

### `plans/` - Level Plans

Pre-generated and validated level plans for testing the director and level builder.

- **`synthetic-living-room-plan.ts`** - Hand-written level plan for the synthetic room

**Future:** LLM-generated plans for each of the 5 emulator rooms will be added here once B-05 (LangChain director) is complete.

## Usage

```typescript
import { SYNTHETIC_LIVING_ROOM } from '@roomquest/fixtures';
import { SurfaceGraph } from '@roomquest/schema';

// Validate a graph
const result = SurfaceGraph.safeParse(SYNTHETIC_LIVING_ROOM);

// Use in tests
test('my feature', () => {
  const level = buildLevel(SYNTHETIC_LIVING_ROOM);
  expect(level).toBeDefined();
});
```

## Exporting Graphs from the Emulator

To export a surface graph from any IWER emulator environment:

1. Set the environment in `iwsdk.config.json`:
   ```json
   {
     "dev": {
       "emulator": {
         "device": "metaQuest3",
         "environment": "living_room"
       }
     }
   }
   ```

2. Run the app with the export flag:
   ```
   npm run dev
   # Open https://localhost:8081/?exportGraph=1
   ```

3. Wait for the SurfaceGraphSystem to stabilize (~2.5s)

4. The graph downloads as `surface-graph-{roomHash}.json`

5. Convert to TypeScript and add to this package:
   ```typescript
   import type { SurfaceGraph } from '@roomquest/schema';
   
   export const LIVING_ROOM: SurfaceGraph = {
     // paste the exported JSON here
   };
   ```

6. Update `src/index.ts` to export the new fixture

7. Run tests to validate: `pnpm test`

## Design

All fixtures:
- Must validate against `@roomquest/schema`
- Should be ≤ 12 nodes, ≤ 66 edges
- Should serialize to ≤ 2 KB
- Include descriptive comments about the environment layout

See `ARCHITECTURE-AND-PLAN.md` §5 and the Design Doc §5 for the surface pipeline specification.
