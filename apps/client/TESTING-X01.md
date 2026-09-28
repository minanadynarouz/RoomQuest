# X-01 Testing Guide

Quick reference for testing the AR spike in all 5 emulator rooms.

## Quick Start

```bash
cd /workspace/apps/client
pnpm dev
# Opens https://localhost:8081 with living_room environment
# XR session auto-launches after 1 second
# Check browser console for "[X-01 Spike]" logs
```

## Switching Rooms

Edit `iwsdk.config.json` → `dev.emulator.environment`:

```json
{
  "dev": {
    "emulator": {
      "device": "metaQuest3",
      "environment": "living_room"  // ← Change this
    }
  }
}
```

**Available rooms:**
1. `living_room` (default)
2. `office_small`
3. `meeting_room`
4. `music_room`
5. `office_large`

## What to Record

For each room, note:

### From Console Logs
1. **XRPlane entities:** count
2. **XRMesh entities:** count
3. **Label Summary:** semantic label counts (e.g., `table: 3, couch: 1, wall: 6`)
4. **Largest Table:** label, area (m²), top height (m)
5. **Cube Position:** [x, y, z] coordinates

### Manual Testing
- [ ] Cube is visible on a surface
- [ ] Ray + pinch works (point at cube, pinch to click)
- [ ] Poke works (touch cube with index finger)
- [ ] Hover feedback (emissive glow on hover)
- [ ] Click feedback (cube flashes green)

### Screenshots
1. Console output showing surface counts
2. View of cube placed on table
3. (Optional) GIF of ray + pinch or poke interaction

## Emulator Controls

### Input Mode
Toggle between **hands** and **controllers** in the emulator UI.  
For X-01, use **hands** mode.

### Movement
- **Click Play** to lock pointer
- **WASD** - move (left stick equivalent)
- **Arrow keys** - turn/strafe (right stick equivalent)
- **LeftShift + WASD** - move headset
- **Left mouse** - trigger (ray + pinch)
- **Right mouse** - squeeze (near grab)
- **Q/E** - left/right trigger/squeeze

## Expected Results (Design Doc)

**living_room:** ~8 tables, 2 couches, 6 walls

Other rooms: TBD (no expectations given)

## Troubleshooting

### No surfaces detected
- Wait 3-5 seconds after launch
- Check console for errors
- Verify emulator environment is set correctly

### Cube not visible
- Check console for "Largest table found" message
- Cube might be behind you (turn around)
- Try a different room

### Interactions not working
- Ensure emulator is in **hands** mode (not controllers)
- Check console for "Cube clicked!" / "Cube pointer enter" messages
- Ray requires trigger (left mouse / left controller trigger)
- Poke requires index finger contact

## Updating docs/emulator-rooms.md

After testing each room, fill in the template sections:

1. Replace "TBD" with actual counts
2. Add semantic label list
3. Note any quirks (missing expected surfaces, mislabeled objects, etc.)
4. For questions a-f, add evidence from testing

## Open Questions to Investigate

### a. DistanceGrabbable axis locking
Not testable in this spike (no DistanceGrabbable entity yet).  
Note: Fields `translateMin/Max` exist, coordinate space unclear.

### b. Fixed foveation
Try adding to `PlaneTestSystem.init()`:
```ts
if ((this.world.renderer as any).xr?.setFoveation) {
  (this.world.renderer as any).xr.setFoveation(1);
  console.log('[X-01] Fixed foveation enabled');
} else {
  console.warn('[X-01] Fixed foveation not available');
}
```

### c. Persistent anchors
Not easily testable in emulator. Mark as "emulator: NO, device: TBD".

### d. session.initiateRoomCapture()
Check console for "initiateRoomCapture" logs if no surfaces appear after 3s.

### e. Version check
Run in a separate terminal:
```bash
npm view @iwsdk/core dist-tags
```

### f. Other gaps
Note any errors, warnings, or unexpected behavior in console.

## Commit Messages (Examples)

After filling docs:
```bash
git add docs/emulator-rooms.md
git commit -m "docs(x-01): add living_room surface survey results"
```

After testing all rooms:
```bash
git add docs/emulator-rooms.md
git commit -m "docs(x-01): complete emulator room survey for all 5 rooms"
```

After adding screenshots:
```bash
git add docs/x-01-screenshots/
git commit -m "docs(x-01): add emulator screenshots and interaction GIF"
```
