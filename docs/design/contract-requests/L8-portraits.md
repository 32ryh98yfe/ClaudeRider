# L8 → L10 / L11: character portraits, and the v1 mascot and kart APIs

Status: shipped in L8. No frozen file changes. This note records the API and asks for three small adoptions outside L8.

## 1. `getPortrait` (for L10: HUD standings, character select, room slots)

```ts
// apps/client/src/render/portrait/portrait.ts
export interface PortraitOptions {
  bodyColor?: string;                                   // garage palette skin (shade is derived 12% darker)
  eyes?: 'open' | 'happy' | 'star' | 'angry' | 'dizzy' | 'sleepy' | 'wink';
  yawDeg?: number;                                      // default −20 (three-quarter view)
}
export function getPortrait(characterId: string, sizePx: number, o?: PortraitOptions): Promise<ImageBitmap | HTMLCanvasElement>;
export function clearPortraitCache(): void;            // e.g. after buying a palette skin
export function setPortraitRenderer(r: WebGPURenderer | null): void; // optional; the contact sheet uses it
```

- **What it returns.** A head-and-shoulders studio render of the vinyl mascot at LOD0 in the stand pose: the body, the head accessory and the sparkle. It is square, `sizePx` wide (clamped to 16–512) and has a **transparent** background, so it works on ivory, dark and coral UI surfaces.
- **Cost.** Each image is rendered at 2× and downsampled. Results are cached per (id, size, options). Concurrent calls are serialized. At 128 px a first render costs one small frame; cached calls are free.
- **Renderer.** Rendering happens on a small dedicated WebGL2-backend `WebGPURenderer` on a detached canvas, created lazily on first use. The main renderer's size, render target and MRT state are never touched.
- **Missing ids.** An unknown id renders the grey placeholder character. It never throws.
- **Art slots.** Importing the Showcase, which happens at boot, runs `render/portrait/register.ts`. That file calls `registerRenderFallback('portrait', …)`, so `getArt('portrait.<id>')` returns this render whenever no Codex override exists.

### Requested change (L10, `ui/components/Portrait.tsx`)
`Portrait.tsx` currently reads only `artUrl()`, which returns overrides only, and then draws the SVG. To show the 3D portrait when there is no override, draw `getArt` into a canvas:

```tsx
// sketch: keep the SVG as the instant placeholder, swap in the bitmap when it resolves
useEffect(() => { let alive = true; void getArt(`portrait.${id}`).then((b) => { if (alive) setBitmap(b); }); return () => { alive = false; }; }, [id]);
// <canvas ref={(c) => c && bitmap && c.getContext('2d')!.drawImage(bitmap, 0, 0, c.width, c.height)} />
```

For HUD rows (about 48 px), call `getPortrait(id, 64)` directly so the downsample stays sharp. The 512-px art-slot render is meant for cards.

## 2. Mascot API v1 (`render/mascot/rig.ts`): additive, backward compatible

The existing surface is unchanged: `root`, `anchors` (`head_top`, `back`, `hand_L`, `hand_R`, `face_front`), `setPose(MascotPose, dt)`, `playEmote(EmoteSlot)`, `setEyes(expr)`, `setTeamTint(Color | null)`, `setLod(0 | 1 | 2)` and `dispose()`. New members:

| member | purpose |
|---|---|
| `setAutoLod(on, d1 = 25, d2 = 70)` | Distance LOD through `THREE.LOD`. It is on by default. `setLod()` turns it off. Low tier can pass 20 / 55. |
| `setBodyColor(hex \| null)` | Garage palette skins. It recolours the partId palette in place, with no new material. |
| `setStance('drive' \| 'stand')` | Hands on the handlebar (the default), or arms relaxed for menus and portraits. |
| `emote` (read-only) | The current `EmoteSlot` or `null`. |
| `onFx(name, anchor)` | Emote FX cue hook, for example `confetti`, `sparkle`, `stars`, `coins`, `smoke`, `snow`, `steam`, `hearts` or `glitch`. The Showcase implements these. L11 may hook race FX to it. |
| `stats()` | Triangles and draws per LOD (used by tests and contact sheets). |
| `RIG.seatScale` | **0.62**. Seated mascots use this scale; RaceRenderer already does. |

Implementation notes:

- **Structure.** Each mascot is one skinned skeleton. Per LOD there are at most three `SkinnedMesh` draws: vinyl, eyes and glass.
- **Materials.** Every mascot in a scene shares three materials. Per-character variation is carried in vertex attributes: `color` from the partId palette, and `surf` (roughness, metalness, glow, clearcoat).
- **Allocation.** `setPose` does not allocate. Springs are substepped at 1/60 s or finer, so 2–10 fps frames stay stable.

## 3. Kart API v1 (`render/karts/types.ts`): additive

Existing members are unchanged: `root`, `wheels` (FL, FR, RL, RR), `steering`, `seat`, `exhausts` and `update({ steer, wheelSpin, boost, drift, speed }, dt)`. The optional inputs `airborne` and `throttle` are new. New members:

| member | purpose |
|---|---|
| `setLivery(Livery)` | Repaints primary, secondary and pattern in place. A new race number needs a rebuild because the digits are baked into the overlay. |
| `setLod`, `setAutoLod`, `stats()`, `id` | Same meaning as for mascots. |
| `KartBodyDef.archetype`, `KartBodyDef.livery` | The archetype and a default livery suggestion for the garage. |

- **Livery patterns** (`Livery.pattern`, index into `LIVERY_PATTERNS` in `render/karts/materials.ts`): 0 solid, 1 stripes, 2 chevrons, 3 checker, 4 split, 5 camo, 6 circuit, 7 filigree, 8 panels, 9 aurora, 10 flames, 11 dots. The i18n names are `karts.pattern.<name>`.
- **Draws and materials.** A kart is one skinned paint mesh plus one skinned overlay (decals, glass, underglow), so at most 2 draws. Every kart shares two materials.
- **`exhausts`.** These are anchors at the pipe mouths, parented to the suspension. Flames should extend along the kart's −Z. Vertical stacks (Tugboat, Jet Kettle) put the anchor at the stack top, so the flame trails backward.

## 4. Materials: request for L11 to promote into the MaterialLibrary

All five are local to L8, marked "FOR L11 TO PROMOTE", and counted by `localMaterialCount()` (`render/mascot/materials.ts`):

| key | type | used by |
|---|---|---|
| `l8:mascotVinyl` | MeshPhysicalNodeMaterial with attribute-driven surf, clearcoat, sheen 0.2 and a TSL Fresnel rim `#FFD9C7` | every mascot body |
| `l8:mascotEyes` | MeshStandardNodeMaterial, alpha-tested eye atlas (8 cells), LED dot-matrix and glow flags | eyes |
| `l8:mascotGlass` | transparent physical material with Fresnel opacity | Nova's helmet, Frost's shards, Glitch's visor |
| `l8:kartPaint` | candy paint (clearcoat 1 / 0.1) with 12 livery patterns in TSL from `positionGeometry` | every kart body |
| `l8:kartOverlay` | transparent atlas material: race numbers, stickers, crests, glass, underglow | kart overlays |

**Request.** Add `localMaterialCount()` to BudgetTracker's per-scene material count. A full 8-kart race adds 5 materials.
