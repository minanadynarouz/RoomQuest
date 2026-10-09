# Roomquest: Art and Sound Direction

**v0.1 · Fri Oct 9, 2026 · Owner: Mina Narouz** · Inputs: `Roomquest-Design-Doc.md` v0.1, `PRD.md` v1.2, `ARCHITECTURE-AND-PLAN.md` v1.2\
**Scope:** post-MVP priority #1 (polish, Oct 12 – Nov 8, freeze Nov 8). This doc covers the 10 MVP pieces (`PIECE_IDS`), the explorer, VFX, HUD and every sound event. It replaces the greybox look. It does not change gameplay or the schema.

## 1. Art pillars

1. **A toy on your real table.** Everything looks like a painted wooden toy, about the size of a board-game piece, sitting on real furniture. The real room is the backdrop, so we never draw floors, skies or walls.
2. **Pops against any room.** Real rooms are beige, grey, brown and white, and Quest passthrough makes them grainier and less saturated. Our colours are saturated and mid-to-light, with a dark ink outline. If a piece can blend into an oak table, it fails.
3. **Colour tells you the job.** One colour family means "your hands can move this". The explorer, the goal, hazards and rewards each get their own hue, and that mapping never changes between themes.
4. **Cheap enough to hold 72 fps.** Flat matte shading, one light, one palette texture, instancing, and no real transparency. The style is designed around the frame budget.

## 2. Visual style

**Shapes:** chunky low-poly with bevelled edges (one bevel segment, 3–5 mm) and slightly oversized parts (fat handles, big knobs, thick planks). Edges have a little hand-made wobble, so nothing looks like CAD.

**Materials:** one shared `MeshLambertMaterial`, flat-shaded, unlit-ish, sampling one **palette texture** (256×256 swatch atlas in KTX2). Themes swap the palette texture, not the meshes. No PBR, no normal maps, no specular, no environment maps. Lighting is one directional key light from upper-left of the start view, plus hemisphere ambient at ~0.6. A cheap fresnel **rim term** (`onBeforeCompile`, about 0.25 strength, cream tint) separates pieces from busy backgrounds.

**Outline:** an inverted-hull outline **baked into each GLB**: a 2.5–4 mm inflated shell with flipped winding, vertex-coloured ink. It uses the same material, so it costs **zero extra draw calls** and roughly doubles triangles, which the budgets in §8 already include. Thickness grows by about 1.5× on pieces placed more than 1.5 m from the head.

**Transparency:** UI text only. Ghosts and the scan use **dither / screen-door** (`discard`) or additive thin edges, never alpha-blended volumes. Blob shadows are the one allowed blended quad (PRD NFR-1), and they all go in one instanced draw.

### 2.1 Palette (sRGB hex)

| Role                    | Colour    | Hex       | Used on                                          |
| ----------------------- | --------- | --------- | ------------------------------------------------ |
| Ink                     | deep plum | `#2B2140` | outlines, eyes, HUD panels, blob shadows         |
| **Hands can move this** | cobalt    | `#3D7BFF` | plank, ramp, platform deck, lever body, tray     |
| Grab/poke point         | tomato    | `#FF5A4E` | lever knob, platform handle, plank end-pegs      |
| Explorer                | tangerine | `#FF8A1F` | Pip's coat and hat band                          |
| Explorer accent         | teal      | `#14C3B0` | Pip's scarf and backpack                         |
| Small highlight only    | cream     | `#FFF1D6` | face, HUD text, rim tint (never a large surface) |
| Reward                  | gold      | `#FFD23F` | gems, stars                                      |
| Goal                    | magenta   | `#FF3EA5` | crystal shrine crystal                           |
| Link/teleport           | violet    | `#7B4BFF` | portal ring, lever↔gate link glyph              |
| Hazard (friendly)       | lime      | `#9BE15D` | slime                                            |
| Valid / scan            | mint      | `#4DFFB4` | snap ghost, surface scan lines, "open" lamps     |
| Invalid / closed        | coral     | `#FF7A6B` | closed-gate lamp, invalid ghost tint (dimmed)    |

**Theme scenery tints** (hut walls/roof, shrine base, gate frame; one palette texture per theme):

| Theme  | Primary              | Secondary           | Note                                                   |
| ------ | -------------------- | ------------------- | ------------------------------------------------------ |
| forest | leaf `#2FBF71`       | roof red `#E5484D`  |                                                        |
| desert | terracotta `#E2683C` | turquoise `#1FB5C9` | **no sand/beige**, which would camouflage against wood |
| snow   | ice blue `#5AA9FF`   | berry `#D6336C`     | white limited to small roof caps                       |
| sky    | sky `#6EC1FF`        | coral `#FF7A8A`     | clouds are small cream puffs only                      |

**Banned as dominant colours:** beige and tan (`#C8B89A`-ish), mid-greys (`#808080`–`#C0C0C0`), wood browns (`#6B4423`–`#A47148`), off-white. These are the colours of real furniture and walls.

## 3. Scale and readability rules

- **Reference scale:** a real coffee table is about 0.45 m high with a 0.6–1.2 m top. **Pip is 8 cm tall**, about a chess king, and walks at 0.15 m/s. Every piece is sized relative to Pip (§5).
- **Minimum feature size:** Quest 3 is roughly 25 pixels per degree and Quest 3S roughly 20. At 1 m, 1 px ≈ 0.7–0.9 mm. Rules: any detail that must read (eyes, lamps, knobs) is **≥ 5 mm at ≤ 0.7 m** and **≥ 10 mm beyond 1.5 m**. Line work and outlines are **≥ 2.5 mm**. Detail below 3 mm is deleted, not textured in.
- **Interaction targets:** poke and grab colliders are **≥ 4 cm** even when the visual is smaller. Ray targets beyond 1 m are **≥ 6 cm**.
- **Silhouette test:** every piece must be identifiable as a flat ink silhouette at 64 px. Pip must be readable at 3 m (hat brim and backpack).
- **Contrast test:** screenshot each piece on 4 real backgrounds (oak table, grey couch, white wall, dark rug). Cobalt, tangerine and magenta must stay visibly distinct from all four.
- **Grounding:** every piece gets a blob shadow (ink, about 35% opacity, 1.2× footprint). Pieces sit within 2 cm of the surface top (US-2). Floating pieces (gems, portal motes) cast a smaller, softer blob.

## 4. Explorer: "Pip" (working name, PRD open question 6)

- **Silhouette:** bean body with a big round head (head ≈ 45% of height). A **wide-brim explorer hat** and a **round backpack with a lantern** together form a unique T-plus-bump silhouette. Stubby arms and two foot nubs. No mouth geometry: emotion comes from the eyes (two ink ovals plus a cream glint) and body pose.
- **Colours:** tangerine coat and hat band, teal scarf and backpack, cream face, ink eyes and boots, gold lantern glow. Tangerine is used only on Pip, so the eye finds Pip instantly.
- **Rig:** 8 bones (root, body, head, hat, 2 arms, 2 feet), ≤ 4k tris including the hull. Lantern glow is a gold vertex colour, not a light.

| Animation     | Loop        | Description                                                                                    | Event hook                  |
| ------------- | ----------- | ---------------------------------------------------------------------------------------------- | --------------------------- |
| `idle`        | 2.4 s       | breathing bob of 3 mm, blink every 2–5 s, glances at the player's head                         | default                     |
| `look_at_you` | n/a         | head turns to the player and the hat tips while gaze dwell is active                           | gaze hint                   |
| `walk`        | 0.33 s step | waddle with ±6° roll, 4 mm bounce, arms swing; feet planted at 0.15 m/s (no skating)           | walking                     |
| `stuck`       | 2 s         | stops, looks at the blocker, then at the player, taps a foot, shrugs; a "?" puff above the hat | `explorerBlocked`           |
| `point`       | 1 s         | arm points at the blocker or gap (used in teaching)                                            | beat start                  |
| `ride`        | loop        | crouched, arms out for balance                                                                 | riding platform             |
| `teleport`    | 0.5 s       | squash to a disc, then pop out with stretch                                                    | portal                      |
| `cheer`       | 1.2 s       | hop, arms up, hat flips off and lands back                                                     | `beatCompleted`, `won` (×2) |
| `arrive`      | 1.5 s       | door of the hut bursts open and Pip hops out with a dust puff                                  | level start                 |

**Chirp personality:** curious, brave and a little clumsy. Pip "talks" in **2–5 tiny pitched blips** (a sine/triangle blend with a quick formant sweep, around 900–1600 Hz, ±3 semitones random per blip). The blips are always non-verbal, while the speech bubble carries the words. Rising contour means a question or excitement, falling means worried or stuck, and a fast trill means cheer. Pip chirps at most once every 4 s unless something happens.

## 5. Piece-by-piece notes (MVP kit, `PIECE_IDS`)

Tris include the baked outline hull. Draws assume the shared material and palette texture.

| Piece id          | Size (W×D×H)                          | Look                                                                                                                                                              | Readability cue                                                                                           | Tris                  | Draws                   |
| ----------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------- |
| `village_hut`     | 14×12×16 cm                           | round toy cottage, theme-tinted walls, big roof, round door Pip comes out of, chimney puff                                                                        | largest, warmest object on the start table; door faces the player                                         | ≤ 3,000               | 1                       |
| `crystal_shrine`  | 12 cm base, 22 cm total               | stepped plinth with a **magenta faceted crystal** that slowly rotates and bobs                                                                                    | tallest, only magenta object, visible across the room; 3 orbiting gold motes                              | ≤ 2,500               | 1 (+motes in VFX)       |
| `plank_bridge`    | 8 cm wide, 1.5 cm thick, length = gap | cobalt slats (5 cm segments, instanced to span) with tomato end-pegs, as if from a toy kit                                                                        | in the tray, a short 3-slat bundle with a tomato grab peg                                                 | ≤ 150 per segment     | 1 (instanced)           |
| `ramp`            | 10 cm wide, length = run              | cobalt stepped ramp (instanced 4 cm steps) with side rails                                                                                                        | step edges get a light cream rim so the slope reads                                                       | ≤ 200 per step        | 1 (instanced)           |
| `moving_platform` | 14×14×3 cm raft + 1 cm rail ≤ 1 m     | cobalt raft with a tomato handle-post; ink rail with end bumpers                                                                                                  | rail drawn fully, so the travel range is obvious; raft pulses mint at a dock point                        | ≤ 1,500 (raft + rail) | 2                       |
| `gate`            | 12×4×12 cm                            | theme-tinted arch with a door in the theme secondary colour (never cobalt: the gate is not hand-movable); **coral lamp = closed, mint = open**; violet link glyph | glyph matches its lever; door swings 90° on open                                                          | ≤ 1,000               | 1                       |
| `lever`           | 5 cm base, 9 cm handle, 3 cm knob     | cobalt body with a **big tomato knob**; violet glyph plate matches the gate                                                                                       | knob is the poke/ray target (6 cm collider); wiggles on hover                                             | ≤ 600                 | 1                       |
| `gem`             | 2.5 cm                                | gold octahedron gem, spins 90°/s and bobs 1 cm                                                                                                                    | 2 twinkle sprites; 3–5 per level                                                                          | ≤ 120                 | 1 (instanced, all gems) |
| `slime`           | 9×9×6 cm                              | lime jelly dome with big ink eyes and cream glints; wobbles while patrolling                                                                                      | squash-and-stretch in the vertex shader; when stunned, flattens with 3 orbiting stars that count down 4 s | ≤ 1,500               | 1                       |
| `portal` (pair)   | 14 cm ring, upright                   | violet ring on a small plinth; **opaque** dark-violet disc with a scrolling spiral (UV scroll), plus 8 orbiting motes                                             | both ends identical; motes stream toward the active end                                                   | ≤ 1,000 per end       | 2 per end               |

**Lever↔gate link:** each linked pair shares one of 3 glyphs (sun, moon, leaf) on a violet plate. When a lever is pulled, a dotted violet line runs from lever to gate over 0.4 s before the gate opens. This makes "this opens that" visible without text.

## 6. VFX (all instanced, no alpha volumes)

- **Room scan:** a mint ring expands from the player's feet at 1.5 m/s. As it reaches each surface in the graph, that surface's top outline draws as a 3 mm mint line loop, and its top fills briefly with a dithered dot grid (`discard` pattern). The fill fades over 0.6 s and the outline stays at 30% until the level is built. A surface rejected by the graph never lights up, which is honest.
- **Snap ghost:** when a held piece is within 10 cm of a valid `playerBuilt` target, a **mint dithered copy** appears at the target and pulses at 1.5 Hz. Within 4 cm the held piece is magnetised toward it. On release, the piece lerps in over 80 ms with a 6% overshoot squash, followed by a 6-particle cobalt "sawdust" puff. Release away from a target returns the piece to its tray slot along a 300 ms arc.
- **Gem:** 2 billboard 4-point stars per gem twinkle out of phase. On collect, the gem hops 3 cm, shrinks, and 5 gold sparks fly to the tray's gem counter.
- **Portal:** spiral UV scroll plus 8 motes. On use, Pip squashes into the disc, a violet flash ring appears at both ends (one 120 ms scale pulse), and Pip pops out.
- **Slime stun:** a squash, then 3 gold stars orbit. One star disappears per 1.33 s, so the 4 s stun counts down visibly.
- **Lever / gate:** dotted violet link line, then the lamp flips coral→mint, then the door swings.
- **Win confetti:** 40 instanced quads in palette colours, 1.5 s, one draw.
- **Particle cap:** ≤ 6 particle systems alive, ≤ 200 quads total, 1 draw each.

## 7. UI / HUD style

- **World-space only.** No head-locked panels except the edge-of-view arrow, which lazily follows the head with about 0.3 s of lag.
- **Look:** ink `#2B2140` opaque rounded panels, cream text, cobalt or gold buttons with an ink outline. These read on any wall. One rounded sans font, licensed (for example an SIL OFL face), listed in `LICENSES.md`.
- **Placement (FoV-aware):** essential UI sits within **±30° horizontal** and **0–35° below** the seated forward view, at **0.45–0.6 m**. The win panel is ≤ 15° from centre. Nothing important goes above eye line.
- **Elements:** (1) the **tray**: a cobalt toy tray 0.5 m out and ~30° down, holding the player-built pieces, the gem counter and a poke **pause** button; (2) a **speech bubble** above Pip, ≤ 2 lines and ≤ 90 chars, auto-hidden after 4 s; (3) a **beat chip** on the tray edge with an icon plus ≤ 6 words; (4) the **edge arrow**: a tangerine chevron with Pip's face at 25° from centre; (5) **pause / win / no-surfaces** panels.
- **Text rules:** ≤ 2 short lines on screen at once. Cap height ≥ 0.9° (about 1.1 cm at 0.7 m), to be confirmed on device. Icons come before words.

## 8. Performance guardrails

Plan limits (PRD NFR-1, plan §7): **< 100 draw calls, < 200k triangles, 72 fps target / 60 floor**, 1 directional + ambient light, no real-time shadows, no transparency except UI. A 14-piece level uses **< 60 draw calls** (X-03). The plan sets totals only, so the per-piece numbers below are this doc's split of those totals.

| Bucket                                     | Triangles                                 | Draw calls |
| ------------------------------------------ | ----------------------------------------- | ---------- |
| Kit, worst-case 14 placements (§5 budgets) | ≤ 25k                                     | ≤ 25       |
| Pip (skinned, 8 bones)                     | ≤ 4k                                      | 1          |
| VFX + blob shadows (instanced)             | ≤ 2k                                      | ≤ 7        |
| HUD (UIKit panels, text)                   | ≤ 10k                                     | ≤ 20       |
| **Total budget for our content**           | **≤ 41k** (headroom for occlusion meshes) | **≤ 53**   |

- **Assets:** GLB per piece, quantised and meshopt-compressed (gltf-transform or gltfpack). One 256×256 **KTX2** palette per theme (UASTC for crisp swatches), with mipmaps. Total art download < 1.5 MB.
- **Instancing:** plank segments, ramp steps, gems, motes, confetti, stars and blob shadows. Static pieces in the level share a material and are merged per type when there is no instancing.
- **Runtime:** no per-frame allocations; animations are transform-based or vertex-shader based (slime squash, gem bob); one skinned mesh total. Use fixed foveation if IWSDK exposes it (X-01 finding).
- **Gate:** every art PR attaches `?debug=1` numbers (fps, draws, tris) from `living_room` and one other emulator room.

## 9. Sound direction

**Agreed character:** warm, small wooden toy-box sounds. Short, dry (no reverb tails) and **quiet under passthrough**: the real room is the soundstage. **No music bed during play.** There is exactly one bright chime sting, on the win.

**Mix rules:** mono 48 kHz files, Ogg (Vorbis q4), < 1 MB total. Peaks ≤ −12 dBFS for most SFX and −6 dBFS for the win sting. **Random pitch ±2 semitones and gain ±1.5 dB** on every repeatable sound. Max 8 voices with oldest-first stealing, and per-key cooldowns. In-world sources use a WebAudio `PannerNode` (HRTF, refDistance 0.3 m, rolloff 1, maxDistance 4 m). UI sounds are non-spatial or sit at the tray. Audio unlocks on the "Enter your room" gesture (F-08).

**Keys** are proposed `dot.case` names for the FE sound manifest. Map them 1:1 onto the existing procedural placeholders, and rename here if the FE keys already differ. Every shipped file gets a `LICENSES.md` line with its URL.

| Key                          | Description                                                                       | Length    | Peak | Spatial       | Suggested source                                                    |
| ---------------------------- | --------------------------------------------------------------------------------- | --------- | ---- | ------------- | ------------------------------------------------------------------- |
| `ui.enter`                   | toy-box lid lifts: soft wood creak + clack                                        | 0.6 s     | −14  | no            | Kenney RPG Audio (`creak`, `bookPlace`)                             |
| `ui.poke`                    | tiny dry wood tick on any button                                                  | 60 ms     | −18  | tray          | Kenney Interface Sounds (`tick`, `click`)                           |
| `ui.pause` / `ui.resume`     | two muted wood notes, down / up                                                   | 0.25 s    | −18  | no            | Kenney UI Audio (`switch`)                                          |
| `ui.exit`                    | lid closes: soft clack                                                            | 0.3 s     | −16  | no            | Kenney RPG Audio (`bookClose`)                                      |
| `scan.spark_poke`            | glassy kalimba pluck that starts the scan                                         | 0.3 s     | −14  | yes           | Kenney Interface Sounds (`pluck`, `glass`) or freesound CC0 kalimba |
| `scan.sweep`                 | very soft airy shimmer under the expanding ring                                   | 1.2 s     | −26  | no            | procedural (filtered noise)                                         |
| `scan.surface`               | kalimba plink per lit surface; **pitch rises with surface height** (pentatonic)   | 0.15 s    | −18  | yes (surface) | freesound CC0 kalimba/marimba single notes, or procedural           |
| `scan.done`                  | 3-note rising kalimba arpeggio                                                    | 0.6 s     | −14  | no            | same note set as above                                              |
| `scan.none`                  | low muted thud + Pip's worried chirp                                              | 0.4 s     | −16  | no            | Kenney Impact Sounds (`impactSoft_medium`)                          |
| `build.piece_pop`            | wooden toy pop as each piece appears, staggered 60 ms                             | 0.12 s    | −18  | yes           | Kenney Impact Sounds (`impactWood_light`)                           |
| `build.hut_land`             | bigger wooden clunk + tiny dust puff                                              | 0.25 s    | −14  | yes           | Kenney Impact Sounds (`impactWood_medium`)                          |
| `build.route_draw`           | soft pencil-scratch ticks as the route line draws                                 | 0.8 s     | −24  | yes           | Kenney Interface Sounds (`scratch`)                                 |
| `pip.hello`                  | 3 rising blips, curious                                                           | 0.35 s    | −14  | yes           | procedural (own synth)                                              |
| `pip.happy`                  | 2–3 bouncy blips                                                                  | 0.3 s     | −14  | yes           | procedural                                                          |
| `pip.question`               | 2 blips, last one up ("hm?"), used when stuck                                     | 0.3 s     | −14  | yes           | procedural                                                          |
| `pip.worried`                | 3 falling blips                                                                   | 0.35 s    | −16  | yes           | procedural                                                          |
| `pip.callout`                | 2 bright blips when out of view; **positioned at Pip** so you hear where he is    | 0.25 s    | −12  | yes           | procedural                                                          |
| `pip.cheer`                  | fast 5-blip trill                                                                 | 0.5 s     | −12  | yes           | procedural                                                          |
| `pip.step`                   | barely-there wood tick per footstep, max 3/s                                      | 30 ms     | −32  | yes           | Kenney Impact Sounds (`footstep_wood`, gain cut)                    |
| `pip.hop` / `pip.land`       | soft cloth flick / small tap                                                      | 0.1 s     | −22  | yes           | Kenney RPG Audio (`cloth`) / `impactSoft_medium`                    |
| `piece.hover`                | faint tick when a hand or ray first targets a piece                               | 30 ms     | −28  | yes           | Kenney Interface Sounds (`tick`)                                    |
| `piece.grab`                 | wooden "tok" lift                                                                 | 80 ms     | −16  | yes (hand)    | Kenney Impact Sounds (`impactPlank_medium`, short)                  |
| `piece.ghost`                | very soft high tick when the snap ghost appears                                   | 40 ms     | −24  | yes           | Kenney Interface Sounds (`tick`)                                    |
| `piece.snap`                 | **soft wood click**: 2 layers (click + small low knock)                           | 0.12 s    | −12  | yes           | Kenney Impact Sounds (`impactWood_light`) + Interface `click`       |
| `piece.return`               | small double wood tap as it flies back to the tray                                | 0.2 s     | −18  | yes           | Kenney Interface Sounds (`drop`)                                    |
| `piece.invalid`              | **low muted thud** (never a buzzer)                                               | 0.15 s    | −16  | yes           | Kenney Impact Sounds (`impactSoft_heavy`)                           |
| `lever.pull`                 | wooden ratchet, 3 clicks                                                          | 0.25 s    | −14  | yes           | Kenney UI Audio (`switch`) ×3                                       |
| `link.line`                  | soft rising pluck as the violet link line runs                                    | 0.4 s     | −20  | yes           | Kenney Interface Sounds (`pluck`)                                   |
| `gate.open`                  | short wooden creak + clunk                                                        | 0.4 s     | −14  | yes           | Kenney RPG Audio (`doorOpen`, trimmed)                              |
| `platform.grab`              | wooden "tok"                                                                      | 80 ms     | −16  | yes           | as `piece.grab`                                                     |
| `platform.slide`             | loop: small wooden wheels rolling, pitch and gain follow speed, silent when still | loop      | −24  | yes           | procedural (filtered noise + clicks)                                |
| `platform.dock`              | click when aligned (3 cm)                                                         | 0.1 s     | −14  | yes           | Kenney Interface Sounds (`toggle`)                                  |
| `slime.blub`                 | occasional soft squelch every 4–7 s while patrolling                              | 0.2 s     | −28  | yes           | procedural (pitched bubble)                                         |
| `slime.stun`                 | squishy "boing" + 3 star tinks                                                    | 0.3 s     | −14  | yes           | procedural boing + Kenney Interface `glass`                         |
| `slime.wake`                 | small pop as the stun ends                                                        | 0.12 s    | −20  | yes           | procedural                                                          |
| `gem.collect`                | **rising kalimba note**; each gem steps up the scale (C D E G A)                  | 0.3 s     | −12  | yes           | freesound CC0 kalimba notes, or procedural                          |
| `portal.enter`               | soft upward "fwip"                                                                | 0.3 s     | −16  | yes           | procedural (sine sweep)                                             |
| `portal.exit`                | soft pop                                                                          | 0.15 s    | −18  | yes           | procedural                                                          |
| `hint.show`                  | single soft kalimba note when a hint bubble appears                               | 0.12 s    | −22  | yes (Pip)     | as `scan.surface`                                                   |
| `beat.complete`              | short rising marimba 2-note                                                       | 0.4 s     | −12  | no            | freesound CC0 marimba notes, or procedural                          |
| `hands.lost` / `hands.found` | two-note soft wood down / up                                                      | 0.25 s    | −20  | no            | Kenney UI Audio (`switch`)                                          |
| `win.sting`                  | **the one bright chime sting**: kalimba/steel-pan flourish                        | 1.5–2.5 s | −6   | no            | Kenney Music Jingles (`Steel`, `Pizzicato` sets)                    |
| `win.star`                   | ascending chime tick per star (1–3)                                               | 0.2 s     | −12  | no            | Kenney Interface Sounds (`glass`)                                   |
| `win.confetti`               | soft paper pop                                                                    | 0.3 s     | −18  | no            | procedural                                                          |

**Source licences (verified Oct 9, 2026):** the Kenney asset pages for **Impact Sounds, Interface Sounds, UI Audio, RPG Audio and Music Jingles** all state "Creative Commons CC0", and the Music Jingles zip's `License.txt` says "Creative Commons Zero, CC0". The file families named above (`impactWood_*`, `impactSoft_*`, `impactPlank_medium`, `footstep_wood`, `tick`, `click`, `pluck`, `glass`, `drop`, `toggle`, `scratch`, `switch`, `creak`, `doorOpen`, `cloth`, `bookPlace`/`bookClose`, and the `Steel`/`Pizzicato` jingles) were confirmed inside the downloaded packs. **freesound.org mixes licences**, so use only files whose page shows **CC0** (search filter "Creative Commons 0"), and record each URL. No specific freesound file was verified for this doc. Procedural sounds are our own code and need no licence; Pip's chirps should stay procedural.

## 10. Do / Don't

| Do                                                                  | Don't                                                      |
| ------------------------------------------------------------------- | ---------------------------------------------------------- |
| Saturated cobalt / tangerine / magenta / gold on ink outlines       | Beige, tan, grey or wood-brown as a main colour            |
| Keep the role-to-colour mapping identical in all 4 themes           | Recolour interactive pieces per theme                      |
| Size details ≥ 5 mm at reach and ≥ 10 mm far away; colliders ≥ 4 cm | Fine textures, text on pieces, sub-3 mm detail             |
| Bake the outline hull into the GLB (0 extra draws)                  | Post-process outlines, bloom or SSAO                       |
| Dither or additive edges for ghosts and scans                       | Alpha-blended glass, smoke or volumes                      |
| One light, Lambert, palette KTX2, instancing                        | PBR, normal maps, real-time shadows, extra lights          |
| Keep UI world-space, low (0–35° down), ≤ 2 lines, icons first       | Head-locked HUDs, text walls, UI above eye line            |
| Short dry SFX with pitch variation; quiet overall                   | Music bed, reverb tails, buzzers, loud loops               |
| Pip speaks in blips and the bubble carries the words                | Voiced or TTS dialogue, gibberish speech longer than 0.5 s |
| Stun the slime (squish, stars) for the 10+ rating                   | Hurt, kill or splatter anything                            |
| Use only CC0 or licensed assets, each listed in `LICENSES.md`       | Logos, brand-like shapes, AI-generated video in materials  |
