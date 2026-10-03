# 16 — Reference-video driving refinement

**Historical first pass (simulation version 5).** The user subsequently prioritized
reference fidelity and authorized localized map, kart, physical and camera changes.
`17-reference-fidelity.md` supersedes this document's preservation requirements,
coefficient choices and old comparison table. The observations below remain useful
evidence; the new frame-level annotations refine their timing.

This amendment refines transient controls in `15-driving-techniques.md`. The
track envelope, kart statistics, speedometer scale, acceleration, grip steering,
gravity, collision, surfaces, jumps, rails and warps remain unchanged. It takes
precedence over the instantaneous cut and unrestricted repeat-kick rules only.

## Evidence and limits

Reference: the user-supplied `원작 카트라이더.mp4`, 338.035 s, 1920×1080,
30 frames/s. Times below are file times, not the in-game race clock.

- 14.2 s: Shift + right enters a right drift. Shift is released at 14.3 s;
  the kart remains rotated with trails while steering is neutral at 14.4–14.6 s.
  Left counter-steering at 14.7–14.8 s is followed by neutral and right steering;
  cornering persists while the HUD recovers from about 263 to 290 km/h.
- 17.1–17.2 s: Shift + left; Shift released by 17.3 s. Right counter-steering
  at 17.9–18.2 s corrects the left drift without an abrupt visible stop.
- 19.9–20.1 s: Shift + right; Shift released for 20.2–20.4 s while right
  stays held; Shift + right again at 20.5–20.6 s shows a spaced repeat input.
- 11.8–13.8 s contains an opposite-direction drift sequence and acceleration
  recovery, not a controlled standing-start or pure counter-steering experiment.

The overlay makes input order observable, but its latency is unknown. Camera
motion and perspective prevent recovering an exact world-space slip angle,
force, yaw rate, or original source algorithm. HUD speeds depend on the original
kart, mode, boost and display scale. Do not copy those speeds into track-space
physics. The recovery rates below are engineering calibration choices tested
against existing tracks, not measured original-engine constants.

## Cut recovery (K7b, before ordinary lateral damping)

Keep the existing full-counter threshold (`sIn <= -0.7`) and two-tick debounce.
Boosting with Shift held still uses reverse gauge and does not cut.

Once the debounce qualifies, recover gradually:

1. Let `v = sqrt(u*u + w*w)`, `ratio = vGrip / max(v, 1)`, and
   `recovery = kCut * clamp(ratio * ratio * ratio, 1, 4)`, with `kCut = 36 / s`.
   Use `wNext = w * decayF(recovery * surf.grip, DT)` and
   `raw = sqrt(u*u + wNext*wNext)`. Slow hairpins catch faster than fast
   sweepers, preserving the existing R9/R12/R16 corner acceptance plans.
2. If `raw > 1e-6`, scale `(u, wNext)` by
   `(raw + etaCut * (v - raw)) / raw`; otherwise keep `wNext`.
   This preserves the existing `etaCut = 0.8` momentum-retention policy and
   cannot inject planar energy. Normal velocity and position are untouched.
3. Damp yaw by `decayF(recovery, DT)` rather than resetting it on qualification.
4. Finish the cut only when `abs(w) <= exitSin * sqrt(u*u + w*w)`, checked
   after recovery and again after ordinary K8 tyre damping.
   Then apply the existing final alignment (`u += etaCut*(v-u)` when u > 0,
   `w = 0`, `yaw = 0`), emit exactly one `cut`, and end through the existing
   K11 exit/instant-boost qualification path.
5. If the driver releases full counter-steer before alignment, the extra
   recovery stops. Ordinary drift damping continues. Surface grip still applies.

No new persistent state is needed: `counterTicks` is already serialized.

## Repeated drift presses

The first double-drift still requires at least nine ticks in the drift. A
successful re-kick also sets `reDriftLock = rekickMinTicks` (nine ticks), and
later re-kicks require that timer to reach zero and the kart not to be stunned.
This prevents two-tick Shift
mashing from accumulating unbounded yaw impulses. Drift duration and gauge
fatigue are not reset. Ending a drift still sets the usual six-tick entry lock.
The existing serialized `reDriftLock` therefore covers both entry and re-kicks.

## Client controls

Preserve the 60 Hz keyboard response (`0.6` approach per 1/60 second) using
elapsed time instead of the number of render callbacks. A release or reversal
uses the same time response. Preserve queued input edges between simulation
ticks. Clear driving input and filter state when the race relinquishes focus.
Default analog triggers keep their magnitude; a separate digital binding can
still request full throttle or braking.

## Compatibility and acceptance

- Bump `SIM_VERSION` for changed physical trajectories; keep the wire layout.
  Update the AI lookahead model and the independent flat-plane oracle from this
  specification. Old ghosts must remain rejected by the existing version gate.
- Preserve existing acceleration, speed caps, corner-envelope tolerances,
  kart balance, wall, slope, jump, rail, surface, and race acceptance tests.
  Do not loosen track tests or change track data to accommodate the refinement.
- Add behavioral checks for finite cut recovery, one exit event, no energy
  injection, both steering directions, low grip, interrupted recovery, reverse
  gauge, repeated-kick spacing, and prediction/rollback during recovery.
- Verify keyboard time response at 30/60/120/144 Hz and analog pedal magnitude.
- Compare unchanged `.ctd`, `.ctrk`, `.vis`, kart and track-content hashes and
  run races over the complete shipped roster.

## Measured map compatibility (2026-10-03)

Rebaking preserves every `.ctd`, `.ctrk`, `.vis`, kart and track-content byte
in the comparison (104 files including indexes/golden data). Generated
`.meta.json` files include elapsed bake timings and are not byte-stability gates.

Baseline: commit `bc256fd`. Candidate: simulation version 5. Both use the
same baked track bytes, seed 4242, one lap, one Legend bot, clay/pebble,
no personality jitter, and the room-style eight-tick lookahead. This is a
controlled regression comparison, not a player-skill or all-seed guarantee.

Reproduce the candidate after `pnpm gen && pnpm bake` with:

```sh
node tools/bench/reference-driving.ts /tmp/driving.json
```

All 21 tracks finish before and after, with zero hard impacts, respawns or
spin-outs. Soft wall contacts total 7 → 6. Median time change is
+0.0000%; the largest increase is 2.969%. The existing
90°/180° R9/R12/R16 corner tests retain their original bounds.

| Track | Before (s) | After (s) | Change |
|---|---:|---:|---:|
| aurora_summit | 110.839 | 110.328 | -0.461% |
| belltower_piazza | 38.443 | 38.142 | -0.781% |
| cascade_slalom | 57.379 | 57.341 | -0.067% |
| coral_cove_docks | 38.143 | 38.143 | +0.000% |
| fernwood_hollow | 37.336 | 37.336 | +0.000% |
| geode_rail_quarry | 41.766 | 41.766 | +0.000% |
| kraken_lighthouse | 40.050 | 40.047 | -0.008% |
| magma_switchback | 57.110 | 57.842 | +1.281% |
| manor_catacombs | 54.788 | 55.314 | +0.961% |
| meadow_loop | 38.163 | 38.163 | +0.000% |
| orbital_express | 110.522 | 113.645 | +2.826% |
| proving_ring | 19.750 | 19.750 | +0.000% |
| pumpkin_lane | 36.984 | 36.982 | -0.006% |
| rainline_blvd | 39.211 | 39.253 | +0.108% |
| sandglass_canyon | 56.601 | 56.518 | -0.148% |
| skyway_interchange | 57.441 | 57.528 | +0.152% |
| snowglobe_halfpipe | 36.749 | 36.751 | +0.005% |
| spark_grand_circuit | 41.362 | 41.362 | -0.000% |
| sunset_arena_rally | 53.631 | 55.224 | +2.969% |
| sunstone_bazaar | 41.743 | 41.743 | +0.001% |
| token_foundry | 40.352 | 40.320 | -0.079% |

Reference video SHA-256: `af4ad63b07786412742068a0ff9c239f738730532cd7ced0acfdb241aa1e16a9`. The video and its extracted frames are
local analysis inputs and are not included in the repository.
