# Landing Page Implementation (F-01)

This implements ticket F-01 from the Roomquest development plan.

## Implementation Summary

### Features Implemented
- ✅ Landing page with Tailwind CSS 3
- ✅ Title and pitch ("Your room, a new quest every day")
- ✅ "Enter your room" button with loading state
- ✅ WebXR capability check (`navigator.xr?.isSessionSupported('immersive-ar')`)
- ✅ Friendly unsupported message with "Try in emulator" link
- ✅ Emulator mode support (`?emulator=1`) - waits for polyfill before checking capability
- ✅ XR chunk prefetching after first paint
- ✅ Button stays disabled until XR chunk is loaded (preserves user activation)
- ✅ Health check pre-warming (`/api/health` - fire and forget)
- ✅ 3-line how-to-play instructions
- ✅ Credits and licenses section
- ✅ Minimal XR boot stub for 3D team integration

### Bundle Size (Target: <50KB gzipped, excluding XR chunk)
- **Landing JS**: 2.11 KB gzipped ✅ (well under 50 KB target)
- **Landing CSS**: 2.76 KB gzipped
- **Total landing**: ~5 KB gzipped (excluding XR chunk)
- **XR chunk**: 1,680 KB gzipped (separately loaded)

The landing page successfully separates the lightweight UI from the heavy XR code.

### Test Coverage
- ✅ 17 tests passing
- ✅ Unit tests for capability check logic (supported/unsupported/error states)
- ✅ Unit tests for UI state management
- ✅ Tests cover the emulator polyfill waiting behavior
- ✅ All lint and typecheck passing

### Technical Decisions
1. **Tailwind CSS 3 instead of 4**: Tailwind 4 has compatibility issues with Vite 7. Used stable Tailwind 3 for reliability.
2. **Separate landing and XR chunks**: The XR code is dynamically imported only after the button is clicked, keeping the initial bundle tiny.
3. **Loading state on button**: The button stays disabled until the XR chunk prefetches, ensuring the session request happens within the user gesture timeframe.
4. **Emulator polyfill wait**: When `?emulator=1` is present, the capability check waits for the IWER polyfill to load before testing support.

### File Structure
```
apps/client/
├── index.html                    # Landing page HTML
├── src/
│   ├── index.ts                  # Main entry point
│   ├── landing/
│   │   ├── index.ts              # Landing page controller
│   │   ├── capability-check.ts   # WebXR capability detection
│   │   ├── ui.ts                 # UI state management
│   │   ├── styles.css            # Tailwind + custom styles
│   │   ├── *.spec.ts             # Unit tests
│   └── xr/
│       └── boot.ts               # XR boot stub (for 3D team)
├── tailwind.config.ts
├── postcss.config.mjs
└── public/
    └── LICENSES.md               # Third-party licenses
```

### Next Steps for 3D Team
The XR boot stub at `src/xr/boot.ts` provides a minimal interface:
- `launchXR()` function that the landing page calls
- Currently creates a World and calls `world.launchXR()`
- 3D team should extend this to add systems and game logic

### Outstanding Items (Not in F-01 Scope)
- Lighthouse mobile performance test (requires deployment to HTTPS)
- Actual IWER emulator testing (requires dev environment running)
- Real device testing on Quest 3/3S

### Notes
- No sign-in anywhere (per competition rules)
- All copy is short and in English (per competition rules)
- No brand logos or ads (per competition rules)
- Desktop Chrome shows the "Try in emulator" link when unsupported
