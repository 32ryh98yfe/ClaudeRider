# S-C: deck skirts must stop above lower roads (trackc)

## What

`undersideToRender` (packages/trackc/src/render.ts) hangs each deck's side skirt from the deck edge down to the
terrain: `skirtDepth = y − terrain(x, z)`. Where a deck crosses over a lower road, the terrain under it is that
road's ground, so the skirt becomes a solid curtain from the deck down through the lower road.

## Why

On Skyway Interchange the cloverleaf deck (y = 10) crosses the toll-plaza road (y = 0) at x ≈ 91–105. Its skirts
are faces normal to ±x that span y −0.4 … 10 and z −8 … 9, straight across the 14 m road. From the first-corner
approach that reads as a black void at the tunnel mouth. The karts drive through it, and the curtain also shadows
the tunnel.

Lane C works around it in its own underside material. `fasciaMask()` in
`apps/client/src/render/themes/neon_harbor/surfaces.ts` uses screen derivatives of the skirt uv to drop skirt
fragments more than 1.5 m below the deck edge. That only covers the Neon Harbor kit, though; every other theme
still gets curtains wherever its decks cross.

## Exact diff (packages/trackc/src/render.ts, `undersideToRender`)

Stop each skirt 1.5 m below the edge when a road surface lies under it (gi = the ground index already passed to
the props pass; thread it into `undersideToRender`):

```diff
-      const da = Math.max(0.6, skirtDepth(ta[0]!, ta[1]!, ta[2]!)), db = Math.max(0.6, skirtDepth(tb[0]!, tb[1]!, tb[2]!));
+      // never hang a skirt through a lower road: stop it as a 1.5 m fascia when a road surface lies under it
+      const under = (q: number[]): boolean => gi.heightAt(q[0]!, q[2]!, q[1]! - 2, 40) !== null;
+      const da = under(ta) ? 1.5 : Math.max(0.6, skirtDepth(ta[0]!, ta[1]!, ta[2]!));
+      const db = under(tb) ? 1.5 : Math.max(0.6, skirtDepth(tb[0]!, tb[1]!, tb[2]!));
```

This changes `.vis` only. `.ctrk` is unaffected.
