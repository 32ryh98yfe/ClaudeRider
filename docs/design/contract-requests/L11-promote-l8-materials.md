# L11 → orchestrator: L8's five local materials are promoted into the MaterialLibrary

Answers `L8-portraits.md` §4. No frozen file changes.

## What shipped in L11

- `apps/client/src/render/materials/rigs.ts` has the builders: `buildMascotVinyl(hq)`, `buildMascotGlass(hq)`, `buildMascotEyes(atlas, cells)`, `buildKartLivery(hq)` and `buildKartOverlay(atlas)`.
  - **Medium and above** match L8's node graphs: physical BRDF, clearcoat, sheen and MaterialX Perlin.
  - **Low** uses the standard BRDF and value noise. On SwiftShader the physical kart shader took about 13 s to link, the slowest program in a race.
  - Both tiers multiply the vinyl rim and the kart Fresnel by `fxUniforms.rimBoost`. The value is 1 on day themes, so they look unchanged. The rim is stronger at night.
- `MaterialLibrary` gains `mascotVinyl()`, `mascotGlass()`, `mascotEyes()`, `kartLivery()` and `kartOverlay()`.
- **Seeding.** `MaterialLibrary.configure(tier)` seeds L8's memo through its exported `registerLocalMaterial(key, make)` for the keys `mascotVinyl`, `mascotGlass`, `mascotEyes`, `kartPaint` and `kartOverlay`. L8's getters then return the library instances, so the rig and kit code needed no edits. `Stage` calls `configure` before the Showcase or any race builds a mascot.
- **Budget.** `MaterialLibrary.count()` counts the union of library and L8-local materials, so the promoted ones are counted once. BudgetTracker's `uniqueMaterials` already walks the scene, so every L8 material is included.
- **Emote FX.** `RaceRenderer` sets `mascot.onFx`, which feeds `DrivingFx.emoteFx(name, pos)`. That supports confetti, coins, sparkle, stars, hearts, glitch, smoke, steam and snow; an unknown cue plays sparkle.

## Optional follow-up (orchestrator or L8, any time after merge)

This makes the delegation explicit, so the library no longer depends on seeding order. It is behaviour-neutral.

```diff
--- a/apps/client/src/render/mascot/materials.ts
+++ b/apps/client/src/render/mascot/materials.ts
-export function mascotVinyl(): THREE.MeshPhysicalNodeMaterial {
-  return memo('mascotVinyl', () => { … });
-}
+export function mascotVinyl(): THREE.MeshStandardNodeMaterial { return MaterialLibrary.mascotVinyl(); }
 (same for mascotGlass → MaterialLibrary.mascotGlass, mascotEyes → MaterialLibrary.mascotEyes)
--- a/apps/client/src/render/karts/materials.ts
+++ b/apps/client/src/render/karts/materials.ts
-export function kartPaint(): THREE.MeshPhysicalNodeMaterial { return registerLocalMaterial('kartPaint', () => { … }); }
+export function kartPaint(): THREE.MeshStandardNodeMaterial { return MaterialLibrary.kartLivery(); }
+export function kartOverlay(): THREE.MeshStandardNodeMaterial { return MaterialLibrary.kartOverlay(); }
```

- **Circular import.** `library.ts` imports `eyeAtlas`/`EYE_ATLAS` and `kartAtlas` from L8's modules. After the change above, move those atlas builders to their own modules (for example `mascot/eyeAtlas.ts` and `karts/atlas.ts`) to avoid a cycle.
- **L8 test.** The test `localMaterialCount() ≤ 5` still holds after the change.
