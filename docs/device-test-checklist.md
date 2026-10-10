# Device test checklist

A single ~20-minute pass on a **real Meta Quest** (Quest 3 or 3S) against the staging HTTPS build.

You do **not** need the GitHub repo, a computer, Node, or any developer tools. A friend or community member with a Quest can run this.

Staging is redeployed only at milestones, so a first load may take ~30-60 s while the Render instance wakes.

**Play URL (Engineering Lead fills this in):** `https://roomquest-client-staging.onrender.com`

Open that URL in **Quest Browser**. For the fps / debug overlay used in this pass, open:

`https://roomquest-client-staging.onrender.com?debug=1`

(If the URL already contains `?`, add `&debug=1` instead.)

Use your **hands**, not controllers. Put the controllers down.

---

## How to send results

We need your filled Pass / Fail marks, Notes, and screenshots. Nothing else.

1. Fill every **Pass / Fail** cell (`Pass` or `Fail`) and use **Notes** for versions, overlay numbers, and anything odd.
2. For **each Fail**, record:
   - the **room** (short description, e.g. "living room, grey couch, wood table")
   - a **screenshot** of the failure
   - **headset model + OS version** and **Quest Browser version** (from the tester block below)
3. **Screenshot on Quest:** hold the **Meta** button and choose **Screenshot**, or press **Meta + right trigger**. Screenshots land in the headset gallery.
4. **Get screenshots off the headset:** Meta Quest mobile app → **Photos**, or Share from the headset gallery to your phone.
5. Send the filled checklist (copy/paste, photos of your notes, or a voice note covering each Fail) **plus the screenshots** to the person who asked you to test.

**Send results to:** _the person who sent you this checklist_ (Engineering Lead: put a name, email, Discord, or WhatsApp here before sharing.)

You do not need a GitHub account.

---

## Tester

Fill this in before or right after Setup. Reuse these versions on every Fail.

| Field | Fill in |
| --- | --- |
| Your name | |
| Date | |
| Headset (Quest 3 / 3S / other) | |
| Headset OS (Settings → System → About) | |
| Quest Browser version (browser ⋯ menu) | |
| Room (short description) | |

---

## Setup (~2 min)

- [ ] **Wake the staging API.** Before starting, open `https://roomquest-api-staging.onrender.com/api/health` in Quest Browser and wait until it shows db `"up"`. This wakes the API so the first level is not a procedural fallback from a timeout.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Quest Browser version.** Open Quest Browser → ⋯ (or the browser menu) and write the version in Notes and in the tester block.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Room setup (Space Setup) is done.** On the Quest, open Settings → **Physical space** / **Space Setup** (or Boundary) and confirm the room has been scanned so tables, couch, floor, and walls are known. Do this before opening the game URL.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **URL opened in Quest Browser.** Paste `https://roomquest-client-staging.onrender.com?debug=1` into Quest Browser (HTTPS). You should see the Roomquest landing page. Do not use a desktop or phone browser for this pass. After Enter, note the director source (`llm` or `procedural`) shown in the `?debug=1` overlay.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Enter tap.** On the landing page, wait until **Enter your room** is enabled, then tap / pinch it. The passthrough scene should start.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

---

## 3D / XR (X-11) (~12 min)

Fixed foveation is turned on by this build. You do not toggle it.

- [ ] **Frame rate stays at 72 fps or above.** After Enter, look for the debug overlay (a small **PERF** panel leashed near the HUD). The first line is `fps`. Play for a minute with the level visible and confirm it stays **72 or higher**. If you cannot see the overlay, you opened the URL without `?debug=1` — go back and add it.

  | Pass / Fail | Notes (write the fps number) |
  | --- | --- |
  | | |

- [ ] **Room surfaces are detected with the right labels, and pieces sit on real furniture.** With `?debug=1`, outlines/labels should match real **table / couch / floor / wall**. Greybox pieces (hut, shrine, gaps, tray) should sit on those real surfaces, not floating in empty air.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Pinch-grab and snapping work; a bad drop thud-rejects.** Pinch a plank or ramp from the tray (palm not facing you) and move it to the glowing ghost on a gap, then release — it should snap onto the target. Pinch another piece, drop it in empty air away from any ghost — you should hear a **thud**, it should **not** snap, and it should return to the tray.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Slime stun (near poke, far ray-pinch) and groggy pathing.** Find the slime. **Near:** walk up and poke it with a finger — it should squish / show stars and go groggy. Wait until it wakes. **Far:** from a couple of metres away, point at it (ray) and pinch — it should stun the same way. While it is groggy, the explorer may pass. While it is **awake**, the explorer must wait and must **never walk through** it.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Lever / gate and platform / portal.** Poke or ray-pinch the lever — the gate should open and the explorer should be able to pass. Pinch-drag the moving platform along its rail; the explorer should board when it is lined up and ride it. Walking into a portal should appear the explorer at the paired portal.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Level stays anchored after leave / re-enter and after a headset restart.** Pinch **Pause** then **Exit** (or **Done** after a win) so you are back on the landing page, tap Enter again — the village / level should sit in the **same physical place**. Then restart the headset, open the same URL, Enter again, and confirm it is still in that place. This is the only reboot in the pass.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **The explorer reaches the shrine and the level is winnable.** Play through (or keep helping the explorer) until they reach the shrine / goal. You should get the win state, not a stuck explorer.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

---

## Frontend (~5 min)

- [ ] **Audio after Enter; explorer chirp is spatial.** After the Enter tap, you should hear game audio (not silence). Walk or lean left/right of the explorer: the chirp should feel like it comes from the explorer, not from inside your head.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **HUD readable at arm's length; Pause, Replay, and Done respond to a pinch.** Stand with panels at about arm's length — titles and buttons should be readable without leaning in. Pinch **Pause** (it should pause). From pause or the win panel, pinch **Replay** and **Done** and confirm each reacts.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Onboarding shows once, then skips on the second launch.** On a first visit to this URL on this headset, the explorer should show a short intro (about 30 seconds, starting like "Hi! Help me cross your room."). After **Done** back to the landing page, tap Enter again **without** clearing browser data — the intro should **not** play again. If you have played this URL on this headset before, write that in Notes; the skip check only applies to a first-time visit.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Edge arrow when you look away from the explorer.** Turn your head so the explorer is well off to the side (outside the centre of view). A small arrow should appear at the edge of your view pointing toward the explorer.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

- [ ] **Win panel shows stars, gems, and time; Done returns to the landing page.** On win, the panel should show star count, gems, and time. Pinch **Done** — the XR session should end cleanly and you should be back on the landing page (Enter your room), not a blank or stuck view.

  | Pass / Fail | Notes |
  | --- | --- |
  | | |

---

## AI director (~1 min)

Do this while the debug overlay is still visible (first session is fine).

- [ ] **Director source, if live mode is on.** On the overlay, read the line that starts with `source`. Write the exact value in Notes (`llm`, `llm_repaired`, `cache`, or `procedural`). If it is `llm`, `llm_repaired`, or `cache`, live mode is on. `procedural` means the fallback generator ran — still note it.

  | Pass / Fail | Notes (`source` value) |
  | --- | --- |
  | | |

---

## Done

Confirm you sent:

- [ ] Filled Pass / Fail + Notes for every item
- [ ] Tester block (headset, OS, browser, room)
- [ ] Screenshots for every Fail
- [ ] The bundle to the person who asked you to test
