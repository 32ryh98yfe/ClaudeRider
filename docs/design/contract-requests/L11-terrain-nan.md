# L11 → L4: NaN terrain heights in the .vis (the black and white stripe patches on the hills)

**Symptom.** Large black and white stripe patches show on the terrain beside and beyond the road. This happens on meadow_loop and on every track with terrain, at any tier. It is most visible toward the horizon.

**Evidence.** A dump of the baked `.vis` (`a local dump script (tools/scratch/visinfo.mjs)`) shows the problem in the `terrain` slot:

| track | vertices with y = NaN | NaN normals |
|---|---|---|
| meadow_loop | 607 / 11 336 | 1 223 |
| proving_ring | 252 / 5 460 | 539 |
| belltower_piazza | 566 / 9 492 | 1 137 |
| snowglobe_halfpipe | 596 / 10 302 | 1 200 |
| magma_switchback | 359 / 9 968 | 703 |
| pumpkin_lane | 617 / 10 506 | 1 202 |

Every other slot is finite. A fresh `trackc build meadow_loop` still reproduces it.

## Root cause (`packages/trackc/src/terrain.ts`, `buildTerrainField`)

Take a grid point whose nearest track sample is finite but 60 m or more away. The search covers ±2 cells of 24 m, so `best` can be finite while `near` (which only collects points with d < 60) is empty.

1. Because `near` is empty, `yRef` stays `Infinity`, so `target = Infinity`.
2. `best − edge ≥ 30` gives `sm = 1`.
3. `y = target·(1 − sm) + natural·sm` then evaluates `Infinity·0`, which is NaN.

The normals of neighbouring vertices then pick up the NaN through `dx` and `dz`.

## Requested fix (exact diff)

```diff
--- a/packages/trackc/src/terrain.ts
+++ b/packages/trackc/src/terrain.ts
@@ buildTerrainField
-    if (Number.isFinite(best)) {
+    if (Number.isFinite(best) && best < 60) {
       // reference height: the lowest deck about as near as the nearest one (stacked decks → the lower one)
```

At `best ≥ 60` the blend is already fully `natural`, since `edge ≤ bestHalf + 3 < 30` for every spec'd width. The output is therefore unchanged wherever it was finite.

Also suggested: a validator rule that fails the bake on any non-finite `.vis` position or normal.

## Client mitigation (shipped in L11)

`TrackView` repairs non-finite terrain vertices on load:

- A NaN height takes the mean of its finite grid neighbours. A few passes fill wider holes. If no neighbour is finite, the vertex falls back to the minimum terrain height.
- Normals are rebuilt from the repaired heights.

A dev warning reports how many vertices were fixed. Once the compiler fix lands, this repair has nothing to do.
