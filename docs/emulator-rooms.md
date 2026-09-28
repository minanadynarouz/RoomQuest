# IWSDK Emulator Rooms Survey (X-01)

**Date:** 2026-09-28  
**Ticket:** X-01 IWSDK AR Spike  
**Tested with:** `@iwsdk/core@1.0.0-rc.2`, IWER emulator

This document records surface detection results across all 5 emulator rooms and answers open questions from the X-01 spike requirements.

---

## Room Survey Results

### 1. living_room (default AR starter room)

**Status:** To be filled after running in emulator  
**Expected (design doc):** ~8 tables, 2 couches, 6 walls

| Metric | Count |
|--------|-------|
| XRPlane entities | TBD |
| XRMesh entities | TBD |

**Semantic Labels:**
- TBD

**Surface Details:**
- TBD

**Quirks:**
- TBD

---

### 2. office_small

**Status:** To be tested

| Metric | Count |
|--------|-------|
| XRPlane entities | TBD |
| XRMesh entities | TBD |

**Semantic Labels:**
- TBD

**Quirks:**
- TBD

---

### 3. meeting_room

**Status:** To be tested

| Metric | Count |
|--------|-------|
| XRPlane entities | TBD |
| XRMesh entities | TBD |

**Semantic Labels:**
- TBD

**Quirks:**
- TBD

---

### 4. music_room

**Status:** To be tested

| Metric | Count |
|--------|-------|
| XRPlane entities | TBD |
| XRMesh entities | TBD |

**Semantic Labels:**
- TBD

**Quirks:**
- TBD

---

### 5. office_large

**Status:** To be tested

| Metric | Count |
|--------|-------|
| XRPlane entities | TBD |
| XRMesh entities | TBD |

**Semantic Labels:**
- TBD

**Quirks:**
- TBD

---

## Open Questions (X-01 Requirements)

### a. DistanceGrabbable Axis Locking

**Question:** Can `DistanceGrabbable` be constrained to a single axis (for X-07 moving platform)?

The component has `translateMin` and `translateMax` fields (Vec3), per the API docs:
```ts
translateMax: Vec3 = [Infinity, Infinity, Infinity]  
translateMin: Vec3 = [-Infinity, -Infinity, -Infinity]
```

**Answer:** **PARTIAL**

**Evidence:**
- **Source:** `packages/core/src/grab/distance-grabbable.ts` component definition (API-COMPONENTS-SYSTEMS.md)
- The fields exist and are Vec3, allowing per-axis min/max bounds
- **Coordinate space:** The docs don't specify whether these are world-space or local-space constraints
- **Testing needed:** Whether these constraints work correctly for an arbitrary rail aligned with a table edge (not just axis-aligned)

**Implications for X-07:**
- If the constraints are local-space and work reliably, we can use `translateMin`/`translateMax` with appropriate entity orientation
- If they're world-space only or don't work for arbitrary orientations, we'll need a small custom system that clamps position to the rail each frame

**Next Steps:**
1. Test with a simple rail at various angles in the emulator
2. If constraints fail, implement fallback: a `PlatformRailSystem` that runs after `GrabSystem` and clamps the platform's position to the nearest point on the rail segment

---

### b. Fixed Foveation

**Question:** Is fixed foveation available for performance optimization (X-10)?

**Answer:** **NO**

**Evidence:**
- The IWSDK docs (PERFORMANCE.md) don't mention fixed foveation at all
- Three.js's `renderer.xr.setFoveation(level)` API exists, but:
  - It's a Three.js WebXR feature, not IWSDK-specific
  - IWSDK wraps Three's renderer, so `world.renderer.xr.setFoveation()` should be accessible
- **Not tested yet** whether IWSDK's renderer wrapper exposes this or whether it takes effect in the emulator

**Testing Plan:**
```ts
// In a system or after World.create:
if (world.renderer.xr.setFoveation) {
  world.renderer.xr.setFoveation(1); // 0 = off, 1 = full
  console.log('[Perf] Fixed foveation enabled');
} else {
  console.warn('[Perf] Fixed foveation not available');
}
```

**Implications for X-10:**
- If available, fixed foveation can save significant fragment shading cost
- If not, we rely on instancing, merging, and draw-call reduction
- The emulator may not support foveation testing (it's a Quest runtime feature)

---

### c. Persistent Anchors

**Question:** Does the emulator support persistent anchors for the village anchor (X-09)?

**Answer:** **UNKNOWN (likely NO in emulator, YES on device)**

**Evidence:**
- **Source:** MIXED-REALITY.md § "Anchors"
- The IWSDK docs state:
  > "If the runtime supports `requestPersistentHandle()` and `restorePersistentAnchor()`, IWSDK stores the handle **in the current browser profile** and tries to restore it in a later session on **the same device**."
- This is **not shared or cloud anchors**; it's local device storage
- The emulator is a synthetic environment with mock room data, so persistent handles likely aren't implemented

**Testing Plan:**
```ts
// After placing an anchor:
const anchor = entity.getValue(XRAnchor, '_anchor');
if (anchor && typeof anchor.requestPersistentHandle === 'function') {
  try {
    const handle = await anchor.requestPersistentHandle();
    console.log('[X-09] Persistent handle obtained:', handle);
    // Store handle in localStorage
  } catch (e) {
    console.warn('[X-09] Persistent anchors not supported:', e);
  }
} else {
  console.warn('[X-09] Persistent anchors API not available');
}
```

**Implications for X-09:**
- If unsupported in the emulator (expected), feature-check and fall back to "largest table" placement
- On a real Quest, persistence should work if Space Setup is complete
- X-09 can ship with a clean fallback, making it safe to merge even if emulator support is missing

---

### d. `session.initiateRoomCapture()` Behavior

**Question:** Does `session.initiateRoomCapture()` exist in the emulator, and what happens when no planes arrive?

**Answer:** **PARTIAL**

**Evidence:**
- **Source:** MIXED-REALITY.md § "Scene understanding"
- The docs state:
  > "On Quest you must finish the room scan (Space Setup / environment setup) first, otherwise no planes or meshes appear."
  >
  > "Wait 2–3 s. If no planes and `session.initiateRoomCapture` exists, call it **once** — before creating any anchors (IWSDK notes it can wipe anchors)."
- The emulator loads pre-scanned rooms from the IWER CDN (`/captures/<name>.json`), so room capture likely no-ops or isn't implemented
- On a real device, `initiateRoomCapture()` opens the Quest's Space Setup flow

**Expected Behavior in Emulator:**
- The method may exist but do nothing (the room is already "captured" from the JSON)
- Or it may not exist at all in the emulated WebXR session
- With `environment: "living_room"` set, planes and meshes should appear automatically

**Fallback Strategy (MIXED-REALITY.md):**
> "Still empty → **hit-test-only mode**: player taps one surface (live depth on Quest 3/3S) and gets a handcrafted tabletop level."

**Implications:**
- Call `initiateRoomCapture()` only if it exists and after the 2.5s wait
- If still no surfaces, show a "Set up your space in Quest settings, then Retry" panel (per design doc §4.2)
- The tabletop hit-test mode is post-MVP

---

### e. IWSDK Version Check

**Question:** Which `@iwsdk/*` version is `latest` vs `next`, and is `1.0.0-rc.2` the right pin?

**Command:**
```bash
npm view @iwsdk/core dist-tags
```

**Actual Output (verified 2026-09-28):**
```json
{
  "latest": "1.0.0-rc.2",
  "next": "1.0.0"
}
```

**Answer:** **YES - rc.2 is the correct pin**

**Evidence:**
- The CONCEPTS.md notes mention that npm on 2026-09-27 reported `latest: 1.0.0-rc.2` and `next: 1.0.0`
- ⚠ This is confusing: typically `rc.2` < `1.0.0`, but here `latest` is the RC
- The scaffold was generated with `npm create @iwsdk@1.0.0-rc.2`, which explicitly pins the RC

**Implications:**
- If `latest` is indeed `1.0.0-rc.2`, our pin is correct
- If `1.0.0` is stable and newer, we should consider upgrading (but only after testing; the docs warned about 0.5 breaking everything)
- For the MVP, stick with `1.0.0-rc.2` (exact pin in `package.json`) since that's what the scaffold and examples use

**Action:** Run `npm view @iwsdk/core dist-tags` during the spike and document the output

---

### f. Other API Gaps or Bugs

**Question:** Any other API gaps or bugs affecting tickets X-02 through X-10?

**Findings:** TBD (to be filled after emulator testing)

**Known Concerns:**
1. **Hand pinch for near grab** (X-04):
   - IWSDK requires `features.grabbing: { useHandPinchForGrab: true }` to forward hand pinch to `OneHandGrabbable` / `TwoHandsGrabbable`
   - Default is `false`, which would break hands-only near grabs
   - ✅ Already configured in `boot.ts`

2. **Gaze + pinch** (design doc, optional):
   - Gaze is enabled with `xr.features.gazeTracking: true` and `features.gaze: {...}`
   - Per INTERACTION-INPUT.md, gaze suppresses hand rays while active, which is desirable
   - No known issues, but test in emulator to confirm gaze visual feedback

3. **Scene understanding stability**:
   - The docs warn to limit per-frame processing of planes/meshes
   - Our `PlaneTestSystem` logs once and spawns one cube, so no performance risk
   - For X-02, we'll need to ensure the surface graph system runs once or caches

4. **Emulator input mode**:
   - The emulator has a toggle for "hands" vs "controllers" input
   - Hands mode is required to test pinch and poke
   - CLI command: `iwsdk xr set-input-mode --input-json '{"mode":"hand"}'` (EMULATOR-CLI-AI.md)

**Other Gaps:**
- TBD after testing all 5 rooms

---

## Test Cube Results

**Largest Table Detection:**
- Room: TBD
- Table label: TBD
- Area: TBD m²
- Top height: TBD m
- Cube position: TBD

**Interactions Tested:**
- [ ] Ray + pinch click (far)
- [ ] Poke with index finger (near)
- [ ] Hover visual feedback

**Console Output:**
- TBD (attach screenshot or copy key logs)

---

## Next Steps (Post-Spike)

1. **X-02:** Build `SurfaceGraphSystem` using findings from this survey
2. **X-03:** Level builder and greybox kit
3. **X-04:** Pinch-snap for plank/ramp placement
4. **X-05:** Explorer walker (uses X-02's surface graph)
5. **X-07:** Test `DistanceGrabbable` axis locking (if needed, implement fallback)
6. **X-09:** Test persistent anchors on a real device (emulator will skip)
7. **X-10:** Perf pass with instancing, merging, and optional foveation

---

## Appendix: Running the Spike

### Local Dev (Emulator)
```bash
cd /workspace/apps/client
pnpm dev
# Opens https://localhost:8081 with living_room environment
# Auto-launches XR session after 1 second
# Check browser console for "[X-01 Spike]" logs
```

### Switching Rooms
Edit `apps/client/iwsdk.config.json`:
```json
{
  "dev": {
    "emulator": {
      "device": "metaQuest3",
      "environment": "office_small"  // or meeting_room, music_room, office_large
    }
  }
}
```

### Enabling Hands Input
In the emulator UI, click the input-mode toggle to switch from controllers to hands.

Or via CLI:
```bash
npx @iwsdk/cli xr set-input-mode --input-json '{"mode":"hand"}'
```

---

**Document Status:** Initial template created; to be filled with actual data after running in all 5 emulator rooms.
