# S-A: `clear=<m>` for PROPS rows (drop instances whose footprint reaches another road)

**Lane:** S-A (canopy_forest + spark_circuit stylized pass). **File:** `packages/trackc/src/props.ts` (shared, read-only
for lanes). Render-only: the `.ctrk` is untouched, only which `.vis` prop instances are kept.

## What
An optional `clear=<metres>` attribute on `PROPS` rows. An instance is dropped (counted in `propsDroppedOnRoad`) when
any of eight points on a circle of that radius around it lies on a drivable surface at about its height.

```diff
@@ placeProps(): PROPS rows loop, after the `if (y < yRoad - 3) { … }` block
+        // clear=<m>: the prop's footprint must not reach any road (the far tree lines of one segment otherwise land
+        // beside, or on the edge of, another segment where the layout folds back: hairpins, infields, spirals)
+        const clear = num(a.clear, 0);
+        if (clear > 0) {
+          let near = false;
+          for (let k = 0; k < 8 && !near; k++) {
+            const ang = (k * Math.PI) / 4;
+            near = gi.heightAt(x + Math.cos(ang) * clear, z + Math.sin(ang) * clear, y + 1, 4) !== null;
+          }
+          if (near) { DROPS.onRoad++; continue; }
+        }
         add(cmd.kind, x, y, z, yawOf(smp.tx, smp.tz) + (side < 0 ? Math.PI : 0), …);
```

and in the row grammar comment: `… from= to= seed= clear=`.

## Why
Doc 34 §6 asks for `tree_clump every=26 offset=60 jitter=50` and `every=34 offset=125` on both sides. On any layout that
folds back (Spark Grand Circuit's infield, Sunset Arena Rally's crossover loops, Cascade Slalom's treehouse spiral,
Meadow Loop's hairpin), a clump 60–175 m out from one segment lands next to another one; the only check today is that
the instance origin is not on a road, so a 16 m clump can stand with trees on the far road's edge. The Spark GP AFTER
set showed one beside the main grandstand, 5 m from the start straight.

## Workaround used in the lane
A fold check of the baked centrelines (a scratchpad helper, not committed) gave, per track and side, the s-ranges where
offsets 60–110 and 125–175 stay ≥ 30 m (Spark) / 20 m (forest) from every other path, and each far tree-line row was
split into `along=<s0>-<s1>` rows on those ranges. With `clear=` those rows can go back to one `side=both` row each.
