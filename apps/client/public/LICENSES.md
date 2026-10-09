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

F-08 gameplay SFX are **placeholders**. Final art and sound direction will
come from the design lead. Swap a clip by replacing the file named in
`apps/client/src/audio/manifest.ts` (or by changing only that manifest).

Current placeholders are **CC0 1.0** from Kenney's
[Interface Sounds](https://kenney.nl/assets/interface-sounds) pack
(also mirrored on [OpenGameArt](https://opengameart.org/content/interface-sounds)).
Licence: https://creativecommons.org/publicdomain/zero/1.0/

Credit "Kenney.nl" is requested but not required.

| File | Original pack file | Used for | Source |
| --- | --- | --- | --- |
| `audio/grab.ogg` | `Audio/click_003.ogg` | pinch / grab | https://kenney.nl/assets/interface-sounds |
| `audio/snap.ogg` | `Audio/drop_003.ogg` | snap (`pieceBuilt`) | https://kenney.nl/assets/interface-sounds |
| `audio/lever.ogg` | `Audio/switch_001.ogg` | lever (`leverPulled`) | https://kenney.nl/assets/interface-sounds |
| `audio/gate.ogg` | `Audio/open_002.ogg` | gate (`gateOpened`) | https://kenney.nl/assets/interface-sounds |
| `audio/stun.ogg` | `Audio/glitch_001.ogg` | stun (`slimeStunned`) | https://kenney.nl/assets/interface-sounds |
| `audio/gem.ogg` | `Audio/glass_001.ogg` | gem (`gemCollected`) | https://kenney.nl/assets/interface-sounds |
| `audio/win.ogg` | `Audio/confirmation_002.ogg` | win | https://kenney.nl/assets/interface-sounds |
| `audio/chirp.ogg` | `Audio/pluck_001.ogg` | explorer chirp (`explorerOutOfView`) | https://kenney.nl/assets/interface-sounds |
| `audio/blocked.ogg` | `Audio/error_001.ogg` | explorer blocked | https://kenney.nl/assets/interface-sounds |
| `audio/beat.ogg` | `Audio/tick_002.ogg` | beat completed | https://kenney.nl/assets/interface-sounds |

Pack download used to verify the files:
https://opengameart.org/sites/default/files/kenney_interfaceSounds.zip

`audio/chime.mp3` is the IWSDK sample-robot one-shot from the starter scene
(`scenes/main.iwsdk.scene.json`), not an F-08 gameplay SFX.

---

Last updated: October 9, 2026
