# ClaudeRider: web rendering and audio tech stack (research snapshot, 29 Sep 2026)

**How this was researched.** The WebSearch budget for the session had already run out, and the egress proxy blocked threejs.org, MDN, caniuse, namu.wiki, the Nexon sites, Wikipedia, Steam, Reddit and the three.js forum. So the findings come from four places: npm registry metadata, **the three@0.186.1 source tarball itself** (read locally and deleted afterwards), GitHub repos/wikis/issues, and raw example files from the `r186` tag. Numbers taken from source code are the most reliable in this report. Anything marked **PROPOSED** is a design value I worked out myself, not a sourced fact.

---

## 1. Recommendation

**Use Three.js r186 (`three@0.186.1`, MIT) with `WebGPURenderer` from `three/webgpu`, write every material in TSL (node materials), and build post-processing only from the built-in TSL display nodes run through `THREE.RenderPipeline`.** Do not use pmndrs/postprocessing. Do not use `WebGLRenderer`. Pin the exact version, because r187 on dev already breaks APIs this project will use.

Reasons:
1. **One code path covers every browser.** `WebGPURenderer` tries WebGPU first. If that fails, it switches itself to a WebGL2 backend (source: `getFallback = () => new WebGLBackend(parameters)`, with the warning "WebGPU is not available, running under WebGL2 backend"). TSL compiles to WGSL through `WGSLNodeBuilder` and to GLSL through `GLSLNodeBuilder`. The same shaders and post chain therefore run on Chrome/Edge/Safari 26 (WebGPU) and on Linux or Firefox-Android (WebGL2). There is also a `forceWebGL: true` option for testing the fallback.
2. **r186 includes most of what a stylized racer needs:**
   - `SunLight` with 2-cascade CSM
   - `SkyMesh` with built-in clouds
   - `WaterMesh`
   - `MeshToonNodeMaterial` + `toonOutlinePass`
   - bloom, SMAA, FXAA, TRAA, motion blur, radial blur, 3D LUT, depth of field, GTAO, chromatic aberration, lens flare, FSR1 and TAAU nodes
   - GPU `LightProbeGrid`, `ProgressiveLightMapGPU`, soft particles
   - new procedural `generators/` modules: Terrain, Forest, Tree, City, plus Car, Person, Streetlight and more
3. **It is the largest ecosystem, and the easiest one to generate procedurally in code** (no artist on this project).
4. **pmndrs/postprocessing is a dead end here.** v6.39.5 (Zlib, 9 Sep 2026) works only with WebGLRenderer and has peer `three >=0.168 <0.187`. The v7 beta (7.0.0-beta.16) has peer `<0.184`, so it does not support r186 at all.

---

## 2. Version snapshot (npm registry, 29 Sep 2026)

| Package | Version | License | Note |
|---|---|---|---|
| three | 0.186.1 (0.186.0 on 8 Sep; 0.186.1 on 24 Sep 2026) | MIT | Releases have been roughly every 1–2 months since r170 (Oct 2024) |
| @types/three | 0.186.0 | MIT | Matches r186 |
| vite | 8.3.1 | MIT | Needs Node ^20.19 or >=22.12 |
| typescript | 7.0.2 latest; **use 6.0.3** | Apache-2.0 | typescript-eslint 8.71 peers `typescript <6.1.0` |
| vitest | 5.0.2 | MIT | Node ^22.12 |
| @babylonjs/core | 9.28.0 | Apache-2.0 | Havok plugin 1.3.14 is MIT |
| playcanvas | 2.22.6 | MIT (engine only) | Editor is a separate proprietary SaaS |
| postprocessing | 6.39.5 | Zlib | WebGL only; peer three <0.187 |

Three.js release cadence from npm publish times: r183 (18 Feb 2026), r184 (16 Apr), r185 (25 Jun), r186 (8 Sep).

---

## 3. WebGPURenderer vs WebGLRenderer, browser support and caveats

**Browser support** (gpuweb Implementation-Status wiki):

| Browser | WebGPU status |
|---|---|
| Chromium on Windows, macOS, ChromeOS | Shipped since 113 |
| Chromium on Android | ARM/Qualcomm/Intel from 121; Imagination GPUs from 139 |
| Chromium on Linux | Intel Gen12+ from 144; NVIDIA on Wayland from 147 |
| Firefox | Windows from 141 (Jul 2025); Apple-Silicon macOS from 145 (macOS 26), all macOS versions from 147; Linux and Android not shipped yet (targeted for 2026) |
| Safari 26 | On by default on macOS, iOS and iPadOS |

That leaves Linux, older Android devices and Firefox-Android on the WebGL2 fallback. The three.js WebGPU backend requests the adapter with `featureLevel: 'compatibility'`. If the device lacks `core-features-and-limits`, it sets `compatibilityMode` and turns MSAA off (`renderer._samples = 0`).

**Known costs of WebGPURenderer, and what to do about them:**
- **Material initialization is slow.** Issue #33821 (Jun 2026, open): 2,100 ms vs 131 ms (16x slower) with unique materials; 1,029 ms vs 28 ms (36x slower) when materials are reused.
  - Keep unique materials to about 40 or fewer per track (PROPOSED). Vary appearance through attributes or uniforms, not new materials.
  - Call `await renderer.compileAsync(scene, camera)` behind the loading screen.
- **Per-object overhead is high.** Issue #30560 (High priority, open): 20,000 non-instanced meshes ran at about 60 fps on WebGL vs about 15 fps on WebGPU (M1 Pro).
  - Keep draw calls low with InstancedMesh, BatchedMesh and merged per-chunk track meshes.
- **Not supported:** `ShaderMaterial` / `RawShaderMaterial` / `onBeforeCompile`. `NodeLibrary.fromMaterial` only maps built-in material types, so custom GLSL has to be rewritten in TSL. There is an experimental `examples/jsm/tsl/WebGLNodesHandler.js` ("Compatibility loader and builder for TSL Node materials in WebGLRenderer"), but it should not be the base of the project.
- **Compute shaders:** real compute runs on WebGPU. The WebGL2 fallback emulates `renderer.compute()` with transform feedback (see `WebGLBackend.compute`), which rules out atomics and workgroup memory. Design VFX so they do not need compute (see §8).
- **Bundle size (measured, unminified gzip):**
  - `three.core.js` 286 KB + `three.webgpu.js` 444 KB, about 730 KB total
  - WebGL path: core + `three.module.js` 131 KB, about 417 KB
  - After Vite minify and tree-shake I estimate about 400–550 KB gzip for the WebGPU path (estimate, not measured).

**API changes to know about** (Migration Guide):
- r179: Timer moved into core; `TRAAPassNode` became `TRAANode`; `label()` became `setName()`.
- r180: `RGBELoader` became `HDRLoader`; new DepthOfField API.
- r181: `renderAsync`/`computeAsync` deprecated in favor of `await renderer.init()`; `PassNode.setResolution` became `setResolutionScale`.
- r182: `PCFSoftShadowMap` deprecated (PCF is soft by default); `colorBufferType` became `outputBufferType`.
- r183: `PostProcessing` became `RenderPipeline`; Clock deprecated in favor of `Timer`; Sky gamma changed.
- r186: `PCFSoftShadowMap` removed for WebGPU; `LightProbeGrid` split into a WebGPU version and `LightProbeGridWebGL`; `SimplifyModifier` now uses meshoptimizer and is async; `Source` became `TextureSource`; Sky `up` uniform removed.
- r187 (dev, not yet released): PMREM becomes cube-based and `CubeUVReflectionMapping` is removed; `renderer.library.addLight()` is replaced by `CustomLight.registerNode()`.
- **Conclusion: pin `"three": "0.186.1"` exactly.**

---

## 4. Engine comparison

| | Three.js r186 | Babylon.js 9.28 | PlayCanvas 2.22.6 |
|---|---|---|---|
| License | MIT | Apache-2.0 | MIT engine; Editor proprietary |
| WebGPU | WebGPURenderer with automatic WebGL2 fallback; TSL writes to WGSL and GLSL | Mature WebGPU engine; WGSL; Frame Graph; Node Material, Node Geometry and Node Render Graph editors | WebGL2 + WebGPU; WGSL shader chunks |
| Included | Rendering, post, loaders/exporters, Web Audio wrappers, procedural generators | Havok physics (MIT WASM), GUI, audio engine, Inspector v2, IBL shadows, gaussian splats | Physics (ammo.js), animation state graph, positional audio, splats |
| Size (measured) | ~730 KB gz unminified (core + webgpu); 20 MB unpacked | Full UMD `babylon.js` 8.6 MB raw / 1.85 MB gz; ES modules tree-shake; 71.6 MB unpacked | `playcanvas.min.js` 2.47 MB raw / 0.63 MB gz |
| Fit for code-only procedural work | Best: most examples and most community code | Good, but heavier and more OOP-framework | Strong runtime; its workflow assumes the Editor |

**Verdict:** Three.js. Babylon would be the pick for an "everything included" engine (physics, GUI, audio), but ClaudeRider wants arcade kart physics written by hand and procedural everything, which suits Three.js/TSL better. PlayCanvas is best suited to Editor-driven teams.

---

## 5. Post-processing chain (TSL nodes + `RenderPipeline`)

Patterns verified in r186 example sources: `webgpu_postprocessing_motion_blur`, `_bloom_emissive`, `_traa`, `_3dlut` and `_radial_blur`.

```ts
import * as THREE from 'three/webgpu';
import { pass, mrt, output, emissive, velocity, uniform, vec4, screenUV, renderOutput } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { smaa } from 'three/addons/tsl/display/SMAANode.js';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { SunLightNode } from 'three/addons/lights/SunLightNode.js';

const renderer = new THREE.WebGPURenderer({ antialias: false, powerPreference: 'high-performance' });
await renderer.init();
renderer.library.addLight(SunLightNode, SunLight);   // r186 API (r187 changes this)
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;

const scenePass = pass(scene, camera);
scenePass.setMRT(mrt({ output, emissive: vec4(emissive, output.a), velocity }));
const beauty = scenePass.getTextureNode('output');
const glow   = bloom(scenePass.getTextureNode('emissive'), 1.0, 0.5); // strength, radius, threshold=0
const boost  = uniform(0);                                            // 0..1, driven by the gameplay layer
const mb     = motionBlur(beauty, scenePass.getTextureNode('velocity').mul(boost)); // 16 samples by default
const vign   = screenUV.distance(.5).remap(.6, 1).mul(2).clamp().oneMinus();
const pipe   = new THREE.RenderPipeline(renderer);
pipe.outputColorTransform = false;                   // SMAA/FXAA need sRGB input
pipe.outputNode = smaa(renderOutput(mb.add(glow)).mul(vec4(vign, vign, vign, 1)));
// per frame: pipe.render();
```

**Order of the chain:**
1. Scene pass with MRT (color, emissive, velocity; add normal and depth only when GTAO is on)
2. GTAO (High tier only), then motion blur or radial blur during boost
3. Add bloom from the emissive MRT (selective glow for flames, sparks, neon, item boxes)
4. Speed-line overlay
5. `renderOutput` for tone mapping and sRGB
6. Grading: `lut3D(node, texture3D(lut), size, intensity)`, or the procedural TSL `cdl()`, `saturation()`, `vibrance()` in `ColorAdjustment.js`
7. SMAA or FXAA
8. Vignette and a little `chromaticAberration(node, strength, center, scale=1.1)` during boost

**Node defaults read from source:**
- **Bloom:** 5 mips at `resolutionScale` 0.5; defaults strength 1, radius 0, threshold 0, smoothWidth 0.01.
- **radialBlur:** center (0.5, 0.5), weight 0.9, decay 0.95, count 32 (recommended 16–64), exposure 5.
- **GTAO:** samples 16, radius 0.25.
- **motionBlur:** numSamples 16.

**Anti-aliasing:**
- TRAA must run without MSAA (per source). It ghosts at high speed, so keep it for photo mode or garage only.
- In-race recommendation:
  - High tier: MSAA 4x on the scene pass (`pass(scene, camera, { samples: 4 })`)
  - Medium tier: SMAA
  - Low tier: FXAA
- MSAA is unavailable in WebGPU compatibility mode.

**Depth of field** (lobby and garage only): `dof(node, viewZ, focusDistance, focalLength, bokehScale)`.

**Boost camera "juice"** (PROPOSED):
- FOV 70° to 80° with a time constant of about 0.25 s
- Radial or motion blur amount ramps from 0 to 1 over 0.15 s
- Chromatic aberration strength up to about 0.4
- Screen-edge speed lines

**Speed lines, cheap version:** polar coordinates in TSL (`atan` of `screenUV - 0.5`), 1-D noise over angle scrolled by time, a radius mask greater than 0.35, intensity driven by speed.

**Tone mapping.** Three ships ACES Filmic, AgX and Neutral. Neutral is Khronos PBR Neutral: it "reproduces base color exactly" for a dielectric under unit white light and causes "no hue shifts".
- **Use `NeutralToneMapping`, exposure about 1.0.** It keeps brand colors true (the Claude coral stays coral; ACES would push it toward yellow). Add punch afterwards with a grade: `cdl` slope 1.05, saturation 1.1 (PROPOSED).
- Offer AgX as an alternative "filmic" option.

---

## 6. Lighting and shadows

- **Sun:** `SunLight` from `three/addons/lights/SunLight.js`.
  - Hard-coded to 2 cascades with a 10% cascade fade; default `mapSize` 1024×1024 per cascade.
  - Fits cascades up to `shadow.camera.far` automatically.
  - The official example uses `far` 1000, resolution 2048 and `normalBias` 0.05.
  - For a racer, shadow distance 120–200 m (PROPOSED); resolution 2048 on High, 1024 on Medium.
  - `examples/jsm/csm/CSMShadowNode.js` is available if 3–4 cascades are needed.
- **Sky and ambient:** `SkyMesh` has uniforms turbidity, rayleigh, mieCoefficient, mieDirectionalG, sunPosition, and clouds (`cloudScale` 0.0002, `cloudSpeed` 0.00002, `cloudCoverage` 0.4, `cloudDensity` 0.4, `cloudElevation` 0.5), plus `showSunDisc`.
  - Build an environment map with `pmremGenerator.fromScene(skyScene)` into `scene.environment`, as the sunlight example does (`environmentIntensity` 0.5). Regenerate it only when time of day changes.
  - Add a `HemisphereLight` for sky/ground tint.
  - This is the "procedural HDRI" approach: no HDR files needed.
- **Baked AO in vertex colors** (PROPOSED): when a track is generated, ray-cast hemisphere AO per vertex with `three-mesh-bvh` in a Web Worker.
  - About 16 rays, maximum distance 4 m.
  - Road vertices near walls get darker, as do props' contact points.
  - Store the result in a `color` or `ao` attribute and multiply it in TSL.
  - Cache it in IndexedDB keyed by track seed.
  - This costs nothing at runtime and replaces SSAO on Low and Medium.
- **Optional High/Ultra extras** (both WebGPU-only classes with WebGL variants):
  - `LightProbeGrid`: L2 SH irradiance grid baked entirely on the GPU, applied automatically to lit node materials.
  - `ProgressiveLightMapGPU`: accumulated lightmaps for static geometry.
- **Avoid:** many real-time point lights (use emissive plus bloom; `ClusteredLighting.js` exists if needed) and planar `Reflector` (it re-renders the whole scene).

---

## 7. Matching the KartRider: Drift look (stylized PBR + toon characters)

KartRider: Drift is an Unreal Engine title. I believe it is UE4 and supports 4K/HDR, but that comes from prior knowledge and I could not verify it this session because namu.wiki and the Nexon sites were blocked. Its look is bright, saturated and toy-like, with soft skylight, soft shadows and heavy bloom on boosts. It is not hard cel shading.

**Plan:**
- **World:** `MeshStandardNodeMaterial` with low-frequency albedo from gradients or noise.
  - Metalness 0–0.1, roughness 0.55–0.9.
  - Vertex AO, subtle environment reflections.
- **Karts:** `MeshPhysicalNodeMaterial` with clearcoat 1 and clearcoatRoughness about 0.1 for "candy paint", on at most 8 karts.
- **Characters and karts:** `MeshToonNodeMaterial` with a 3–4 texel `RedFormat` DataTexture gradient map (NearestFilter), plus a fresnel rim, for example `emissiveNode = rim.mul(pow(1 - dot(normalView, positionViewDirection), 3))`.
  - Outlines through `toonOutlinePass(scene, camera, color, thickness = 0.003, alpha)`. Per the source it outlines **only** MeshToon materials, so the world stays outline-free. Each toon object costs one extra draw.
  - Alternative: an inverted-hull BackSide mesh per character.
- **The `partId` pattern** (used by the r186 City, Car and Person generators): merge all parts into one geometry with a baked `partId` attribute. One material then picks colors from a uniform palette, giving one draw per character. Character variations become palette and accessory swaps.

---

## 8. Sky, clouds, water, foliage and VFX

- **Clouds:** `SkyMesh` clouds, plus stylized "cotton" clusters: low-poly icosphere blobs with toon shading, instanced, far away. Skip volumetric clouds; `webgpu_volume_cloud` costs too much.
- **Water:** stylized depth-fade shader as in `webgpu_backdrop_water`:
  - `viewportLinearDepth.sub(linearDepth())` for shore foam and color depth
  - `viewportSharedTexture` for refraction
  - noise normals
  - PMREM reflections
  - `WaterMesh` (TSL) is available for a reflective lake.
- **Noise sources** for textures and shaders: TSL `mx_noise_*`, `mx_fractal_noise_*`, `mx_worley_*`, `triNoise3D`, `hash`, and addons `voronoiNoise.js`, `curlNoise.js`, `Bayer.js`, `triplanarTexture`.
- **Foliage:** InstancedMesh grass cards and trees, placed within about 60 m of the track by a noise mask.
  - Wind in `positionNode`: `positionLocal + vec3(sin(time*1.7 + h), 0, cos(time*1.3 + h)) * 0.08 * heightMask`, where `h = hash(instanceIndex)` (PROPOSED values).
  - `ForestGenerator` (r186) draws 500k trees in one instanced call and gates shader detail by distance. A useful reference.
- **Particles: use "stateless" GPU particles, not compute.**
  - Spawn on the CPU into a ring buffer of instanced attributes (`p0`, `v0`, `spawnTime`, `seed`, `tier`) with `addUpdateRange` partial uploads.
  - The vertex node computes `age = time - spawnTime` and `p = p0 + v0*age + 0.5*g*age²`, plus size and color over life.
  - Works the same on WebGPU and the WebGL2 fallback; CPU work only happens at spawn.
  - Use `SpriteNodeMaterial` or velocity-stretched billboards (`billboarding()` exists), and `softParticles()` from `tsl/utils/SoftParticles.js` for smoke.
- **Effect recipes** (PROPOSED):
  - **Drift sparks:** additive, stretched, 0.25–0.45 s life, 40–80 per second per wheel. Color tiers that are original to ClaudeRider: white → Claude coral (#D97757) → violet, keyed to drift charge. Written into the emissive MRT so they bloom.
  - **Boost flame:** two cone meshes with scrolling noise in UV, additive, emissive intensity 4–8. Plus a heat-shimmer sprite.
  - **Tire smoke:** alpha-blended soft particles, 0.8–1.5 s life, size 0.3 → 2.0 m.
  - **Skid marks:** a ribbon ring buffer per rear wheel (2 vertices per 0.25 m sample, about 2,000 segments), raised 1–2 cm or with polygonOffset, faded by age in the shader. The pmndrs racing-game uses 500 instanced planes (size 0.4, opacity 0.5); ribbons look better and cost fewer draws.

---

## 9. Performance budgets and quality tiers (all PROPOSED)

Target: 60 fps at 1080p on a mid laptop (Iris Xe, Radeon 680M, M1, or GTX 1650 class). That means GPU ≤ 12 ms and CPU main thread ≤ 8 ms: physics 2 ms, game logic and AI 1.5 ms, render submission ≤ 4 ms.

| Tier | Pixel ratio | Shadows | AA | Post | Draws | Triangles in view |
|---|---|---|---|---|---|---|
| Low | 1.0 (dynamic 0.7–1.0 via `pass.setResolutionScale`, optional `fsr1`) | 2×1024, far 80 m | FXAA | Bloom, radial boost blur | ≤150 | ≤0.6M |
| Medium | ≤1.25 | 2×1024, far 120 m | SMAA | + LUT grade, speed lines | ≤250 | ≤1.2M |
| High | ≤1.5 | 2×2048, far 200 m | MSAA 4x | + GTAO at half resolution, velocity motion blur | ≤400 | ≤2M |
| Ultra/photo | native | 2×2048 | TRAA | + DoF / SSR | — | — |

**Shared budgets:**
- Each kart plus driver: ≤12k triangles at LOD0, 4k beyond 25 m, 1.2k beyond 70 m.
- VRAM ≤ 256 MB, of which textures ≤ 128 MB. An RGBA8 1024² texture with mips is about 5.3 MiB; BC7/ASTC 4x4 at 8 bpp is about 1.3 MiB.
- Camera far plane about 800 m, with fog hiding pop-in.
- Split the track into chunks of about 50 m so frustum culling works.
- **Occlusion:** precompute a PVS per track segment by sampling camera positions along the spline at build time.
- **Instancing:** use `InstancedMesh` for identical props. Use `BatchedMesh` for mixed static props; it has `perObjectFrustumCulled` and `sortObjects`, both default true.
- **Tier selection:** automatic, from the adapter and the first 3 s of frame times.
- **Profiling:** `stats-gl` 4.2.3 supports WebGPURenderer, with GPU timestamps when the device has `timestamp-query`. The r186 `Inspector` also has Timeline and Memory tabs.
- **Asset compression:** since assets are procedural, KTX2 matters mostly if canvas textures are baked at build time. Basis UASTC is about 8 bpp; ETC1S about 0.3–3 bpp. For any `.glb` files, use meshopt (`EXT_meshopt_compression`, vertex data 2–4x smaller, decodes at 3–6 GB/s) rather than Draco.

---

## 10. Procedural geometry

- **Road ribbon:**
  - Control points go into `new CatmullRomCurve3(pts, true, 'centripetal')`; centripetal is the default and avoids cusps.
  - Sample by arc length with `getPointAt(u)` or `getTangentAt` at about 1 m spacing.
  - **Frames:** `Curve.computeFrenetFrames` in three is the Bloomenthal rotation method, seeded from the tangent's smallest component, so it is not aligned to "up". **Write your own frames:**
    - On flat or hilly tracks, use up-constrained frames: `B = normalize(T × worldUp)`, `N = B × T`.
    - Use double-reflection RMF (Wang et al., 4th-order accurate at about the same per-frame cost as the projection or rotation methods) only for loops and corkscrews.
    - Spread any twist left over at loop closure evenly along the track.
  - **Banking:** roll about T by a per-control-point bank angle, interpolated with the same spline.
  - **Cross-section:** a shared profile (road crown, curbs with alternating color from u, shoulders) swept along the frames. u = lateral position; v = arc length ÷ repeat length.
  - Keep the arrays (s → position, T, N, B, width) for AI, lap progress, ranking and respawn in track coordinates (s, d).
- **Barriers, guardrails, tunnels:** sweep other profiles over sub-ranges of the same frames.
  - Tunnels: a half-ellipse arch with inward normals, instanced emissive light strips, and environment intensity lerped down inside.
  - The new `LoftGeometry` (sections → skin, with `capStart`/`capEnd`) and `ExtrudeGeometry` with `extrudePath` also help.
- **Terrain:** a plane displaced by fBm, flattened near the track by a distance-to-spline mask, with vertex color from height and slope. `TerrainGenerator` (domain-warped noise, thermal erosion, TSL grass/rock/snow material) is a reference.
- **Props and buildings:** boxes plus a window-grid shader (`fract` of UV × floors, emissive windows at night), `RoundedBoxGeometry`, Lathe cones and pylons, and CanvasTexture signs with original names and OFL fonts. Borrow the partId and bake-to-one-geometry technique from `SkyscraperGenerator`. Its NYC realism does not fit the style.

---

## 11. Procedural characters, animation and glTF

- **Build the mascot from primitives:**
  - body from `LatheGeometry` (pear profile), head from a scaled sphere, limbs from `CapsuleGeometry`
  - "spark" emblem from `ExtrudeGeometry` of an n-ray star shape with bevel
  - eyes and mouth from CanvasTexture decals or small flattened spheres
  - merge with `BufferGeometryUtils.mergeGeometries` and a partId attribute
- **Smoother blob option:** smooth-min SDF of the primitives, polygonized with `examples/jsm/libs/surfaceNet.js` (MIT) or `MarchingCubes` at about 64³. Then simplify with meshoptimizer (the `SimplifyModifier` in r186 is meshopt-based and async) to about 5k triangles, in a worker, cached.
- **Animation:**
  - A rigid hierarchy of pivots is enough.
  - Procedural motion: bob `A·sin(ωt)` scaled by speed; body roll `-steer·k`; head turned toward the turn; squash-and-stretch spring on landing (scaleY 0.85 → 1.1).
  - Emotes as `AnimationClip`s built from `KeyframeTrack`s in code, played by `AnimationMixer`.
  - If deformation is needed, use a `SkinnedMesh` with 5–8 bones and auto-weights from distance to bone segments.
- **glTF:** `GLTFExporter` supports KHR_mesh_quantization, EXT_mesh_gpu_instancing, KHR_materials_{emissive_strength, clearcoat, unlit, …}, EXT_texture_webp and KHR_lights_punctual.
  - **TSL node graphs do not export.** Bake partId palettes into vertex colors before exporting.
  - In Node the exporter needs a FileReader polyfill; otherwise write glb with `@gltf-transform/core` 4.5.1 and apply meshopt/quantize through `@gltf-transform/functions`.
  - Exported glbs are useful for caching and as reference renders for the Codex image-generation step.

---

## 12. Audio (Web Audio)

- **Engine:** synthesize with native nodes for each nearby kart, or pre-render loops once.
  - Signal chain: sawtooth at f0, square at 2·f0 (gain 0.3), sine at f0/2 (gain 0.4), then a tanh `WaveShaper`, then a lowpass (600 + 3000·throttle Hz, Q about 1). Add bandpassed noise at about 4·f0 for rasp.
  - Stylized fake gears: 3–4 "shifts" with a 30% RPM drop.
  - Parameter changes via `setTargetAtTime`, τ 0.03–0.05 s.
  - Frequency (PROPOSED): 2-stroke firing frequency `f0 = rpm/60`, idle about 30 Hz, redline about 200 Hz. For a toy feel, map f0 to 55–220 Hz.
  - Cheaper for 8 karts: render 3 loops (idle, mid, high) in an `OfflineAudioContext` at startup, then crossfade them and set `playbackRate = rpm/refRpm`.
  - Physically based alternative: `Antonio-R1/engine-sound-generator` (MIT; AudioWorklet or WASM waveguides, `rpm` AudioParam, based on Baldan 2015).
- **Drift screech:** noise through a bandpass at 1–3 kHz, gain from slip angle, with 6–9 Hz AM wobble.
- **Boost whoosh:** noise bandpass sweeping 400 Hz → 4 kHz over about 0.3 s, a sine "thump" at about 60 Hz, and a speed-scaled wind layer.
- **Spatial audio:** three's `PositionalAudio` uses an HRTF panner by default (checked in source). `AudioListener` goes on the camera.
  - refDistance about 5, rolloff about 1.5, maxDistance about 150 (PROPOSED).
  - Web Audio no longer does Doppler, so fake it with `playbackRate *= c/(c − v_radial)`.
  - Voice limits: player engine at full quality, the 3 nearest AI engines simplified, everything else culled. DynamicsCompressor on the master bus; duck music about 3 dB during boost.
- **Music and SFX:**
  - Tone.js 15.1.22 (MIT, last published Apr 2025) for procedural 150–170 BPM loops, or a small custom lookahead scheduler.
  - `zzfx` 1.3.2 (MIT, about 0.1 MB) for UI and item SFX.
  - CC0 tracks, or CC-BY with attribution.
  - **Avoid** `@strudel/web` (AGPL-3.0). Check `jsfxr` first: its npm license field is empty.

---

## 13. npm packages

**Use:**
- three 0.186.1 (MIT) and @types/three 0.186.0
- vite 8.3.1 and typescript 6.0.3
- three-mesh-bvh 0.9.15 (MIT): AO baking, raycasts
- @gltf-transform/core and /functions 4.5.1 (MIT)
- meshoptimizer 1.3.0 (MIT)
- stats-gl 4.2.3 (MIT)
- lil-gui 0.21.0 (MIT), or the built-in Inspector
- simplex-noise 4.0.3 (MIT): CPU noise
- troika-three-text 0.52.5 (MIT): 3D name tags; check it works with WebGPU
- tone 15.1.22 (MIT), zzfx 1.3.2 (MIT)
- ws 8.22.0 (MIT), @msgpack/msgpack 3.1.3 (ISC)
- Optional: @dimforge/rapier3d-compat 0.21.0 (Apache-2.0) for prop and debris collisions

**Avoid with the WebGPU path:**

| Package | Reason |
|---|---|
| postprocessing 6.39.5 / 7 beta | WebGL only; peers <0.187 / <0.184 |
| n8ao 2.0.1 | WebGL post |
| three.quarks 0.17.1 | WebGPU still on its roadmap |
| three-nebula | WebGL |
| three-good-godrays | peer ≤0.182; no license |
| realism-effects | WebGL |

---

## 14. Risks

1. **Performance on the WebGL2 fallback** has not been measured on the target laptops. Build a benchmark scene early: 8 karts, a full track, the whole post chain.
2. **Breaking changes every release:** stay on r186 until the game ships.
3. **Material-count and draw-count limits** (#33821, #30560) shape the whole content pipeline: batching and a partId palette are required, not optional.
4. **Unverified KartRider: Drift facts:** engine and art direction come from memory; Nexon pages and namu.wiki were blocked.

## Key parameters

- **three.js version**: 0.186.1 (r186), pin exactly; r186.0 published 2026-09-08, 186.1 on 2026-09-24 [sourced] — https://registry.npmjs.org/three
- **Renderer**: WebGPURenderer (three/webgpu) with automatic WebGL2 fallback; forceWebGL option for testing [sourced] — three@0.186.1 src/renderers/webgpu/WebGPURenderer.js
- **Post-processing API**: THREE.RenderPipeline (PostProcessing renamed in r183) with TSL display nodes [sourced] — three@0.186.1 src/renderers/common/PostProcessing.js; Migration Guide
- **pmndrs/postprocessing compatibility**: v6.39.5 peer three >=0.168 <0.187, WebGL only; v7.0.0-beta.16 peer <0.184 [sourced] — https://github.com/pmndrs/postprocessing/releases
- **Tone mapping**: NeutralToneMapping, exposure 1.0; grade afterwards with cdl slope 1.05 and saturation 1.1 [proposed] — Khronos PBR Neutral README (no hue shifts); design reasoning
- **SunLight CSM cascades**: 2 (hard-coded), cascade fade 0.1, default mapSize 1024 per cascade [sourced] — three@0.186.1 examples/jsm/lights/SunLightShadow.js
- **Shadow distance / resolution per tier**: Low 80 m @1024; Medium 120 m @1024; High 200 m @2048; normalBias 0.05 [proposed] — webgpu_lights_sunlight example (far 1000, 2048, normalBias 0.05) adapted
- **Bloom defaults**: 5 mips, resolutionScale 0.5, strength 1, radius 0, threshold 0, smoothWidth 0.01; in-game strength ~1.0, radius ~0.5 on the emissive MRT [sourced] — three@0.186.1 examples/jsm/tsl/display/BloomNode.js; bloom_emissive example (2.5, 0.5)
- **radialBlur defaults**: center (0.5,0.5), weight 0.9, decay 0.95, count 32 (16-64), exposure 5 [sourced] — three@0.186.1 examples/jsm/tsl/display/radialBlur.js
- **motionBlur samples**: 16 by default; velocity scaled by a boost uniform from 0 to 1 [sourced] — three@0.186.1 examples/jsm/tsl/display/MotionBlur.js
- **GTAO defaults**: samples 16, radius 0.25; High tier only, at half resolution [sourced] — three@0.186.1 examples/jsm/tsl/display/GTAONode.js
- **Anti-aliasing per tier**: Low FXAA, Medium SMAA, High MSAA 4x on the scene pass, Ultra/photo TRAA (TRAA needs MSAA off) [proposed] — TRAANode.js note; design reasoning (TRAA ghosts at racing speed)
- **SkyMesh cloud defaults**: cloudScale 0.0002, cloudSpeed 0.00002, cloudCoverage 0.4, cloudDensity 0.4, cloudElevation 0.5, turbidity 2, rayleigh 1, mieCoefficient 0.005, mieDirectionalG 0.8 [sourced] — three@0.186.1 examples/jsm/objects/SkyMesh.js
- **Environment intensity from PMREM sky**: 0.5 [sourced] — webgpu_lights_sunlight.html r186
- **Toon outline thickness default**: 0.003 (toonOutlinePass), outlines only MeshToon materials [sourced] — three@0.186.1 src/nodes/display/ToonOutlinePassNode.js
- **Frame budget**: 60 fps; GPU <=12 ms at 1080p Medium on Iris Xe/680M/M1 class; CPU main thread <=8 ms [proposed] — design reasoning
- **Draw call budget**: Low <=150, Medium <=250, High <=400 (including shadow passes) [proposed] — design reasoning; three.js issue #30560 per-object overhead
- **Triangle budget (in view, including shadows)**: Low 0.6M, Medium 1.2M, High 2M [proposed] — design reasoning
- **Kart+driver LODs**: LOD0 <=12k tris, LOD1 4k at >25 m, LOD2 1.2k at >70 m [proposed] — design reasoning
- **Pixel ratio caps**: Low 1.0 (dynamic 0.7-1.0), Medium 1.25, High 1.5, Ultra native [proposed] — design reasoning; PassNode.setResolutionScale
- **VRAM budget**: <=256 MB total, textures <=128 MB; RGBA8 1024^2 with mips about 5.3 MiB [proposed] — design reasoning
- **Unique materials per track**: <=40; call renderer.compileAsync at load [proposed] — three.js issue #33821 (16-36x slower material init on WebGPU)
- **Track sampling / chunking**: Spline sampled every 1 m; render chunks of ~50 m; camera far ~800 m with fog [proposed] — design reasoning
- **Spline type**: CatmullRomCurve3 closed, 'centripetal' (the default), tension 0.5 is ignored for centripetal [sourced] — three@0.186.1 src/extras/curves/CatmullRomCurve3.js
- **Road frames**: Up-constrained frames (B = T x up) for normal tracks; double-reflection RMF for loops; spread closure twist evenly [proposed] — Wang et al. RMF (Microsoft Research); Curve.computeFrenetFrames is not up-aligned
- **Baked vertex AO**: 16 hemisphere rays per vertex, max distance 4 m, three-mesh-bvh in a worker, cached in IndexedDB [proposed] — design reasoning
- **Drift spark particles**: Life 0.25-0.45 s, 40-80 per second per wheel, additive, tiers white -> #D97757 -> violet [proposed] — design reasoning (original tiering)
- **Tire smoke**: Life 0.8-1.5 s, size 0.3 to 2.0 m, soft particles [proposed] — design reasoning; SoftParticles.js
- **Skid mark ribbon**: 2 verts per 0.25 m, ~2000 segments ring buffer per rear wheel, +1-2 cm offset, age fade [proposed] — design reasoning; pmndrs racing-game Skid uses 500 planes size 0.4 opacity 0.5
- **Boost camera FOV kick**: 70 deg to 80 deg, time constant ~0.25 s; blur ramp 0.15 s; chromatic aberration <=0.4 [proposed] — design reasoning
- **Engine synth fundamental**: f0 = rpm/60 (2-stroke); idle ~30 Hz, redline ~200 Hz; stylized range 55-220 Hz; 3-4 fake gears with 30% RPM drop [proposed] — engine acoustics reasoning; Antonio-R1/engine-sound-generator
- **Audio parameter smoothing**: setTargetAtTime time constant 0.03-0.05 s [proposed] — design reasoning
- **Positional audio**: HRTF panner (three default), refDistance 5, rolloff 1.5, maxDistance 150, Doppler emulated via playbackRate [proposed] — three@0.186.1 src/audio/PositionalAudio.js (HRTF default)
- **Drift screech**: Noise through a bandpass at 1-3 kHz, gain from slip angle, 6-9 Hz AM [proposed] — design reasoning
- **Boost whoosh**: Noise bandpass sweep 400 Hz to 4 kHz over 0.3 s + 60 Hz sine thump [proposed] — design reasoning
- **WebGPU browser support**: Chromium Win/Mac/ChromeOS 113+, Android 121+, Linux Intel 144+/NVIDIA Wayland 147+; Firefox Win 141+, macOS AS 145+; Safari 26 on macOS/iOS; Firefox Linux/Android not shipped [sourced] — https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- **Three bundle size (unminified gzip)**: three.core.js 286 KB + three.webgpu.js 444 KB (~730 KB); WebGL path ~417 KB [sourced] — measured from three-0.186.1.tgz
- **Babylon / PlayCanvas bundle size**: babylon.js UMD 8.6 MB raw / 1.85 MB gz; playcanvas.min.js 2.47 MB raw / 0.63 MB gz [sourced] — measured from npm tarballs babylonjs@9.28.0, playcanvas@2.22.6
- **TypeScript version**: 6.0.3 (typescript-eslint 8.71 peer <6.1.0), not 7.0.2 [sourced] — npm registry typescript-eslint peerDependencies
- **Vite version / Node**: vite 8.3.1; Node ^20.19 or >=22.12 [sourced] — npm registry vite
- **Mesh compression**: meshopt (EXT_meshopt_compression): vertex data 2-4x smaller, index ~1 byte per triangle, decode 3-6 GB/s; preferred over Draco [sourced] — https://github.com/zeux/meshoptimizer
- **Texture compression**: KTX2/Basis: ETC1S 0.3-3 bpp, UASTC 8 bpp (fast to BC7/ASTC) [sourced] — https://github.com/BinomialLLC/basis_universal

## Open questions

- KartRider: Drift's exact engine version (believed UE4) and art-direction details could not be checked: namu.wiki, kartdrift.nexon.com, Wikipedia and Steam were blocked by the egress proxy.
- What share of target users actually get WebGPU vs the WebGL2 fallback in late 2026? caniuse was blocked and needs telemetry or a later lookup.
- How fast is WebGPURenderer's WebGL2 fallback compared with WebGLRenderer on the target mid-range laptops? Needs an early benchmark scene: 8 karts, full track, full post chain.
- Do troika-three-text and three-mesh-bvh helpers work unchanged with WebGPURenderer/TSL materials in r186? Needs a quick prototype.
- r187 breaking changes (cube-based PMREM, CustomLight.registerNode replacing renderer.library.addLight): when, or whether, to upgrade after r186.
- Should the toon outline use toonOutlinePass (one extra draw per toon object, whole scene) or a per-character inverted hull, given the draw-call budget?
- License of jsfxr is missing in npm metadata; check before use, or use zzfx (MIT).

## Sources

- https://github.com/mrdoob/three.js/releases
- https://github.com/mrdoob/three.js/releases/tag/r186
- https://registry.npmjs.org/three
- https://registry.npmjs.org/three/-/three-0.186.1.tgz
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/files.json
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_postprocessing_motion_blur.html
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_postprocessing_bloom_emissive.html
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_postprocessing_traa.html
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_postprocessing_3dlut.html
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_postprocessing_radial_blur.html
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_lights_sunlight.html
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_compute_particles.html
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_backdrop_water.html
- https://raw.githubusercontent.com/mrdoob/three.js/r186/examples/webgpu_materials_toon.html
- https://github.com/mrdoob/three.js/wiki/Migration-Guide
- https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language
- https://github.com/mrdoob/three.js/issues/33821
- https://github.com/mrdoob/three.js/issues/30560
- https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- https://github.com/pmndrs/postprocessing
- https://github.com/pmndrs/postprocessing/releases
- https://registry.npmjs.org/postprocessing/-/postprocessing-6.39.5.tgz
- https://github.com/BabylonJS/Babylon.js/releases
- https://github.com/BabylonJS/Babylon.js
- https://github.com/playcanvas/engine/releases
- https://github.com/playcanvas/engine
- https://github.com/Alchemist0823/three.quarks
- https://github.com/RenaudRohlinger/stats-gl
- https://github.com/zeux/meshoptimizer
- https://github.com/BinomialLLC/basis_universal
- https://raw.githubusercontent.com/KhronosGroup/ToneMapping/main/PBR_Neutral/README.md
- https://www.microsoft.com/en-us/research/publication/computation-rotation-minimizing-frames/
- https://github.com/Antonio-R1/engine-sound-generator
- https://github.com/pmndrs/racing-game
- https://raw.githubusercontent.com/pmndrs/racing-game/main/src/effects/Skid.tsx
- https://raw.githubusercontent.com/pmndrs/racing-game/main/src/effects/Dust.tsx
- https://raw.githubusercontent.com/pmndrs/racing-game/main/src/effects/Boost.tsx
- https://registry.npmjs.org/ (latest metadata for vite, typescript, typescript-eslint, vitest, @babylonjs/core, @babylonjs/havok, babylonjs, playcanvas, tone, zzfx, howler, three-mesh-bvh, meshoptimizer, @gltf-transform/*, stats-gl, three.quarks, n8ao, three-good-godrays, @strudel/web, jsfxr, ws, colyseus, @msgpack/msgpack, @dimforge/rapier3d-compat)
