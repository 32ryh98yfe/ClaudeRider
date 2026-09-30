# L11 → L6 / orchestrator: additive `ThemeLook` fields in `render/themes/kit.ts`

**Status:** shipped in L11 (merged in 63edda4) and additive only. This file records the diff for review.

## Diff

```diff
--- a/apps/client/src/render/themes/kit.ts
+import type { ThemeLookFx } from '../env/look.ts';
-export interface ThemeLook {
-  road: { style: RoadStyle; a: string; b: string; line: string };
+/** Colour/look data per theme. Optional FX fields (sky details, grade, weather, water…) come from ThemeLookFx (L11). */
+export interface ThemeLook extends ThemeLookFx {
+  road: { style: RoadStyle; a: string; b: string; line: string; wet?: boolean; glow?: string };
 …
-  wall: { a: string; b: string };
+  wall: { kind: WallStyle; a: string; b: string };
```

## Why

- **`ThemeLookFx` fields** (`env/look.ts`) let a kit tune its sky, grade, weather and water. Every field is optional, and each sky kind has a default, so a kit that sets only colours still gets a complete light rig. The field reference is in `docs/art/fx/README.md`.
- **`road.wet` and `road.glow`** select the wet-asphalt and emissive-edge road variants of `MaterialLibrary.road`.
- **`wall.kind`** chooses the wall material family: `panel`, `stone`, `barrier`, `fence`, `rock`, `parapet`, `building`, `planter`, `pillar`, `curb`, `glass`, `neon`, `ice` or `hedge`. It is required so every kit picks a family on purpose. All roster kits set it.
