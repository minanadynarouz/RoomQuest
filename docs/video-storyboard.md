# Roomquest: Competition Video Storyboard

**v1.0 · Fri Oct 9, 2026 · Owner: Mina Narouz** · Expands the 9-shot teaser in `docs/first-five-minutes.md`. Sound keys come from `docs/art-and-sound-direction.md` §9. Facts and claims come from `PRD.md` and `Roomquest-Design-Doc.md`.\
**Target 2:40** (hard ceiling 2:55; the rule is under 3:00) · 1920×1080 · English · public on YouTube (Vimeo as backup) · capture Nov, edit lock Nov 13, upload by Sun Nov 15.

**Sources:** **A** = real Quest passthrough captured in 2–3 real rooms (borrowed headset, ~Nov). **B** = IWSDK emulator (IWER) in desktop Chrome, using the preset rooms `living_room`, `meeting_room`, `music_room`, `office_large` and `office_small`. **C** = phone on a tripod filming Mina from the side (≤ 6 s total, supporting footage only). **Every A shot has a B stand-in** (shown in brackets), so a complete rough cut can be built from emulator footage before the headset arrives. A small tag sits in the bottom-left of every shot ("Quest 3 · passthrough" / "IWSDK emulator · office_small") to keep the footage honest.

**Criteria:** **Inn** = Innovation · **XD** = Experience Design · **Tech** = Technical · **Pol** = Polish & Presentation. **Special awards:** **AG** = Best Agentic Interaction · **CB** = Reason to Come Back · **5M** = First Five Minutes.

## 1. Shot table

| # | Timecode | Len | Visual | Src | On-screen text | VO (see §2) | Sound keys | Hits |
|---|---|---|---|---|---|---|---|---|
| 1 | 0:00–0:08 | 8 s | **Cold open, first person, living room.** A gold spark bobs in front. My hand pokes it, a mint ring sweeps the real floor, and the table, couch and shelf light up one at a time. | A (B: `living_room`) | — | *(none: let the plinks play)* | `scan.spark_poke`, `scan.sweep`, `scan.surface` ×N, `scan.done` | Inn, XD, 5M |
| 2 | 0:08–0:16 | 8 s | The gold route line draws across my table and couch, pieces pop in, and the hut lands with a dust puff. | A (B) | **ROOMQUEST** / "Your room. A new quest every day." | V1 | `build.route_draw`, `build.piece_pop`, `build.hut_land` | Inn, Pol |
| 3 | 0:16–0:24 | 8 s | Pip hops out (`arrive`), tips his hat to the lens, and his bubble names my couch. He points at the gap and shrugs. | A (B) | *(in-game bubble only)* | V2 | `pip.hello`, `pip.step`, `pip.question` | XD, Pol, 5M |
| 4 | 0:24–0:40 | 16 s | **Close-up of the hand:** a palm-down pinch on the plank, carry, the mint ghost pulses, then the snap and a sawdust puff. Pip crosses and grabs a gem. Hold 2 s on the snap. | A (B) | "Pinch · carry · snap" | V3 | `piece.grab`, `piece.ghost`, `piece.snap`, `pip.cheer`, `gem.collect` | Tech, Pol, 5M |
| 5 | 0:40–0:46 | 6 s | Side wide shot of Mina seated on the couch with both hands free. The controllers are visibly set down on the table. | C | "Seated · hands only · no controllers" | V4 | game SFX continue under it | XD |
| 6 | 0:46–1:00 | 14 s | A lever on a far shelf: open-palm ray, then pinch and pull. A violet dotted line runs to the gate, the lamp turns from coral to mint and the door swings open. Start with the gate in frame, then turn the head to the lever (≤ 50°). | A (B) | "Far away? Point and pinch." | V5 | `piece.hover`, `lever.pull`, `link.line`, `gate.open` | Tech, XD (FoV) |
| 7 | 1:00–1:08 | 8 s | A poke on the slime: it flattens, 3 stars count down, Pip sneaks past. *(If the plan has no slime, use the platform drag instead: `platform.grab/slide/dock`.)* | A (B) | — | V6 | `slime.blub`, `slime.stun`, `slime.wake` | Tech, Pol |
| 8 | 1:08–1:18 | 10 s | **Map reveal:** a toy model of my room floats above the tray, and each block pulses as the matching real surface re-lights. | A (B) | *(in-game caption "Drawn from your room · <date>")* | V7 | `scan.surface` (replay), `pip.happy` | Inn, AG |
| 9 | 1:18–1:38 | 20 s | **"Same game, different rooms" montage.** First, 3 hard cuts of about 2.5 s each through real rooms 1–3, each showing a different route and theme. Then a 2×2 split of 4 emulator rooms, each building a different level. End on a 4-way freeze. | A + B | "Same day. Same game. Different rooms." + room tags | V8 | each clip's `scan.done` / `build.hut_land`, cut on the beat | Inn, XD, Tech (untested rooms) |
| 10 | 1:38–2:00 | 22 s | **Tech beat (emulator, `?debug=1`).** The overlay shows the plan source `llm`, the repair count, the latency and the surface count. Over it, a 4-step diagram builds: **perceive → plan → verify → fallback**. Then the API service is stopped, the level is replayed, the client falls back locally, the overlay reads `procedural` and the game still plays. (For a quick take instead, load with `?director=off`.) | B | "AI director: perceive → plan → verify → fallback", then "API offline → still playable" | V9 | `scan.done`, `build.piece_pop`; music lifts slightly | AG, Tech, Inn |
| 11 | 2:00–2:08 | 8 s | **Stuck → adapt** *(only if `adapt` ships)*: I hesitate, Pip shrugs, and a validated patch moves the lever closer or adds a hint. The overlay reads `adapt 1/2`. **Fallback:** the ghost hand demonstrates the move, and the snap radius widens. | A or B | "Stuck? The level adapts." *(fallback: "Stuck? Pip shows you.")* | V10 | `pip.question`, `hint.show`, `build.piece_pop` | AG, 5M |
| 12 | 2:08–2:18 | 10 s | **Win:** the crystal spins, confetti bursts, Pip cheers twice and the stars pop in. The panel shows "New quest tomorrow". | A (B) | *(in-game panel)* | V11 *(starts after the sting)* | **`win.sting`** (music fully out), `win.star` ×3, `win.confetti`, `pip.cheer` | Pol, 5M |
| 13 | 2:18–2:30 | 12 s | **Next day, same room.** Re-enter: the hut is still on the table (anchor), Pip says "You came back!", and a new route and theme draw on. Shot on two real consecutive days. *(If the anchor does not ship: show the hut rebuilt on the largest table and cut the anchor claim.)* | A (B: two dates) | "Next day: same room, new quest" | V12 | `build.hut_land`, `pip.hello`, `build.route_draw` | CB, Inn, Tech (anchors) |
| 14 | 2:30–2:34 | 4 s | **On-device proof strip:** the `?debug=1` overlay on Quest shows fps, draw calls and triangles mid-scene. | A only *(no B stand-in: emulator fps is not proof)* | "Quest Browser · WebXR · measured fps" | V13 | quiet | Tech |
| 15 | 2:34–2:40 | 6 s | **End card** over the last real frame (Pip waves and walks into the hut, then the frame dims to 40%). | A (B) | See §3 | V14 | `pip.happy`, `ui.exit`; music resolves | Pol |

**Totals:** 15 shots, 2:40. The VO runs ≈ 1:50 of that, so there is room to breathe. The 15 s buffer up to 2:55 is for extra holds, never for extra shots.

## 2. VO script (Mina, calm, plain English, ~140 wpm, ≈255 words)

> **V1** This is my living room. Roomquest just read it: the table, the couch, the shelf. Then it built a level on top.
> **V2** Pip lives in that little hut. Today his crystal fell onto my couch, and he needs help getting there.
> **V3** I help with my hands. I pinch a plank, carry it over, and it snaps into place.
> **V4** I stay seated, and there are no controllers.
> **V5** When something is out of reach, I point and pinch. The lever opens the gate with the same sign.
> **V6** The slime doesn't get hurt. It's just stunned for a few seconds.
> **V7** Pip's map shows what really happened: every block is a surface in my room.
> **V8** That's the idea. The same game in a different room is a different level. An office, a music room, a meeting room: same day, new layout.
> **V9** Behind it is an AI director. It only sees a simple map of surfaces, never camera images. It plans the level, and our own code checks that it can be solved. If that fails, or the network is down, a built-in generator takes over. Take the AI away, and it still plays.
> **V10** If I get stuck, a second agent can adjust the level, with the same checks. *(Fallback: "If I get stuck, Pip shows me, without any text.")*
> **V11** One full quest takes about five minutes.
> **V12** Tomorrow, my room gets a new quest. And Pip's hut is still on my table, right where I left it.
> **V13** It runs in Quest Browser at a steady \[measured\] frames per second. No install, no login.
> **V14** Roomquest. Your room. A new quest every day.

Say only things that are true on the capture day. Read the fps figure for V13 off the shot 14 overlay. Drop the second sentence of V12 if the anchor doesn't ship. Record VO in a quiet, soft-furnished room with a USB mic about 15 cm away, 48 kHz/24-bit WAV, 3 takes per line.

## 3. Title and end cards

- **Title (shot 2, overlay, 0:09–0:15):** "ROOMQUEST" in the game's OFL rounded font, cream `#FFF1D6` on an ink `#2B2140` rounded panel. Subline: "Your room. A new quest every day." Lower third, centred, fades in and out over 0.3 s. There is no separate black title card, because the cold open is the hook.
- **End card (shot 15):** **ROOMQUEST** · `<production URL>` · "Free in Quest Browser · no install, no login" · "Hands only · seated · Quest 3 / 3S" · small credits: "Made by Mina Narouz · SFX: Kenney (CC0) · Music: `<title>` by `<artist>` (CC0)". Use no logos at all: no Meta, Devpost, YouTube or tool marks. Text only.

## 4. Capture checklist

**A · Quest passthrough (borrowed Quest 3 preferred over 3S for capture, ~Nov, after the Nov 8 art freeze)**
- [ ] **Recording:** MQDH → Device Manager → Record (gear icon): **Single Eye**, **1080p 16:9** (2160p at 60 fps variable only if fps holds), **40 Mbps**. Each clip is capped at **3 minutes**, so record beat by beat. **Backup:** the in-headset Camera app set to Landscape 1920×1080, 36 fps (variable), 20 Mbps, Low stabilisation. **Third option:** MQDH Cast plus OBS on the laptop.
- [ ] **Audio:** MQDH docs conflict on whether audio is recorded, so do a test clip first. If there's no game audio, recreate the SFX in the edit from the shipped sound files, synced to the visuals.
- [ ] Keep `?debug=1` visible **only** for shot 14. For each room, check fps with recording on. If recording drops fps below 60, lower the capture resolution, and never show a dip as "proof".
- [ ] **Head movement:** slow turns, hold each payoff for 2 s, hands inside the camera frame (the capture FoV is narrower than the eye's). Cover each beat with 3 takes.
- [ ] **Rooms:** room 1 is the living room (hero: table, couch, shelf). Room 2 is a desk or office room. Room 3 is a bedroom or dining room (a friend's flat is fine if it's empty of people). Run Space Setup in each room. Afterwards, delete the room scans from the borrowed headset.
- [ ] **Same day, different rooms:** capture all 3 rooms on the same date for shot 9 (the daily seed is `roomHash + date`).
- [ ] **Two days, same room:** Day 1: win, then Exit. Day 2: re-enter the living room for shot 13. Don't clear browser data between the two days, because the anchor and `localStorage` must survive.
- [ ] **Clean room prep:** remove, turn around or tape over every logo (books, boxes, appliances, remotes, mugs, clothing). Turn screens off. No photos of people, no mirrors, no windows showing signs or neighbours, nobody else at home. Use bright, even light, which helps both hand tracking and passthrough. Mute headset notifications.
- [ ] **Shot C (phone):** 1080p at 30 fps on a tripod, side or back angle. Plain clothing. Matte tape over the headset logo. Controllers set down in frame. Nothing branded in the background.

**B · Emulator (can start now; rough cut by Nov 1)**
- [ ] Chrome in full screen (F11) at 1920×1080, with no bookmarks, extensions, profile picture or OS notifications. URL: `?emulator=1&room=<name>` (add `&debug=1` only for shot 10).
- [ ] **OBS:** 1920×1080 at 60 fps, CQP/CRF about 18 (or 40 Mbps CBR), record to MKV and remux to MP4, desktop audio on its own track.
- [ ] Capture all 5 rooms building and playing a level. For shot 10, capture the source `llm` (and `llm_repaired` if it happens naturally), plus `procedural` with the API service stopped (or `?director=off` for a quick take). Record the `llm` shots only after the model keys are set and B-08's live eval has run; until then the server always returns `procedural`.
- [ ] Hide the IWER dev panel except in shot 10. Emulated hands move slowly, with pinches held for a readable beat.
- [ ] Never present emulator fps as a headset number.

## 5. Editing notes

- **Timeline:** 1920×1080. Use 30 fps if most A footage is 36 fps variable (conform it); use 60 fps if MQDH 60 fps capture works. Export H.264 at 1080p and about 16 Mbps, or higher.
- **Pacing:** a cold open with no VO, then cuts every 4–8 s. The hand-interaction shots (4, 6) breathe, the montage (9) cuts fast on the beat, and the tech beat (10) is the only spot where text stacks up. Never speed-ramp gameplay, never composite fake interactions, and never cut so that a puzzle looks solved before it is.
- **Captions:** burn in the full VO in the game's font: cream on an ink panel, bottom centre, ≤ 2 lines, ≥ 42 px. Also upload an `.srt` to YouTube. On-screen labels follow the game's rule: at most 2 short lines, icons first.
- **Music:** one light CC0 track (acoustic, kalimba or marimba-friendly). It plays in the video only, never in the game. Save its licence page URL in `LICENSES.md` and the video description. Sit it around −28 LUFS under VO and **duck it 10–12 dB** whenever VO plays. Cut it **completely from 2:08 to 2:11** so `win.sting` is the musical peak, then bring it back to resolve under the end card.
- **Mix:** game SFX stay above the music, and the scan plinks in shot 1 are the hero sound. Aim for about −14 LUFS integrated and ≤ −1 dBTP.
- **Grade:** light exposure and white-balance matching between rooms only. Use no AI tools anywhere in the pipeline: no generative fill, no AI upscaling, no AI voice.
- **Rough cut first:** cut the all-B animatic by Nov 1, then swap in A footage shot by shot. If an A shot is missing on Nov 13, ship the B take with its tag.

## 6. Final compliance checklist (sign off before upload)

- [ ] Runtime **< 3:00** (target 2:40, ≤ 2:55). The end card is fully on screen before 2:55.
- [ ] **Public** on YouTube (not unlisted or private). Plays in a logged-out incognito window. Link pasted into Devpost.
- [ ] **All footage is real:** Quest capture (A), emulator (B) or phone of Mina (C). Every gameplay shot carries a source tag. **No AI-generated video** or AI-altered frames.
- [ ] **No logos, brand names or recognisable branded products** after a frame-by-frame scrub of every room shot, including the headset in shot C and the browser UI in B.
- [ ] **Only Mina is identifiable** (her voice and shot C). No other faces, voices, photos or reflections.
- [ ] **English** VO, burned-in captions and `.srt`.
- [ ] **Hands only** is visible: no controller in hand in any shot, and the controllers are shown set down in shot 5.
- [ ] **Claims match the build:** the fps in V13 equals the shot 14 overlay (≥ 60). Shot 11 and the second sentence of V12 appear only if `adapt` and the anchor shipped. The emulator is never shown as headset performance.
- [ ] **Audio licences:** one CC0 music track, credited. Kenney SFX are CC0. Pip's sounds are procedural. Everything is listed in `LICENSES.md` and the description.
- [ ] The URL on the end card is live, free and needs no login, and matches the Devpost link.
- [ ] The description repeats the source note: "Captured on Meta Quest 3 and in the IWSDK emulator; no AI-generated video."
