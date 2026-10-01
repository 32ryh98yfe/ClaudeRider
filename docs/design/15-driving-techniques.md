# 15 · Driving techniques (M5): the user's physics spec, Part 1

This document is canonical for the M5 driving techniques. It sits on top of `10-sim-spec.md`, ADR-004, and the constants in `kart/params.ts`. Where this document and older text disagree, this document wins. Implementation (`packages/sim/src/kart/**`) and tests (`packages/sim/test/techniques.test.ts`, the oracle) are written against it independently.

## 0. User spec (verbatim summary, Korean)
- **Model.** Heading θh and velocity heading θv are controlled separately. The slip angle is β = θv − θh.
- **Longitudinal.** dv/dt = a_engine − a_drag − a_friction + a_inject.
  - Engine target: 205 km/h normally, 272 km/h while boosting.
  - With no input, the kart slows gradually, then zero-lock holds it at 0.
  - a_inject is extra longitudinal acceleration from techniques.
- **Yaw.** ω = v/R·S_input·K_grip. K_grip drops sharply in a drift, so the body heading turns fast while the velocity lags, which creates β.
- **끌기 (dragging).** Conditions: boosting, drifting, steering neutral, 20° ≤ |β| ≤ 35°. The β-restoring force is converted into forward speed, v += K_drag·Δt, reaching 290+ km/h.
- **톡톡이 (tap boost).** While dragging, tap the corner-direction key every 0.1–0.2 s. Each tap gives a yaw pulse and amplifies a_inject. The cap lifts to about 300–305 km/h.
- **Post-boost decay (core).** On the tick a boost expires, apply 0.5 s of near-critical exponential bleed: v ← v_target + (v − v_target)·e^(−k·Δt).
  - v_target is 205 km/h with ↑ held, 0 with ↑ released.
  - A new boost, an instant boost (순부) or a drift cancels the bleed immediately.
- **Cutting.** Counter-steer past a threshold while drifting gives a forced yaw restore: β → 0 and the drift ends.
- **Reverse gauge.** Boosting, drifting and counter-steering fills the gauge at BaseRate × 3.
- **고속턴 (brake drift turn).** Brake tap during a drift:
  - held < 0.15 s: ω_yaw × 2;
  - held ≥ 0.18 s: spin-out, v ← 20 km/h.
- **Gears.**
  - N (no keys): slows gradually; at exactly 0 the kart is STOPPED.
  - ↓ while moving forward: strong braking.
  - At 0 with ↓ still held: reverse, accelerating to −65 km/h.

## 1. Speed scale (user decision: rescale the speedometer only)
- The display uses `KMH_PER_MPS = 205/34` (≈ 6.0294). Internal physics stays calibrated: vGrip 34 m/s reads 205 km/h.
- `vBoost` was scaled ×(45.11/44.4). Balance is 45.11 m/s (272 km/h); per body: speed 45.72, neon_blade 45.92, drift 44.50.
- Spec km/h values converted to m/s:

  | Spec | m/s |
  |---|---|
  | 290 km/h | 48.10 |
  | 300 km/h | 49.76 |
  | 305 km/h | 50.59 |
  | 20 km/h | 3.317 |
  | 65 km/h | 10.78 |

- Tests that check the old, validated gap-2 numbers keep those numbers on the old scale with `KMH_GAP2 = 5.4`. Physics outside the new laws is unchanged.

## 2. New shared constants (`kart/params.ts` `SHARED`)
Units are m/s, m/s², s⁻¹ and ticks (60 Hz). `core/math.ts` `SIN` gains:
- `d18 0.3090169943749474`
- `d20 0.3420201433256687`
- `d35 0.573576436351046`
- `d37 0.6018150231520483`

| Key | Value | Meaning |
|---|---|---|
| vReverse | 10.78 | reverse cap (65 km/h; was 10) |
| aReverse | 8 | reverse acceleration (`−aReverse·(1−r²)`) |
| revEngageTicks | 6 | ticks of ↓ at STOP before R engages |
| zeroLockGt | 4.2 | zero-lock only where the tangential gravity is ≤ this (about a 15% grade) |
| postTicks | 30 | bleed duration (0.5 s) |
| kPostHold | 6 | bleed rate toward the non-boost target with ↑ held (95% in 0.5 s) |
| kPostRel | 0.7 | bleed rate toward 0 with ↑ released, never weaker than the held rule |
| aDrag | 5 | drag injection (K_drag) |
| etaDrag | 1.0 | lateral-scrub retention while dragging (the restoring force goes into forward speed) |
| dragCapMul | 1.0662 | drag cap = vBoost·1.0662, on planar \|v\| (290 km/h on Balance) |
| tapCapStep | 0.01839 | +cap per streak step: streak 1/2/3 → 295/300/305 km/h (Balance) |
| tapStreakMax | 3 | |
| tapYaw | 0.7 | rad/s yaw pulse per valid tap (M5 fix: was 0.4; see the tap grace in §4.4) |
| tapAccelMul | 2 | injection multiplier inside the tap window |
| tapTicks | 8 | injection window after a valid tap |
| tapGrace | 8 | in-direction steer is tolerated this long after a valid tap, and steers like neutral (§4.4, §4.6) |
| tapMinGap, tapMaxGap | 6, 12 | valid tap rhythm (0.1–0.2 s) |
| dragNeutral | 0.3 | \|sIn\| below this counts as neutral steering |
| dragEnterLo, dragEnterHi | SIN.d20, SIN.d35 | drag entry window for sb = sin β |
| dragExitLo, dragExitHi | SIN.d18, SIN.d37 | drag exit hysteresis |
| cutSteer | 0.7 | counter-steer magnitude (sIn ≤ −0.7) |
| cutTicks | 2 | consecutive ticks needed for a cut |
| etaCut | 0.8 | share of the lateral speed kept along the heading on a cut |
| revGaugeMul | 3 | reverse-gauge multiplier |
| brakeTurnTicks | 8 | brake ticks 1..8 in a drift rotate the heading ×2 |
| brakeTurnMul | 2 | |
| spinTicks | 11 | brake held ≥ 11 ticks (≥ 0.183 s) in a drift spins out |
| spinSpeed | 20 / (205/34) = 3.317073 | planar speed after a spin-out |
| spinStunTicks | 15 | stun after a spin-out |

Decay factors per tick come from `decayF(k, DT)` (`core/math.ts`); never `Math.exp`.

## 3. Definitions
- **boosting** = `boostTicks > 0 || startTicks > 0`, of any kind: gauge, team, item turbo, pad or start. Item-effect targets (`mods.vTarget`: overclock, slingshot, tether) do not count.
- **sb** = sin β toward the drift side = `−driftDir·wl/v`, where wl = v·l and l = n × f. **sIn** = steer·driftDir: + is into the drift, − is counter-steer.
- **Tap edge in the drift direction**: `Edge.TAP_L` for driftDir = +1 (left) and `Edge.TAP_R` for −1. Under `mods.steerInvert` (Mirror Mode) the bits swap. The client raises TAP_L/TAP_R on every press of a steer key.

## 4. Per-tick algorithm (additions to `kartDynamics`, in order)
1. **Timers.**
   - Read `wasBoost = boosting` before the decrements.
   - Then decrement as before and decrement `postTicks`.
   - If `wasBoost` and now `boostTicks === 0 && startTicks === 0`, set `postTicks = P.postTicks`. This triggers on **natural expiry only**. Cancellations (hard wall hit, hard CC, respawn, start-boost throttle release) zero the timers outside this point, and they also zero `postTicks`.
2. **Brake counter (control branch).** `brakeTicks = brk ? min(255, brakeTicks + 1) : 0`. Drift entry resets the technique fields and sets `brakeTicks = brk ? 1 : 0` and `postTicks = 0`.
3. **K3 brake turn, spin-out and taps** (while drifting, after entry and double-drift handling).
   - `brakeTicks ≥ spinTicks` → **spin-out**:
     - end the drift with no instant window;
     - reset the technique fields;
     - cancel the active boost: emit boostEnd if boostTicks > 0; set boostTicks, boostKind, startTicks, instTicks, instWindow and postTicks to 0. Stored boosters are kept;
     - `stunTicks = spinStunTicks + 1`;
     - emit `spinOut`. Planar speed is set to `spinSpeed` at the end of the tick (step 9).
   - `1 ≤ brakeTicks ≤ brakeTurnTicks` → **brake turn**: this tick's heading rotation (K5) is ×`brakeTurnMul`. Emit `brakeTurn` when `brakeTicks === 1`. Ticks 9–10 are plain drift braking.
   - **Taps** (only while `dragTicks > 0`):
     - `tapGap` saturates at 255.
     - On an in-direction tap edge (not locked):
       - gap > tapMaxGap → streak 1;
       - tapMinGap ≤ gap ≤ tapMaxGap → streak + 1 (max 3);
       - gap < tapMinGap → streak 0 (mashing is invalid);
       - then `tapGap = 0`.
     - A valid tap (streak > 0) adds `yawRate += driftDir·tapYaw` and emits `tapBoost{streak}`.
4. **K4 tap grace and K5.**
   - **Tap grace** = `dragTicks > 0 && tapStreak > 0 && tapGap ≤ tapGrace`. Inside it, in-direction steer counts as neutral for the drift laws: the K4 yaw target uses `min(sIn, dragNeutral)` in place of sIn (`rT = driftDir·(y0/(1 + t/y0T) + y1·min(sIn, dragNeutral) + y2·DRIFT)`). The cut, the drag's steerOk and the reverse gauge keep the raw sIn.
   - Why: a keyboard tap is a press of several frames that the client smooths (`x += (target − x)·0.6` per frame). With the full y1·sIn the press drove β past dragExitHi in about 5 ticks, so only 1–3-frame presses kept the drag. With the grace and tapYaw 0.7, keyboard taps every 8–12 frames held 2–5 frames all keep the drag at 305 km/h (Balance: 21 of the 24 gap 6/8/10/12 × hold 1–6 cases, against 13 before; the misses are 4–6-frame holds at the fastest gap, 6).
   - **K5.** `rotateForward(yawRate·DT·(brakeTurn ? 2 : 1))`.
5. **K7b cut, reverse gauge and drag** (after the u/wl/vn decomposition and slope gravity).
   - **Cut.**
     - `counterTicks = sIn ≤ −cutSteer ? +1 : 0`.
     - `cut = counterTicks ≥ cutTicks && !(boosting && driftHeld)`.
     - On a cut: `if (u > 0) u += etaCut·(v − u)`, `wl = 0`, `yawRate = 0`, and emit `cut`. The velocity is aligned to the heading and β becomes 0. The drift ends this tick (K11) through the normal exit path, including the instant-window rule.
     - While boosting, counter-steer with DRIFT held is the reverse gauge, not a cut. Releasing DRIFT cuts.
   - **Drag.**
     - `steerOk = sIn > −dragNeutral && (sIn < dragNeutral || (tapStreak > 0 && tapGap ≤ tapGrace))`.
     - `ok = !cut && boosting && throttle held && !brk && grounded && steerOk`.
     - **Enter** when ok and sb ∈ [dragEnterLo, dragEnterHi]: `dragTicks = 1`, streak 0, gap 255, emit `drag{on:true}`.
     - **Stay** while ok and sb ∈ [dragExitLo, dragExitHi]; `dragTicks` saturates at 255.
     - **Otherwise end the drag**: dragTicks 0, streak 0, gap 255, emit `drag{on:false}`.
6. **K8.** While dragging, drift retention η = `etaDrag` (1.0). Inside the tap grace (§4.4) the lateral-damping band is chosen with `min(sIn, dragNeutral)`, which is the neutral band (kLatNeutral).
7. **K11.**
   - Reverse gauge: the drift gauge gain is ×`revGaugeMul` while boosting and sIn ≤ −0.3.
   - The exit condition gains `cut`.
   - Every drift end also ends the drag and resets the technique fields. This covers the six external reset sites: wall impact, hard CC, tether, rail capture, warp, respawn.
8. **K14/K15 laws.**
   - **Drag law** (dragging, throttle held, boost law active):
     - injection `aI = aDrag·(tapStreak > 0 && tapGap < tapTicks ? tapAccelMul : 1)`;
     - cap `vCap = vBoost·(dragCapMul + tapCapStep·tapStreak)·surf.vMul·conveyor·capMul`, limited by the slow cap;
     - the cap applies to **planar |v| = √(u² + wl²)**: `u += max(boostLawA, aI)·DT`, limited so that √(u² + wl²) ≤ vCap. Above the cap: `−kOver·(|v| − vCap)`.
     - K16 drift drag is skipped while dragging.
   - **Post-boost bleed** (`postTicks > 0`).
     - Cancelled permanently (postTicks 0) on any tick with a boost law, which includes `mods.vTarget`, or `drift === 1`, or `instTicks > 0`.
     - Target = the K14 non-boost vT: draft, surface, conveyor, capMul, slow cap.
     - ↑ held and u > vT: `u ← vT + (u − vT)·decayF(kPostHold)`.
     - ↑ released: `du = min((vT − u)·(1 − decayF(kPostHold)), −u·(1 − decayF(kPostRel)))`. That is, toward 0, never weaker than the held rule.
     - Brake during the bleed uses the stronger deceleration.
   - **Gears.** The state machine runs before the longitudinal law.
     - ↑ → D.
     - ↓ with u > 0.5 → D with strong braking (aBrake 24, or aBrakeDrift 14 while drifting).
     - ↓ with u ≤ 0.5:
       - not in R → STOP: hold u = 0, and `brakeTicks` restarts at the STOP transition;
       - after `revEngageTicks` → R: accelerate `−aReverse·(1 − (−u/vReverse)²)` toward −vReverse.
     - No keys: D → N, coasting at aCoast 2.5.
     - N or R reaching u = 0 with tangential gravity ≤ zeroLockGt → STOP. In STOP with no ↑ on such a grade, u = wl = 0 (zero-lock).
     - ↑ in R → D (the forward law brakes the backward motion).
     - Emit `gear{gear}` on every change.
     - In the air: no gear change. The drag ends, the cut counter is reset, and the bleed is cancelled by any boost, drift or instant boost.
9. **Spin-out speed** (end of the tick). Scale (u, wl) so that √(u² + wl²) = spinSpeed.

## 5. Acceptance (`packages/sim/test/techniques.test.ts`, all "physics: …")
| # | Area | Must hold |
|---|---|---|
| 1 | Display | 34 m/s reads 205.0 km/h; booster plateau reads 272 ± 0.5. |
| 2 | Coast and zero-lock | Coast from 20 m/s reaches exactly 0, then STOP and position frozen. Zero-lock holds on a 10% grade; on a 20% grade the kart rolls. |
| 3 | Gears | Brake to 0, STOP, R after 6 ticks, reverse capped at −10.78 m/s (65.0 ± 0.3 km/h). ↑ in R → D. |
| 4 | Post-boost bleed | Per-tick factor `decayF(6)` toward vGrip; \|v\| at +30 ticks ≈ 34.55. Release rule as in §4.8. Cancelled by drift, booster or instant boost. A 60° wall hit before expiry gives no bleed. |
| 5 | Drag | Entry and exit events fire. \|v\| rises to 48.10 m/s (290 km/h) at most. No drag without boost, without ↑, with brake, or with in-steer held and no tap. A sustained neutral drag entered near β 30° reaches at least 288 km/h. |
| 6 | Tap | Taps every 8 ticks give streak 1, 2, 3, 3; max \|v\| ≈ 50.59 m/s (305 km/h); the drag lasts at least 90 ticks. Keyboard-shaped taps (0.6 smoothing per frame) every 8, 10 or 12 frames held 2–5 frames keep the drag ≥ 150 ticks and reach 305 km/h; a key held past the grace ends the drag. Gaps of 4 ticks give no streak ≥ 2; gaps of 14 stay at streak 1; a wrong-direction tap does nothing. |
| 7 | Cut and reverse gauge | A full counter-steer cuts on its 2nd tick with \|wl\| ≈ 0 and the instant window open. Half counter does not cut. Boosting with DRIFT held: no cut, and gauge gain is ×3. |
| 8 | Brake turn and spin-out | Ticks 1–8 rotate the heading at 2·yawRate·DT; ticks 9–10 at 1×; tick 11 spins out to 3.317 m/s with the drift ended, boost cancelled and 15 ticks of stun. |
| 9 | Determinism | Bumping any `KartDrive` field changes `hashWorld`. The oracle (`test/oracle/proto2d.ts`) implements all of §4 and matches to ≤ 1e-6 m on the old logs plus six new ones: post-boost, drag, tap, cut/reverse gauge, brake turn/spin, gears. |
