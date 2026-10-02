# S-D: PROPS exclusion zones also strip far-off dressing (start areas come out bare)

**Owner of the fix:** trackc (`packages/trackc/src/props.ts`). The fix is render-only: the `.vis` changes and the `.ctrk` does not.

## What happens
`placeProps()` drops every PROPS row instance whose sample `s` falls in an exclusion window: line ±10 m, pads ±6 m past their ends, item rows ±6 m, hazards ±8 m, jump gaps and junctions. The check uses `s` only, never the lateral offset. So a grass tuft 0.2 m beyond the barrier and a tree line 125 m out are removed alike.

On tracks whose first pad sits just after the line, the start area loses every row layer over a long stretch:
- Coral Cove Docks (pads at 20 and 1318): nothing from 1309 to 35 m, about 76 m around the grid.
- Kraken Lighthouse: nothing from 1326 to 14 m.
- Pumpkin Lane: nothing from 1231 to 27 m.
- Geode Rail Quarry: nothing from 1286 to 1304 m and from 1329 to 10 m.

That is the grid and the a1/a3 camera views, the most-seen part of each lap.

## Work-around shipped by S-D
The six S-D tracks hand-place the start-zone dressing with `PROP` lines. Poses come from the baked frame, at the same offsets the rows use. Each kit has a `grass_patch` kind, a 12 × 6 m clump of its ground-cover layer, so a few lines stand in for hundreds of tufts. This works, but it is brittle: if a track's geometry ever changes, the poses must be regenerated.

## Proposed fix
Apply the gameplay exclusions only to near-road dressing, which is what they protect: readability of pads, boxes and hazards, plus the start line.
```diff
-      if (smp.jumpPart === 2 || smp.warp || excluded(pathIdx, smp.s)) { DROPS.excluded += sides.length; continue; }
+      // gameplay windows keep the road edge clear; dressing farther out (shrubs, trees, tree lines) is unaffected
+      const nearOnly = offset + jitter < (Number(a.clear ?? 2.5));
+      if (smp.jumpPart === 2 || smp.warp || (excluded(pathIdx, smp.s) && (nearOnly || offset < 2.5))) { DROPS.excluded += sides.length; continue; }
```
Alternatively, add an explicit opt-out attribute, `PROPS … exclude=none` (or `exclude=line,pad`), so authors decide per row. The default stays as it is today, so existing bakes are unchanged until a row opts in.
