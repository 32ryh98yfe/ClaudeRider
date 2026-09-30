# L1: track hazard contacts (10-sim-spec §13.6) — one additive line in `step.ts`

## What

`packages/sim/src/race/trackhazards.ts` (new, L1) applies the contact effects of L4's analytic F5 hazards:

| Hazard `effect` | Result |
|---|---|
| launch (geyser) | `airborne` for 66 ticks |
| squash (press) | `stun` for 45 ticks, speed ×0.3 at contact |
| spin (train) | `spin` for 60 ticks, plus an 8 m/s push away from the hazard |
| spin (traffic) | `spin` for 60 ticks, plus a 6 m/s push |
| spin (swinger) | `spin` for 60 ticks |
| block | a solid obstacle with no effect |

Every hit goes through L2's effect runtime, and nothing from it is duplicated:

- The hit calls `scheduleEffect` with source 255 and `EFlag.HAZARD`, then `resolveEffect` right away, the same path items use for contact hits.
- The hard-CC refresh and absorb rules, the 36-tick immunity after a CC, the effect events and the stats therefore all come from L2.
- `EFlag.HAZARD` makes shields and halos not block track hazards, as the spec requires.

Contact test and poses:

- The kart's collider is its wall sphere: r 0.85 m, centred 0.6 m above the contact point.
- It is tested against the hazard shape at the pose from `BakedTrack.hazardPose(id, tick)`.
- Shapes: a box standing on the pose; a cylinder standing on the pose; a capsule centred on the pose for swingers; a sphere.
- A hazard collides only while `active === 1`.
- No state is stored, and no banned math is used.

No double hits:

- A kart whose running hard CC was started by a track hazard is skipped, because the CC outlasts every contact window.
- An immune kart is skipped. The result would be the same as L2's immunity check; skipping only avoids emitting an `immune` result on every tick of one contact.

## Frozen-file edit: `packages/sim/src/step.ts` (additive, lock updated)

```diff
 import { computeMods, startEffects, stepBoxes, stepProjectilesHazards, tickEffects, useItems } from './items/runtime.ts';
+import { stepTrackHazards } from './race/trackhazards.ts';
@@ (5,6) projectiles, hazards, boxes
-  if (racing) { stepProjectilesHazards(w, ctx); stepBoxes(w, ctx); }
+  if (racing) { stepProjectilesHazards(w, ctx); stepTrackHazards(w, ctx); stepBoxes(w, ctx); }
```

Track hazards run in phase 5, right after item projectiles and hazards, as the spec's phase table says. Tracks
without hazards return at once, so their replay hashes do not change.

## Tests

`packages/sim/test/hazards.test.ts` runs on the F5 bake (`tracks/_test/f5_hazards.ctd`). It checks:

- each kind's effect, duration and push;
- that idle hazards do not collide;
- one hit per geyser eruption while a kart is held on the vent;
- that immune karts are skipped;
- that a running item CC is refreshed by a longer hazard CC;
- that shields and halos stay up and do not block;
- that an 8-bot race with hazard hits gives the same hash on two runs.
