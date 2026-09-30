# L4 → L1: respawn on the baked target sample (jump-gap respawn loop)

## What broke
In the item race on meadow_loop (`items-tracks.test.ts`, seed 31, pro/racer), karts knocked into the creek-hop J
gap died on the kill floor. `lastValid` was their last grounded point, on the ramp or the lip. The respawn walked back
from there onto the ramp at v = 0, too slow for vMin (25 m/s), so they fell into the same gap forever (62–64 respawns
each, one finisher).

## L4 side (shipped)
- `.ctrk` v2 gains `p{k}.rto` (i32, one per sample): the sample a kart whose last valid location is sample i is placed
  on, or −1 to respawn in place. `p{k}.rok` is zeroed over every jump's danger zone.
  - Ramp foot → landing window + 5 m: placed on the landing side, 5 m into the landing window (KRD behaviour).
  - Run-up `[rampS − 2·vMin²/(2·9 m/s²), rampS)`: placed back before the run-up, so a standing start reaches vMin
    (2× the distance from rest at 9 m/s², about half the slowest kart's a0).
  - Everywhere else: the old rule (nearest ok sample ≤ 15 back), then ≤ 15 forward, then ≤ 300 m back.
  - A target never crosses the finish line (in either direction), nor a key gate going forwards. `race.loc` jumps
    straight to the placed sample, so the lap logic never sees that move.
- `BakedTrack.respawnPose` and `respawnLoc` read the table. Older bakes without `rto` keep the walk-back.

## L1 side (needed): `packages/sim/src/race/respawn.ts`
The landing side is 12+ m ahead of the death point. The progress anti-cut (`|dS| ≤ v·dt·1.5 + 10`) compares the next
locate against `race.loc`, which respawn.ts currently resets to the death point (`copyLoc(r.loc, r.lastValid)`). So the
placed kart is rejected, goes off-graph for 180 ticks and respawns again, in a loop. Adopt `respawnLoc` so that
`race.loc` and `lastValid` start from the placed sample:

```diff
@@ export function updateRespawn(w: WorldState, k: KartState, ctx: StepContext): void {
   if (r.respawnPhase === 1 && w.tick >= r.respawnUntil) {
     const pose = POSE;
+    // place on the respawn sample, not the death point: locate and the anti-cut window restart from there
+    // (a jump gap respawns past the landing, well outside the ±10 m anti-cut window of the death point)
+    if (ctx.track.respawnLoc) { ctx.track.respawnLoc(r.lastValid, r.loc); copyLoc(r.lastValid, r.loc); } else copyLoc(r.loc, r.lastValid);
     ctx.track.respawnPose(r.lastValid, pose);
@@
     d.draftCharge = 0; d.draftTicks = 0;
-    copyLoc(r.loc, r.lastValid);
     r.wrongWayTicks = 0; r.offGraphTicks = 0; r.noGroundTicks = 0;
```

`frameAt(r.lastValid.path, r.lastValid.s, f)` then reads the up vector at the placed sample rather than the death
point. `respawnPose` on a target is idempotent (`rto[target] = target`), so calling it after the move is safe.

## Evidence
`runItemRace({ track: 'clayhill_village/meadow_loop', seed: 31, tiers: ['pro', 'racer'] })`, respawns per kart:
- before: 7 karts at 62–64, 1 finisher.
- L4 table alone: 7 finish; kart 3 loops (lastValid 579.1 → placed at 591, rejected by the anti-cut, 21 respawns).
- L4 table + this diff: all 8 finish, and kart 3 respawns once.

`packages/trackc/test/respawn.test.ts` covers this on f2_jumps with the real `step()`: a kart dropped into the gap
respawns once, past the landing, and then drives on. It checks for the diff and applies the same two lines in its
own harness until L1 lands it.
