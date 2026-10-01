# 33 — Ultra graphics: the cinematic tier (ADR-015)

Status: foundations landed (U-F1). Streams S-Mat, S-Light, S-Post, S-Terrain and S-Flora build on this spec.

## 1. Goal and scope
The user's brief asks for AAA visuals with no performance constraints:
- **Lighting:** ACES tone mapping, a procedural HDRI environment, soft cascaded sun shadows, atmospheric scattering and volumetric fog.
- **Materials:** PBR whose roughness, metalness and normals come from procedural noise, with clearcoat and micro-distortion.
- **Post:** SSAO, bloom (threshold 0.8, strength 0.4), motion blur and depth of field.
- **World:** GPU clipmap terrain and 100k–500k instanced vegetation or particles.

**Tier policy:**
- **Ultra** runs every feature at full quality.
- **High** runs the cheaper versions.
- **Low and Medium** keep their passes. Only the display transform changes for them (§2). CI renders Low on SwiftShader and must stay as it is.

**Auto tier:** `auto` picks Ultra only when all of these hold:
- the backend is WebGPU;
- the device is not mobile;
- the adapter is not a fallback adapter;
- `deviceMemory` is ≥ 8, or unknown.

On an auto-picked Ultra, a first race with p95 > 33 ms saves High for this browser (`noteAutoFrameTime`, stored under `cr.render.autoTier`). An Ultra the player picks never downgrades.

## 2. Display transform (all tiers)
- `ACESFilmicToneMapping` (`render/engine/tone.ts`).
- Every theme exposure is ×`ACES_EXPOSURE` = 0.72 and every grade saturation is ×`ACES_SATURATION` = 1.13 (`env/look.ts`).
- **Calibration** (test `apps/client/test/ultra-foundations.test.ts`):
  - **Method:** a CPU mirror of three's ACES and Neutral, compared over brand, road, grass, sky and kerb swatches at 0.6–1.2× lighting.
  - **Result:** mean ΔE_OKLab < 0.02; the brand orange is < 0.03. Highlights roll off filmically.
- Portraits (`render/portrait`) keep Neutral, because they are UI art.

## 3. Tier matrix (`render/quality.ts` is the source of truth)

| | High | Ultra |
|---|---|---|
| Sun shadows | CSM 3×2048, maxFar 300 m, λ 0.7, fade, PCF r=2 | CSM 4×4096, maxFar 600 m, λ 0.8, fade, PCSS (WebGPU) / PCF r=2 (WebGL2) |
| AO | GTAO post, half res | GTAO from the prepass, full res, into indirect light only + contact shadows |
| AA | MSAA 4× | TRAA + sharpen 0.2 |
| Motion blur / DoF | radial boost blur / DoF in the showcase | camera + object motion blur (McGuire) / cinematic DoF (intro, grid, finish, results, showcase) |
| Bloom | threshold 0.8, strength 0.4, radius 0.55 on `hdr·exposure + emissive` | same |
| Sky / fog | Preetham / analytic aerial perspective | Hillaire LUT atmosphere / aerial perspective + volumetric correction (64 steps, ½ res, 200 m) |
| Terrain | baked mesh + clipmap outside it ("hybrid"), 5 levels × 127, 2 m | full clipmap, 7 levels × 255, 1 m, horizon about 8 km |
| Grass / forest / weather | 150k ≤ 45 m / 10k / 30k | 400k ≤ 70 m + 100k tufts ≤ 250 m / 30k / 100k |
| Material profile / far plane | hq+tri / 1500 m | uq / 10 000 m |
| Budgets (draws / tris) | 500 / 6M | 800 / 30M |

**Dev query flags:** `?csm=0|N &grass=<k> &clip=0|1 &vol=0|1 &traa=0|1 &mb=0|1 &dof=0|1 &gfx=smoke`.
- `gfx=smoke` keeps every code path on but with tiny counts and map sizes, so software GL can render it.
- Use it for every SwiftShader screenshot and for `e2e/ultra.spec.ts`.

**Player settings** (`save.ts`, contract request `U-settings-postfx.md`):
- `velocityBlur` and `dof`, each `'tier' | 'off' | 'on'`.
- `motionBlur` keeps controlling the radial boost blur.
- `reducedMotion` turns off both blurs and the DoF transitions.

## 4. Ultra post chain (S-Post; `post/ultraChain.ts`, imported dynamically)
1. **prePass:** `pass(scene, cam)` on layer 0 only (`prePass.setLayers`). Effects live on `LAYER_FX` (`engine/layers.ts`).
   - MRT: `normal` (normalView) and `velocity` (VelocityNode, an NDC delta), both RGBA16F, plus depth.
   - Water and other depth-writing transparents stay in the prepass. Particles, flames, item VFX, headlight cones and the Time Attack ghost do not.
2. **GTAO and contact shadows** from the prepass, combined in `scenePass.contextNode = context({ getAO, getShadow })`.
   - AO darkens indirect light only (`builtinAOContext` semantics).
   - Contact shadows (`post/contactShadows.ts`) multiply into the sun's shadow.
   - The warm-up (`compileInContext`) must set the same `renderer.contextNode`, or the first frame recompiles everything.
3. **scenePass:** MRT `output` (HDR) and `emissive` (MaterialBlending), with no MSAA.
4. **HDR stages** from S-Light (`post/volumetric.ts`): `hdr·Tv + ΔL`.
5. **TRAA.**
   - It owns the jitter.
   - `reset()` when `PostFrameInput.cutSerial` changes.
   - Never combine it with `setResolutionScale` or dynamic resolution.
6. **DoF:** `dof(node, viewZ, focus, range, bokeh)`, where range is a transition in world metres. The blend is 0 while racing.
7. **Motion blur:** tile-max → neighbour-max → 16-tap depth-aware gather.
   - Shutter 1/120 s, scaled by dt and clamped to one tile.
   - Zero for one frame after a cut.
8. Radial boost blur and chromatic aberration, with the CA masked off the player kart.
9. **Bloom:** threshold 0.8 on `hdr·exposure + emissive·k`, with sky pixels (depth = far) scaled ×0.5. Strength 0.4, radius 0.55.
10. **Display:** `renderOutput` (ACES + sRGB), then CDL and split tone, speed lines, flash, vignette, hit, fade, then sharpen.

## 5. Rules every stream follows
- **Velocity.** Every material that moves vertices in `positionNode` (clipmap, ocean, grass, forest, weather, foliage wind) also writes `positionPrevious` when `builder.needsPreviousData()`. Use the previous-frame uniforms: `prevMainCamPos`, and time − dt for animated displacement. Otherwise TRAA and motion blur smear.
  - Props draw in a fixed instance order on velocity tiers (`TrackViewOptions.stableInstances`).
- **Alpha-0 MRT.** Transparent materials write `vec4(…, 0)` to the `normal` and `velocity` attachments under MaterialBlending, so sparks never overwrite them.
- **Camera position.** Camera-relative placement reads `FrameContext.u.mainCamPos`, never TSL `cameraPosition`, which is the light's camera in shadow passes. Use `castShadowPositionNode` for a cheaper shadow-pass path.
- **WebGL2.**
  - R32F is not filterable, so read heights with `.load()` and interpolate by hand.
  - PCSS is WebGPU only; it is gated in `tierSettings`.
  - No compute shaders in required paths; GPU placement happens in the vertex shader from `instanceIndex`.
- **GPU-driven instancing:** `Mesh` + `InstancedBufferGeometry.instanceCount` with no instanceMatrix, and `frustumCulled = false`.
- **Materials.** Everything goes through `MaterialLibrary` (`custom(key, make)` for system graphs), with ≤ 40 per scene. Per-theme variation comes from uniforms and vertex data.
- **Hot paths:** nothing allocates per frame.
- **Strings:** every user-visible string goes through `t()` in ko and en.
- **Theme files are not edited.** Per-theme presets live in `env/atmoPresets.ts` and `ground/biomes.ts`.

## 6. Foundation APIs
- **`render/systems/types.ts`:** `FrameSystem` (`id`, `order`, `init`, `update`, `dispose`) and `FrameContext`. `FrameContext` carries renderer, scene, camera, tier, ts, backend, kit, look, env, track, vis, meta, view, ground, poses and localSlot, plus the shared uniforms `u` (`mainCamPos`, `prevMainCamPos`, `kartPos[8]`, `dt`, `time`, `windDir`, `windStrength`).
- **`render/systems/registry.ts`:** a lazy `import.meta.glob('./*.system.ts')`. It loads only when `ts.systems`. RaceRenderer inits the systems after the track view and karts, before `createPost`/warm, and updates them after the camera director.
- **`render/ground/field.ts`:** `buildGroundField(vis)` returns:
  - the terrain lattice (`height`, `shade`, `present`) and `heightAt` / `normalAt`, which use the exact baked triangle split;
  - `road.dist`, the 1 m distance to drivable surfaces;
  - `textures()`: height R32F nearest, shade R8, road R8 (= dist/64), present R8.
  - `ground/index.ts` wraps it as `loadGroundField` (S-Terrain may move it into a Worker).
- **`render/post/stages.ts`:** `PostIO`, `HdrStage`, `HdrStageFactory` and `PostFrameInput`. `Post.frame(input)` runs every frame.
- **`Environment`:** `csm` (null until S-Light), `aerial(posW)`, `onCameraChange(cam)`.
- **Stubs:** `materials/terrainSurface.ts` (`terrainSurface(p, posW, nrmW, shade, roadDist)`) and `materials/wind.ts` (`windAt(posW, phase, mask, amp)`).
- **Other hooks:**
  - `CameraDirector.cutSerial` and `bumpCut()`; RaceRenderer bumps it when the local kart teleports;
  - `LAYER_FX` and `tagFx()`;
  - `TrackView.terrainMeshes` and the `stableInstances` option.

## 7. Per-theme scope
- **Far terrain** for every theme with a `.vis` terrain, except:
  - orbital (space);
  - ember (cave vault);
  - neon (city: flat ground only).
  - Coral gets a Gerstner ocean clipmap instead of the flat water plane.
- **Grass** only on grassy biomes: clayhill, canopy, spark circuit and lantern. The other themes get ground cover and weather that fit them:
  - frostbyte: snow tufts and ice crystals;
  - sunstone: dry grass and pebbles;
  - ember: ash and embers;
  - coral: kelp;
  - neon: puddles and debris;
  - orbital: none.

## 8. What cannot be measured in this container
There is no GPU here, so none of these can be measured:
- real frame times;
- the GPU cost of 500k blades;
- PCSS cost;
- full-resolution temporal quality.

**Ways to check correctness anyway:**
- pure JS mirrors of the TSL height and placement functions, tested in node;
- readback-parity pages on SwiftShader;
- debug views (`?post=velocity|ao|coc`, `?csmDebug=1`);
- a `?bench=1` flythrough that reports p50/p95 plus GPU timestamps on the player's own GPU.
