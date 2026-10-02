# S-D: PROPS rows put props on top of a road on another level

**Owner of the fix:** trackc (`packages/trackc/src/props.ts`, `placeProps`). The fix is render-only: the `.vis` changes and the `.ctrk` does not.

## What happens
A PROPS row instance is dropped only when `gi.heightAt(x, z, yRoad)` finds a road at the height of the row's own road (`yRoad`). On stacked layouts the instance can sit on a different stretch of road: an overpass above, a spiral below, or the far leg of a hairpin. `groundY()` then puts it on the terrain, and on these tracks the terrain at that point is level with the other road. The instance therefore stands in the middle of that road.

Before the fix, the frozen-tick chase shot of Geode Rail Quarry at tick 1000 showed two 6 m stalagmite columns. They stood between the camera and the kart on the rail-exit deck (s ≈ 313–318), and both were emitted from the geode spiral 9 m below. Before the lane-D workaround, a scan of the baked `.vis` files found these instances inside the road edges (bushes, rocks, stalagmite columns, tree clumps and timber cribs, not counting lamps or deck-edge items):
- Geode Rail Quarry: 6, plus 9 ground-cover patches.
- Magma Switchback: 11, plus 17 ground-cover patches. One of the 11 is a scatter `basalt_column` that was already there before the pass.

## Workaround in lane D
The `.ctd` rows on the two Ember Mine tracks are split round every stretch whose offset range reaches another road (generated, verified with a scan of the baked `.vis`). This costs about 140 rows on Magma Switchback, and the split goes stale whenever a row or the layout changes.

## Request
Check for a road at the height where the prop lands, not only at the row's own road height:

```diff
--- a/packages/trackc/src/props.ts
+++ b/packages/trackc/src/props.ts
@@ placeProps, PROPS rows
         let y = groundY(x, z, yRoad - 0.2);
+        // a stacked layout (overpass, spiral, hairpin) can put the landing point on another stretch of road
+        if (gi.heightAt(x, z, y, 2.5) !== null) { DROPS.onRoad++; continue; }
         if (y < yRoad - 3) {
```

`maxDy = 2.5` keeps props under a bridge whose deck stands more than 2.5 m above them. The deck-edge branch further down reassigns `x/z/y` to the row's own deck edge, so it is unaffected. The scatter loop already keeps a 2D keep-out corridor against every road sample. Once this lands, lane D can fold the split rows back into one row per stretch.
