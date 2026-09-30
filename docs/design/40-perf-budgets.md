# 40 — Performance budgets

Owner: L11 (render budgets, BudgetTracker, post), L1/L3/L9 (CPU budgets of sim, AI, net), L4 (bake budgets, V20), orchestrator (bundle `pnpm size`, e2e perf).
Sources: `02-contracts.md` §E (thresholds), ADR-002 (renderer), ADR-011 (kart/mascot budgets), ADR-012 #19 (DPR caps), `05-tech-rendering.md` §5–§9, R1/R3/R9/R15.
Status keys: **[S]** sourced/contracted · **[P]** proposed.

Target hardware: 60 fps at 1080p on a mid laptop (Iris Xe, Radeon 680M, Apple M1, GTX 1650 class): **GPU ≤ 12 ms**, **main-thread CPU ≤ 8 ms** per frame [S 05].

---

## 1. Quality tiers (`QualityTier`, B10)
| Setting | Low | Medium | High | Ultra (P2) |
|---|---|---|---|---|
| Pixel-ratio cap (ADR-012 #19) | 1.0, dynamic resolution 0.7–1.0 (`pass.setResolutionScale`, optional FSR1) | 1.25 | 1.5 | native |
| Anti-aliasing | FXAA | SMAA | MSAA 4× (scene pass) | TRAA (photo/garage) |
| Sun shadows (2 cascades) | 1024², far 80 m, karts + landmarks cast | 1024², far 120 m | 2048², far 200 m | 2048², far 200 m |
| Bloom (emissive MRT) | on, res 0.5 | on | on | on |
| Boost blur | radial (16 taps) | radial (32 taps) | velocity motion blur (16) | same |
| Speed lines, LUT grade | — | on | on | on |
| GTAO | — | — | half res | half res |
| Particles | 25% | 60% | 100% | 150% |
| Foliage / scatter density | 40% | 70% | 100% | 100% |
| Transmission (Nova helmet, Frost shell, crystal caves) | faked (alpha + Fresnel) | faked | real | real |
| Camera far plane | 600 m + fog | 800 m | 800 m | 1000 m |
| Kart LOD switch | LOD1 at 20 m, LOD2 at 55 m | 25 / 70 m | 25 / 70 m | 35 / 90 m |
| Engine voices (detailed) | 1 player + 1 near, pre-rendered loops | 1 + 2 | 1 + 2 | 1 + 2 |
| Draw calls (all passes, incl. shadows) [S E] | ≤ 150 | ≤ 250 | ≤ 400 | — |
| Triangles in view (incl. shadows) [S E] | ≤ 0.6M | ≤ 1.2M | ≤ 2M | — |
| Unique materials per scene [S E] | ≤ 40 | ≤ 40 | ≤ 40 | ≤ 40 |
- Auto tier (default): start at Medium; after the first 3 s of racing, p90 frame time > 20 ms → Low; p90 < 10 ms on the WebGPU backend → High. The chosen tier is stored in settings; the user can override.
- Dynamic resolution (Low, optional on Medium): p90 > 16.7 ms over 2 s → render scale −0.1 (floor 0.7); p90 < 12 ms for 5 s → +0.1.
- The e2e perf suite runs **Low at 960×540** under SwiftShader (R15): counters are asserted, frame times are not.

## 2. Render budgets by category [P, sums to the tier caps]
### 2.1 Draw calls per frame
| Category | Low (150) | Medium (250) | High (400) |
|---|---|---|---|
| Track static, visible set (V20, PVS) | 70 | 140 | 250 |
| Karts + mascots (8 × ≤ 5: kart 2, mascot ≤ 3) | 40 | 40 | 40 |
| VFX systems (instanced: sparks, smoke, flames, skids, items) | 12 | 20 | 30 |
| Sky, terrain, water, far props | 6 | 8 | 10 |
| Name tags, in-world UI | 4 | 4 | 4 |
| Shadow passes (casters × 2 cascades) | 18 | 38 | 66 |

### 2.2 Triangles per frame
| Category | Low (0.6M) | Medium (1.2M) | High (2M) |
|---|---|---|---|
| Track static visible set | 0.35M | 0.8M | 1.4M |
| Karts + drivers (LOD mix; LOD0 ≤ 12k, LOD1 ≤ 4k, LOD2 ≤ 1.2k each) [S ADR-011] | 0.06M | 0.08M | 0.1M |
| VFX | 0.02M | 0.04M | 0.06M |
| Sky/terrain/water | 0.05M | 0.08M | 0.1M |
| Shadow passes | 0.12M | 0.2M | 0.34M |

### 2.3 Per asset
| Asset | Budget |
|---|---|
| Kart + driver | LOD0 ≤ 12k tris (kart ≤ 8k, mascot ≤ 4k), LOD1 ≤ 4k (> 25 m), LOD2 ≤ 1.2k (> 70 m) [S] |
| Mascot | ≤ 3 draws via the `partId` palette [S] |
| Vis chunk (≈ 50 m) | ≤ 8 / 10 / 12 draw groups and ≤ 20k / 30k / 40k tris (Low/Med/High, V20) |
| Track material slots | ≤ 24 unique (V20); scene total ≤ 40 |
| Props | `InstancedMesh` per kind; mixed statics in `BatchedMesh` (per-object culling on) |
| Particles | ring buffers: sparks 4096, smoke 1024, dust 512, item VFX 1024 instances at 100% |
| Skid ribbons | 2 × 2000 segments per kart (local + 3 nearest), ring buffers |

### 2.4 Memory
| Resource | Budget |
|---|---|
| VRAM total | ≤ 256 MB [S 05] |
| Textures | ≤ 128 MB; ≤ 1024² per texture (terrain splat 2048² on High); RGBA8 1024² with mips ≈ 5.3 MiB [S] |
| Geometry | ≤ 96 MB (track + karts + props) |
| JS heap | ≤ 300 MB steady in a race [P] |
| `.ctrk` | ≤ 1.5 MB per track [S E] |
| `.vis` | ≤ 2 MB gzip per track [S E] |
Track assets are disposed when leaving a race; the material cache survives across races (R3: WebGPU material init is 16–36× slower).

## 3. CPU budgets
### 3.1 Main thread per frame (60 fps, mid laptop)
| System | p95 budget |
|---|---|
| Input sampling + NetClient update (prediction step, relay merge) | 1.0 ms |
| Rollback on a snapshot frame (8 karts × up to 14 ticks at 200 ms RTT) | ≤ 1.5 ms p99 [S E M11] |
| Game logic: interpolation, HudPresenter (20–30 Hz), meta/events | 0.8 ms |
| Render systems update (camera, mascots, karts, VFX spawns, name tags) | 1.5 ms |
| Render submission (`RenderPipeline.render`) | ≤ 4 ms, tracked ±20% vs the recorded baseline [S E] |
| Audio update (engines, spatial params) | 0.3 ms |
| **JS update, non-render, total** | **≤ 4 ms p95 [S E]** |
| GC | no per-frame allocation in hot paths (scratch objects); no major GC during a race |

### 3.2 Simulation and server (bench, `pnpm bench`)
| Item | Budget [S E] |
|---|---|
| `step()` | ≤ 6 µs per kart-tick (gap-2 measured 0.98 µs for the 2D step) |
| AI | ≤ 5 µs per kart-tick (decisions at 20 Hz amortized) |
| Offline Worker authority (8 karts, 7 bots) | ≈ 0.08 ms per tick → ≈ 5 ms per second, off the main thread |
| Room tick (8 karts, 7 bots, items) | p99 ≤ 0.5 ms |
| Load: 50 rooms in one process | tick p99 ≤ 4 ms |
| Codec | snapshot encode ≤ 50 µs per client; decode ≤ 50 µs [P] |

### 3.3 Tooling
| Item | Budget [S E] |
|---|---|
| Track bake | ≤ 20 s per track; `pnpm bake --all --validate --ghost` ≤ 4 min with 4 jobs |
| `pnpm test` | ≤ 3 min (excludes @slow) |
| `pnpm test:races` | ≤ 5 min (CI, 1 seed) |

## 4. Loading
| Stage | Budget |
|---|---|
| Boot → lobby (cold, e2e) | ≤ 8 s [S E] |
| Track load (fetch `.ctrk`/`.vis`, build, `compileAsync`) | ≤ 5 s on Medium hardware [P]; behind the loading screen |
| Returning to a room / next race | reuse materials and kart/mascot geometry; only track assets reload |

## 5. Bundle budgets (`pnpm size`, `tools/size.mjs`)
| Chunk | Budget |
|---|---|
| Initial JS (gzip) | ≤ 1.0 MB [S E] — expected: three WebGPU build ≈ 400–550 KB [S 05], app code ≈ 300 KB, preact + signals ≈ 15 KB |
| CSS | ≤ 60 KB [S E] |
| First-screen fonts | ≤ 400 KB [S E]: Pretendard dynamic subset, Barlow Condensed Latin subset (≈ 30 KB), Black Han Sans banner subset |
| Tone.js chunk | lazy, loaded after the first gesture [S E] (≈ 90 KB gzip) |
| Worker chunk (authority: sim + room + content) | ≤ 250 KB gzip [P] |
| Garage/showcase, Time Attack ghost code | lazy route chunks [P] |
| Track assets | streamed per race, never bundled |
| Codex art overrides | fetched on demand from `/art/overrides/`; recommended ≤ 300 KB each (WebP) |

## 6. BudgetTracker (`RenderContext.budget`, `render/engine/budget.ts`)
### 6.1 What it measures (every frame)
| Counter | Source |
|---|---|
| `drawCalls`, `triangles` (all passes) | `renderer.info.render` after `RenderPipeline.render`, reset per frame |
| `uniqueMaterials` | materials created through the `MaterialLibrary` (registry) + a set of material ids seen by the scene traversal |
| `textureBytes` | sum over registered textures: `w·h·bytesPerPixel·(mipmaps ? 4/3 : 1)` |
| `geometryBytes` | sum of `BufferAttribute.array.byteLength` of live geometries |
| `shadowDraws` | draw calls issued in shadow passes (counted per cascade) |
| `jsUpdateMs`, `renderSubmitMs`, `frameMs` | `performance.now()` around the frame phases (p50/p95 over 300 frames) |

### 6.2 How budgets are enforced
| Where | Behaviour |
|---|---|
| `MaterialLibrary` | creating a 41st unique material **throws in test/dev builds** and warns once in production |
| Dev overlay (F3) | live counters vs the tier budget, red when over; `window.__cr.budget` exposes the latest snapshot and the backend (ADR-002) |
| e2e `perf.spec.ts` | Low tier, 960×540, 3 tracks (smoke) / all tracks (nightly): samples 300 frames after GO and asserts drawCalls ≤ 150, uniqueMaterials ≤ 40, triangles ≤ 0.6M; JS update p95 ≤ 4 ms is asserted on the bench machine, not under SwiftShader |
| Bake time (V20) | per-chunk draw-group, triangle and material-slot budgets; worst PVS visible set per tier |
| Unit tests | kart and mascot builders report triangle counts per LOD; tests fail above §2.3 |
| M4 perf pass | per-track baselines recorded in `docs/tracks/<id>.md`; regressions > 20% in render-submit time fail review |
| Runtime | dynamic resolution and auto tier (§1) keep frame time inside budget; BudgetTracker never changes gameplay |
