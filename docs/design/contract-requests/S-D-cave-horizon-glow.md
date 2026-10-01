# S-D: let an underground kit turn down the vault's lava band

**Owner of the fix:** env (`apps/client/src/render/env/sky.ts`, `apps/client/src/render/env/look.ts`). The fix is render-only and does not change any track file.

## What happens
The `underground` sky branch draws a warm band at the horizon: `#ff6a2b × 0.18`, fading out by `|h| = 0.25` (about 14° of elevation). The chase camera sees almost nothing of the sky above that, so after exposure 1.28 and bloom the band reads as a red-orange sunset behind every stalagmite silhouette. This shows on Geode Rail Quarry and Magma Switchback in every after-sheet view (a1, b1, b2). The brief for Ember Mine asks for limited lava glow, but the kit cannot reach the band. The branch ignores `sky.top`, `sky.bottom` and `horizon` (it uses hard-coded `#2a1a14` and `#0b0807`), and changing `exposure` darkens the whole scene.

## Request
Add one optional look field. It defaults to today's value, so other underground tracks stay as they are.

```diff
--- a/apps/client/src/render/env/look.ts
+++ b/apps/client/src/render/env/look.ts
@@ ThemeLook
   horizon?: string;             // gradient-sky horizon colour
+  /** underground vault only: strength of the warm lava band at the horizon (default 0.18) */
+  caveGlow?: number;
@@ EnvLook.sky
-  sky: { …; style: 'physical' | 'gradient' };
+  sky: { …; style: 'physical' | 'gradient'; caveGlow: number };
@@ resolve()
       clouds: L.clouds ?? (kind === 'overcast' ? 0.85 : 0),
+      caveGlow: L.caveGlow ?? 0.18,
--- a/apps/client/src/render/env/sky.ts
+++ b/apps/client/src/render/env/sky.ts
@@ cache key
-  …:${JSON.stringify(L.sky.planet)}`;
+  …:${JSON.stringify(L.sky.planet)}:${L.sky.caveGlow}`;
@@ underground
-    c = c.add(color('#ff6a2b').mul(smoothstep(0.25, -0.05, abs(h)).mul(0.18)));
+    c = c.add(color('#ff6a2b').mul(smoothstep(0.25, -0.05, abs(h)).mul(L.sky.caveGlow)));
```

Lane D would then set `caveGlow: 0.07` in `themes/ember_mine/index.ts`. The lava then glows from the lava pools, seams and ore carts, not from the whole horizon.
