# Third-Party Licenses

This project uses the following third-party assets and libraries:

## Software Libraries

### Meta Immersive Web SDK
- License: MIT
- Copyright: Meta Platforms, Inc. and affiliates
- Source: https://github.com/meta-quest/immersive-web-sdk

### Three.js (via super-three)
- License: MIT
- Copyright: three.js authors
- Source: https://threejs.org/

### Tailwind CSS
- License: MIT
- Copyright: Tailwind Labs, Inc.
- Source: https://tailwindcss.com/

## Audio Assets

F-08 gameplay SFX are **procedural WebAudio placeholders** (filtered noise,
decaying sines/triangles, low-passed sine, formant blips). Direction: warm
wooden toy-box, short, dry, quiet under passthrough. No music bed during play.

They are defined only in `apps/client/src/audio/manifest.ts`. To swap in a
CC0 file later, set that row's `file` to a name under `public/audio/` and
list the file here.

`audio/chime.mp3` is the IWSDK sample-robot one-shot from the starter scene
(`scenes/main.iwsdk.scene.json`), not an F-08 gameplay SFX.

---

Last updated: October 9, 2026
