# L5 → L4: terrain next to a road should follow that road, not the track's lowest point

**Owner of the change:** L4 (`packages/trackc/src/terrain.ts`). Render only; no `.ctrk` or sim change.

## What happens now
Inside `edge = half + 3` of the nearest road sample, `buildTerrainField` sets

```ts
if (best < edge) y = Math.min(target, natural);
```

Near a road the noise ramp is 0, so `natural` is `baseY - 1.5`, and `baseY` is the lowest deck or kill plane on the
whole track. Every road that sits above the track's low point therefore gets a trench as deep as its height above
that point, running along both edges. From about 3 m past the shoulder the ground climbs back up to road level.

Seen on the L5 tracks:
- **sandglass_canyon** (floor −12 m): the rim roads run in 12–14 m ditches, and the compiler adds 115 `pillar`s.
- **aurora_summit** (−120 m descent): the start plateau and upper hairpins stand on stilts above a 120 m hole.
- **belltower_piazza** and **meadow_loop** (+2–4 m bridges and the piazza): 3–5 m ditches.

There is a second effect. `PROPS` rows closer than about 5 m past the shoulder are dropped by the
`y < yRoad - 3` rule because the ground there is the ditch floor. For example, the belltower market stalls at
`offset=2` or `offset=3.5` place 0 instances; at `offset=5` they place 14.

## Ask (exact diff)
```diff
--- a/packages/trackc/src/terrain.ts
+++ b/packages/trackc/src/terrain.ts
@@
-      if (best < edge) y = Math.min(target, natural);
+      // follow the local (lowest nearby) deck; only fall away where the road is meant to drop (jump gaps, open
+      // ledges over kill planes, rails, warps)
+      if (best < edge) y = drop ? Math.min(target, natural) : target;
```
`target` is already `yRef - 0.35` from the lowest deck near the point, so stacked decks still get ground under
the lower one. Jump gaps, ledges and rails keep falling away through `drop`. Beyond `edge` the existing smoothstep
still blends to the far-field hills.

I tried the diff locally and reverted it. On sandglass_canyon it changes the placed counts as follows: `pillar` 115 → 0,
`canyon_wall` 11 → 45, `cactus` 45 → 58, `clay_pots` 0 → 3. The validator still reports 0 errors.

## Second bug in the same function: NaN terrain vertices on every track
For a grid vertex whose nearest road sample is 60–85 m away, `best` is finite, because the 5×5 lookup covers
about 85 m. `near` only collects samples closer than 60 m, so it stays empty. That leaves `yRef = Infinity` and
`target = Infinity`, and once `sm = 1` the blend evaluates `Infinity * 0`, which is NaN.

In the baked `.vis` files, about 2% of terrain vertices are NaN on all six L5 tracks:
- meadow: 607 values
- aurora: 1298 values

The same band applies to every other lane's tracks. Scatter props that land in that band get `y = NaN`, for example
15 seracs on aurora. In the client these show as holes in the ground: black-rimmed gaps some 60–70 m out from the road.

```diff
-    if (Number.isFinite(best)) {
+    if (Number.isFinite(best) && best < 60) {
```
Beyond 60 m the blend already gives `natural`, since `sm = 1` whenever `best ≥ edge + 30`. The guard therefore
changes nothing except the NaN band. I tried it locally and reverted it: meadow_loop and aurora_summit then bake with
0 NaN values.

## Fallback shipped meanwhile
- The L5 tracks keep their rows as designed. Rows on raised sections place fewer instances until this lands.
- Landmarks (`PROP at=`) are posed from the centreline and are not affected.
- No DSL workaround exists. `THEME terrain=none` would remove the ground entirely.
