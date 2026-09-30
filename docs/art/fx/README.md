# FX, rendering and audio (L11)

This covers the look layer: materials, post, camera, VFX, environment, track rendering and audio. All of it is render-only; the sim never reads any of it.

- Code: `apps/client/src/render/{materials,post,camera,vfx,env,engine,track,props}`, `render/RaceRenderer.ts`, `render/quality.ts`, `game/Stage.ts`, `audio/**`.
- Screenshots in this folder come from headless SwiftShader at 960×540 with `?renderer=webgl2&quality=low`. They look softer and darker than a real GPU.

## Screenshots

| file | what |
|---|---|
| `before-*.jpg` | M1 baseline |
| `after-meadow-start.jpg`, `after-meadow-race.jpg` | Clayhill Village: golden-hour sky, trees swaying in wind, boost flame, Prompt Cubes |
| `after-ring-item.jpg` | Proving Ring in item mode: HUD items, exhaust glow |
| `after-coral-cobble.jpg` | Coral Cove: cobble road variant, palms, lighthouse |
| `after-magma-underground.jpg` | Ember Mine: underground sky (cave vault and crystal glints), headlights, airborne kart |
| `after-f2-lava-killplane.jpg` | F2 fixture from above, via `?cam=`: animated lava kill plane under the jump gap and ledge |
| `after-f3-plaza.jpg` | F3 fixture: annulus plaza (paint-free stone), tower obstacle, curb ring |
| `after-kraken-hazards.jpg` | Kraken Lighthouse (per-track sunset look): the L12 kit `hazard_tentacle` model sweeping the sea-cave road, posed from `hazardPose` |
| `after-f5-swinger.jpg` | F5 fixture: default wrecking-ball swinger with its arm, traffic cars in the distance |
| `bug-terrain-nan-stripes.png` | The black and white "stripe" bug: NaN terrain heights from trackc. Repaired on load; see `contract-requests/L11-terrain-nan.md` |

## Theme look fields (`ThemeLookFx`, set in a kit's `look`)

Every field is optional. A kit that sets only colours still gets a complete rig from its sky kind (`env/look.ts` → `KIND_DEFAULTS`).

**Precedence:** the track `THEME sky=…` wins, then the kit `skyKind`, then content `sky`.

| field | type | effect |
|---|---|---|
| `skyKind` | day · goldenHour · sunset · overcast · night · aurora · underground · space | sky dome, light rig and grade defaults |
| `hour` | 0–24 | sun elevation on day-like skies |
| `stars`, `moon`, `aurora` | 0–1 / bool | night sky details (the defaults depend on the sky kind) |
| `planet` | `{ color, ring?, dir?, size? }` | ringed planet on `space` skies |
| `horizon`, `clouds` | colour / 0–1 | gradient-sky horizon and cloud cover |
| `grade` | `{ slope, saturation, tint, offset, power, shadows, highlights }` | CDL grade after Neutral tone mapping; split tone on Medium+ |
| `exposure`, `bloom` | number | tone-map exposure, bloom strength |
| `envIntensity` | number | PMREM reflection strength. Low skips PMREM and folds 60% of it into the hemisphere light |
| `rimBoost` | number | Fresnel rim on mascots and karts (night readability) |
| `fog` | `{ color, near, far }` | overrides the content fog. The far plane is clamped to the tier's `far` |
| `ambient` | none · snow · fireflies · dust · rain · embers · leaves · petals · bubbles · motes · stars | air particles around the camera |
| `wind`, `wet` | multiplier / 0–1 | foliage sway; wet-road darkening and gloss |
| `headlights` | bool | kart headlight beams; SpotLight on High+ |
| `water` | `{ level, shallow, deep, foam?, size? }` | stylized water plane |
| `shadowStrength` | 0–1 | sun shadow intensity |

**Kit look extras** (`themes/kit.ts`):

- `road.wet` and `road.glow`: wet and neon-edge road variants.
- `wall.kind`: the wall material family (`panel`, `stone`, `barrier`, `fence`, `rock`, `parapet`, `building`, `planter`, `pillar`, `curb`, `glass`, `neon`, `ice` or `hedge`).

## Tiers (`render/quality.ts`)

| | Low | Medium | High | Ultra |
|---|---|---|---|---|
| DPR cap / dynamic resolution | 1.0 / 0.7–1 | 1.25 / off | 1.5 / off | 2 / off |
| Shadows | off | 1024 PCF | 2048 PCF soft | 2048 |
| Bloom | 12-tap glow on the emissive MRT | BloomNode mips | mips | mips |
| AA | FXAA | SMAA | MSAA 4× | MSAA 4× |
| Boost blur / speed lines / CA | radial 16 / – / – | 32 / ✓ / ✓ | 32 / ✓ / ✓ + GTAO | + GTAO |
| Materials | standard BRDF, value noise, no PMREM, gradient sky | Perlin, PMREM, SkyMesh | + triplanar terrain, physical vinyl | same |
| Budgets (draws / tris / materials) | 150 / 0.6 M / 40 | 250 / 1.2 M / 40 | 400 / 2 M / 40 | 600 / 3 M / 40 |

**Player overrides** (Settings → Graphics) are applied by `withUserPrefs()`:

- render scale and frame cap;
- shadows, bloom and particles (tier / off / on);
- motion blur, which switches the boost radial blur;
- camera distance (near / normal / far), camera shake and reduced motion. Changes apply live through `save.subscribe`.

**Measured on SwiftShader** (meadow_loop, autopilot, 960×540, `dpr=0.5`; values are current / maximum over the race):

| tier | draws | triangles | scene materials |
|---|---|---|---|
| Low | 43 / 115 | 59 k / 91 k | 22 |
| Medium | 104 / 142 | 112 k / 165 k | 22 |
| High | 154 / 174 | 166 k / 191 k | 22 |

`MaterialLibrary.count()` also counts L8's promoted mascot and kart materials. Live counters are on `?debug`.

## Low-tier boot and shader cost (SwiftShader has no `KHR_parallel_shader_compile`)

- **Showcase:** no PMREM on Low (`Showcase({ env: false })`). The lobby scene fills in one material per frame (`MaterialReveal`), so the title never freezes. Boot → lobby went from 31 s to 9.3 s.
- **Race:** the race compiles behind the loading screen in the scene pass's own context (`Post.warm()`, same render target and MRT). Pooled item proxies and status parts are prewarmed. Hidden and culled meshes are made visible for the warm-up.
- **Shader size:** value noise emitted once as a GLSL function; a branch-free kart livery mask on Low (the `select()` chain linked in about 13 s); the standard BRDF instead of physical.

## Materials (`MaterialLibrary`, at most 40 unique per scene)

- **World:**
  - `road(style…)`: asphalt, cobble, dirt, ice, metal, wood, sand, neon, glass, snow, gravel, lava, basalt, obsidian, conveyor. Supports `wet`, `glow`, `tint` and `shoulder`; area chunks render paint-free.
  - Also `kerb`, `wall(kind)`, `terrain` (triplanar on High), `water`, `foliage`/`foliageLit` (wind), `boostPad(boost|jump)`, `killPlane(lava|void)` (kill_water uses `water`) and `startLine`.
- **Characters:** `vinyl`, `kartPaint`, and the promoted L8 set: `mascotVinyl`, `mascotGlass`, `mascotEyes`, `kartLivery` (12 patterns) and `kartOverlay`.
- **FX:** `emissive`, `emissiveVertex`, `neon`, `flameShared`, `bubble`, `ringDecal`, `ghost` (Time Attack hologram) and `custom(key)` for particles, skids and sky.

## VFX catalogue (`render/vfx`)

- **Driving:** drift sparks in 3 tiers, skids and smoke by surface, surface kicks, boost flames per kind, draft streaks, wall and bump sparks, landing dust, respawn, GO ring, finish confetti, Prompt Cube shatter and emote cues (`mascot.onFx`).
- **Items:** `vfx/items/defs/*` holds one file per item (18). Projectile and hazard proxies come from world state:
  - token bomb lob, per-block firewall;
  - status rigs: shield, halo, traps, spin, stun, throttle, mirror, lock, pulse and tether;
  - incoming-hit ring telegraph, fast-escape burst;
  - render-only CC motion: airborne roll, spin, trap float.
- **Track hazards** (`track/hazards.ts`): geyser, press, train, traffic and swinger, posed with `hazardPose()`. They have telegraph cues, and kit props `hazard_<kind>` override the default look.

## Camera (`render/camera`)

- **Chase:** yaw and offset springs, drift look-into, boost FOV kick (70 → 80) and look-back.
- **Director:** the PRE intro fly-by, grid orbit, finish slam with 0.4× slow motion, then an orbit.
- **Shake:** a shared shake budget (≤ 0.22 m). Reduced motion turns off shake, blur, chromatic aberration and speed lines.
- **Dev:** `?cam=px,py,pz,tx,ty,tz` pins the camera.

## Audio (`audio/**`)

- **Mixer:** buses (master, music, sfx, engine, ui, voice), then compression, a limiter and a −1 dBFS soft clip. Up to 32 voices, with a per-id cap and voice stealing.
- **Engines:** the player plus the nearest 3, with Doppler and pan (HRTF off on Low).
- **SFX:** 117 synthesized definitions, one `SfxDef` per file in `audio/sfx/defs`. A test checks that every item and effect presentation key resolves.
- **Music:** 11 Tone.js songs, one `SongDef` per file (lobby plus 10 themes), each with a/b variants. They load lazily in their own chunk. An adaptive director adjusts intensity (final lap, position), with jingles and stingers.

## Dev flags

- Quality: `quality=low|medium|high|ultra`, `renderer=webgl2`.
- Tier overrides: `bloom=0|1|2|3`, `shadows=<size>`, `fxaa=0|1`, `aa=…`, `dpr=<cap>`, `ssao=0|1`, `dynres=0|1`, `blur=<taps>`.
- Views and flows: `debug` (live budget overlay), `cam=…`, `race=<track>` or `go=1&track=<id>`, `autopilot=1`.
