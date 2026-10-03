# 17 — Reference fidelity and executable calibration

This is the current driving specification for simulation version 6. The user
explicitly prioritized the supplied video over the previous immutable map and
corner-number requirement. Preserve track themes, routes and feature order;
adjust local geometry where the calibrated driving requires clearance. Camera
and controls are in scope. Character/theme/art/audio replacements are not.

## Evidence and evaluation

`docs/research/reference-driving-evidence.md` records the source hash, frame
extraction, initialization assumptions and uncertainty. The data module contains
12 clips: four calibration and eight held-out validation clips, 257 raw key
transitions and 394 speed observations. Raw key times are never shifted to fit.
The beginner demonstration visibly uses a different kart; report it separately.

Only standing-start clips have sufficiently identified initial motion for the
absolute-speed gate. Continuations have unknown initial slip, yaw and boost
history; their errors are diagnostics, not proof of absolute fidelity. The
90-tick start duration and 180-tick normal boost duration are explicit retained
model hypotheses. Video speed integers do not determine world-space metres.

All launches start at zero speed with **zero stored boosters**. The first normal
booster must be earned by the simulated drift and consumed by the observed key.
The source has variable input-overlay latency, including a measured 100 ms
disagreement between the first expert inventory consumption and its Ctrl display.
An input release is not labeled a physically observed drift exit.

The bounded calibration searches 625 combinations of launch acceleration,
launch target multiplier, reference-kart gauge coefficient and cut response.
Only the four calibration clips participate. Identified launch speed dominates;
continuations have a low diagnostic weight and a penalty for regressions above
one percentage point. The visible first inventory award supplies a separate
timing term. Validation observations never enter the search objective.

The fitter floors its relative-error denominator at 20 km/h near rest. The public
validation gate instead uses **ordinary mean absolute relative speed error over
nonzero source samples**, with no floor. Independent tests recompute that metric
on an in-memory flat fixture rather than importing the fitter or generated assets.

| Identified clip | Before fb71b3f | Version 6 | Role |
|---|---:|---:|---|
| Expert launch | 20.675% | 5.348% | Calibration; not a held-out claim |
| Intermediate launch | 20.322% | 4.758% | Held out; passes 5% gate |
| Beginner launch | 20.557% | 4.925% | Held out; different source kart |

The held-out first inventory award and consumption each agree within 100 ms.
Some uncertain continuation errors remain larger and one repeated intermediate
sequence worsens in point error; unknown initial gauge/slip prevents attributing
that difference to the driving law. Do not present the whole recording as a
5% match. Retain the per-clip diagnostic table in the results JSON.

## Adopted physics and kart changes

The fixed 60 Hz integration, heading/velocity separation, deterministic arithmetic
and end-of-tick quantization remain. The video display scale remains 205/34:
matching changes actual acceleration and inventory timing, not only HUD numerals.

| Parameter | Before | Adopted | Behavior |
|---|---:|---:|---|
| `aStartMax` | 30 | 45 m/s² | Faster standing-start thrust |
| `startCapMul` | implicit 1 | 1.12 | Launch-only target `vBoost * startCapMul` |
| Balance `g0` | 0.7 | 1.1 | Earn the observed first booster from zero inventory |
| Other kart `g0` | original | original × 1.1/0.7 | Preserve relative archetype/body charge differences |
| `kCut` | 36 | 12 s⁻¹ | Retain lateral motion longer during counter-steering |

The normal/team booster retains priority over a simultaneously active launch.
Ordinary grip/boost caps, base acceleration, brakes, gravity, jump launch speeds,
surface properties and collision dimensions have no new evidence requiring a
change in this iteration. They remain candidates for future evidence, not frozen
goals. The nine-tick repeat-kick guard remains; raw re-press scenarios pass it.

Finite recovery uses the version-5 algorithm with the new coefficient:
`response = kCut * clamp((vGrip / max(planarSpeed, 1))³, 1, 4)`. Apply surface
grip to lateral damping and preserve `etaCut=0.8`; yaw relaxes with the same
response. Final alignment occurs only inside the existing six-degree exit band.
The independent oracle and AI lookahead model implement the launch target and
recovery rules. SIM_VERSION 6 rejects older ghost/online trajectories; no packet
or persistent world-state field was added.

## Actual game replay and camera

`InputActionFilter` is shared by keyboard events and annotated raw-key playback.
Replay compilation maps one 30 Hz source frame to two 60 Hz ticks. Input lookup
is tick-addressable and seek-safe; it never re-emits an edge because a frame is
rendered twice. Default boost behavior is one press, as in keyboard settings.

The development-only offline reference session seeds authority once before the
first snapshot. RaceRoom, its binary snapshot, NetClient prediction, ordinary
events/HUD and RaceRenderer then execute normally. Reference playback cannot be
combined with online mode, autopilot or another provider. The fixed allowlisted
`reference_pad` asset is never added to the shipped track roster.

Capture mode disables the real-time pump, advances exactly two ticks, and updates
the real camera/renderer by 1/30 s per saved image. Native Chrome real-time video
is a separate check, with actual submitted frame count and wall time reported.
The resulting comparison does not stretch time or reset velocity during playback.

The calibrated chase rig uses distance 6.2 m, height 2.1 m, near look-ahead 0.5 m
and look height 0.1 m; base vertical FOV is 66° with ordinary/boost/overspeed cues
4°/7°/2°. Heading response is 7/s with 45% velocity-heading contribution, plus
bounded 0.08 slip look and 0.25 m swing. This moves the kart from approximately
0.65 to 0.49 of viewport height; reference straight framing is about 0.48.
At the standing launch the camera starts 3.8 m closer with 1.2 m additional
look-ahead, then releases that framing continuously as real speed approaches
45 m/s. This reproduces the source's close launch view and subsequent pull-back;
ordinary boosting does not trigger the launch zoom.
Normal play establishes this close view during the countdown, so GO does not
first pull the camera inward from an already initialized cruising view.
Frame-by-frame physics hashes remain identical when only the camera changes.
The legacy camera is selectable only in a development reference run.

## Local map adjustments and verification

- Aurora Summit: the 68 m ski run-up widens 13→15 m after the serac S; the jump
  restores 13 m. This clears a new residual-slide contact near station 1493.6 m.
- Sunstone Bazaar: awning entry bend and the first 45 m of its following
  straight widen 9→11 m, then restore 9 m. Route lengths and the centerline remain.
- Manor Catacombs: the bookcase moves laterally 4→4.5 m and its across-road
  footprint narrows 6→5 m, keeping the same timed press and a clearer center pass.
- Sunset Arena Rally: the first 80.0406 m of the service-road branch widens
  8→10 m through its R30 bend and 12 m exit. The remaining 68.6625 m returns to
  8 m. This removes an independently reproduced, unhit branch-corner wall/reset.
- Belltower Piazza: the 30 m plaza feeds a 28 m exit bend, then a 24 m first
  half of the descending straight before returning to 16 m. The 40 m straight's
  elevation change remains −2 m. This avoids a retreating road edge before a
  displaced kart has time to return from the broad plaza to the ordinary road.

Only those five physical track files change; 16 shipped `.ctrk` outputs remain
byte-identical. Their golden entries are regenerated and independently rebaked.
The compiler reads `SHARED.aBrake`, and its cache fingerprint includes kart
parameters so future brake calibration cannot reuse stale approach tables.
Canonical golden entries, including the global external fingerprint, are regenerated
after independently rebuilding the baseline and candidate with the same default
compiler profile. This restores the existing golden assertions instead of relying
on their stale-input skip. The baseline already had 18 stale entries (14 roster
tracks and four fixtures); refreshing them does not imply 18 additional map edits.
Cached visual assets built with different AO/PVS profiles are not compared as if
they used identical compiler options.

The matrix covers 21 tracks × speed/item × solo/eight racers × seeds
4242/2026/7301: 252 races, 1,134 kart starts. Version 2 explicitly enables the item
brain and counts actual item uses and opponent hits. The older pickup-only matrix
is not evidence of combat robustness. Source-tree fingerprints before and after
each full run must match; a changed source invalidates its certificate.

| Actual-combat matrix metric | fb71b3f baseline | Adopted candidate |
|---|---:|---:|
| Finishers / kart starts | 1,134 / 1,134 | 1,134 / 1,134 |
| Hard wall contacts | 51 | 38 |
| Respawns | 9 | 15 |
| Maximum no-progress ticks | 302 | 183 |
| Items used | 3,191 | 3,166 |
| Effect hits on opponents | 2,042 | 1,867 |

The adopted candidate has zero speed-mode respawns, solo hard contacts, missed
gates or missed finishes. Its 15 respawns occur in item packs. Traces identify
attack/pile-up chains before jumps in Sunstone and Pumpkin, but also remaining
recoverable behavior: Aurora's post-stun traffic coast can starve a jump approach.
Belltower's displaced-line failure at the narrowing exit is repaired by the local
width transition. The remaining incidents are not all unavoidable attacks.
**The no-new-unintended-respawn
completion criterion remains unmet.** The matrix deliberately exits nonzero on
these review flags; do not weaken its gates to certify the result.

A bounded post-control-loss steering candidate fixed the local Belltower example
but increased global item respawns 16→18 and maximum no-progress ticks 184→213.
It was rejected and the exact preceding driver restored. Its local improvement
is not included in the delivered behavior. No map-index-specific AI behavior,
invulnerability, state teleport, or weakened respawn threshold is used.

Further causal review found two existing lane-planner issues: the own lookahead
travel is subtracted twice from a predicted gap, and a minimum-gap cost floor can
be returned as an actual closing speed. Correcting the projection alone increased
the full matrix to 57 hard wall contacts / 27 respawns / 344 no-progress ticks.
Correcting only the signed closing return, including a bounded earlier-braking
trial, also exceeded the unchanged pack-contact test. These candidates and their
new tests were rejected together; **neither lane-planner correction is shipped**.
They require coordinated lane-execution work rather than a safe isolated patch.
The narrow Aurora gap trial also retained its reset and added a solo hard contact,
so its original 10 m gap / 60 m landing were restored. Belltower's local exit
clearance is the retained physical repair, separately verified against the old
centerline and elevation.

The retained AI changes reduce booster waiting 0.6→0.4 s, change Rookie's speed
multiplier 0.93→0.97 while keeping its mistakes/reaction delays, avoid traffic
coast below 6 m/s, and start collision braking at 0.45 rather than 0.35 s TTC.
Mirror compensation uses the tick at which delayed controls will execute, with
separate start/expiry tests; ordinary item decisions still use present time.
Homing projectile route-height correction retains its 20% response but caps a
large airborne-launch transient at 0.75 m per tick, preventing a measured snap.

Legacy corner numbers are changed only where the new law intentionally changes
them. Launch distance is checked against independent integration to 0.05 m.
Gauge integration is normalized by `g0`; the R9 input plan is retimed while
retaining zero contacts and the same speed/time tolerances.

The Linux `/proc/self/mem` stream-failure fixture is explicitly skipped on macOS;
Linux still runs the original assertion. Orbital homing-feature coverage uses
three guaranteed shots across the loop, low-gravity tube and helix, in addition
to all three random races, so a different AI battle cannot silently remove feature
coverage. Impact, no-fizzle and the existing geometric limits are still asserted.

## Executed presentation checks and remaining limits

Final verification on the restored runtime and five accepted maps: **836 tests
pass, 61 skip, zero fail**. The skipped set includes the explicitly Linux-only
HTTP fixture on macOS. Canonical golden verification additionally passes all
32 focused compiler build tests with no stale-input notices. Frozen contracts,
dependency boundaries, TypeScript, ESLint, all-track bake/validation and production
build pass. The two original production browser E2E tests pass in 47.8 s with
only the missing favicon request intercepted.

Eight actual browser sequences (four clips, independent baseline and candidate)
match all 1,536 corresponding Node world hashes. Their deterministic captures use
exactly two ticks per 30 Hz image. Chrome's separate real-time launch submitted
171 frames over 3.063 s, approximately 55.5 fps under the measured local load.
Native keyboard testing additionally exercised acceleration, left/right drift,
counter-steer, re-entry, earned inventory and booster use through the normal UI.
Reference query parameters are ignored by the production build.

Camera framing is visually compared at 4:3; tests cover 4:3 and 16:9 projection,
30/120 Hz response, launch pull-back, angle wrapping, warp reset and reduced motion.
The source cannot uniquely identify world-space slip, camera heading lag, absolute
vehicle dimensions or booster duration. The framing is a bounded visual match,
not a measured all-clip camera-error pass. These uncertainties and diagnostic
continuation regressions remain explicit in the per-motion report.

## Reproduction

From the repository root:

```sh
pnpm gen
pnpm bake
node tools/reference/build-fixture.ts
node tools/reference/measure.ts /tmp/reference.json
node tools/reference/measure.ts /tmp/reference-before.json --overrides '{"aStartMax":30,"startCapMul":1,"g0":0.7,"kCut":36}'
node tools/reference/calibrate.ts /tmp/calibration.json
node tools/reference/map-matrix.ts /tmp/maps.json
DEV_PORT=5202 SERVER_PORT=8802 pnpm dev
```

In another terminal:

```sh
node tools/reference/capture.mjs 'http://127.0.0.1:5202/?referenceTrack=reference_pad' expert-launch /tmp/capture 92 960 720
node tools/reference/realtime.mjs 'http://127.0.0.1:5202/?referenceTrack=reference_pad' expert-launch /tmp/realtime
```

The local source file is needed only for extraction/composition. macOS
AVFoundation tools are included; Chrome canvas recording needs no bundled FFmpeg.
`compose.swift` combines source footage, actual baseline/candidate game captures,
raw-key labels and their speed curves. Raw footage and media outputs stay local.

For a genuinely independent baseline capture, extract `git archive fb71b3f` into
a fresh directory and install its locked dependencies offline. Workspace `@cr/*`
links must resolve inside that directory, not into the current checkout. Copy
only the current capture instrumentation listed below into the archive; retain
all baseline simulation, kart and track sources:

```text
apps/client/src/game/Session.ts
apps/client/src/game/HudPresenter.ts
apps/client/src/net/localAuthority.ts
apps/client/src/render/RaceRenderer.ts
apps/client/src/render/camera/ChaseCamera.ts
apps/client/src/input/actionFilter.ts
apps/client/src/dev/reference/
packages/content/src/reference-driving.ts
tools/reference/
```

Run generation, baking and `build-fixture.ts` inside the archive. Start its own
development ports, then pass `referenceCamera=legacy` to the capture URL. This
selects the preserved old camera profile; it does not override physics. The
independent baseline's `measure.ts` report must use **no parameter overrides**.
The results reporter verifies that all its stored speeds/world hashes equal the
four-parameter reconstruction above before reporting a baseline comparison.

```sh
node tools/reference/report.ts --before /tmp/reference-before.json --after /tmp/reference.json --independent-before /tmp/baseline-independent.json --map-before /tmp/maps-before.json --map-after /tmp/maps.json --rejected /tmp/rejected-recovery.json --browser-parity /tmp/node-browser-parity.json --review /tmp/causal-review.json --output /tmp/reference-driving-results.json
```

The independent baseline needs the same version-2 matrix observation harness
(`ai/balance.ts` and `map-matrix.ts`) to enable item decisions and count combat;
this instrumentation must not copy the candidate driver, avoidance, physics or
kart data. The matrix fingerprints those runtime sources and all baked inputs.
Review JSON describes inspected causal traces; it is an annotation input, not an
automatic assertion that every nearby item effect caused a reset.
