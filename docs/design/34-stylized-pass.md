# 34 — Stylized arcade pass: recipe for every track

**Status:** proven on Meadow Loop (commits a31849e and 6096e3b). This file is the brief the theme lanes follow.

**Target:** a stylized arcade kart racer. Crisp, cute shapes, organised colours, solid grounding. The kart and the *next corner* must read before the background. A finished screen matters more than how many effects it has.

**Style references:** KartRider: Drift screenshots, for style only. Never copy Nexon names, logos, boards or assets (CLAUDE.md §9). Our own mark is the parametric sparkle.

**Hardware assumption:** desktop RTX 30-class on High. Props are instanced, so we can be generous: about 3–5 k props per track, 1–2 M triangles in view. Low and Medium thin the plants automatically.

## 1. Rules that never bend
1. **Physics, collision, AI and laps stay unchanged.** In `.ctd` files, edit only the `THEME` attributes, `PROPS` rows and `PROP` rows.
   - Never touch S/C/WIGGLE/J/BRANCH/DEFAULTS/GRID/PAD/ITEMS/KEYS/LINE/CLOSE, wall kinds or heights, or surfaces.
   - After every bake, the track's `.ctrk` md5 must equal the pre-pass value.
   - Everything else changes only render code.
2. **Fix in this order:** kart/character shape → road and roadside structures → colour → materials → lighting and shadow → post.
3. **Gloss only where it means something:** kart paint, chrome, wet or ice surfaces. Tyres, dirt, foliage, wood and cloth are matte.
   - No per-pixel noise on everything.
   - Bloom only on real lights and FX. Daytime themes use `bloom: 0.25`; the High tier thresholds the emissive buffer at 0.8.
4. **Keep each track's identity:** its time of day, theme palette, landmarks and night or space mood.
   - Night, space and cave tracks are fixed for readability and grounding, not turned into daytime.

## 2. Evidence for every track
1. **Views:** `node tools/shots/autoviews.ts <id> <views.json>` gives the standard five views (grid chase, kart 3/4, start wide, first-corner approach, first-corner outside) with freeze ticks 200 and 700.
2. **BEFORE:** run this before changing anything:
   `node tools/shots/views.mjs "http://127.0.0.1:<port>/?renderer=webgl2&quality=high&race=<id>&autopilot=1&seed=7" <dir>/before <views.json>`
   The script exits non-zero on console errors.
3. **AFTER:** the same command, then `node tools/shots/compare.mjs <before> <after> <sheets> a1-grid-chase a2-kart-34 a3-start-wide b1-corner-approach b2-corner-outside`.
4. **Live chase shot:** `node tools/shots/shot.mjs "<same url without freeze>" <prefix> 72000 8000`.
5. **Bake and checks:**
   - `node packages/trackc/src/cli.ts build <id> --validate` must show 0 errors.
   - Compare the `md5sum apps/client/public/tracks/<id>.ctrk` result against the pre-pass list.
   - Read the `stats.props` count in `<id>.meta.json`.

## 3. Global changes already shipped (do not redo)
- **Karts:** contact shadow plus wheel pads, dark-grey matte rubber, near-neutral chrome. Paint is roughness 0.4 with clearcoat 0.7.
- **Effects:** boost chromatic aberration only at the frame edge; the flash never washes over the kart.
- **Start area:** start gantry (navy truss, white panel, red chevrons, sparkle); painted grid slots.
- **Item boxes:** cyan item boxes with a coral frame.
- **Sky:** the gradient-dome day sky (`skyStyle: 'gradient'`), with puffy cumulus and a small sun glow.
- **Shared props** in `render/props/trackside.ts`, available to every kit:
  - `ad_board_a/b/c`, `tyre_wall`, `grandstand`, `spectators`, `flag_pole`, `lamp_post`;
  - `grass_tuft`, `flower_patch`, `bush_round`, `rock_cluster`, `tree_round_big`, `tree_clump`, `hot_air_balloon`.
  - A kit overrides any kind with a themed version by using the same name in its own props, which win on a clash. For example: snowy `grass_tuft`, desert `bush_round`, neon-coloured `ad_board_*`.
- **Board chevrons point along +Z** (the travel direction once placed). On a bend's outside they point into the turn. Never place a board that reads as a wrong-way arrow.
  - `PROPS` rows turn `side=L` props by 180°, so any directional prop on the left points backwards. Use `ad_board_b` only on `side=R` and `ad_board_b_l` on `side=L` (never `side=both`); give your own arrow props a left-side twin the same way.
- **One kit, several times of day:** kit factories receive the track's `THEME` attributes (`export default (c, env) => …`, see `clayhill_village/index.ts`). Branch the look on `env.sky` rather than tuning one look for both. A day-tuned `sky.top/bottom`, `horizon` and `sun.color` otherwise override the golden-hour and sunset defaults.
  - The gradient dome mixes `horizon` up to about 33° of elevation, and that is most of the sky a chase camera sees. A saturated warm horizon tints the whole frame, so keep it pale and put the warmth in the key light.

## 4. Look levers (kit `look`, `ThemeLookFx` in `render/env/look.ts`)

| Lever | Meadow (day) value | Why |
|---|---|---|
| `skyStyle: 'gradient'` + `sky.top`, `sky.bottom`, `horizon` | top `#4f97e0`, horizon `#bcd8f0` | The Preetham sky washed day scenes to peach and grey. |
| `sun` | `#fff0da`, 3.1 | A key light that clearly beats the fill. |
| `hemi` | sky `#cfe0ff`, ground `#8a6a55`, 1.45 | Sun : fill ≈ 2.5 : 1. A warm ground keeps orange backs orange. |
| `fill` | `#ffe6d2`, 0.45 | Shadowless back fill, so the chase camera facing the sun still reads the mascots. |
| `shadowStrength` | 0.62 | Shadows ≥ 60 % of the lit value, never navy. |
| `envIntensity` | 0.42 | |
| `rimBoost` | 0.4 (day) | Rims made bodies wash out to white. Night themes keep 1.5–1.9 for readability. |
| `bloom` | 0.25 (day) | |
| `fogColor` = horizon, THEME `fogNear` / `fogFar` | 250 / 1500 | Keep near objects crisp; show the far tree lines. |
| `grade` | tint `#ffffff`, saturation about 1.06 | No warm or cool cast over the whole frame. |

**Colour targets:**
- Greens are mid-value, around `#5e9a45` / `#74ad52` lit. No lime, and no shadows with R≈0.
- Asphalt is neutral (`#605e5f` / `#6e6c6c`).
- Kerbs are red `#d9453c` and white `#f6f4ef`.
- The trackside palette is signal red `#d8423a`, white `#f4f1ea`, navy `#2f4a7a` and yellow `#f5c230`.

## 5. Structures
- **Rural edges:** a see-through post-and-rail fence (`MaterialLibrary.wall('ranch', rail, kick)`), white rails on dark posts. It is cut by alpha test; the collision wall is unchanged.
- **Other wall kinds:** keep them, but give them rhythm through the theme's wall material colours. Do not add noise.
- **Sponsor boards** go just outside the fence (offset 0.4) on posts above the 1 m fence top, so the rails never cross their faces.
- **The first corner** gets tyre walls (offset 0.6) and chevron boards behind them (offset 2.4) that read above the tyres.
- **The start straight** gets a grandstand or a themed equivalent, spectators, flags and lamps. Do not put big trees behind the grandstand or the grid.

## 6. Dressing layers (Meadow Loop densities)

| Layer | `PROPS` row (side=both unless noted) |
|---|---|
| Fence-side ground cover | `grass_tuft every=0.8 offset=0.2 jitter=8 scale=1.0-1.8` · `flower_patch every=5 offset=0.8 jitter=9` |
| Shrubs and rocks | `bush_round every=11 offset=3 jitter=9` · `rock_cluster every=23 offset=4 jitter=12` |
| Shade trees | `tree_round_big every=17 offset=14 jitter=18` (none behind the grandstand or grid) |
| Far tree lines | `tree_clump every=26 offset=60 jitter=50` · `tree_clump every=34 offset=125 jitter=50 scale=1.0-1.6` |
| Fields | `THEME scatter=<6–11 kinds, repeat a kind to weight it> density≈40` |
| Sky | 2–3 `hot_air_balloon` `PROP`s at 40–60 m (day themes) |

**Per-theme ground cover:** use the theme's equivalent of grass, shrubs and trees, overriding the shared kinds where needed.
- forest: ferns, mushrooms, logs
- desert: dry tufts, cacti, pebbles
- glacier: snow tufts, ice rocks, snow pines
- neon: planters, street furniture, building rows
- orbital: antennas, panels, pylons
- coral: palms, shells, beach props
- lantern: pumpkins, crooked trees, lanterns
- ember: crystals, ore carts, basalt

**Low-tier thinning:** TrackView thins and culls early any kind whose name matches `SCATTER` (`bush|flower|grass|rock|fence|lamp|cone|sign|chevron|barrel|crate|mushroom`) or `tree|bush`. Name new plant kinds so they match.

**Size:** `.vis` must stay ≤ 2 MB gzip.

## 7. Done means
For every track:
- the BEFORE and AFTER sheets and a live chase shot;
- an unchanged `.ctrk` md5;
- a bake with 0 errors;
- zero console errors.

For the lane, all of these must pass:
- `node tools/typecheck.mjs client`;
- `npx eslint apps/client tools`;
- `pnpm vitest run --project client --maxWorkers=1`;
- `pnpm build`.

Do not commit `tracks/golden.json`; the orchestrator regenerates it at merge.
