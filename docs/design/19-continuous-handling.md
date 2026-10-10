# 19 — Continuous handling and stronger traction (simulation 10)

This amendment follows the play-test requests after simulation 9. It supersedes
the impulse steering, fixed brake-spin technique, speed targets and video-speed
acceptance pins in documents 15–18 where they conflict. The supplied recording
and its annotations remain comparison evidence; matching its 205/272 km/h HUD
values is no longer the acceptance target after the explicit speed reductions.

The intended result is a controllable kart whose nose and actual travel direction
change continuously. One held Shift negotiates a U-turn; repeated presses tighten
the curve progressively; a short press produces a real, interruptible skid after
release. Counter-steering and braking take priority. These are arcade handling
laws, not a claimed reconstruction of the original game's source or tyre model.

## Physical speed and propulsion

- Every kart's ordinary top speed and base thrust are 85% of their simulation-9
  values. Relative kart roles are retained. Balance/pebble is **28.9 m/s**.
- The first requested 15% boost reduction and the later additional 15% reduction
  compound: boost targets are 72.25% of their old values. Pebble is
  **32.591975 m/s**. The HUD conversion remains `205 / 34`; these physical speeds
  therefore display about **174.25 / 196.51 km/h**. The speedometer is not the fix.
- Boost response is `1.8 * (target − forwardSpeed)` with an 8.5 m/s² thrust cap;
  ordinary propulsion remains a floor where it is stronger. Start boost caps at
  20 m/s² and the same boost target. There is no higher launch target.
- Team, drag and tap propulsion do not exceed the kart's boost cap. Positive
  motor work is bounded by **planar velocity magnitude**, so lateral speed cannot
  provide an extra motor-driven overspeed. Existing gravity/inertia is not
  instantaneously clamped. Slingshot and tether use the reduced targets too.
- Chaining extends the running timer without an artificial pause or a restarted
  acceleration delay. Durations and stored-booster capacity are retained.

On a flat road, a pebble starting at ordinary top speed reaches 30.0305, 31.1113,
31.9978 and 32.5762 m/s after 0.2, 0.5, 1 and 3 seconds of boost respectively.

## Steering, Shift and recovery

The chassis heading remains separate from the velocity vector. No Shift action
adds a fixed heading angle or instantaneous yaw impulse, and drift completion
does not delete lateral velocity or zero the requested yaw.

The seven additional authoritative drive fields are:

| Field | Meaning |
|---|---|
| `driftArmed` | One fresh held press waiting for a direction or sufficient entry speed |
| `driftIntentTicks` | 36 physical ticks of minimum skid intent after an accepted press |
| `driftEngagement` | Continuous grip/drift blend, 0–1 |
| `driftTarget` | Requested tightening, 0–1 |
| `driftTightness` | Smoothed tightening, 0–1 |
| `driftRecovering` | 0 sustained; 1 release/brake recovery; 2 counter-steer priority |
| `pendingDriftDir` | One fresh directional press retained during recovery |

A fresh Shift enters at forward speed ≥10 m/s. A press before the direction can
arm while the key stays held. The raw requested direction selects the entry;
filtered steering still controls the continuous motion. Stale filtered steering
of the old sign cannot immediately cancel a newly requested direction.

Holding Shift sustains the turn. A 20, 50 or 100 ms press also sustains its physical
intent for 36 ticks, then eases out. This clock continues in the air. It is not an
uninterruptible animation: counter-steering, braking, impact/reset, hard CC,
attachments and finish cleanup can cancel the intent. Counter-steering works
while Shift and/or a booster remain active. A held key cannot automatically
restart a completed drift; a fresh request during recovery is consumed once.

Each same-direction press raises `driftTarget` by 0.25, capped at 1, and refreshes
the 36-tick intent. `driftTightness` moves toward that target at at most 2/s.
Engagement rises at 3.5/s, releases at 4/s, and unwinds under counter-steer at 10/s.
The input FIFO is consumed in order, so multiple real presses in one physics tick
are distinct target changes rather than a single coalesced edge.

For signed steering `s`, forward speed `u`, engagement `e` and tightening `t`, the
drift yaw target is `s * (2.1 + t) * max(u,0)/(max(u,0)+3)` rad/s. It blends with
the existing speed-dependent grip target by `e`. The target error is filtered by
0.25 per 60 Hz tick (0.5 during counter-steer), then bounded to **5.5 rad/s²**
angular acceleration (**24 rad/s²** while unwinding). Heading changes only by
integrating that resulting yaw rate. Counter-steer may respond faster than entry
without snapping the chassis.

Braking cancels skid intent and restores grip while reducing speed. There is no
ordinary 11-tick automatic spin, 15-tick control blackout, or 2× heading injection.
Up+Down uses the brake, including at zero speed; it cannot oscillate between a
small forward acceleration and a stop. Item/hazard spin effects remain separate.

## Traction and preserved rewards

The user judged the first gentler-yaw candidate too much like ice. A 10% reduction
was consequently insufficient. Pebble now uses lateral damping **24/s in grip,
12/s in drift, and 24/s in counter-steer**, continuously blended by engagement.
The previous candidate used 18/6/9. Other kart grip roles scale proportionally;
authored surface grip modifiers still apply.

Increasing lateral grip also reduces slip-related speed loss. The reference
`cBeta` is therefore 11 rather than 2.2, while drift thrust stays capped at
2.5 m/s². Since the drag term is proportional to squared slip, the larger
coefficient keeps comparable corner resistance at the much smaller slip angle.
The kart slows naturally through a tight turn rather than retaining a large
sideways velocity, applying an unseen brake command, or steering through an AI.

With identical flat-road inputs, peak slip fell **17.89° → 8.21°** and accumulated
lateral travel in the first 1.95 s fell **12.00 m → 5.94 m**. Short Shift presses
retain a 0.85 s drift state with actual slip above 3° for 0.60 s: the kart travels
16.52 m along its path while its integrated sideways travel is only 1.81 m.
These quantities come from physical velocity and heading, not smoke or skid marks.

To preserve earned-booster and instant-boost roles under the reduced slip, the
gauge reference slip is 0.25 rather than 0.5 and the instant reward's minimum
slip is 4° rather than 8°. The minimum drift duration and throttle-press window
remain. Tests cover all eight karts with and without an active booster.

Wall impact preserves fractional gauge, stored normal/team boosters and an
already-running boost timer. Momentum/contact response still applies. A consumed
booster or normal timer expiry remains a separate event from wall contact.

## Collision movement, camera and compiler

Physics forces still advance once per 60 Hz tick, followed by two nominal movement
halves. Only when a half-displacement exceeds half the kart radius (0.425 m,
approximately 51 m/s) is movement subdivided. Ground and wall contact run after
each segment. Subsequent segments use resolved velocity, and wall-grind friction
uses the segment duration, so subdivision does not multiply gravity or friction.
Thin-wall tests at 180 and 360 m/s cover both directions and finite state.

Camera normalization uses the current kart's actual ordinary/boost targets.
Launch distance can open at the new boost speed; FOV boost contribution follows
actual speed gained between ordinary and boost targets instead of jumping to full
strength on a key press. The preserved legacy capture profile keeps its old scale.

The compiler's turn and braking budgets read current physical parameters. Its V10
boost-pad clearance uses 120 real simulation ticks from the pad exit, with no
steering and an initially running boost. Static geometry, road following, gravity,
flight, rails and warps use the game path; timed hazards retain their separate
validation. This replaces a world-space tangent ray that could run underground
on a rising road and falsely call its underside an obstacle.

## Verification and compatibility

`docs/research/handling-keyboard-scenarios.json` fixes the initial conditions and
finite digital-key schedules for 12 m wide R9/R12/R16 U-turns, mirrored left/right.
They contain one held Shift, one counter-steer, then release—no Down, repeated
Shift, pursuit controller or position correction. Completion requires passing
the arc exit by 60 m, final velocity heading within 2° of 180°, and **zero wall
contacts including severity-0 grinding**. The tests run the shared keyboard filter.

`node tools/reference/measure-handling.ts` writes `docs/research/handling-v10-metrics.json` with measured motion timings, radii, boost curves, skid distances, pass targets and a hash of the physical source files. It reuses the fixed keyboard schedules.

The focused suite also checks short-press physical skid duration, ordered bursts,
fresh direction versus filtered direction, repeated tightening, counter-steer
under boost, prolonged combined-pedal input, resource preservation, all kart
rewards, external-state cleanup and an independent planar oracle. Original video
speed/timing measurements remain diagnostics; the explicit slower-handling
requirements replace their previous 5% speed-fidelity pass condition.

`clearDriftTech` clears all additional control fields at external cancellation.
World initialization, hashing, quantization, snapshots and the AI lookahead model
carry the same state. Engagement, target and tightening use the 1/32768 grid;
intent/arming/recovery/pending fields are integers. Simulation version 10 rejects
older incompatible trajectories rather than interpreting them under new rules.
The input transport/ghost FIFO changes have their own accompanying contract.

AI cap multipliers are 0.90/0.955/0.985/1.0 for Rookie/Racer/Pro/Legend. Measured across all 12 characters, these restore the existing relative pace bands under the reduced boost advantage. At the lower speed Meadow’s R40+ corners are grip-feasible, so the retired fixed neutral-drag quota is not a requirement to force needless sliding; explicit tight-corner and reward tests retain technique coverage.

AI hazard avoidance treats visible solid mechanical bodies independently from damage activity or immunity. In addition to its normal lane samples, it considers legal lanes just outside each blocked footprint. This is required for a central chandelier wider than the old five candidate lanes. Near a hazard, these lanes take priority over cosmetic line noise, corner-entry outside bias and pickup wishes. Retired, non-colliding karts are excluded from traffic and drafting.

The separate full-map, multiplayer, rendering and compatibility checks remain
required integration gates. Passing the focused handling tests is not evidence
that every map or pack-race regression has been resolved.

The post-contact escape uses a 30-tick reverse only for a kart already pinned
when hard CC releases; ordinary reverse remains 54 ticks. An active escape pauses
through another hard-CC interval so the immunity window is usable. The unchanged
200-tick recovery deadline still resets a genuinely trapped kart. After drive-out,
2 m of actual forward progress together with forward speed above 6 m/s and heading
within 0.6 rad clears an old episode; velocity alone cannot clear a rebound loop.

Vertical RMF spans use pursuit in the kart's actual tangent plane. Their forward
speed and recovery heading include Y. A horizontal projection near the upright
part of a loop had treated the far side of the loop as a target behind the kart,
commanded full lock, and then reset the stopped kart. The replacement is limited
to those authored RMF spans and uses the same kart grip gain and delayed input
path. Three loop fixtures start at −2/0/+2 m lateral offsets and require upright
and inverted traversal without wall contacts or recovery.

Traffic braking on a committed jump approach respects the same `vMin + 2 m/s`
floor already used by corner braking. A failed jumper below an ordinary road,
airborne and still falling, is excluded from ramp traffic predictions; nearby
above-road airborne karts remain threats. Otherwise the missed jumper's rebound
looks like oncoming traffic in XZ, causing each follower to brake below the
validated launch speed. Actual kart collision and item effects are unchanged.

A selected fork is checked for safe alignment 30 m before the split. Its route
choice is committed inside the larger of 10 m or half a second of current travel.
Previously, repeated checks could abandon the fork only 2 m before the split,
after the eight queued input ticks already turned into it; the new host target
then swung the kart into the solid gore cushion. The cushion and branch remain
unchanged, and a full item-race regression retains the route choice while checking
that the affected kart finishes without a hard hit, reset, or recovery episode.

The final Racer-only cap refinement is 0.955 rather than 0.95. This is an explicit
mixed-tier balance adjustment under the slower physics, not a collision fix. At
0.95, the seed-31 two-lap Manor/Kraken item fields retired several moving racers
near the finish under the unchanged 600-tick deadline. The 0.955 candidate keeps
the existing Racer 92–96% pace band (95.0% measured over all twelve characters),
and every one of the 21 mixed Pro/Racer item-track gates passes unchanged. Both
formerly failing fields finish 8/8 with zero respawns and hard wall hits. Pro,
Legend, human kart parameters, and retirement timing remain unchanged.
