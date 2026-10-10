# Roomquest: The First Five Minutes

**v0.1 · Fri Oct 9, 2026 · Owner: Mina Narouz** · Targets: **Best First Five Minutes**, plus the Experience Design criterion for **Best New Gaming Experience**\
Inputs: `PRD.md` §4.1 and US-1–US-10, `ARCHITECTURE-AND-PLAN.md` §7 (store phases and events), `docs/art-and-sound-direction.md` (sound keys, VFX). Post-MVP priority #2 (Oct 12 – Nov 8).

## Goals and guardrails

- **Pay off before the headset comes off:** first snap by **≤ 1:30**, first "it's my room" moment by **≤ 0:30**, and first win by **~4:30**, all inside the ≤ 10 min session rule.
- **No text walls:** at most 2 short lines on screen at once, and beat 1 is completable after reading ≤ 2 lines (US-7). Teaching comes from **demonstration** (a ghost hand), **Pip's body language** and **invitation** (wiggling targets).
- **Hands only, seated, never palm-up:** the tray tilts 20° toward the player, so pieces are picked up palm-down. Everything stays ≤ 50° from the start view.
- **0:00 = the "Enter your room" tap.** Times assume a living room with Space Setup done. The director has an 8 s budget and the procedural plan runs in parallel (PRD US-3).

**Onboarding rules for `level-core`** (proposed; apply to a device's first session, flagged in `localStorage`): tier `easy`; **beat 1 uses `plank_bridge` from the start surface within hand reach** (fall back to `ramp`, then `portal`); beat 2 is a `lever`→`gate`; ≤ 3 beats; no `slime` before beat 3. These rules are enforced by the validator and generator, so they hold for both LLM and procedural plans.

**Event names:** events in plain backticks already exist in the plan (§7: phases `landing → requesting → surveying → building → playing ⇄ paused → won | noSurfaces | error`; events `pieceBuilt`, `gateOpened`, `slimeStunned`, `gemCollected`, `explorerBlocked`, `beatCompleted`, `explorerOutOfView`, `won`). Events marked **†** are proposed additions for the F-02 store.

## Beat-by-beat script

### B0 · Landing (before 0:00)

- **Sees:** the 2D page in Quest Browser: title, one-line pitch ("Your room. A new quest every day."), three icons (sit down, hands only, controllers away) and the **Enter your room** button.
- **Does:** taps Enter. That tap unlocks audio and starts the XR session.
- **Fail-safes:** if WebXR AR or hand tracking is unsupported, show a friendly message plus "Try in emulator". Enter stays disabled until the XR chunk has loaded (F-01). `/api/health` is pre-warmed.
- **Store / sound:** `landing → requesting` · `ui.enter`.

### B1 · 0:00–0:06 · The spark (teach **poke**)

- **Sees:** passthrough fades in. A gold **spark** (Pip's lantern firefly) floats 0.45 m ahead and 20° down, bobbing gently. When a hand comes into view, the spark drifts toward the index finger.
- **Hears:** a faint shimmer near the spark (spatial).
- **Does:** pokes the spark. This is the first gesture, it is impossible to get wrong, and it gives the player instant agency.
- **Teaches:** if there is no poke after 3 s, a **cobalt ghost hand** demonstrates a poke on the spark once. There is no text.
- **Fail-safes:** if there is no poke by 0:08, the spark bursts by itself (nobody waits). Plane and mesh queries already started in the background at 0:00.
- **Store / sound:** `requesting → surveying`, `sparkPoked`† · `scan.spark_poke`.

### B2 · 0:06–0:15 · Room read: "it sees my room"

- **Sees:** the spark bursts into a **mint ring** that sweeps outward across the real floor. As it reaches each furniture top in the surface graph, that surface's outline lights up mint and briefly fills with a dot grid. The table, the couch and the shelf each light up one at a time. Pip's lantern light then circles over the lit surfaces ("surveying") while the director works.
- **Hears:** one **kalimba plink per surface, pitched by height**, so the floor is low and the shelf is high. The room literally plays a little tune. `scan.done` arpeggio plays when the graph is complete.
- **Does:** watches and looks around. Surfaces outside the 50° start view light up last, which draws the head around without forcing it.
- **Teaches:** this is the passthrough thesis: the game knows where your furniture is. Only surfaces that the graph accepted light up, so the scan is honest.
- **Fail-safes:** if there are no planes at 2.5 s, call `initiateRoomCapture` **once**, then sweep when it returns. With < 2 usable surfaces, show the `noSurfaces` panel: Pip holding a tiny broom, the line "Set up your space in Quest settings, then tap Retry", and a Retry button. If the director is late, outlines stay "breathing" at 30% until the 8 s mark, then the procedural plan is used and the player sees no error.
- **Store / sound:** `surfaceLit`† ×N, then `planReady {source}`† · `scan.sweep`, `scan.surface`, `scan.done` (or `scan.none`).

### B3 · 0:15–0:30 · The quest draws itself onto your furniture

- **Sees:** a title card appears above the start table: **"The Fallen Sun Crystal · today's quest for your room"**. A dotted gold **route line** draws itself from the biggest table to the goal surface, hopping across _their_ gaps. Pieces pop in along the route in order, and the **hut** lands last on the start table with a dust puff. Mint outlines fade out. The tray slides up from below eye line.
- **Hears:** pencil-scratch ticks as the line draws, a pop per piece and a clunk for the hut.
- **Does:** follows the line with their eyes. This is the first "wow, it planned around my couch".
- **Fail-safes:** the route always starts in view (the hut's in-view constraint). If any piece is > 50° off, its pop sound plays spatially to pull the head.
- **Store / sound:** `surveying → building → playing` · `build.route_draw`, `build.piece_pop`, `build.hut_land`.

### B4 · 0:30–0:45 · Pip arrives

- **Sees:** the hut door bursts open and **Pip** hops out (`arrive`), looks straight at the player, and tips his hat. A bubble shows the intro line: the LLM plan's `intro` line, which names the player's furniture, for example "The sun crystal fell onto your couch! Help me get there?". The procedural template fills the same slot with the surface label. Pip walks to the table edge, stops, **points at the gap** and shrugs.
- **Hears:** `pip.hello`, soft steps, then `pip.question`.
- **Does:** looks at Pip. A 1 s gaze dwell makes Pip look back and repeat the current goal, which teaches the hint system with no instruction.
- **Teaches:** "Pip needs help, the problem is _there_." The beat chip on the tray shows a bridge icon and "Bridge the gap".
- **Fail-safes:** if Pip leaves view, a tangerine edge arrow appears and `pip.callout` plays **from Pip's position**.
- **Store / sound:** `explorerArrived`†, `explorerBlocked {reason:"gap"}`, `hintShown`† · `pip.hello`, `pip.step`, `pip.question`, `hint.show`.

### B5 · 0:45–1:30 · Beat 1: teach **pinch, carry, snap** (plank)

- **Sees:** the plank bundle in the tray wiggles and its tomato peg glints. A **dim mint pre-ghost** already sits across the gap, so the goal is visible before the player touches anything.
- **Does:** pinches the plank palm-down, lifts it and carries it toward the gap. Within 10 cm the ghost brightens and pulses. Within 4 cm the plank is pulled in magnetically. On release it **snaps** into place with a sawdust puff. Pip cheers, crosses and grabs a gem on the way.
- **Teaches:** if there is no grab after 4 s, the ghost hand performs a **pinch, lift and carry** along a dotted arc from the tray to the gap. That is the only demo. A wrong release costs nothing: the plank flies back to its tray slot.
- **Fail-safes (escalating):** after 30 s stuck, the ghost hand repeats and the snap radius widens from 10 to 15 cm. After 60 s, Pip gives a canned hint line. Post-MVP, the `adapt` agent may move the plank or add a hint (validated patch). **Hand tracking lost:** timers and Pip freeze, and the tray shows two hand icons until the hands are back. **Controllers picked up:** icon panel "put controllers down: this game uses your hands".
- **Store / sound:** `pieceGrabbed`†, `ghostShown`†, `pieceReturned`†, `pieceBuilt`, `beatCompleted {beatIndex:0, durationMs}`, `gemCollected`, `handsLost`†/`handsFound`† · `piece.hover`, `piece.grab`, `piece.ghost`, `piece.snap` (or `piece.return` / `piece.invalid`), `pip.cheer`, `beat.complete`, `gem.collect`, `hands.lost`/`hands.found`.

### B6 · 1:30–2:30 · Beat 2: first real puzzle (lever opens gate)

- **Sees:** Pip reaches a **gate** with a coral lamp and a sun glyph, and stops. Somewhere else, on a shelf or the arm of a chair, a **lever with the same sun glyph** wiggles. The player has to connect the two, and that small deduction is the puzzle.
- **Does:** if the lever is in reach, pokes the tomato knob. If it is far away, uses **ray + pinch and pulls** without leaving the seat (US-5). A dotted violet line runs from the lever to the gate, the lamp flips to mint and the door swings open. Pip walks on and collects gems, each one a note higher than the last.
- **Teaches:** the ghost hand demonstrates the gesture once and only when needed. For a far lever it shows an open palm-away hand casting a ray, then pinch and pull. Matching glyphs teach "this opens that" without words.
- **Fail-safes:** the lever is always ≤ 50° from the start view (validator). Gaze dwell on Pip re-shows "Open the gate", and the stuck ladder from B5 applies.
- **Store / sound:** `leverPulled`†, `gateOpened`, `gemCollected` ×n, `beatCompleted` · `lever.pull`, `link.line`, `gate.open`, `gem.collect`, `beat.complete`.

### B7 · 2:30–2:50 · The director reveal: "this was built from YOUR room"

- **Sees:** Pip stops and unrolls a map. Above the tray, a **palm-sized toy model of the player's room** appears: ≤ 12 cobalt-outlined blocks, one per surface in their graph at about 1:20 scale, with small icons (table, couch, shelf). A gold route runs over it, with Pip's marker partway along and the remaining segments pulsing. As each map block pulses, **the matching real surface re-lights** in passthrough, one by one. A caption reads "Drawn from your room · Fri Oct 9". Pip's line comes from the plan's `beat` dialogue, for example "Your shelf is the perfect spot for a gate!"
- **Hears:** the **same height-pitched plinks** from the scan, replayed in order. Recalling that motif connects the scan to the level.
- **Does:** watches for about 5 s, then pokes or pinches the map to dismiss it (or it folds away by itself). This shows judges that the level topology _is_ the room, without a debug screen.
- **Fail-safes:** this works the same for a procedural plan, which is also built from the room, so the caption stays true. The map is ≤ 30 draws (one instanced block draw plus the route), and it hides if fps drops below 65.
- **Store / sound:** `mapShown`† · `scan.surface` (replay), `pip.happy`, `ui.poke`.

### B8 · 2:50–4:00 · Beat 3: one new verb, then play

- **Sees / does:** whichever of `moving_platform`, `slime` or `portal` the plan uses. **Platform:** ray + pinch to drag the raft along its visible rail until it docks with a click, then Pip rides across. **Slime:** poke or ray-tap it, the slime flattens, and 3 stars count down the 4 s stun while Pip sneaks past. **Portal:** Pip uses it automatically, so there is nothing new to teach.
- **Teaches:** at most one ghost-hand demo, for the new verb only. After that the player is fluent.
- **Fail-safes:** Pip never passes an awake slime. The platform clamps to its rail. The stuck ladder and the edge arrow still apply. **System menu or blur** auto-pauses (`playing → paused`), and resuming continues.
- **Store / sound:** `slimeStunned`, `beatCompleted` · `platform.grab`, `platform.slide`, `platform.dock`, `slime.blub`, `slime.stun`, `slime.wake`, `portal.enter`, `portal.exit`.

### B9 · 4:00–4:30 · First win

- **Sees:** Pip touches the magenta crystal. It lifts and spins, confetti bursts, and Pip does a double `cheer`. The win panel appears ≤ 15° from centre, showing 1–3 stars popping in, gems (e.g. 4/5) and time.
- **Hears:** **`win.sting`**, the only musical moment in the session, followed by a `win.star` tick per star and the confetti pop.
- **Store / sound:** `won`, `playing → won` · `win.sting`, `win.star`, `win.confetti`, `pip.cheer`.

### B10 · 4:30–5:00 · The hook: come back tomorrow

- **Sees:** Pip yawns, waves and walks back into his hut. The hut lights dim, and **the hut stays on the table**. With the village anchor (P1) it is still there next session. The panel reads **"New quest tomorrow · Sat Oct 10"**, with a sealed envelope showing tomorrow's **theme icon** (derived locally from tomorrow's seed) and "Same room, new adventure". Buttons: **Replay** and **Exit** (poke or ray).
- **Next visit:** Pip greets the player with "You came back!", based on the last-played date in `localStorage`. Streaks and visible progression are a post-MVP stretch for Best Reason to Come Back.
- **Fail-safes:** Exit ends the XR session cleanly and returns to the landing page (US-10). A crash or exit mid-level offers "Resume today's quest", which loads the same plan from the cache (US-9).
- **Store / sound:** `won` → Exit to `landing` · `pip.happy`, `ui.poke`, `ui.exit`.

## Global fail-safes (any beat)

| Situation                       | Response                                                                                             |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| No WebXR / no hand tracking     | Landing message plus "Try in emulator"; never a blank page                                           |
| No planes after 2.5 s           | `initiateRoomCapture` once, before any anchor                                                        |
| < 2 usable surfaces             | `noSurfaces` panel with Retry (tabletop hit-test mode is post-MVP)                                   |
| API slow or down, invalid plan  | Procedural plan at ≤ 8 s, no error shown; the debug overlay shows `procedural`                       |
| Hand tracking lost              | Freeze Pip and timers, show hand icons at the tray, play `hands.lost`; resume on `hands.found`       |
| Pip > 50° out of view           | Edge arrow plus spatial `pip.callout` (`explorerOutOfView`)                                          |
| Stuck on a beat                 | 30 s: ghost-hand repeat and wider snap; 60 s: canned hint; post-MVP: validated `adapt` patch (max 2) |
| Piece dropped somewhere invalid | Flies back to its tray slot with `piece.return`                                                      |
| Anchor restore fails            | Hut goes on the largest table (X-09 fallback)                                                        |

**Playtest metrics** (log with `?debug=1`): Enter → playable ≤ 10 s p95; Enter → first `pieceBuilt` ≤ 90 s median; % of players finishing beat 1 **without** the ghost-hand demo; lines read before the first success ≤ 2; time to `won` 3–6 min; fps ≥ 60 during the scan and build (the busiest moments).

## Teaser: 3-minute video storyboard outline (full storyboard due Fri Oct 16)

Rules: under 3:00; **real footage** from Quest capture or the IWSDK emulator, with no AI-generated video; Mina is the only identifiable person; no logos or brands visible in the rooms (check shelves and screens); SFX from the game; no music except the win sting, plus an optional quiet licensed or CC0 bed under the title and end cards only.

| #   | Time      | Shot                                                                                                                                                                                                            | Purpose                             |
| --- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | 0:00–0:12 | Cold open, first-person passthrough of a living room: a hand pokes the spark, the mint ring sweeps and the furniture lights up with plinks                                                                      | Hook: "it sees my room"             |
| 2   | 0:12–0:25 | The route line draws across the table and couch, pieces pop in, the hut lands, Pip hops out and looks into the lens. Title: "Your room. A new quest every day."                                                 | Concept in 1 line                   |
| 3   | 0:25–0:55 | Close-up of the hand pinching a plank, the ghost appearing, the snap and sawdust; Pip crosses. Then a seated wide shot (third person, Mina only) showing no controllers                                         | Hands-only, seated, juicy           |
| 4   | 0:55–1:20 | Ray + pinch pulls a lever on a far shelf, the violet link line and the gate opens; poking the slime and the stun stars                                                                                          | Range of hand verbs, FoV-aware      |
| 5   | 1:20–1:45 | The map reveal, then a hard-cut montage of **3 different real rooms** each producing a different level from the same day                                                                                        | Passthrough matters; innovation     |
| 6   | 1:45–2:10 | Agent explainer: screen capture of the `?debug=1` overlay (plan source `llm`, repairs, latency) over a simple perceive → plan → verify → fallback diagram; the "take it away" toggle shows the game still plays | Best Agentic Interaction, technical |
| 7   | 2:10–2:30 | Win: crystal, `win.sting`, confetti, stars; then the same room with the date flipped to tomorrow and a new level                                                                                                | Best Reason to Come Back            |
| 8   | 2:30–2:45 | Quick proof: fps overlay at 72, a hands-only badge, the "under 10 minutes" session timer                                                                                                                        | Technical and compliance            |
| 9   | 2:45–2:58 | End card: Roomquest, the URL, "Free in Quest Browser · no install, no login"; Pip waves and walks into the hut                                                                                                  | Call to action                      |
