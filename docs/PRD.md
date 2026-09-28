# Roomquest — Product Requirements Document (PRD)

**Owner:** Mina Narouz (solo entrant) · **Prepared by:** Engineering Lead · v1.2, Sun Sep 27, 2026\
**Competition:** Meta VR Start Developer Competition 2026 · Track **Gaming** · Division **New Experience** · **Primary target: Best New Gaming Experience** ($100,000, 1 winner; runner-up $50,000) · Secondary targets **Best Agentic Interaction**, **Boldest Original Concept**, **Best Reason to Come Back** ($25K each); also in view **Best First Five Minutes** ($25K)\
**Changelog v1.2 (Sep 27):** primary prize target is now Best New Gaming Experience; post-MVP priorities reordered to polish → first five minutes → adapt → extra pieces (freeze Nov 8); buying a Quest 3S is the recommended headset plan (decision by Sep 30), with borrowing as the backup.\
**Build window:** Mon Sep 28 → Sun Oct 11, 2026 (MVP complete, live over HTTPS, submission-ready) · **Hard deadline:** Wed Nov 18, 2026, 12:00 PM PT (10:00 PM Cairo)\
**Source of truth for design:** `Roomquest-Design-Doc.md` v0.1. Companion doc: `ARCHITECTURE-AND-PLAN.md`.

## 1. Problem and pitch

Mixed-reality games mostly treat passthrough as a backdrop: the same scene plays whether you sit in a living room or an office, and turning passthrough off changes nothing. Judges explicitly penalise that ("passthrough should be purposeful: the player's real room meaningfully changes the experience"; see §9). Hand-tracked MR games also tend to be either tech demos or controller designs retrofitted to hands.

**Pitch:** Roomquest turns your real room into a tiny puzzle adventure. An AI game director reads your furniture through Quest scene understanding and builds a short quest where a pocket-sized explorer has to get from your table to your couch. You help with your bare hands: pinch bridges into place, drag platforms, pull levers, poke slimes. Every room is a different level, and your room gets a new level every day.

## 2. Target user and platform

| Item | Decision |
|---|---|
| Primary user | A Quest 3 / 3S owner (and a competition judge) sitting on a couch or at a desk for a 5–8 minute session, with no controllers paired. |
| Secondary user | A judge or reviewer on desktop Chrome watching via the IWSDK emulator (IWER), or reading the landing page. |
| Platform | **Meta Quest Browser, WebXR `immersive-ar`**, built with Meta Immersive Web SDK (IWSDK). No APK, no store listing. Native Spatial SDK is out of scope. |
| Input | **Hands only.** No controller code path. Head gaze (viewer pose) for hints. |
| Posture | Seated, stationary, everything within a ~0.6 m reach radius or reachable by hand ray ("airplane seat test"). |
| Access | Free, no login, no account. One public HTTPS URL. Anonymous device id only (random UUID in `localStorage`) for rate limiting and the daily cache. |
| Language / rating | English only. Target Meta content guideline **10+** (cartoon slime is "stunned", never hurt). |

## 3. Goals and non-goals

### Goals (by Sun Oct 11, 2026)
1. **G1 Playable core loop:** read room → director builds level → player helps with hands → explorer reaches goal → stars. Runs end-to-end in the IWSDK emulator in all 5 pre-scanned rooms and on a Quest 3/3S.
2. **G2 Room-dependent levels:** the level layout comes from the detected surfaces (tables, couches, shelves, floor). Different rooms give visibly different levels.
3. **G3 Agentic director:** a LangChain agent on NestJS perceives (surface graph), plans (zod-typed `LevelPlan`), gets verified (constraint and solvability check, one repair round), and always falls back to a deterministic generator. The game still works with the AI turned off (the "take it away" test).
4. **G4 Hands-first:** pinch (near), ray + pinch (far), poke. Never a palm-facing pinch.
5. **G5 Performance:** 72 fps target and a hard floor of 60 fps on Quest 3/3S in the demo rooms.
6. **G6 Shippable:** production URL over HTTPS (Vercel for the client, Render + Neon for the API), a daily seed and cache, and a Devpost draft ready.

### Non-goals (for this build)
- Controllers, locomotion, standing or room-scale play.
- Native Android / Spatial SDK / Unity builds, and store publishing.
- Monetisation, ads, accounts, login, social or multiplayer.
- Voice input, eye tracking (WebXR exposes none), custom hand poses beyond pinch, ray and poke.
- The 11 non-MVP pieces, the stuck-player "adapt" agent, two-hand rope stretching, and the back-of-hand wrist menu (see §6.3 Post-MVP).
- Hand-modelled GLB art and final audio mix. The MVP uses a cohesive greybox "toy" style; art direction, sound and music are post-MVP priority #1 (Oct 12 – Nov 8).

## 4. MVP scope

### 4.1 Core loop (MVP)
1. **Landing page (2D):** title, 1-line pitch, "Enter your room" button, device check (WebXR `immersive-ar` supported? hand tracking?), 3-line how-to-play, credits and licences. No login.
2. **Enter AR** (a user gesture starts the session). Scene understanding starts. If no planes arrive after 2.5 s and `initiateRoomCapture` exists, call it **once**. If there are still fewer than 2 usable surfaces, show a clear "Set up your space in Quest settings, then tap Retry" panel (the hit-test tabletop mode is post-MVP, §6.3).
3. **Surveying (≤ 8 s):** surfaces pulse while the surface graph is built and the director is called. The procedural generator runs in parallel, so the player never waits more than 8 s.
4. **Level build:** pieces spawn at their plan positions. The village hut (start) appears in view on the largest table. A tray with the player-built pieces floats below eye line, ≤ 0.6 m from the head.
5. **Play:** the explorer says the intro line and walks to the first blocker. The player places bridges or ramps, drags the moving platform, pulls or pokes levers to open gates, and pokes the slime to stun it. Looking at the explorer for 1 s shows a hint bubble. If the explorer leaves the field of view, an edge-of-view arrow and a chirp appear.
6. **Win:** the explorer reaches the crystal shrine, then confetti and a 1–3 star rating (time plus gems). "New quest tomorrow" shows with the date. Buttons: **Replay** (same plan) and **Exit**.
7. **Pause:** a poke button on the tray opens Resume / Restart / Exit. Exiting ends the XR session cleanly.

### 4.2 The 10 MVP pieces (★ in the design doc)
| # | Piece id | Role | Interaction | Placement constraint (validator-enforced) |
|---|---|---|---|---|
| 1 | `village_hut` | Start | none | table/desk top, area ≥ 0.3 m², height 0.4–1.1 m, in view at start |
| 2 | `crystal_shrine` | Goal | none (win trigger) | horizontal surface ≠ start, path distance ≥ 0.8 m |
| 3 | `plank_bridge` | Player-built crossing | near pinch from tray, snap with ghost preview | 2 horizontal surfaces, gap 0.1–0.9 m, Δh ≤ 0.25 m |
| 4 | `ramp` | Up/down link | near pinch from tray, snap | Δh ≤ 0.6 m, free floor run ≥ 2×Δh |
| 5 | `moving_platform` | Ferry on a rail | near pinch, or ray + pinch drag along the rail | table/desk/floor, rail ≤ 1 m, fully on one surface |
| 6 | `gate` | Blocks an edge | opened by its lever | on an explorer path edge, needs a linked lever |
| 7 | `lever` | Opens linked gate(s) | poke (near) or ray + pinch pull (far) | reach ≤ 0.7 m or ray-visible, ≤ 50° from the start view |
| 8 | `gem` | Optional score | auto-collected by the explorer | on path surfaces, 3–5 per level |
| 9 | `slime` | Patrol enemy | poke or ray-tap to stun for 4 s | surface area ≥ 0.5 m² (couch/bed/table) |
| 10 | `portal` (pair) | Links unconnectable surfaces | none (explorer uses it) | 2 horizontal surfaces, max 1 pair per level, both in view |

**Cut order if we fall behind** (decided at the Oct 4 midpoint demo): `portal` → `moving_platform` → `slime` → `ramp`. The irreducible core is hut, shrine, plank, gate, lever and gem (6 pieces), and it still demonstrates the full loop and the agentic director.

## 5. User stories and acceptance criteria

| ID | As a… | I want… | Acceptance criteria |
|---|---|---|---|
| US-1 | Quest player | to open one link and start with no login or install | Production URL loads over HTTPS in Quest Browser in ≤ 5 s on Wi-Fi; landing shows "Enter your room"; no sign-in prompt anywhere; unsupported browsers show a friendly message instead of a blank page. |
| US-2 | Player | the game to use my actual furniture | In each of the 5 emulator rooms and in 1+ real room, start is on a detected table/desk, goal is on a different detected surface, and all pieces sit on detected surfaces within 2 cm of the surface top. Two different rooms produce different start/goal surfaces. |
| US-3 | Player | to never wait long for the level | From "Enter" to a playable level takes ≤ 10 s p95 (≤ 8 s director budget plus build). If the API is slow or down, the procedural level appears at the 8 s mark with no error shown. |
| US-4 | Player | to place a bridge with my bare hand | Pinch (palm away/down) on a tray plank to lift it; a ghost preview appears when within 10 cm of a valid edge; releasing snaps it; releasing elsewhere returns it to the tray. Works with left or right hand. |
| US-5 | Player | to operate far-away things without standing | A lever beyond reach is pulled via hand ray + pinch; a moving platform is dragged along its rail via ray + pinch; nothing requires leaving the seat. |
| US-6 | Player | to deal with the slime | Poking (index tip) or ray-tapping the slime stuns it for 4 s (visual plus sound); the explorer only passes while it is stunned. |
| US-7 | Player | to know what to do | The intro line and each beat goal show in a bubble near the explorer; a 1 s head-gaze dwell on the explorer shows a hint; when the explorer is outside ~50° of view, an edge arrow points to it. The first beat is completable without reading more than 2 short lines. |
| US-8 | Player | a satisfying ending in under 10 minutes | A median session in the emulator takes 3–6 minutes. The win screen shows stars (time and gems), gems collected, and "New quest tomorrow"; Replay and Exit work. |
| US-9 | Returning player | a new level tomorrow, the same level today | Same room and same date → identical plan (cache hit, `source: "cache"`); next date → a different seed and plan. |
| US-10 | Player | to pause and leave cleanly | The tray pause button (poke) freezes the explorer and timers; Resume continues; Exit ends the XR session and returns to the landing page with no console errors. |
| US-11 | Judge on desktop | to see it work without a headset | The landing page links to "Try in emulator" (`?emulator=1&room=living_room`), which runs the full loop in desktop Chrome via IWER with emulated hands. |
| US-12 | Mina (owner) | proof the AI is core and safe | The debug overlay (`?debug=1`) shows the plan source (`llm`/`llm_repaired`/`cache`/`procedural`), validator repairs, latency and fps. The eval report shows ≥ 90% valid LLM plans (before fallback) across the 5 rooms. |

## 6. Requirements

### 6.1 Functional requirements
| ID | Requirement |
|---|---|
| FR-1 | The client requests `immersive-ar` with `hand-tracking`, `plane-detection`, `mesh-detection`, `hit-test` and `anchors` (optional), via IWSDK `sceneUnderstanding: true`, with `locomotion` off. |
| FR-2 | The **surface graph** is built per design doc §5: filter out ceiling, global mesh, < 0.04 m² and > 1.8 m; merge plane and mesh duplicates (> 50% overlap); relabel by geometry; compute edges (`adjacent`/`plank`/`ramp`/`portalOnly`, plus `rope` reserved) and reach (`hand`/`ray`/`outOfView`); cap at 12 nodes; ≤ 2 KB JSON; stable `roomHash`. |
| FR-3 | The **director API** returns a `LevelPlan` that passes the shared zod schema. Server-side it runs: LLM (`withStructuredOutput`) → validate → at most one repair call → procedural fallback. The server times out the LLM at 7 s. |
| FR-4 | The **client validates every plan again** using the same shared `@roomquest/level-core` (schema, constraints, BFS solvability). An invalid or late (> 8 s) plan is replaced by the client-side procedural plan. |
| FR-5 | The **procedural generator** is deterministic for (graph, seed, tier) and always produces a solvable plan for any graph with ≥ 2 usable surfaces. |
| FR-6 | **Daily seed** = `roomHash + "-" + YYYY-MM-DD` (client local date). **Cache** in Postgres keyed by `sha256(roomHash, date, tier, promptVersion)`. Every cache hit is re-validated against the incoming graph (roomHash only covers the 6 largest surfaces); a failure counts as a miss. |
| FR-7 | The level builder maps each placement (`surface`, `u`, `v`, optional `to`) to a world pose on the surface top; everything is anchored to the scene's reference space. The village uses one WebXR anchor when available (P1, with a fallback to "largest table"). |
| FR-8 | The explorer walks kinematically on surface tops and across built bridges, ramps, platforms and portals, stops at closed gates, unbuilt gaps and unstunned slimes, and collects gems on contact. |
| FR-9 | Interactions: `OneHandGrabbable` (tray pieces), `DistanceGrabbable`/`RayInteractable` (far levers, platform drag), `PokeInteractable` (levers, slime, UI). No `TwoHandsGrabbable` in the MVP. |
| FR-10 | HUD (IWSDK spatial UI): dialogue bubble, current beat goal, pause panel, win panel, "no surfaces" panel, edge-of-view arrow. |
| FR-11 | Audio: pinch, snap, gate, lever, slime stun, gem, win and explorer chirps (CC0 SFX, licences listed in `LICENSES.md`). |
| FR-12 | Debug overlay behind `?debug=1`: fps, draw calls, triangles, surface count, plan source, latency, validator repairs. Off in normal play. |
| FR-13 | `POST /api/v1/levels/:cacheKey/result` stores anonymous session results (stars, gems, time, completed). **P1**: the game must not depend on it. |

### 6.2 Non-functional requirements
| ID | Requirement | Target / rule |
|---|---|---|
| NFR-1 Frame rate | Quest 3/3S in the demo rooms | **72 fps target, 60 fps hard floor** (the rules require min 60 fps). Budget: < 100 draw calls, < 200k triangles, one directional light plus ambient, blob shadows, no transparency except UI, instancing for gems and planks. |
| NFR-2 Hands only | Input | Completable end-to-end without ever pairing a controller. No controller-only code path or prompt. |
| NFR-3 Palm rule | Gestures | **Never require a pinch with the palm facing the user** (reserved for the Quest system menu). Tray and levers sit below eye line so natural pinches are palm-down or palm-away. |
| NFR-4 Seated / FoV | Layout | Start, goal and levers ≤ 50° from the initial seated forward view; essential UI within a comfortable narrow FoV; reach ≤ 0.6–0.7 m or a ray. |
| NFR-5 Session | Length | A complete, satisfying session in ≤ 10 min (target 3–6 min). Cold start (tap → playable) ≤ 10 s p95. |
| NFR-6 Access | Hosting | Free, no login, public **HTTPS** URL (WebXR requires a secure context). Stays live and unchanged from submission until the winner announcement (~Dec 11, 2026). |
| NFR-7 Reliability | Degradation | The game is fully playable with the API or the LLM down (procedural fallback). No uncaught errors in the console during a full session. |
| NFR-8 Latency / cost | Director | ≤ 8 s client budget (7 s server LLM timeout); ~2k tokens in / ~600 out per level; < $0.01 per level; per-device and per-IP rate limits. |
| NFR-9 Privacy | Data | Only the abstract surface graph (labels, sizes, heights; no images, WebXR gives no camera frames) and an anonymous UUID leave the device. No PII. |
| NFR-10 Compliance | Content | No ads, corporate logos, brand names or recognisable branded products; English; no identifiable people other than Mina in the video; all third-party assets properly licensed (CC0 preferred). |
| NFR-11 Originality | Not a wrapper | The core game (surface graph, validator, generator, pieces, explorer) is our code. The LLM is one replaceable planner behind a validator. |
| NFR-12 Video | Submission | **Under 3 minutes**, public on YouTube or Vimeo, real footage from Quest or the IWSDK emulator, not AI-generated. Recorded in the Oct 12 – Nov 15 buffer. |
| NFR-13 Browser support | Compatibility | Quest Browser (Quest 3 / 3S) primary; Quest Pro/2 best effort; desktop Chrome via the emulator for review. |
| NFR-14 Quality | Engineering | TypeScript strict; CI green (lint, typecheck, unit tests, build) plus 1 approval before merge; `level-core` ≥ 90% line coverage. |

### 6.3 Post-MVP / stretch (Oct 12 → Nov 8, feature freeze stays Nov 8)
Priorities, in order:
1. **Polish:** custom art direction for the 10 pieces and the explorer (hand-built low-poly GLB, one atlas, KTX2, explorer animation), sound design and music, and juice/feedback on every hand interaction (pinch, snap, lever, stun). The Polish & Presentation criterion explicitly covers UI/UX, art direction and sound design, and it matters most for Best New Gaming Experience.
2. **The first five minutes:** onboarding, a fast cold start, and the reveal moment when the level builds itself from the room (Best First Five Minutes).
3. **The "adapt" agent** (Best Agentic Interaction), described below.
4. **Extra pieces** from the remaining 11, only if 1–3 are done.

**The "adapt" agent (priority #3)**, as `POST /api/v1/levels/:cacheKey/adapt`. It takes the client's stuck event (from the typed `explorerBlocked` / time-per-beat events) and returns a small patch: a hint line, or one piece added or moved. The client applies the patch only after `level-core` validates it. Max 2 per session, with a canned fallback. Reason: the Best Agentic Interaction award.

Unranked items, only after priorities 1–4:
1. Hit-test **tabletop mode** (tap one surface → handcrafted level) for rooms with no scan. Pull it into priority 2 if device tests show unscanned rooms are common.
2. (Art and audio moved to priority 1 above.)
3. (Adapt moved to priority 3 above.)
4. Village **anchor persistence** across sessions (if it slipped from the sprint).
5. (Priority 4 above) Remaining 11 pieces: rope bridge (two-hand stretch), ladder, pressure plate, crate, key + lock, bat, balloon lift, lamp beacon, plant grove, wall vista.
6. Back-of-hand wrist menu; progress streaks / "Best Reason to Come Back" features; difficulty tiers beyond easy/normal.
7. Accessibility extras (high-contrast mode, larger hit targets toggle).
8. Devpost assets: < 3 min video in 2–3 real rooms, screenshots, description, then submission (target **Sun Nov 15**, buffer Nov 16–18).

## 7. How each judging criterion is covered

Stage 1 is a pass/fail viability check (fits the theme, uses the required tools/features); Stage 2 weighs the four criteria equally at 25% each ([rules §5](https://start-developer-competition-26.devpost.com/rules)).

| Criterion (25% each) | What judges look for (verified wording, paraphrased) | How Roomquest covers it in the MVP |
|---|---|---|
| **Stage 1 viability** | Fits the theme; applies the required tools/features | IWSDK WebXR app for Quest, hands-first, Gaming track, hosted link, < 3 min video. |
| **Innovation & Creativity** | Originality, ambition, track relevance, uniquely uses device capabilities (spatial depth, hands-first) to drive repeat usage | Your furniture is the level; an AI director plans a new quest per room per day from a safe modular kit; the daily seed drives repeat play. |
| **Experience Design** | Seated, hands-first journey; clear onboarding; habit-forming; **purposeful passthrough** (the room changes the experience); **FoV-aware** | Level topology comes from your surfaces, so turning off passthrough would make it unplayable. 30-second onboarding via the explorer's lines. Start, goal and levers ≤ 50° from forward; edge-of-view arrow; seated, 3–6 min session; daily "new quest tomorrow". |
| **Technical Implementation** | Hands, gaze, passthrough, spatial anchoring, FoV-aware design; ≥ 60 fps; bug-free; for passthrough apps, **correct scene understanding that holds up in rooms the developer never tested** | Pinch, ray and poke via IWSDK interactables; head-gaze dwell (IWSDK `GazeSystem` / viewer-pose ray); planes + meshes + semantic labels + room capture; validator and solvability check so unfamiliar rooms still give solvable levels; anchor for the village (P1); perf budget and overlay; tested in all 5 emulator rooms plus a real room. |
| **Polish & Presentation** | Explicitly covers **UI/UX, art direction and sound design**; cohesive; strong submission materials; honest real-gameplay video, not AI-generated | MVP: consistent low-poly toy palette, snap ghosts, explorer chirps, clear win screen, no logos. Post-MVP priority #1 (Oct 12 – Nov 8): custom art for the 10 pieces and explorer, sound design and music, hand-interaction juice. Video in the buffer. |
| **Best Agentic Interaction** (special) | AI as a core part: spatial agents, procedural content, context-aware assistance | The director perceives (surface graph) → plans (typed `LevelPlan`) → is verified (validator feedback, repair round) → falls back safely. The AI shapes every level; the "adapt" live agent (`POST …/adapt`, validated patches) is stretch priority #1 for Oct 19 – Nov 8. |
| **Boldest Original Concept** (special) | Could not exist on another platform; depends on presence, spatial depth, real-world scale, eyes and hands | A living miniature world on your own furniture. Without MR and your room there is no game. |
| **Best Reason to Come Back** (special, $25K) | Progression and rewards, visible growth between sessions, a loop that pulls you back tomorrow | Daily seed: same room, new quest every day ("New quest tomorrow" on the win screen), stars per level; streaks and progression are unranked post-MVP items. |
| **Best First Five Minutes** (special, $25K, in view) | How fast it explains itself, teaches controller-free interaction without a wall of text, and pays off before the headset comes off | MVP: 30-second onboarding via the explorer and a 3–6 min complete session. Post-MVP priority #2: onboarding polish, fast cold start, and the reveal as the level builds itself from the room. |
| **Best New Gaming Experience** (primary, $100K) | Top-scoring New-division Gaming entry on the four criteria above | Everything above; the post-MVP order (polish → first five minutes → adapt) is chosen to maximise the four criteria scores. |

## 8. Risks and mitigations
| # | Risk | Likelihood / impact | Mitigation | Owner / trigger |
|---|---|---|---|---|
| R1 | **Start membership not approved in time** (eligibility requires membership by submission) | Med / Fatal | Mina applies **Mon Sep 28, 6–8 AM** (task M-01) and checks status each window; escalate via the Start community/forum if there's no answer by Oct 11; the Nov 18 deadline leaves 7 weeks. | Mina |
| R2 | **No Quest headset**: 60 fps and real-room behaviour unverified | High / High | Build against the IWSDK emulator's 5 rooms; debug/perf overlay from week 1; **Recommended plan: buy a Quest 3S**, with Mina's decision and order by **Wed Sep 30** (M-11b) so it arrives before **device test #1 on Thu Oct 8** (test #2 on Sun Oct 11). **Backup:** borrow a Quest 3/3S (asks sent on day 1, M-05). Last resort: remote tester(s) from the Start community run the URL with `?debug=1` and send screenshots. | Mina / Lead |
| R3 | FPS < 60 on device | Med / High | Hard budgets (NFR-1), instancing, greybox materials, no real-time shadows, perf ticket on Oct 7, and fixed foveation if IWSDK exposes it. | 3D Dev |
| R4 | LLM latency, outage or invalid plans | Med / Med | 7 s server timeout; 8 s client budget; generator runs in parallel; one repair round; Postgres cache; pre-generated plans for the 5 emulator rooms; fallback provider. | Backend Dev |
| R5 | Messy / mislabelled real rooms | High / Med | Merge, filter, geometry relabel, cap 12; min-area rules; < 2 usable surfaces → room capture then a clear retry panel (tabletop mode post-MVP). | 3D Dev |
| R6 | 2-week scope too big | Med / High | Parallel tracks from day 1 (shared schema and mock API first); midpoint demo Oct 4 with an explicit cut list (§4.2); feature freeze **Thu Oct 8**; Oct 9–10 bugfix only. | Lead |
| R7 | IWSDK is a release candidate (`1.0.0-rc.2`) with API gaps or bugs | Med / Med | Pin exact version; day-1 spike validates scene understanding, grab and ray in the emulator; wrap IWSDK calls in thin adapters. | 3D Dev |
| R8 | Free-tier hosting sleeps or expires during judging (Nov 23 – Dec 11) | Med / High | Neon Free has no expiry; Render free sleeps after 15 min, so upgrade the prod API to Starter before Nov 1; the landing page pre-warms `/health`; the client works without the API regardless. | Lead / Mina (billing) |
| R9 | Rule-compliance slip (logos, controller prompts, video length, identifiable people) | Low / Fatal | Compliance checklist in the release PR template; CC0 assets with `LICENSES.md`; video script reviewed against rules. | Lead |
| R10 | Rubber-stamp reviews from same-identity agents | Med / Med | GitHub forbids approving your own PR, so agents author PRs as a bot account and the Lead reviews as Mina (see plan §9). | Lead / Mina |

## 9. Verified competition requirements (with sources)

Pages fetched Sep 27, 2026: [overview](https://start-developer-competition-26.devpost.com/), [official rules](https://start-developer-competition-26.devpost.com/rules), [resources](https://start-developer-competition-26.devpost.com/resources), [schedule](https://start-developer-competition-26.devpost.com/details/dates).

| Topic | Verified requirement | Source |
|---|---|---|
| Dates | Entry Sep 24, 2026 10:00 AM PT → **Nov 18, 2026 12:00 PM PT**. Judging Nov 23 – Dec 9. Winners ~Dec 11, 2026. | [schedule](https://start-developer-competition-26.devpost.com/details/dates), [rules](https://start-developer-competition-26.devpost.com/rules) |
| Eligibility | 18+ and age of majority; not resident in Brazil, Quebec or sanctioned areas (Egypt isn't listed); active Meta account with Developer Access; **submitter must be a Meta VR Start Program member by submission time**. One entry per individual. | [rules §2](https://start-developer-competition-26.devpost.com/rules) |
| Division | New Experience = conceived and built in the window starting Sep 24, 2026; no pre-existing codebase. Roomquest's code starts Sep 28. | [overview](https://start-developer-competition-26.devpost.com/), [rules §4](https://start-developer-competition-26.devpost.com/rules) |
| Hard requirement | **Hands-first:** fully usable with hands end-to-end; "can someone complete the entire experience without ever pairing a controller?" | [rules §4](https://start-developer-competition-26.devpost.com/rules) |
| Guidelines | Seated-optimised (2 ft radius); fast cold start, clean pause/resume, satisfying in ≤ 10 min; original, not a thin wrapper ("take it away" test). | [rules §4](https://start-developer-competition-26.devpost.com/rules) |
| Hosting (IWSDK) | A link for judges; "Deploying to GitHub Pages", or preferred hosting (e.g. Vercel, DigitalOcean, AWS, Azure). The resources page lists "Deploying IWSDK (WebXR) through GitHub Pages or Vercel (required for IWSDK (WebXR) competition submission)". Must stay available and free until the winner announcement. | [rules §4](https://start-developer-competition-26.devpost.com/rules), [resources](https://start-developer-competition-26.devpost.com/resources) |
| Video | **Less than 3 minutes**, footage on a Meta Quest device or via XR Simulator / equivalent emulator, public on YouTube or Vimeo; judges needn't watch past 3:00; show real gameplay, don't lean on AI-generated video. | [rules §4, §5](https://start-developer-competition-26.devpost.com/rules) |
| Submission form | Name, 140-char tagline, track, division, description (inspiration, how built, future plans; ~500 words suggested), **target launch date**, optional hand-interaction write-up, team members. No changes after the deadline. | [overview](https://start-developer-competition-26.devpost.com/), [rules §4](https://start-developer-competition-26.devpost.com/rules) |
| Content | No commercial advertising, corporate logos, brand names or recognisable branded products; English; no identifiable person other than entrants; suitable for 10+/13+/18+ content guidelines; publicly available tools only; third-party assets must be licensed. | [rules §4](https://start-developer-competition-26.devpost.com/rules) |
| Judging | Stage 1 pass/fail viability, then 4 equally weighted criteria (25% each). Tech criterion: min 60 fps on Quest, scene understanding that holds in untested rooms. AI tools may assist judging; humans decide. | [rules §5](https://start-developer-competition-26.devpost.com/rules) |
| Prizes | Best New Gaming Experience $100,000 (1 winner), runner-up $50,000; Best Agentic Interaction, Best Reason to Come Back, Best First Five Minutes, Boldest Original Concept $25,000 each. | [overview](https://start-developer-competition-26.devpost.com/), [rules §7](https://start-developer-competition-26.devpost.com/rules) |
| Tooling | IWSDK suggested with Node.js ≥ 20.19.0 via `npm create @iwsdk@latest`. | [overview](https://start-developer-competition-26.devpost.com/) |

**Not verifiable on the Devpost pages:** the "palm-facing pinch is reserved by the system" rule comes from the design doc and team chat (Meta hand-design guidance), not the Devpost text; we follow it anyway. The Devpost pages now call the program "Meta VR Start"; the design doc's apply link (`developers.meta.com/horizon/programs/start/apply/`) resolves but needs a Meta login, so we couldn't read the form. The rules say the entry must include a "link … to your GitHub page (if built with IWSDK / WebXR)". That wording is ambiguous, so we submit the Vercel URL, keep the repo public and add a GitHub Pages mirror (ticket L-09) to cover both readings.

## 10. Open questions for Mina
1. **Repo visibility:** OK to make `roomquest` **public** from day 1? Free GitHub gives branch protection (needed for "green CI + 1 approval") only on public repos; private needs GitHub Pro (~$4/mo). Public also enables the GitHub Pages mirror.
2. **Bot account:** OK to create a GitHub machine account (e.g. `roomquest-bot`) that the three dev agents use to open PRs, so the Lead can approve as you? GitHub doesn't let an author approve their own PR.
3. **Budget:** approve about **$15–25 total**: Render Starter for the prod API from ~Nov 1 to Dec 11 (~$7/month) plus LLM usage capped at $10? Plus the **Quest 3S purchase**, now the recommended headset plan, with a decision by **Wed Sep 30**.
4. **Headset:** can you order a Quest 3S by **Wed Sep 30** with delivery before Oct 8? As a backup, who could lend a Quest 3/3S for the **Thu Oct 8** and **Sun Oct 11** mornings?
5. **Licence:** keep the public repo "all rights reserved" (the default, no LICENSE file) or use MIT?
6. **Character and tone:** approve the explorer name **"Pip"** and the 4 themes (forest, desert, snow, sky), or propose others.
7. **Project URL:** is `roomquest.vercel.app` acceptable (if free), or do you own a custom domain to use?
8. **Target launch date** for the Devpost form (the rules require one): propose "public web launch Dec 2026".
