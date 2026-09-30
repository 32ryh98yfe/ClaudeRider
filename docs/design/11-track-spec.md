# 11 — Track spec

Owner: L4 TRACKC (compiler, validators, formats), L5/L6/L7 WORLD lanes (the tracks), L3 AI (ai-bake), L11 (render budgets).
Sources: ADR-006, ADR-012 (#8, #9, #13, #15, #16), gap-3 report (§2–§9 verbatim where marked), `04-maps-tracks.md` (names, layouts, gimmicks, palettes, music), gap-2 §5–§6 (corner envelope, track limits).
Status keys: **[S]** sourced · **[V]** validated by gap-2 · **[P]** proposed. Ticks at 60 Hz; seconds in parentheses.

---

## 1. Pipeline overview (ADR-006)

```
tracks/<themeId>/<trackId>.ctd  ──parse──▶ TrackAst ──toDef (turtle + CLOSE)──▶ TrackDefV1
   ──build──▶ spline (centripetal, 1 m samples) → frames → profiles/areas/junctions → ground & wall meshes
            → TriHash → graph/gates/grid/AI tables → .ctrk  +  render chunks/props/terrain/minimap → .vis  + .meta.json
   ──validate V1–V20──▶ report (SVG + plots + JSON)  ──ghost (Pro AI)──▶ refLapSec → V13, V19
```
- Output: `apps/client/public/tracks/<id>.ctrk|.vis|.meta.json` (gitignored). `tracks/golden.json` holds content hashes (`pnpm bake` compares).
- CLI: `pnpm trackc build <ids|all> [--validate] [--ghost] [--preview] [--jobs 4] [--out …]`; bake ≤ 20 s per track (E).
- The sim never evaluates trig on track data; every frame, normal and AI value is baked (ADR-003 §6).

---

## 2. Authoring DSL (gap-3 §9 + extensions)

### 2.1 Lexical rules
- One command per line, or several separated by `;`. `#` starts a comment.
- Attributes are `key=value`; they **persist** until changed (turtle state), except those marked *one-shot* below.
- Numbers are metres, degrees, seconds (converted to ticks at bake with `ticks()`), or ratios.
- `?a`, `?b`, `?c` are free straight lengths solved by `CLOSE`; the solver writes the solved value back as `?a=128.94`.
- `@label` (lower-case identifier) marks the current s for later reference (`from=@bridge`). `@signature` and `@fallback` are reserved directives, not labels.

### 2.2 Grammar (EBNF)
```ebnf
file        = header { line } ;
header      = "TRACK" ident "name=" string "theme=" themeId "diff=" 1..5 "laps=" int "topo=" ("circuit"|"p2p") NL ;
line        = [ stmt { ";" stmt } ] [ "#" text ] NL ;
stmt        = segment | macro | label | block | content | directive ;

segment     = "S" len segAttrs
            | "C" radius deg side segAttrs                       (* a helix is C with dy *)
            | "E" "R" num "->" num deg side segAttrs             (* clothoid easement *)
            | "LOOP" radius "shift=" num "ease=" num
            | "J" "ramp=" num "@" num "gap=" num "drop=" num "land=" num [ "wland=" num ] "vmin=" num "vmax=" num ;
macro       = "WIGGLE" radius num "/" num "/" num side segAttrs    (* a° side, b° other side, a° side *)
            | "CHICANE" radius num "/" num "/" num side segAttrs
            | "HAIRPIN" radius side segAttrs                        (* C radius 180 side *)
            | "HELIX" radius deg side "dy=" num segAttrs
            | "CLOVERLEAF" "levels=" num "/" num "/" num "R=" num "grade=" num
            | "PLAZA" ident ;                                       (* shorthand for AREA + guide arc *)
len         = num | "?" ident [ "=" num ] ;
radius      = "R" num ;  deg = num ;  side = "L" | "R" ;
segAttrs    = { "dy=" num | "w=" num | "bank=" num | "surf=" surfaceId | "prof=" ident | "wall=" wallSpec
              | "wallL=" wallSpec | "wallR=" wallSpec | "shoulders=" num ":" surfaceId | "blend=" num
              | "area=" ident | "frame=" ("worldUp"|"rmf") | "gravity=" ("world"|"track"|"low:" num)
              | "kill=" ident | "tag=" ident } ;
wallSpec    = wallType ":" num [ ":soft" ] [ ":ledgeKill" ] ;     (* type:height *)
wallType    = "none"|"curb"|"barrier"|"fence"|"rock"|"parapet"|"building"|"invisible"|"planter"|"pillar" ;
label       = "@" ident ;

block       = "BRANCH" ident "from=" sRef "to=" sRef "kind=" ("shortcut"|"risk"|"alt") "aiMin=" num segAttrs
                  [ "kill=" ident ] "{" { stmt } "}"
            | "RAIL" ident "host=" ident "from=" sRef "to=" sRef "d=[" sd { "," sd } "]" "h=" num
                  "capture=(" "dMax" num "," "hdg" num "," "vMin" num ")"
                  "speed=(" "min" num "," "accel" num "," "max" num ")" "gauge=" num "/s"
            | "WARP" ident "at=" sRef "to=" sRef [ "d=[" num "," num "]" ] "transit=" num [ "keep" ] ;
sRef        = num | "@" ident [ ("+"|"-") num ] ;
sd          = num ":" num ;                                        (* s:d pairs *)

content     = "AREA" ident areaAttrs
            | "ITEMS" "at=" itemAt { "," itemAt } [ "n=" int ] [ "path=" ident ]
            | "PAD" "at=" sRef { "," sRef } [ "d=" num ] [ "len=" num ] [ "w=" num ] [ "path=" ident ]
            | "HAZ" hazardKind "at=" sRef "d=" num shapeAttr "period=" num "on=" num "-" num "tele=" num "offset=" num
                  [ "effect=" ("spin"|"launch"|"squash"|"block") ] [ "lanes=[" laneSpec { "," laneSpec } "]" ]
            | "ZONE" zoneKind "from=" sRef "to=" sRef [ "d=[" num "," num "]" ] [ "mul=" num ] [ "surf=" surfaceId ]
            | "KILL" ident ( "belowY=" num | "aabb=(" num "," num ".." num "," num ")" ) { … }
            | "KEYS" sRef { "," sRef }
            | "GRID" "rows=" int "cols=" int "pitch=" num "stagger=" num "d=" num
            | "LINE" "start" "at=" sRef
            | "PROPS" "kind=" ident "along=" ( ident | "main" ) [ "side=" ("L"|"R"|"both") ] "every=" num
                  [ "offset=" num ] [ "jitter=" num ] [ "scale=" num "-" num ] [ "from=" sRef ] [ "to=" sRef ] [ "seed=" int ]
            | "PROP" "kind=" ident "at=(" num "," num "," num ")" [ "yaw=" num ] [ "scale=" num ]   (* landmark *)
            | "THEME" themeId [ "sky=" skyId ] [ "time=" hh ":" mm ] [ "sun=(" num "," num "," num ")" ]
                  [ "fog=" hex ":" num ":" num ] [ "headlights=" ("on"|"off") ] [ "terrain=" ident ] [ "song=" ident ":" ("a"|"b") ] ;
itemAt      = sRef [ "(" "n=" int [ "," "span=" num ] ")" ] ;
laneSpec    = "(" "d" num "," "speed" num "," "count" int "," "spacing" num ")" ;
hazardKind  = "geyser"|"press"|"train"|"traffic"|"swinger" ;
zoneKind    = "conveyor"|"surface"|"kill"|"noItem"|"camera"|"gravity" ;

directive   = "DEFAULTS" segAttrs
            | "START" "pos=(" num "," num "," num ")" "hdg=" num
            | "CLOSE" "solve=[" "?" ident { "," "?" ident } "]" "length=" num
            | "@signature" feature { "," feature }
            | "@fallback" feature "->" text [ "when=" ("F1"|"F2"|"F3"|"F4"|"F5"|"F6") ] ;
feature     = "branch"|"pads"|"surfaces"|"conveyor"|"jump"|"kill"|"ledge"|"halfpipe"|"plaza"|"rail"|"warp"
            | "hazard:" hazardKind | "helix" | "cloverleaf" | "loop" | "zeroG" | "stacked" | ident ;
```

### 2.3 Extensions over gap-3 (ADR-006, B6)
| Directive | Purpose | Notes |
|---|---|---|
| `PROPS kind=… along=… side=… every=…` | Seeded procedural prop rows along a path | `kind` is a `PropFactory` key of the theme kit; placement respects exclusion zones (gates, pads, item rows ±6 m, junction blends, hazards ±8 m) |
| `PROP kind=… at=(x,y,z)` | Hand-placed landmark (clock tower, windmill, lighthouse) | Landmarks may carry wall colliders via their `AREA` obstacles |
| `THEME themeId …` | Environment: sky, time of day, sun, fog, headlights, terrain preset, song variant | Overrides the theme defaults in `packages/content/src/themes/<id>.ts` |
| `@signature …` | Features the track must ship with | The bake report fails if a signature feature is missing without a matching `@fallback` taken |
| `@fallback X -> Y when=Fn` | Substitute if ladder step Fn is not available | E.g. `@fallback loop -> "HELIX R20 360 L dy=+10" when=F6` |
| Wall types `planter`, `pillar` | Used by the gap-3 authored tracks | Added to `WallSpec.type` |

### 2.4 Compiler steps (gap-3 §9)
1. Run the turtle: points every ≤ 20° and ≤ 12 m chord on arcs, ≤ 40 m on straights, 8 m guard points at straight/arc boundaries; adjacent spacing ratio ≤ 3; segments < 4 m merged.
2. Solve closure: 3×3 linear system in (x, z, length) over the free straights' fixed headings; write the solved lengths back.
3. Check closure (V1) and elevation sum.
4. Centripetal Catmull-Rom, own arc-length table (64 sub-steps per segment, binary search + one Newton step), resample every 1 m (N = round(L/1.0)).
5. Frames (§4).
6. Profiles, areas (plaza union), junctions (gore), walls.
7. Ground and wall meshes with smooth normals and per-triangle `u8` surface; TriHash.
8. Graph, branch maps, gates, key gates, grid, respawn samples.
9. Validators V1–V18 (static).
10. `.ctrk`, preview SVG with s ticks, elevation/curvature/width plots, JSON report.
11. Headless ghost laps (Pro AI, speed and item) → `refLapSec` → V13, V19.
12. Props (seeded along s), terrain, AO bake (three-mesh-bvh, 16 rays, 4 m), render chunks, PVS, V20.
13. Golden hash.

Compiled spline vs turtle ideal: deviation ≤ 0.5 m (achieved 0.42 m Belltower, 0.34 m Magma) [S gap-3].

---

## 3. `TrackDefV1` schema (`packages/trackc/src/schema.ts`)

Verbatim from gap-3 §4, plus `PropDef`, `EnvDef`, `meta`, and the two extra wall types.
```ts
export interface TrackDefV1 {
  schema: 'clauderider.track/1'; id: TrackId; name: string; theme: ThemeId;
  difficulty: 1|2|3|4|5; laps: number; topology: 'circuit'|'pointToPoint';
  startLineS: number;                       // DSL s of the finish line; bake rotates s so line = 0
  paths: PathDef[];                         // paths[0] = main
  areas: AreaDef[]; junctions: JunctionDef[]; rails: RailDef[]; warps: WarpDef[]; jumps: JumpDef[];
  zones: ZoneDef[]; hazards: HazardDef[]; items: ItemRowDef[]; boostPads: BoostPadDef[];
  grid: { rows: number; cols: number; pitch: number; stagger: number; dAbs: number };
  keyGates: number[];                       // main-line s; ordinary gates auto every 30 m
  props: PropDef[]; env: EnvDef; profiles: ProfileDef[];
  targets: { refLapSec: { speed: number; item: number }; straightRatio: [number, number] };
  meta: { signature: string[]; fallbacks: { feature: string; substitute: string; when: `F${1|2|3|4|5|6}` }[]; taken: string[] };
  source: { dsl: string; compiler: string; seed: number };
}
export interface PathDef {
  id: string; kind: 'main'|'branch'|'rail'|'connector'; closed: boolean;
  curve: 'centripetal';                     // no tension field (ignored for centripetal)
  ctrl: CtrlPtV1[];
  frame?: { fromS: number; toS: number; mode: 'worldUp'|'rmf' }[];
  gravity?: { fromS: number; toS: number; mode: 'world'|'track'|'low'; scale?: number }[];
  map?: { host: string; fromS: number; toS: number };   // progress mapping
  aiMinSkill?: number; width?: number; wallL?: WallSpec; wallR?: WallSpec;
}
export interface CtrlPtV1 {
  p: [number, number, number];
  w?: number; bank?: number;                // road width (m); deg, + raises right edge
  profile?: string; surf?: SurfaceId;
  shoulderL?: number; shoulderR?: number; shoulderSurf?: SurfaceId;   // drivable off-road
  wallL?: WallSpec; wallR?: WallSpec; tag?: string; blend?: number;   // attr blend length (default 15 m)
}
export type WallSpec = { type: 'none'|'curb'|'barrier'|'fence'|'rock'|'parapet'|'building'|'invisible'|'planter'|'pillar';
  h: number; restitution?: number; soft?: boolean; ledgeKill?: boolean };
export type ProfileDef =
  | { id: string; kind: 'flat'; crown?: number }
  | { id: string; kind: 'halfpipe'; floorHalf: number; filletR: number; wallDeg: number /*≤60*/; wallH: number; lip?: number; sides: 'both'|'L'|'R' }
  | { id: string; kind: 'custom'; pts: [d: number, h: number, surf?: SurfaceId][] }; // canonicalised to 17 verts
export interface AreaDef { id: string; kind: 'annulusSector'|'polygon'; y: number;
  center?: [number, number]; rIn?: number; rOut?: number; fromDeg?: number; sweepDeg?: number;
  polygon?: [number, number][]; holes?: [number, number][][]; surf: SurfaceId;
  wallIn?: WallSpec; wallOut?: WallSpec; guide: string;  // path used for progress
  obstacles?: { kind: 'cyl'|'box'; at: [number, number]; r?: number; size?: [number, number, number] }[] }
export interface JunctionDef { id: string; kind: 'split'|'merge'; host: string; s: number; branch: string;
  side: 'L'|'R'; blendLen: number; gore?: WallSpec }
export interface RailDef { id: string; host: string; fromS: number; toS: number;
  offset: { s: number; d: number; h: number }[];   // rail = host centreline + lateral/vertical offset
  capture: { dMax: number; headingMaxDeg: number; vMin: number };
  speed: { min: number; accel: number; max: number }; gaugePerSec: number }
export interface WarpDef { id: string; entry: { path: string; s: number; d: [number, number]; hMax: number };
  exit: { path: string; s: number; d: number }; transitSec: number; keepSpeed: boolean }
export interface JumpDef { s: number; rampLen: number; lipDeg: number; gapLen: number; drop: number;
  landLen: number; landW: number; vMin: number; vMax: number }
export interface ZoneDef { kind: 'conveyor'|'surface'|'kill'|'noItem'|'camera'|'gravity';
  path?: string; fromS?: number; toS?: number; d?: [number, number]; aabb?: [number, number, number, number, number, number];
  speedMul?: number; surf?: SurfaceId; belowY?: number }
export interface HazardDef { id: string; kind: 'geyser'|'press'|'train'|'traffic'|'swinger';
  path: string; s: number; d: number; shape: { type: 'cyl'|'box'|'sphere'; size: number[] };
  period: number; activeFrom: number; activeTo: number; telegraph: number; offset: number;   // seconds in DSL, ticks after bake
  effect: 'spin'|'launch'|'squash'|'block'; lanes?: { d: number; speed: number; count: number; spacing: number }[] }
export interface ItemRowDef { s: number; n: number; span?: number; path?: string }
export interface BoostPadDef { s: number; d: number; len: number; width: number; path?: string }
export interface PropDef { kind: string; mode: 'along'|'landmark'|'scatter'; path?: string; side?: 'L'|'R'|'both';
  every?: number; offset?: number; jitter?: number; scale?: [number, number]; fromS?: number; toS?: number;
  at?: [number, number, number]; yaw?: number; seed?: number }
export interface EnvDef { themeId: ThemeId; sky?: ThemeDataDef['sky']; time?: string; sunDir?: [number, number, number];
  fog?: { color: string; near: number; far: number }; headlights?: boolean; terrain: string; song: { id: string; variant: 'a'|'b' } }
```

---

## 4. Frames (ADR-006, gap-3 §3)
| Mode | Where | Construction |
|---|---|---|
| `worldUp` (default) | wherever \|T·Ŷ\| ≤ 0.9 (V7) | `R = normalize(T × Ŷ)`, `U = R × T` (right-handed; T = −Z gives U = +Y, R = +X). Near-vertical fallback keeps `R_prev` continuity. |
| `rmf` | vertical loops, corkscrews, zero-g tubes | Seed from the worldUp frame at entry; propagate by **double reflection** (Wang et al. 2008); distribute the residual twist φ (relative to worldUp at exit) as φ·smoothstep(arc fraction). A closed curve that is RMF everywhere spreads its closure twist linearly by arc length. |
| Bank | everywhere, applied **last** | θ > 0 raises the right edge: `R′ = R cos θ + U sin θ`, `U′ = U cos θ − R sin θ` (computed from the pre-bank R). |
- Helices and spirals with grade below 10% stay `worldUp` plus explicit bank (RMF would add an unwanted inward roll).
- three.js `computeFrenetFrames` and the Catmull-Rom `tension` parameter are **not** used.
- Tangents: central differences with h = 0.01 m, bake time only.
- `LOOP R12 shift=12 ease=15` (Orbital Express): lateral-shift helix around a horizontal axis, shift = width + 2 m, `frame=rmf`, `gravity=track`, 15 m Euler-spiral easements; length 76.3 m for the circular part. With track gravity there is no minimum entry speed (with world gravity it would need √(5gR) ≈ 41 m/s).

---

## 5. Collision model: TriHash (ADR-006)

### 5.1 What collides against what (gap-3 §2.1, adapted)
| Mover | Ground | Walls | Track hazards | Karts | Zones | Spline graph |
|---|---|---|---|---|---|---|
| Kart | ray along −up, origin +1.0 m, maxT 2.0 m, `n·up > cos 65°` | sphere r 0.85 m, centre 0.6 m above the contact point | analytic shapes at the tick phase | sphere–sphere | (s, u, h) boxes or AABB | progress, laps, gravity, up hint, respawn, AI |
| Thrown item | ray settle | — (homing items pass through walls) | — | sphere | kill → despawn | spline route (s, u, h) |
| Dropped item | one settle ray at spawn | — | — | trigger sphere | noItem → fizzle | s-tag for AI avoidance |
| Camera (client) | — | three-mesh-bvh shapecast r 0.3 against occluders | — | — | camera zones | look-ahead along samples |

Bake rules:
- **Ground vs wall is decided semantically at bake**, not by normal angle at runtime: halfpipe walls up to 60° are ground; anything above 62° is wall.
- Smooth normals written from the analytic frame and profile; welded 2D-union seams at plazas and junctions.
- Surface id per triangle (`u8`), flags per triangle (`u8`: bit0 wall-soft, bit1 ledge-kill, bit2 pad, bit3 no-item, bit4 rail-marker).

### 5.2 Grid
| Property | Value |
|---|---|
| Cell size | 4 m, uniform, 3D |
| Cell key | `((ix + 512) << 20) | ((iy + 512) << 10) | (iz + 512)` as int32; covers ±2048 m on each axis |
| Table | open addressing, capacity = next power of two ≥ 2 × occupied cells, linear probing, empty key = −1 |
| Payload | CSR: per slot `(offset u32, count u16)` into a `u32` triangle-id array |
| Insertion | a triangle goes into every cell its AABB overlaps (walls: AABB inflated by 0 — the query inflates) |
| Separate hashes | `HASH_GROUND` and `HASH_WALL` |

### 5.3 Queries (zero allocation)
- `groundRay(o, d, maxT, out)`: 3D DDA through at most ⌈maxT/4⌉ + 2 cells; Möller–Trumbore per triangle (arithmetic only); per-query stamp array (`Uint32Array` per triangle, stamp += 1 per query) to skip duplicates; nearest `t` wins; smooth normal = barycentric blend of the three vertex normals, renormalized; `surf` and `flags` from the triangle.
- `sphereWalls(c, r, out, max)`: cells overlapped by the sphere AABB (≤ 8); closest point on triangle (Ericson); contact if distance < r; `depth = r − dist`, normal = (c − closest)/dist (or the face normal if dist < 1e-9); returns up to `max` contacts sorted by depth.
- `locate`, `frameAt`, `aiAt`, `gravityAt`, `respawnPose`, `hazardPose` are sample-table lookups with linear interpolation between 1 m samples (B5).

### 5.4 Stacked levels
- V2 guarantees ≥ 8 m deck-to-deck wherever footprints overlap; the ground ray window (1 m up, 1 m down) cannot reach another deck.
- Graph-local search (±20 samples, −2 ≤ h ≤ 6 m, |u| ≤ w/2 + 3 m) keeps progress on the right deck; the 16 m 2D fallback grid is used only on respawn, landing, warp exit, or after > 60 ticks off-graph.

---

## 6. Difficulty dials (merged: gap-3 §5, gap-2 §6, ADR-006)

| D | Stars | Road width, speed-built (ADR-006) | Item-built (+2 m) | Min centreline R | Corner-angle guideline (gap-2) | Straight ratio* | Sustained grade | Max bank | V19 N(D) | v_ref (m/s) | Hazard density |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ★ | 15–18 m | 17–20 m | 30 m | ≤ 90° typical; 180° only at R ≥ 35 | 40–55% | ≤ 8% | ≤ 15° | 3 | 37 | none or static |
| 2 | ★★ | 14–16 m | 16–18 m | 22 m | ≤ 120°; 150° sweepers at R ≥ 25 | 32–45% | ≤ 8% | ≤ 18° | 4 | 36 | 1–2, telegraphed |
| 3 | ★★★ | 12–15 m | 14–17 m | 16 m (12 m allowed for 90°) | ≤ 150° | 25–38% | ≤ 10% | ≤ 20° | 5 | 35 | 2–4 |
| 4 | ★★★★ | 12–14 m | 14–16 m | 12 m hairpins, 9 m for 90° | ≤ 180° | 18–30% | ≤ 12% | ≤ 22° | 7 | 34 | 4–6, some moving |
| 5 | ★★★★★ | 11–12 m | 13–14 m | 9 m hairpins (R_L ≥ 13.5 m) | ≤ 180° | 12–24% | ≤ 12% (≤ 15% P2P downhill) | ≤ 25° | 9 | 33 (Aurora 34) | 6+, timed |
\* Length with R ≥ 150 m counts as straight; jump flight/landing, rail and warp spans are excluded.

- The corner-angle column is a **guideline**, not a validator; the binding checks are V3 (radius), V4 (width), V19 (drift demand) and V13 (timing).
- Item mode: KRD item tracks are D1–D3 [S]; our item-built tracks use the +2 m widths and keep hairpins at R ≥ 22 m and width ≥ 16 m [P].
- Racing-line radius (gap-2): `R_L = (Ro − Ri·cos(Δ/2)) / (1 − cos(Δ/2))`, `Ro = Rc + W/2 − 1.5`, `Ri = Rc − W/2 + 1.5`; Δ ≥ 180° → `R_L = Ro`. Generators check yaw demand `v/R_L` at design speed, not the centreline radius.
- Validated corner envelope (gap-2 §5) [V]: grip R_min 14.7/21/29/39.5/50/86 m at 15/20/25/30/34/44.4 m/s; drift with no net loss 11/14/21/26/~47 m at 15–34 m/s; drift with ≤ 8 m/s² loss 9/12/15/18/24 m.

---

## 7. Width rules (ADR-006, gap-2)
1. Main-line width per D as in §6 (speed-built bands; item-built +2 m). Tracks built for both modes use the speed band plus up to +1 m.
2. **Minimum 11 m in any corner** (any sample with R < 150 m) on the main line.
3. 9–10 m only on straights shorter than 60 m (AI grazes below 11 m in corners; gap-2).
4. Shortcuts and branches 7–9 m (≥ 7 m, V4 branch floor [P tightening gap-3's 6 m]).
5. Maximum 18 m in corners (≥ 16 m makes 90° corners nearly flat-out on grip); wider is allowed on straights, plazas and halfpipes. V19 is the real guard.
6. Attribute changes (width, bank, surface) blend over ≥ 15 m (V4).
7. The gap-3 Magma fixture uses 9–10 m in hairpins and the chicane; the **roster** `magma_switchback` raises those to 11 m (fixture stays verbatim in `tracks/_fixtures/` as a compiler test).

---

## 8. Placement rules

### 8.1 Checkpoints and gates (ADR-006)
- Ordinary gates every 30 m; 20–25 m where the inside of a corner has a cuttable gap under 40 m. Gate width = w + 2 m.
- ≥ 6 key gates on main-line stretches, outside every branch, rail and warp span; at least one key gate between consecutive branches (V18).
- Anti-cut: a new s is accepted only within Δs ≤ v·dt + 10 m (`10-sim-spec.md` §12.2).

### 8.2 Item rows (ADR-010, V9)
- Rows of 4–6 boxes at 3 m spacing, spread across the width minus 1.5 m each side; pickup radius 1.8 m.
- ≈ L/250 ± 1 rows per lap; ≥ 150 m apart; first row ≥ 60 m after the line.
- ≥ 20 m from any apex with R < 30 m; local R ≥ 60 m within ±10 m (areas ≥ 24 m wide exempt).
- Not in junction blends, on ramps, landings, rails, or within ±15 m of a hazard.
- Present in every track (both modes); hidden and inactive in speed mode.
- Special cubes (fixed-item, double) are not in v1 [P].

### 8.3 Boost pads (V10)
- 2–4 per lap on standard tracks; about one per 200 m on boost-heavy tracks (Orbital Express) [S classic ~230 u].
- Not within 15 m of an apex with R < 30 m; not in landing zones; no wall ahead within 2 s × v (≈ 90 m at 44.4 m/s).
- Standard size 6 m long × 4 m wide; colour and chevrons per the art bible (green/teal, scrolling chevrons).

### 8.4 Jumps (V11)
- For every speed v in [vMin, vMax], the landing point at G = 28 m/s² must fall in [gapEnd + 2 m, landEnd − 5 m].
- Landing zone ≥ 40 m long, R ≥ 80 m, grade within ±10%, full road width (≥ `landW`).
- Jump pad colour: coral pad with a pink gate (art bible §9).
- Worked example (Magma): lip 8°, at 25 m/s lands 16.7 m past the lip, at 46 m/s 36.9 m; gap 14 m, landing zone 14–54 m → pass.

### 8.5 Hazards (V12)
- Period ≥ 120 ticks (2.0 s); active ≤ 50% of the period; telegraph ≥ 36 ticks (0.6 s) with light, sound and a decal.
- Phase is `(tick + offsetTicks) mod periodTicks`, integer ticks, no stored state.
- Traffic always leaves ≥ 1 safe lane at every s; train crossings are closed for ≤ 50% of the period.
- Not within ±15 m of an item row or ±20 m of a jump lip.

### 8.6 Respawn samples (V15)
- Every main-line sample has ground or lies in a declared gap/jump span.
- Respawn slots (the centreline at a sample) are ≥ 8 m from walls and hazards; samples that fail are skipped and `respawnPose` walks back to the previous good one.

### 8.7 Branches (V18)
- Rejoin tangent error ≤ 5°; time saved ≤ 8% of the lap (Pro ghost); ≥ 1 key gate between consecutive branches.
- `aiMinSkill` ∈ [0, 1] gates AI use (`14-ai-spec.md` §4.1): 0.2 free, 0.45 moderate, 0.6–0.75 risky, ≥ 0.8 expert.

---

## 9. Validators V1–V20 (thresholds)
| Id | Name | Rule | Severity |
|---|---|---|---|
| V1 | Closure | position error < 0.05 m (target < 0.01), heading < 0.1°; turning number ±1 (±2 when every crossing is z-separated); elevation sums to 0 on circuits | error |
| V2 | Self-overlap | samples > 40 m (or 2w) apart along the graph whose footprints come within the two half-widths + 2 × wall thickness + 1 m need Δy ≥ 8 m at the same (x, z); RMF loops exempt within their own span | error |
| V3 | Radius | main R ≥ Rmin(D) (§6); branches may go 20% lower; inner edge R − w/2 ≥ 3 m | error |
| V4 | Width | main w ≥ band minimum (§7), ≥ 11 m in corners, 9–10 m only on straights < 60 m; branches ≥ 7 m; attribute blends ≥ 15 m | error |
| V5 | Grades | sustained grade per §6; ramps ≤ 30% over ≤ 12 m; crest Rv ≥ v²/(0.8g) (≈ 71 m at 40 m/s); sag Rv ≥ 30 m | error |
| V6 | Bank rate | ≤ 1.5°/m | error |
| V7 | Frame mode | worldUp only where \|T·Ŷ\| ≤ 0.9 | error |
| V8 | Gates | ordinary every 30 m (20–25 m anti-cut); ≥ 6 key gates, none in branch/rail/warp spans; width w + 2 m | error |
| V9 | Item rows | §8.2 | error |
| V10 | Boost pads | §8.3 | error |
| V11 | Jumps | §8.4 | error |
| V12 | Hazards | §8.5 | error |
| V13 | Timing | `laps == clamp(round(115/refLapSec), 1, 5)`; speed race 100–130 s; Pro ghost lap within ±8% of the table value (§12 rows) | error |
| V14 | Straight ratio | within the §6 band | error (warn for `proving_ring`) |
| V15 | Respawn | §8.6 | error |
| V16 | Areas | the area triangulates; its guide path lies inside it | error |
| V17 | Rails | exit tangent error ≤ 5°; lock time 48–180 ticks (0.8–3 s); entry reachable from the road | error |
| V18 | Branches | §8.7 | error |
| V19 | Drift demand | ≥ N(D) corners (3/4/5/7/9 for D1–D5) where the Pro ghost's drift beats grip by ≥ 0.1 s (measured per corner in the ghost run: drift plan vs grip plan) | error (exempt: `proving_ring`) |
| V20 | Render budget | per vis chunk and per tier (§11.3); unique material slots per track ≤ 24; worst visible set within the tier budget | error |

Every validator has a seeded-violation test in `packages/trackc/test/validators/` (L4 done criterion).

---

## 10. `.ctrk` format (B5)

### 10.1 Header
All little-endian; sections 8-byte aligned.
| Offset | Type | Field |
|---|---|---|
| 0 | u32 | magic `0x4b525443` ("CTRK") |
| 4 | u16 | version = 1 |
| 6 | u16 | nSec |
| 8 | u32 | flags (bit0 p2p, bit1 has-rmf, bit2 has-track-gravity) |
| 12 | nSec × {u16 id, u16 rsv, u32 off, u32 len} | section table |

### 10.2 Sections
| Id | Name | Contents |
|---|---|---|
| 1 | META | u32 trackCode, u8 difficulty, u8 laps, u8 topology, u8 nPaths, f64 lapLength, f64 killY, u32 refLapTicksSpeed, u32 refLapTicksItem, u8[32] content hash, UTF-8 id |
| 2 | SAMPLES | SoA per path at 1 m: `p` f64×3, `t/r/u` f32×3 each, `s` f64, `wL, wR, bank` f32, `flags` u16 (bits 0–4 surface class, 5–6 frameMode, 7–8 gravMode, 9 jumpSpan, 10 noItem, 11 railSpan, 12 warpSpan, 13 branchBlend), `sMain` f64, `gravScale` f32 |
| 3 | PATHS | per path: u8 kind, u8 closed, u32 firstSample, u32 nSamples, f64 length, u8 hostPath, f64 map.fromS, f64 map.toS, f32 aiMinSkill, successor/predecessor lists (u8 count + u8 path ids + u32 sample idx) |
| 4 | GATES | ordinary gates: f64 sMain, u8 path, f32 width; key gates: u8 count + f64 sMain[] |
| 5 | GRID | 8 × {f64 x, y, z, f32 fx, fy, fz} |
| 6 | BOXES | per box: u16 id, u8 path, f64 s, f64 x, y, z, u8 row |
| 7 | PADS | per pad: u8 path, f64 s0, s1, f32 d, width |
| 8 | ZONES | per zone: u8 kind, u8 path, f64 fromS, toS, f32 d0, d1, f32 speedMul, u8 surf, f32 belowY, f32 aabb[6] |
| 9 | HAZARDS | per hazard: u16 id, u8 kind, u8 path, f64 s, f32 d, u8 shape, f32 size[3], u32 periodTicks, activeFrom, activeTo, telegraph, offset (ticks), u8 effect, lanes (u8 n × {f32 d, speed, u8 count, f32 spacing}) |
| 10 | RAILS | per rail: u8 host, f64 fromS, toS, u16 nOff × {f64 s, f32 d, h}, f32 dMax, headingMaxCos, vMin, speed min/accel/max, gaugePerSec |
| 11 | WARPS | per warp: u8 entryPath, f64 entryS, f32 d0, d1, hMax, u8 exitPath, f64 exitS, f32 exitD, u32 transitTicks, u8 keepSpeed |
| 12 | JUMPS | per jump: u8 path, f64 s, f32 rampLen, lipDeg, gapLen, drop, landLen, landW, vMin, vMax, f64 landingS |
| 13 | TRI_GROUND | f32 xyz per vertex, f32 smooth normal per vertex, u32 index ×3 per triangle, u8 surf, u8 flags per triangle |
| 14 | TRI_WALL | same layout |
| 15 | HASH_GROUND | u32 capacity, Int32 keys[capacity], u32 offset[capacity], u16 count[capacity], u32 triIds[] |
| 16 | HASH_WALL | same layout |
| 17 | RESPAWN | per main sample: u8 ok; f64 nearest-good sMain table |
| 18 | AI | per path per 1 m sample: f32 lineU, vLim, kappa, turnAhead40, u8 driftZone (0 none, 1 entry, 2 apex, 3 exit), plus guide-line table for halfpipes (f32 u, h per sample) and branch-choice records |
- `loadCtrk()` builds zero-copy typed-array views; `.ctrk ≤ 1.5 MB` (E).
- The sim reads f32 fields as numbers once at load into f64 arrays where they enter arithmetic that must be reproducible (the bytes are identical everywhere, so f32 → f64 conversion is exact and deterministic).

### 10.3 `.meta.json`
`{ id, code, hash, lapLength, laps, difficulty, topology, refLapSec: {speed, item}, straightRatio, bounds, signature, fallbacksTaken, validators: {V1: "pass", …}, bakeMs }`.

---

## 11. `.vis` format (outline, `sim/src/track/vis-format.ts`)

### 11.1 Layout
| Block | Contents |
|---|---|
| Header | magic "CVIS", u16 version, u16 nChunks, u16 nPropKinds, u16 nMaterialSlots, bounds f32×6 |
| Material slots | u8 count × {u8 slotId (road, curb, wall_<type>, terrain, water, decal, emissive …), u8 kind, palette refs} — keys match `ThemeKit.materials()` |
| Chunks (~50 m of track each) | per chunk: bounds, u8 nGroups × {u8 materialSlot, vertex count, index count, positions f32×3, normals oct-encoded i16×2, uv f32×2, color/AO u8×4, indices u16 or u32}; LOD1 group set (≤ 40% triangles) for > 150 m |
| Props | per kind: {kind id string, u32 count, transforms f32×5 (x, y, z, yaw, scale)}; landmarks as separate kinds with count 1 |
| Terrain | heightfield chunks (65×65 samples, f16 heights, splat weights u8×4) aligned to the track chunks |
| Decals | chevrons, pad markings, start line, kerbs as instanced quads (x, y, z, yaw, w, h, atlas index) |
| Minimap | SVG path string (main + branches), layer list (deck levels), scale/offset |
| PVS | per 10 m main-line sample: bitset of visible chunks (camera sampled 3–7 m behind and 2 m above, far 800 m, fog-limited) |

### 11.2 Budgets
`vis ≤ 2 MB gzip` (E). Props use `InstancedMesh`; mixed static props use `BatchedMesh`.

### 11.3 V20 render budget per tier [P]
| Budget | Low | Medium | High |
|---|---|---|---|
| Static draw groups per chunk | ≤ 8 | ≤ 10 | ≤ 12 |
| Triangles per chunk (LOD0) | ≤ 20k | ≤ 30k | ≤ 40k |
| Worst visible static set (PVS): draws | ≤ 70 | ≤ 140 | ≤ 250 |
| Worst visible static set: triangles | ≤ 0.35M | ≤ 0.8M | ≤ 1.4M |
| Unique track material slots | ≤ 24 (all tiers) | | |
The remaining scene budget (karts, mascots, VFX, shadows, sky) is in `40-perf-budgets.md` §2.

---
## 12. The roster (20 tracks + Proving Ring)

Numbers per ADR-006 and the gap-3 lap table: `refLapSec = L / v_ref(D)` (speed), item ×1.12; `laps = clamp(round(115/refLapSec), 1, 5)`; hard cap `max(3·laps·refLapSec, 240 s)`. Block-outs below are **turtle targets**: straights marked `?a/?b` are solved by `CLOSE`, and every other straight scales with the solver (lengths are rounded to 1 m). Net turning is +360° (counter-clockwise) for every circuit. "(V19)" marks the corners expected to satisfy drift demand; the ghost run is the judge. `dy` values in the notes are indicative: the lane balances elevation so it sums to zero on circuits (V1) and keeps grades inside §6.

### 12.0 Summary table

| # | id | Name (EN / KR) | Theme | D | Laps | Lap m | v_ref | Speed lap s (ticks) | Race s speed / item | Hard cap ticks | Width (m) | Straight % | Lane | Ladder |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `meadow_loop` | Meadow Loop / 초원 순환로 | clayhill_village | 1 | 3 | 1400 | 37 | 37.8 (2270) | 114 / 127 | 20433 | 17–20 | 45.3 | L5 (M1 basic version) | F1, F2 |
| 2 | `belltower_piazza` | Belltower Piazza / 종탑 광장 | clayhill_village | 2 | 3 | 1350 | 36 | 37.5 (2250) | 112 / 126 | 20250 | 14–16 | 37.4 | L5 | F1, F3 |
| 3 | `sunstone_bazaar` | Sunstone Bazaar / 선스톤 바자르 | sunstone_desert | 1 | 3 | 1450 | 37 | 39.2 (2351) | 118 / 132 | 21163 | 17–20 | 45.5 | L5 (F1-first) | F1, F2, F5 |
| 4 | `sandglass_canyon` | Sandglass Canyon / 모래시계 협곡 | sunstone_desert | 4 | 2 | 1950 | 34 | 57.4 (3441) | 115 / 128 | 20648 | 12–14 | 25.2 | L5 | F1, F2, F4 |
| 5 | `snowglobe_halfpipe` | Snowglobe Halfpipe / 스노글로브 하프파이프 | frostbyte_glacier | 2 | 3 | 1300 | 36 | 36.1 (2167) | 108 / 121 | 19500 | 16–18 | 42.0 | L5 | F1, F3, F5 |
| 6 | `aurora_summit` | Aurora Summit / 오로라 정상 활강 | frostbyte_glacier | 5 | 1 | 3700 | 34 | 108.8 (6529) | 109 / 122 | 19589 | 11–12 | 12.1 | L5 | F2, F6 |
| 7 | `fernwood_hollow` | Fernwood Hollow / 고사리숲 골짜기 | canopy_forest | 1 | 3 | 1350 | 37 | 36.5 (2189) | 109 / 123 | 19703 | 17–20 | 46.6 | L7 (F1-first) | F1, F2 |
| 8 | `cascade_slalom` | Cascade Slalom / 폭포 슬라럼 | canopy_forest | 4 | 2 | 1900 | 34 | 55.9 (3353) | 112 / 125 | 20118 | 12–14 | 25.9 | L7 | F2, F5 |
| 9 | `geode_rail_quarry` | Geode Rail Quarry / 정동석 레일 채석장 | ember_mine | 3 | 3 | 1400 | 35 | 40.0 (2400) | 120 / 134 | 21600 | 12–15 | 35.3 | L6 | F1, F4, F5 |
| 10 | `magma_switchback` | Magma Switchback / 마그마 굽잇길 | ember_mine | 5 | 2 | 1850 | 33 | 56.1 (3364) | 112 / 126 | 20182 | 11–12 | 19.6 | L6 | F1, F2, F4, F5, F6 |
| 11 | `pumpkin_lane` | Pumpkin Lane / 호박 퍼레이드 길 | lantern_hollow | 2 | 3 | 1300 | 36 | 36.1 (2167) | 108 / 121 | 19500 | 16–18 | 34.0 | L7 (F1-first) | F1, F2, F5 |
| 12 | `manor_catacombs` | Manor Catacombs / 저택 지하묘지 | lantern_hollow | 4 | 2 | 1850 | 34 | 54.4 (3265) | 109 / 122 | 19589 | 12–14 | 24.2 | L7 | F4, F5 |
| 13 | `coral_cove_docks` | Coral Cove Docks / 산호만 부두 | coral_cove | 2 | 3 | 1350 | 36 | 37.5 (2250) | 112 / 126 | 20250 | 16–18 | 37.6 | L7 (F1-first) | F1, F2, F5 |
| 14 | `kraken_lighthouse` | Kraken Lighthouse / 크라켄 등대 | coral_cove | 3 | 3 | 1400 | 35 | 40.0 (2400) | 120 / 134 | 21600 | 12–15 | 31.3 | L7 | F5, F6 |
| 15 | `rainline_blvd` | Rainline Boulevard / 레인라인 대로 | neon_harbor | 3 | 3 | 1350 | 35 | 38.6 (2314) | 116 / 130 | 20829 | 12–15 | 28.1 | L6 (layout first, traffic later) | F1, F5 |
| 16 | `skyway_interchange` | Skyway Interchange / 스카이웨이 나들목 | neon_harbor | 4 | 2 | 2000 | 34 | 58.8 (3529) | 118 / 132 | 21177 | 12–14 | 21.1 | L6 | F2, F5, F6 |
| 17 | `spark_grand_circuit` | Spark Grand Circuit / 스파크 그랜드 서킷 | spark_circuit | 1 | 3 | 1500 | 37 | 40.5 (2432) | 122 / 136 | 21892 | 15–18 | 47.3 | L7 (F1-first) | F1 |
| 18 | `sunset_arena_rally` | Sunset Arena Rally / 선셋 아레나 랠리 | spark_circuit | 3 | 2 | 1950 | 35 | 55.7 (3343) | 111 / 125 | 20058 | 12–15 | 26.6 | L7 | F1, F2 |
| 19 | `token_foundry` | Token Foundry / 토큰 주조소 | orbital_nexus | 3 | 3 | 1350 | 35 | 38.6 (2314) | 116 / 130 | 20829 | 14–17 | 30.4 | L6 (without presses first) | F1, F3, F5 |
| 20 | `orbital_express` | Orbital Express / 궤도 급행선 | orbital_nexus | 5 | 1 | 3800 | 33 | 115.2 (6909) | 115 / 129 | 20728 | 11–12 | 14.3 | L6 | F2, F4, F5, F6 |
| 21 | `proving_ring` | Proving Ring / 시험 주행 링 | spark_circuit | 1 | 5 | 700 | 37 | 18.9 (1135) | 95 / 106 | 17028 | 15–18 | 64.1 | M1 core (L4/L5) | F1 |

Difficulty spread: D1 ×4, D2 ×4, D3 ×5, D4 ×4, D5 ×3 (roster). Laps: 12 × 3, 6 × 2, 2 × 1 (ADR-006). Every track is playable in both modes; item-built tracks (item★) use the +2 m widths.

### 12.0.1 Feature ladder → tracks (02-contracts §C/M2)

| Step | Unblocks (roster #) | Tracks that also use it later |
|---|---|---|
| F1 branches, pads, surfaces, conveyors, PROPS | 1, 3, 7, 11, 13, 17 (+ 21) | all |
| F2 jumps, kill, open ledges, shoulders | 6, 8, 18 | 1, 3, 4, 7, 10, 11, 13, 16, 20 |
| F3 halfpipe/custom profiles, AREA plaza, junction gore | 2, 5 | 19 (gutter) |
| F4 rails, warps | 4, 9, 12 | 10, 20 |
| F5 analytic hazards | 14, 15, 19 | 3, 5, 8, 9, 10, 11, 13, 16, 20 |
| F6 helix ≥ 360 stacked, cloverleaf, loop + RMF, gravity modes | 10, 16, 20 | 6, 14 |

A track whose signature needs a later step ships with its `@fallback` until that step lands; the bake report lists `fallbacksTaken`.

### 12.1 `meadow_loop` — Meadow Loop / 초원 순환로

| Property | Value |
|---|---|
| Theme | `clayhill_village` (클레이힐 마을) |
| Difficulty | D1 (★) |
| Laps × lap length | 3 × 1400 m (circuit) |
| Built for | item★ / tutorial |
| v_ref | 37 m/s |
| Ref lap (speed / item) | 37.8 s = 2270 ticks / 42.4 s = 2543 ticks |
| Race (speed / item) | 113.5 s / 127.1 s |
| Hard cap (speed) | 20433 ticks (341 s) |
| Width | 17–20 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 30 m / 3 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 6 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the home straight (+110, +160) |
| Feature ladder | F1 (pads, grass shoulders); F2 (tutorial hop) |
| `@signature` | pads, surfaces, jump |
| `@fallback` | jump → "hay-bale hump (no air, S 54 dy +1.5/−1.5)" when=F2 |
| Lighting / time of day | 10:00 sun, soft blue sky (`THEME clayhill_village sky=day time=10:00`). |
| Music | song `clayhill` variant `a`: marimba + ukulele pop, F major, 120 BPM |
| Lane | L5 (M1 basic version) |

**Signature and gimmicks.** Wide loop with grass shoulders (grass 0.80 / ×0.60, the off-road lesson); tutorial signboards: 드리프트 → 부스터 → 순간 부스터; soft hay-bale barriers.

**Hazards.** None.

**Props.** Windmill landmark, clay-roof cottages with chimneys, bunting, sheep, market stalls, flower boxes, Spark-mascot weathervanes, hay bales.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 183 | S 183 | Home straight; start line at s = 0; boost pads at +110 and +160; tutorial arch "드리프트!" |
| 183 | 246 | C R40 90° L | T1 "first drift" corner (V19) |
| 246 | 337 | S 92 | Windmill run; item row |
| 337 | 505 | WIGGLE R60 40/80/40 L | Meadow S-bends past the sheep field |
| 505 | 566 | S 61 | Stone-bridge approach, dy +2 |
| 566 | 620 | J (54 m) | Tutorial hop over the creek: ramp 8 m @6°, gap 6, drop 0.5, land 40 (F2) |
| 620 | 672 | C R50 60° R | Bridge exit |
| 672 | 798 | C R40 180° L | Village-green hairpin around the bandstand (V19) |
| 798 | 835 | C R70 30° R | Market kink |
| 835 | 957 | S 122 | Market lane; item row |
| 957 | 1051 | C R60 90° L | Windmill corner |
| 1051 | 1177 | WIGGLE R60 30/60/30 L | Hay-bale S |
| 1177 | 1238 | S 61 | Hay-bale straight |
| 1238 | 1308 | C R45 90° L | Last corner onto the home straight (V19) |
| 1308 | 1400 | S 92 | Run to the line |

*Notes:* Tutorial prompts on signboards teach drift, then boost, then instant boost; the creek hop teaches air (no steering, landing).

### 12.2 `belltower_piazza` — Belltower Piazza / 종탑 광장

| Property | Value |
|---|---|
| Theme | `clayhill_village` (클레이힐 마을) |
| Difficulty | D2 (★★) |
| Laps × lap length | 3 × 1350 m (circuit) |
| Built for | both (reference-screenshot track) |
| v_ref | 36 m/s |
| Ref lap (speed / item) | 37.5 s = 2250 ticks / 42.0 s = 2520 ticks |
| Race (speed / item) | 112.5 s / 126.0 s |
| Hard cap (speed) | 20250 ticks (338 s) |
| Width | 14–16 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 22 m / 4 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 5 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 400 (d +10, outer plaza line) and 1290 |
| Feature ladder | F1 (alley branch, pads, cobble/gravel); F3 (plaza AREA, junction gore) |
| `@signature` | plaza, branch, pads |
| `@fallback` | plaza → "C R27 270 L w 24 ring road around the tower (ribbon, no AREA)" when=F3 |
| Lighting / time of day | Golden late afternoon (`sky=goldenHour time=17:30`). |
| Music | song `clayhill` variant `b`: accordion + strings waltz-pop, B♭ major, 132 BPM |
| Lane | L5 |

**Signature and gimmicks.** 270° piazza (annulus rIn 12, rOut 42, sweep 270° at (170.4, 4, −220.6)) around a 38 m bell tower; canal bridge; alley shortcut; the tower bell rings each lap and its hands show the race timer.

**Hazards.** Cosmetic only: pigeons scatter, café tables at the alley entrance (static props, soft walls).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `alley` | shortcut | 1040.0 → 1153.4 | 8 m, building walls 4 m, gravel 20–50 m, bump strip | 0.45 | 16.6 m (≈ 0.45 s) |

**Props.** Clock tower, 3 stone arches over the home straight, domed basilica (hemisphere + drum), pennant flags (wind shader), chevron boards, fountain, café tables, canal boats.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 80 | S 80 (w 20) | Home straight @home; pad at 1290 on the run-in; item row 165 on T1 exit |
| 80 | 151 | C R45 90° L, bank 6 | T1 (V19 candidate) |
| 151 | 181 | S 30, dy +2 |  |
| 181 | 244 | C R40 45° R + C R40 45° L (w 16) | Canal kink |
| 244 | 284 | S 40, dy +2, w 14, parapet | Canal bridge @bridge (key gate 243.5) |
| 284 | 318 | C R22 90° R (w 18, bank −4) | Veer into the piazza (V19) |
| 318 | 445 | C R27 270° L (w 30, AREA piazza) | 270° plaza around the 38 m bell tower; item row 335 (n 6, span 26); pad 400 (d +10, outer line) |
| 445 | 480 | C R22 90° R (w 18) | Veer out (V19; key gate 445.3) |
| 480 | 635 | S 40 dy −2 + C R55 60° R + C R55 60° L | Domed-basilica S; item row 505 |
| 635 | 764 | S ?a = 128.94, grass shoulders 1.5 m | Market street @marketSt; item row 690 |
| 764 | 870 | C R70 35° L + C R70 35° R + S 20 | Arcade kink; item row 860; key gate 764 |
| 870 | 938 | C R26 150° L (w 16, bank 8) | Hairpin @hairpin (V19) |
| 938 | 990 | C R36 60° R + S ?b = 14.54 (w 14) | Fountain bend; key gate 975.3 |
| 990 | 1039 | C R28 50° R + C R28 50° L (w 14) | Chicane @chicane (V19) |
| 1039 | 1064 | S 25 | Alley split at 1040.0 |
| 1064 | 1153 | C R42 90° L (w 18, bank 5) + S 40 | Riverside corner (V19); alley merges at 1153.4; item row 1185 |
| 1153 | 1350 | C R90 30° R + C R90 30° L + S ?c = 86.08 | Riverside S to the line; pad 1290; key gate 1263.9 |

The full DSL and the 116 control points are in gap-3 §7 and `tracks/_fixtures/belltower_piazza.ctd`.

*Notes:* Gap-3 authored DSL is the source (closure < 0.01 m; straight ratio 37.4%; tightest R 22; min width 14 m on the bridge).

### 12.3 `sunstone_bazaar` — Sunstone Bazaar / 선스톤 바자르

| Property | Value |
|---|---|
| Theme | `sunstone_desert` (선스톤 사막) |
| Difficulty | D1 (★) |
| Laps × lap length | 3 × 1450 m (circuit) |
| Built for | item★ |
| v_ref | 37 m/s |
| Ref lap (speed / item) | 39.2 s = 2351 ticks / 43.9 s = 2634 ticks |
| Race (speed / item) | 117.6 s / 131.7 s |
| Hard cap (speed) | 21163 ticks (353 s) |
| Width | 17–20 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 30 m / 3 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 6 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the market street (+90, +140) |
| Feature ladder | F1 (awning branch, sand zones, pads); F2 (dune jump); F5 optional (pot cart) |
| `@signature` | branch, surfaces, jump |
| `@fallback` | jump → "dune hump (no air)" when=F2; hazard:traffic → "static pot-cart prop" when=F5 |
| Lighting / time of day | 16:00 heat haze (`sky=day time=16:00`, warm fog). |
| Music | song `sunstone` variant `a`: oud-flavoured synth, D Phrygian dominant, 110 BPM |
| Lane | L5 (F1-first) |

**Signature and gimmicks.** Market props everywhere; sand zones (0.85 grip, ×0.92) on the oasis inside and the dune shoulders teach off-road slowdown; wide dune jump with a generous 45 m landing.

**Hazards.** Rolling pot cart crossing slowly (traffic, 1 lane, 3 m/s, period 300 ticks, 1 safe lane always).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `awning` | shortcut | inside of the well-plaza sweeper | 9 m, cobble under market awnings | 0.2 | ≈ 8 m (≈ 0.2 s) |

**Props.** Awnings, rugs, lanterns, palms, camel statues, glyph-carved "token" monoliths, oasis pond with water shader.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 199 | S 199 | Awning market street; pads at +90 and +140; item row |
| 199 | 254 | C R35 90° L | Oasis-pond corner, sand on the inside (V19) |
| 254 | 320 | S 66 | Palm avenue |
| 320 | 442 | WIGGLE R50 35/70/35 R | Palm S-bends |
| 442 | 484 | C R80 30° L | Dune approach |
| 484 | 551 | S 66 | Dune climb, dy +3; item row |
| 551 | 616 | J (65 m) | Wide dune jump: ramp 10 m @8°, gap 10, drop 3, land 45 (F2) |
| 616 | 686 | C R45 90° L | Camel-statue corner (V19) |
| 686 | 819 | S 133 | Caravan road, dy −3 |
| 819 | 882 | C R60 60° R | Caravan kink |
| 882 | 966 | C R40 120° L | Well-plaza sweeper (V19); the awning branch bypasses it on the inside |
| 966 | 1100 | WIGGLE R55 35/70/35 L | Rug-market S |
| 1100 | 1166 | S 66 | Rug market |
| 1166 | 1253 | C R55 90° L | Lantern corner |
| 1253 | 1302 | C R70 40° R | Gate chicane in |
| 1302 | 1351 | C R70 40° L | Gate chicane out |
| 1351 | 1450 | S 99 | Back to the line |

### 12.4 `sandglass_canyon` — Sandglass Canyon / 모래시계 협곡

| Property | Value |
|---|---|
| Theme | `sunstone_desert` (선스톤 사막) |
| Difficulty | D4 (★★★★) |
| Laps × lap length | 2 × 1950 m (circuit) |
| Built for | speed★ |
| v_ref | 34 m/s |
| Ref lap (speed / item) | 57.4 s = 3441 ticks / 64.2 s = 3854 ticks |
| Race (speed / item) | 114.7 s / 128.5 s |
| Hard cap (speed) | 20648 ticks (344 s) |
| Width | 12–14 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 12 m / 7 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 8 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the rim start straight, 1 before the jump lip |
| Feature ladder | F1 (sand); F2 (canyon-mouth jump, open rim ledges); F4 (Hourglass Portal warp branch) |
| `@signature` | warp, jump, surfaces |
| `@fallback` | warp → "ledge branch 7 m, no walls, kill below (F2)" when=F4 |
| Lighting / time of day | Harsh noon at the rim, warm bounce light in the canyon (`sky=day time=12:00`). |
| Music | song `sunstone` variant `b`: driving percussion surf-rock, D Phrygian dominant, 140 BPM |
| Lane | L5 |

**Signature and gimmicks.** Slot-canyon descent (−20 m); S-chains under sandfalls (clipping one: sand zone + brief visibility puff); obelisk hairpin R12; 3-hairpin switchback climb; canyon-mouth jump with a 50 m landing.

**Hazards.** Sandfalls (surface zones, not hazards); open rim ledges with kill plane.

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `hourglass` | risk (warp) | canyon floor after hairpin 2 → rim straight | 7 m portal gate on the outside of hairpin 2; transit 48 ticks (0.8 s), keep speed | 0.6 | skips switchback 3 (≈ 1.5 s, ≤ 8% of the lap) |

**Props.** Sandstone arches, obelisks, rope bridge, scaffolding, pyramids in the far distance, sandfalls (particle sheets).

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 90 | S 90 | Rim start straight; pads at +60 and +100 |
| 90 | 137 | C R30 90° R | Rim drop-in (V19) |
| 137 | 182 | S 45 | Canyon descent, dy −12 |
| 182 | 224 | C R40 60° L | Descent kink, dy −8 |
| 224 | 291 | WIGGLE R16 60/120/60 L | Sandfall S-chain 1 (R16) under the sandfalls (V19 ×2) |
| 291 | 354 | WIGGLE R18 50/100/50 R | Sandfall S-chain 2 (R18) (V19 ×2) |
| 354 | 417 | WIGGLE R30 30/60/30 L | Rope-bridge S (wood) |
| 417 | 462 | S 45 | Canyon floor; the Hourglass Portal warp branch splits here |
| 462 | 499 | C R12 180° R | Obelisk hairpin R12 (V19) |
| 499 | 544 | S 45 | Switchback leg 1, dy +8 |
| 544 | 588 | C R14 180° L | Switchback hairpin 2 (V19), dy +4 |
| 588 | 633 | S 45 | Switchback leg 2, dy +8 |
| 633 | 683 | C R16 180° R | Switchback hairpin 3 (V19), dy +4 |
| 683 | 728 | S 45 | Rim straight; item row |
| 728 | 807 | WIGGLE R25 45/90/45 L | Rim S (V19) |
| 807 | 878 | C R45 90° L | Rim corner |
| 878 | 922 | S 45 | Jump run-up; pad 40 m before the lip |
| 922 | 1002 | J (80 m) | Canyon-mouth jump: ramp 12 m @8°, gap 18, drop 6, land 50 (F2, V11) |
| 1002 | 1057 | C R35 90° R | Landing exit |
| 1057 | 1183 | C R40 180° L | Canyon-mouth U-turn (V19) |
| 1183 | 1267 | WIGGLE R30 40/80/40 R | Mesa S |
| 1267 | 1312 | S 45 | Sand flats (sand shoulders) |
| 1312 | 1453 | C R45 180° L | Mesa sweeper (V19) |
| 1453 | 1600 | WIGGLE R70 30/60/30 R | Dune S |
| 1600 | 1663 | C R30 120° L | Mesa corner (V19) |
| 1663 | 1725 | C R40 90° L | Obelisk-gate corner |
| 1725 | 1788 | C R40 90° R | Gate exit |
| 1788 | 1883 | C R60 90° L | Rim-return corner |
| 1883 | 1950 | S 67 | Back to the line |

*Notes:* 04 had an R10 obelisk hairpin; D4 minimum is R12, so it is R12 here.

### 12.5 `snowglobe_halfpipe` — Snowglobe Halfpipe / 스노글로브 하프파이프

| Property | Value |
|---|---|
| Theme | `frostbyte_glacier` (프로스트바이트 빙하) |
| Difficulty | D2 (★★) |
| Laps × lap length | 3 × 1300 m (circuit) |
| Built for | item★ |
| v_ref | 36 m/s |
| Ref lap (speed / item) | 36.1 s = 2167 ticks / 40.4 s = 2427 ticks |
| Race (speed / item) | 108.3 s / 121.3 s |
| Hard cap (speed) | 19500 ticks (325 s) |
| Width | 16–18 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 22 m / 4 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 5 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the village straight (+90, +130) |
| Feature ladder | F1 (ice); F3 (hp60 halfpipe profile); F5 optional (penguin sleds) |
| `@signature` | halfpipe, surfaces |
| `@fallback` | halfpipe → "flat section W 20, bank 22° both ways (S-bank chicane)" when=F3; hazard:traffic → cosmetic sleds when=F5 |
| Lighting / time of day | Bright overcast with strong bloom (`sky=overcast`). |
| Music | song `frostbyte` variant `a`: glockenspiel electro + glass FM bells, E major, 124 BPM |
| Lane | L5 |

**Signature and gimmicks.** 120 m hp60 halfpipe (floorHalf 5, fillet R6, walls 60°, wallH 4.5, footprint 22.1 m): riding high on the wall changes the exit line and speed; crystal-cave tunnel with a translucent shader; ice-rink sweeper (ice 0.75).

**Hazards.** Sliding penguin sleds cross the snowman lane (traffic, 1 lane, 8 m/s, period 360 ticks).

**Props.** Penguin village, igloos, snowmen, crystal pillars, snow-globe dome over the start, fairy lights.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 153 | S 153 | Penguin-village straight; pads at +90 and +130; item row |
| 153 | 200 | C R30 90° L | Igloo corner (V19) |
| 200 | 238 | S 38 | Halfpipe entry |
| 238 | 358 | feature (120 m) | hp60 halfpipe, 120 m (profile hp60, footprint 22.1 m, free line choice) |
| 358 | 405 | C R45 60° L | Halfpipe exit bend |
| 405 | 481 | S 76 | Crystal-cave tunnel (translucent) |
| 481 | 593 | WIGGLE R40 40/80/40 R | Cave S-bends, ice 0.75 on the inside |
| 593 | 669 | S 76 | Glacier straight; item row |
| 669 | 735 | C R25 150° L | Ice-rink sweeper R25 150°, ice 0.75 (V19) |
| 735 | 766 | C R60 30° R | Rink exit |
| 766 | 829 | C R60 60° R | Sled-run bend |
| 829 | 955 | WIGGLE R60 30/60/30 L | Sled-run S |
| 955 | 1040 | WIGGLE R35 35/70/35 L | Snowman S (V19) |
| 1040 | 1116 | S 76 | Snowman lane |
| 1116 | 1171 | C R35 90° L | Snow-fort corner (V19) |
| 1171 | 1224 | C R50 60° L | Final bend |
| 1224 | 1300 | S 76 | To the line |

*Notes:* 04 had an "ice-rink hairpin"; D2 guideline keeps it at 150° R25.

### 12.6 `aurora_summit` — Aurora Summit / 오로라 정상 활강

| Property | Value |
|---|---|
| Theme | `frostbyte_glacier` (프로스트바이트 빙하) |
| Difficulty | D5 (★★★★★) |
| Laps × lap length | 1 × 3700 m (p2p) |
| Built for | speed★ (1-lap point-to-point downhill) |
| v_ref | 34 m/s |
| Ref lap (speed / item) | 108.8 s = 6529 ticks / 121.9 s = 7313 ticks |
| Race (speed / item) | 108.8 s / 121.9 s |
| Hard cap (speed) | 19589 ticks (326 s) |
| Width | 11–12 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 9 m / 9 corners |
| Key gates | ≥ 10 |
| Item rows per lap | 15 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 1 at the start, 2 before the ski-jump lip, 1 on the lodge straight |
| Feature ladder | F2 (ski jump, open ledges, kill planes); F6 (stacked 2×360° spiral) |
| `@signature` | jump, ledge, kill, helix, stacked |
| `@fallback` | helix → "2 × C R16 170° switchback hairpins with the same −24 m drop" when=F6 |
| Lighting / time of day | Night with dancing aurora; headlights forced on (`sky=aurora time=22:00 headlights=on`). |
| Music | song `frostbyte` variant `b`: epic synth-orchestral, E minor, 150 BPM |
| Lane | L5 |

**Signature and gimmicks.** Summit-to-valley descent (−120 m total, ≤ 15% sustained); double spiral 2×360° (9.3 m per turn); ski jump ≈ 84 ticks of air; ice-shelf S-bends with no rails (fall = respawn); frozen-lake straight.

**Hazards.** Snowball rollers crossing the gully on a 240-tick cycle (traffic, 2 lanes, safe lane kept); cornice edges (kill planes).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `cornice` | risk | upper slope, 2 bends | 7 m, no walls, kill below | 0.8 | ≈ 30 m (≈ 1.0 s) |

**Props.** Aurora ribbons (animated emissive), pine forest, ski lodge, gondola pylons, ice seracs, avalanche nets.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 41 | S 41 | Summit start gate (1 lap, point-to-point); pad at +60 |
| 41 | 88 | C R30 90° L | Summit drop, dy −6 (V19) |
| 88 | 130 | C R20 120° R | Cornice bend, dy −6 (V19) |
| 130 | 163 | S 33 | Steep chute, dy −12 (≤ 15% P2P downhill) |
| 163 | 288 | WIGGLE R60 30/60/30 L | Upper-slope S |
| 288 | 477 | C R120 90° L | Upper sweeper |
| 477 | 550 | WIGGLE R15 70/140/70 L | Ice-shelf S (no rails, kill below) (V19 ×2) |
| 550 | 609 | WIGGLE R14 60/120/60 R | Cornice S (V19 ×2) |
| 609 | 629 | S 21 | Shelf run |
| 629 | 981 | HELIX R28 720° R | Double spiral descent 2×360°, dy −24 (9.3 m per turn) (V19) |
| 981 | 1014 | S 33 | Spiral exit |
| 1014 | 1140 | WIGGLE R60 30/60/30 R | Moraine S |
| 1140 | 1297 | C R100 90° R | Moraine sweeper |
| 1297 | 1335 | C R12 180° L | Glacier hairpin R12 (V19) |
| 1335 | 1376 | S 41 | Avalanche-gully tunnel, dy −10; item row |
| 1376 | 1451 | WIGGLE R18 60/120/60 R | Gully S (V19 ×2) |
| 1451 | 1507 | WIGGLE R16 50/100/50 L | Serac S (V19 ×2) |
| 1507 | 1548 | S 41 | Ski-jump run-up, dy −8; pads at −60 and −20 from the lip |
| 1548 | 1658 | J (110 m) | Ski jump: ramp 14 m @10°, gap 30, drop 10, land 60 (≈ 84 ticks air) (F2, V11) |
| 1658 | 1721 | C R40 90° L | Landing bend |
| 1721 | 1888 | WIGGLE R80 30/60/30 L | Landing-zone S |
| 1888 | 1965 | WIGGLE R22 50/100/50 L | Pine slalom (V19 ×2) |
| 1965 | 2042 | WIGGLE R22 50/100/50 R | Pine slalom 2 (V19) |
| 2042 | 2083 | S 41 | Lower valley, dy −10; item row |
| 2083 | 2125 | C R16 150° R | Ice-bridge hairpin (V19) |
| 2125 | 2166 | S 41 | Frozen-lake straight, ice 0.75 edges |
| 2166 | 2354 | C R120 90° R | Lake sweeper |
| 2354 | 2480 | WIGGLE R60 30/60/30 L | Lake-shore S |
| 2480 | 2564 | WIGGLE R30 40/80/40 R | Aurora S |
| 2564 | 2601 | C R12 180° L | Lodge hairpin (V19) |
| 2601 | 2671 | WIGGLE R20 50/100/50 R | Lodge S (V19) |
| 2671 | 2712 | S 41 | Lodge straight; item row |
| 2712 | 2880 | WIGGLE R80 30/60/30 R | Lodge-road S |
| 2880 | 3068 | C R90 120° L | Lodge-road sweeper |
| 3068 | 3194 | WIGGLE R60 30/60/30 R | Birch S |
| 3194 | 3272 | WIGGLE R25 45/90/45 L | Village S (V19) |
| 3272 | 3316 | C R14 180° R | Chapel hairpin (V19) |
| 3316 | 3385 | WIGGLE R18 55/110/55 L | Chapel S (V19) |
| 3385 | 3426 | S 41 | Final descent, dy −6 |
| 3426 | 3584 | C R100 90° L | Valley-mouth sweeper |
| 3584 | 3638 | C R35 90° R | Final corner |
| 3638 | 3700 | S 62 | Finish straight to the gate at s = 3700 |

*Notes:* 04 had 2 laps + a 6 s gondola rail back to the summit; the 1-lap point-to-point form (ADR-006, gap-3) removes the need for the return rail.

### 12.7 `fernwood_hollow` — Fernwood Hollow / 고사리숲 골짜기

| Property | Value |
|---|---|
| Theme | `canopy_forest` (캐노피 숲) |
| Difficulty | D1 (★) |
| Laps × lap length | 3 × 1350 m (circuit) |
| Built for | item★ |
| v_ref | 37 m/s |
| Ref lap (speed / item) | 36.5 s = 2189 ticks / 40.9 s = 2452 ticks |
| Race (speed / item) | 109.5 s / 122.6 s |
| Hard cap (speed) | 19703 ticks (328 s) |
| Width | 17–20 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 30 m / 3 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 5 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the trail straight (+100, +150) |
| Feature ladder | F1 (branch, pads, wood/dirt surfaces); F2 (mushroom bounce) |
| `@signature` | branch, pads, jump |
| `@fallback` | jump → "gentle hump" when=F2 |
| Lighting / time of day | Morning with god-rays (`sky=day time=08:00`). |
| Music | song `canopy` variant `a`: acoustic folk-pop, pizzicato, G major, 118 BPM |
| Lane | L7 (F1-first) |

**Signature and gimmicks.** Trail through giant trunks; hollow-log tunnel; log bridge (wood); pond sweeper; a mushroom `jump_pad` bounce that always lands on the road.

**Hazards.** None.

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `mossy_bypass` | alt | log bridge → pond sweeper exit | 9 m, dirt | 0.2 | ≈ 6 m (≈ 0.15 s) |

**Props.** Giant trunks, instanced ferns, red mushrooms, fireflies (night-emissive particles), pond with lilies, log bridge.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 189 | S 189 | Trail straight through giant trunks; pads at +100 and +150; item row |
| 189 | 252 | C R40 90° L | Trunk corner (V19) |
| 252 | 328 | S 76 | Hollow-log tunnel |
| 328 | 495 | WIGGLE R60 40/80/40 R | Fern S-bends |
| 495 | 571 | S 76 | Log bridge (wood); the Mossy Bypass branch splits here |
| 571 | 663 | C R35 150° L | Pond sweeper R35 (V19) |
| 663 | 797 | WIGGLE R55 35/70/35 R | Pond-side S |
| 797 | 873 | S 76 | Mushroom meadow; item row |
| 873 | 923 | J (50 m) | Mushroom bounce: jump_pad hop, gap 5, land 40 (F2) |
| 923 | 1009 | C R55 90° L | Firefly corner (V19) |
| 1009 | 1085 | S 76 | Glade |
| 1085 | 1158 | C R70 60° R | Root kink |
| 1158 | 1236 | C R50 90° L | Old-oak corner |
| 1236 | 1350 | S 114 | To the line |

### 12.8 `cascade_slalom` — Cascade Slalom / 폭포 슬라럼

| Property | Value |
|---|---|
| Theme | `canopy_forest` (캐노피 숲) |
| Difficulty | D4 (★★★★) |
| Laps × lap length | 2 × 1900 m (circuit) |
| Built for | speed★ |
| v_ref | 34 m/s |
| Ref lap (speed / item) | 55.9 s = 3353 ticks / 62.6 s = 3755 ticks |
| Race (speed / item) | 111.8 s / 125.2 s |
| Hard cap (speed) | 20118 ticks (335 s) |
| Width | 12–14 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 12 m / 7 corners |
| Key gates | ≥ 8 |
| Item rows per lap | 8 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the pool straight |
| Feature ladder | F2 (waterfall-lip jump); stacking (self-crossing bridge, V2); F5 optional (log pendulums) |
| `@signature` | jump, stacked, hazard:swinger |
| `@fallback` | hazard:swinger → "static log arches" when=F5 |
| Lighting / time of day | Misty, dappled light (`sky=day time=09:30`, dense fog). |
| Music | song `canopy` variant `b`: taiko + flute, D dorian, 138 BPM |
| Lane | L7 |

**Signature and gimmicks.** Rhythmic left-right pillar slalom (3 wiggles, the KRD "zigzag" lesson); behind-the-waterfall tunnel; canopy boardwalk 20 m up (12 m wide); self-crossing bridge ≥ 8 m over the slalom.

**Hazards.** Swinging log pendulums on the pendulum run (swinger, period 180 ticks, active 60, telegraph 36); waterfall spray (cosmetic).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `vine_gap` | risk | canopy boardwalk → boardwalk S exit | 8 m vine bridge with a gap jump (F2), kill below | 0.7 | ≈ 1.2 s |

**Props.** Karst rock pillars, waterfall sheets, rope boardwalk, treehouses, pandas (cosmetic), mist cards.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 58 | S 58 | Pool straight; pads at +50 and +80 |
| 58 | 97 | C R25 90° L | Pool corner (V19) |
| 97 | 166 | WIGGLE R22 45/90/45 R | Pillar slalom 1 (V19 ×2) |
| 166 | 235 | WIGGLE R22 45/90/45 L | Pillar slalom 2 (V19 ×2) |
| 235 | 305 | WIGGLE R25 40/80/40 R | Pillar slalom 3 (V19) |
| 305 | 351 | S 46 | Behind-the-waterfall tunnel |
| 351 | 395 | C R14 180° L | Cave hairpin (V19) |
| 395 | 441 | S 46 | Climb to the canopy, dy +10 |
| 441 | 504 | C R30 120° R | Canopy ramp bend, dy +10 |
| 504 | 550 | S 46 | Canopy boardwalk (20 m up, wood); the vine-gap branch splits |
| 550 | 613 | WIGGLE R18 50/100/50 L | Boardwalk S, 12 m (V19 ×2) |
| 613 | 671 | S 58 | Log-pendulum run (F5 swingers) |
| 671 | 713 | C R20 120° R | Treehouse bend (V19) |
| 713 | 759 | S 46 | Descent, dy −10 |
| 759 | 829 | J (70 m) | Waterfall-lip jump: ramp 10 m @8°, gap 14, drop 4, land 45 (F2) |
| 829 | 884 | C R35 90° L | Splash corner |
| 884 | 1010 | C R80 90° L | River sweeper |
| 1010 | 1156 | WIGGLE R60 35/70/35 R | River S |
| 1156 | 1214 | S 58 | Self-crossing bridge over the slalom, dy −10 (≥ 8 m separation) |
| 1214 | 1256 | C R16 150° L | Spray hairpin (V19) |
| 1256 | 1319 | WIGGLE R20 45/90/45 R | Rapids S (V19) |
| 1319 | 1376 | S 58 | Rapids straight |
| 1376 | 1523 | WIGGLE R70 30/60/30 L | Rapids-exit S |
| 1523 | 1628 | C R100 60° L | Gorge sweeper in |
| 1628 | 1732 | C R100 60° R | Gorge sweeper out |
| 1732 | 1795 | C R40 90° R | Bank corner |
| 1795 | 1842 | C R30 90° L | Pool-return corner |
| 1842 | 1900 | S 58 | To the line |

### 12.9 `geode_rail_quarry` — Geode Rail Quarry / 정동석 레일 채석장

| Property | Value |
|---|---|
| Theme | `ember_mine` (엠버 광산) |
| Difficulty | D3 (★★★) |
| Laps × lap length | 3 × 1400 m (circuit) |
| Built for | both |
| v_ref | 35 m/s |
| Ref lap (speed / item) | 40.0 s = 2400 ticks / 44.8 s = 2688 ticks |
| Race (speed / item) | 120.0 s / 134.4 s |
| Hard cap (speed) | 21600 ticks (360 s) |
| Width | 12–15 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 16 m / 5 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 6 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the cavern straight |
| Feature ladder | F4 (2 ore rails); F1 (conveyor lift); F5 optional (mine carts) |
| `@signature` | rail, conveyor, hazard:traffic |
| `@fallback` | rail → "banked trestle ribbon with a conveyor_fwd ×1.15 lane at the rail line" when=F4; hazard:traffic → "cart tunnel always open" when=F5 |
| Lighting / time of day | Underground: cool crystal glow plus amber lanterns (`sky=underground headlights=on`). |
| Music | song `ember` variant `a`: industrial funk, MetalSynth percussion, A minor, 128 BPM |
| Lane | L6 |

**Signature and gimmicks.** Crystal cavern; trestle S over a pit (R20); two ore rails (lock ≈ 1.6 s and ≈ 1.4 s, gauge +0.30/s); geode spiral descent 300° (non-overlapping); conveyor lift ramp.

**Hazards.** Mine carts crossing the crossing straight and running through the cart tunnel (traffic, period 300 ticks, telegraph 60 ticks bell, 1 safe lane).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `cart_tunnel` | risk | after rail 1 exit → geode chamber | 7 m tunnel shared with timed mine carts (bell 60 ticks ahead) | 0.55 | ≈ 0.8 s |

**Props.** Mine-cart rails, wooden trestles, amethyst and cyan geodes (emissive), lanterns, headframe, ore piles.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 116 | S 116 | Crystal-cavern straight; pads at +60 and +90; item row |
| 116 | 147 | C R20 90° L | Cavern corner R20 (V19) |
| 147 | 203 | WIGGLE R20 40/80/40 R | Trestle S over the pit (R20) (V19 ×2) |
| 203 | 293 | feature (90 m) | Ore rail 1: host span 90 m, lock ≈ 1.6 s, gauge +0.30/s (F4) |
| 293 | 340 | C R30 90° L | Rail exit |
| 340 | 398 | S 58 | The cart-tunnel branch (7 m, timed carts) splits here |
| 398 | 524 | HELIX R24 300° R | Geode spiral descent 300°, dy −8, non-overlapping (V19) |
| 524 | 582 | S 58 | Geode chamber; item row |
| 582 | 624 | C R16 150° L | Amethyst hairpin (V19) |
| 624 | 685 | WIGGLE R22 40/80/40 L | Crystal S (V19) |
| 685 | 743 | S 58 | Conveyor lift ramp (conveyor_fwd ×1.15), dy +8 |
| 743 | 823 | feature (80 m) | Ore rail 2 (lift rail), lock ≈ 1.4 s (F4) |
| 823 | 878 | C R35 90° L | Lantern corner (V19) |
| 878 | 936 | S 58 | Mine-cart crossing straight (F5 carts) |
| 936 | 978 | C R40 60° R | Headframe kink |
| 978 | 1104 | WIGGLE R60 30/60/30 R | Ore-yard S |
| 1104 | 1166 | C R30 120° L | Headframe hairpin (V19) |
| 1166 | 1271 | C R50 120° L | Winch-house corner |
| 1271 | 1313 | C R40 60° L | Headframe exit |
| 1313 | 1400 | S 87 | To the line |

*Notes:* The 04 "2×360° spiral" becomes 300° so the track stays in the F4 group; upgrade to 2×360° after F6 if desired.

### 12.10 `magma_switchback` — Magma Switchback / 마그마 굽잇길

| Property | Value |
|---|---|
| Theme | `ember_mine` (엠버 광산) |
| Difficulty | D5 (★★★★★) |
| Laps × lap length | 2 × 1850 m (circuit) |
| Built for | speed★ |
| v_ref | 33 m/s |
| Ref lap (speed / item) | 56.1 s = 3364 ticks / 62.8 s = 3767 ticks |
| Race (speed / item) | 112.1 s / 125.6 s |
| Hard cap (speed) | 20182 ticks (336 s) |
| Width | 11–12 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 9 m / 9 corners |
| Key gates | ≥ 8 |
| Item rows per lap | 7 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 468, 1072, 1790 (DSL s) |
| Feature ladder | F6 (540° helix, 3 stacked crossings); F4 (ore rail); F2 (lava jump, ledge kill); F5 (geysers); F1 (conveyors) |
| `@signature` | helix, stacked, rail, jump, ledge, hazard:geyser, conveyor |
| `@fallback` | helix → "3 × C R16 180° descending switchbacks, dy −4.7 each" when=F6; rail → "lava-edge corner at d −6, no capture" when=F4; hazard:geyser → "static vents (cosmetic)" when=F5 |
| Lighting / time of day | Lava as the key light, red fog (`sky=underground headlights=on`). |
| Music | song `ember` variant `b`: heavy synth-rock, E minor, 160 BPM |
| Lane | L6 |

**Signature and gimmicks.** 540° helix (9.33 m per turn) under the plateau; ore rail over the lava pool (radius 24 m, lock ≈ 1.6–1.75 s at 38–42 m/s, +30%/s gauge, ends tangent to the jump ramp); lava jump; conveyors ±15% in split lanes; twin R12 switchbacks.

**Hazards.** Three geysers (DSL 600/720/845, d ±2, r 3 m): period 216 ticks (3.6 s), active 0–60 (1.0 s), telegraph 48 (0.8 s), offsets 0/72/144 ticks; lava kill plane `belowY 6`.

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `ledge` | risk | 666.5 → 896.0 (DSL s) | 7 m obsidian ledge, no walls, lava kill | 0.75 | 25.7 m (≈ 0.78 s) |

**Props.** Basalt columns, lava lake (emissive + heat shimmer), ore rail trestle, mine lanterns, obsidian shards, glowing cracks.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 70 | S 70 (w 14) — DSL 40–110 after LINE shift | Plateau deck; grid DSL 14–32 |
| 70 | 168 | C R30 60° R + S 20 + C R22 120° L | Plateau corners (V19) |
| 168 | 198 | S 30, dy −1.5 | @helixIn (key gate DSL 197.5) |
| 198 | 461 | HELIX R28 540° L, dy −14, bank 12 | 9.33 m per turn; outer wall rock 1.5, inner pillars (V19) |
| 461 | 547 | S 30 dy −2 (w 12) + C R45 60° R + S ?a = 8.2 | Passes under the plateau (≈ 17 m) |
| 547 | 667 | WIGGLE R26 55/110/55 L + S 20 (w 10 → 11 on the roster) | Under the north run (V19 ×2); ledge branch splits at 666.5 |
| 667 | 896 | WIGGLE R30 50/100/50 R + S 20 + WIGGLE R30 50/100/50 R | Geyser field: 3 geysers (DSL 600/720/845); ledge merges at 896 |
| 896 | 984 | S 15 + C R35 120° L (bank 6, curb) | @railCorner; ore rail 902–990 at d −11 over the lava (V19) |
| 984 | 1068 | J ramp 30 @8°, gap 14, drop 4, land 40 (w 14), vmin 25, vmax 46 | Lava jump (V11 pass) |
| 1068 | 1192 | C R40 60° L (w 12) + S ?b = 81.64 dy +1 | Conveyors 1120–1185: right half ×1.15, left half ×0.85 |
| 1192 | 1300 | CHICANE R18 70/140/70 L (w 10 → 11) + S 20 | Basalt chicane (V19 ×2) |
| 1300 | 1442 | C R12 180° R (w 9 → 11, bank −10) + WIGGLE R60 25/50/25 R dy +6 | Switchback 1 (V19) |
| 1442 | 1585 | C R12 180° L (w 9 → 11, bank 10) + WIGGLE R60 25/50/25 L dy +6 | Switchback 2 (V19) |
| 1585 | 1850 | C R30 90° L + S ?c + WIGGLE R50 40/80/40 L dy +6 + S 30 + C R30 90° R (w 13) | Climb back to the plateau (V19) |

The full DSL and the 192 control points are in gap-3 §8 and `tracks/_fixtures/magma_switchback.ctd`. s values here are baked s (DSL s − 40); hazard, rail and branch spans in the table text are DSL s.

*Notes:* Gap-3 authored DSL; roster widths raised to ≥ 11 m in hairpins/chicane (§7). 04 said "lava fall costs respawn + 2 s": there is no time penalty (ADR-004).

### 12.11 `pumpkin_lane` — Pumpkin Lane / 호박 퍼레이드 길

| Property | Value |
|---|---|
| Theme | `lantern_hollow` (랜턴 할로우) |
| Difficulty | D2 (★★) |
| Laps × lap length | 3 × 1300 m (circuit) |
| Built for | item★ |
| v_ref | 36 m/s |
| Ref lap (speed / item) | 36.1 s = 2167 ticks / 40.4 s = 2427 ticks |
| Race (speed / item) | 108.3 s / 121.3 s |
| Hard cap (speed) | 19500 ticks (325 s) |
| Width | 16–18 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 22 m / 4 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 5 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the lantern lane (+90, +130) |
| Feature ladder | F1 (graveyard branch); F2 (bridge hop); F5 optional (swinging gates) |
| `@signature` | branch, jump |
| `@fallback` | jump → "flat bridge" when=F2; hazard:swinger → "gates fixed open" when=F5 |
| Lighting / time of day | Moonlit night with warm point lights (emissive) (`sky=night headlights=on`). |
| Music | song `lantern` variant `a`: swing-spooky big band (square brass), C minor, 126 BPM |
| Lane | L7 (F1-first) |

**Signature and gimmicks.** Lantern-lit parade lane; pumpkin patch; graveyard S; wooden-bridge hop over a creek; friendly ghosts drift across the road (cosmetic, pass through karts).

**Hazards.** Swinging parade gates (swinger, period 240, active 90, telegraph 36).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `graveyard` | shortcut | graveyard S entry → mill corner | 8 m between tombstones, dirt | 0.4 | ≈ 0.5 s |

**Props.** Jack-o-lanterns, paper lanterns, crooked trees, tombstones, iron gates, ghost sprites, a big moon.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 125 | S 125 | Lantern-lit lane; pads at +90 and +130; item row |
| 125 | 164 | C R25 90° L | Pumpkin-patch corner R25 (V19) |
| 164 | 227 | S 62 | Scarecrow row |
| 227 | 324 | WIGGLE R35 40/80/40 R | Graveyard S between tombstones; the graveyard branch splits |
| 324 | 362 | S 37 | Creek approach |
| 362 | 412 | J (50 m) | Wooden-bridge hop: ramp 8 m @6°, gap 6, land 40 (F2) |
| 412 | 475 | C R30 120° L | Mill corner (V19) |
| 475 | 572 | WIGGLE R40 35/70/35 R | Mill-race S |
| 572 | 635 | S 62 | Parade street (swinging gates, F5); item row |
| 635 | 698 | C R40 90° L | Bat-tree corner (V19) |
| 698 | 783 | WIGGLE R35 35/70/35 L | Candle-alley S (V19) |
| 783 | 845 | S 62 | Candle alley |
| 845 | 971 | WIGGLE R60 30/60/30 L | Hayride S |
| 971 | 1055 | C R80 60° R | Orchard sweeper in |
| 1055 | 1139 | C R80 60° L | Orchard sweeper out |
| 1139 | 1170 | C R60 30° R | Chapel kink |
| 1170 | 1225 | C R35 90° L | Chapel corner (V19) |
| 1225 | 1300 | S 75 | To the line |

### 12.12 `manor_catacombs` — Manor Catacombs / 저택 지하묘지

| Property | Value |
|---|---|
| Theme | `lantern_hollow` (랜턴 할로우) |
| Difficulty | D4 (★★★★) |
| Laps × lap length | 2 × 1850 m (circuit) |
| Built for | both |
| v_ref | 34 m/s |
| Ref lap (speed / item) | 54.4 s = 3265 ticks / 60.9 s = 3656 ticks |
| Race (speed / item) | 108.8 s / 121.9 s |
| Hard cap (speed) | 19589 ticks (326 s) |
| Width | 12–14 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 12 m / 7 corners |
| Key gates | ≥ 8 |
| Item rows per lap | 7 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the garden straight |
| Feature ladder | F4 (portal warp); F5 (bookcase press door, chandeliers); stacking (garden over catacombs) |
| `@signature` | warp, hazard:press, hazard:swinger, stacked |
| `@fallback` | warp → "ramp tunnel climbing back to the garden (S 120, dy +9)" when=F4; hazard:press → "bookcase always open" when=F5 |
| Lighting / time of day | Candle-lit interior, blue moonlit exterior (`sky=night headlights=on`). |
| Music | song `lantern` variant `b`: harpsichord drum-and-bass (half-time), D minor, 150 BPM |
| Lane | L7 |

**Signature and gimmicks.** Giant-scale ballroom (drive across the table); mandatory 12 m corridor; spiral staircase down 270°; catacomb 90° grid of R12 corners (double-drift lesson); bat-cave chamber; portal warp back to the garden (48 ticks).

**Hazards.** Swinging chandeliers (swinger, period 180, active 60, telegraph 36); bookcase door (press with effect `block`, period 240, closed 120, telegraph 36).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `bookcase` | risk | crypt grid 3 → ossuary exit | 8 m secret passage behind a rotating bookcase (press/block, open 120 of 240 ticks) | 0.6 | ≈ 0.8 s |

**Props.** Candelabras, portraits, giant cutlery, chandeliers, coffins, bat swarms, hedge maze, gazebo.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 69 | S 69 | Garden straight; pads at +60 and +90 |
| 69 | 116 | C R30 90° L | Fountain corner (V19) |
| 116 | 153 | S 37 | Manor gate |
| 153 | 216 | C R40 90° R | Ballroom entry |
| 216 | 262 | S 46 | Ballroom across the giant table (wood) |
| 262 | 304 | C R20 120° L | Chandelier bend (F5 swingers) (V19) |
| 304 | 332 | S 28 | Mandatory corridor, 12 m wide |
| 332 | 382 | WIGGLE R16 45/90/45 R | Corridor S (V19 ×2) |
| 382 | 476 | HELIX R20 270° L | Spiral staircase down 270°, dy −9 (V19) |
| 476 | 495 | S 18 | Catacomb entry |
| 495 | 514 | C R12 90° R | Crypt grid 1 (V19) |
| 514 | 532 | S 18 |  |
| 532 | 551 | C R12 90° L | Crypt grid 2 (V19) |
| 551 | 569 | S 18 |  |
| 569 | 588 | C R12 90° L | Crypt grid 3 (V19) |
| 588 | 607 | S 18 | The bookcase branch splits (press door, F5) |
| 607 | 651 | C R14 180° R | Ossuary hairpin, double drift (V19) |
| 651 | 707 | WIGGLE R18 45/90/45 L | Ossuary S (V19) |
| 707 | 744 | S 37 | Bat-cave chamber |
| 744 | 784 | C R25 90° L | Bat-cave exit |
| 784 | 824 | feature (40 m) | Portal warp: 48-tick transit to the garden (F4) |
| 824 | 870 | S 46 | Garden terrace, stacked ≥ 8 m over the catacombs |
| 870 | 925 | C R35 90° L | Hedge corner |
| 925 | 1019 | C R60 90° R | Rose-garden corner |
| 1019 | 1166 | WIGGLE R70 30/60/30 L | Rose-garden S |
| 1166 | 1235 | WIGGLE R25 40/80/40 R | Hedge-maze S (V19) |
| 1235 | 1281 | S 46 | Hedge-maze straight |
| 1281 | 1407 | C R80 90° R | Orangery sweeper |
| 1407 | 1533 | WIGGLE R60 30/60/30 R | Orangery S |
| 1533 | 1643 | C R70 90° R | Greenhouse corner |
| 1643 | 1674 | C R30 60° R | Gazebo kink |
| 1674 | 1753 | C R30 150° L | Gazebo hairpin (V19) |
| 1753 | 1795 | C R40 60° L | Gazebo exit |
| 1795 | 1850 | S 55 | To the line |

*Notes:* 04 "trapdoors that open on a timer" are dropped (no timed kill zones in v1).

### 12.13 `coral_cove_docks` — Coral Cove Docks / 산호만 부두

| Property | Value |
|---|---|
| Theme | `coral_cove` (코랄 코브) |
| Difficulty | D2 (★★) |
| Laps × lap length | 3 × 1350 m (circuit) |
| Built for | item★ |
| v_ref | 36 m/s |
| Ref lap (speed / item) | 37.5 s = 2250 ticks / 42.0 s = 2520 ticks |
| Race (speed / item) | 112.5 s / 126.0 s |
| Hard cap (speed) | 20250 ticks (338 s) |
| Width | 16–18 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 22 m / 4 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 5 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the beach straight |
| Feature ladder | F1 (wood/sand surfaces); F2 (gangplank drop); F5 optional (barrels, crane) |
| `@signature` | surfaces, jump |
| `@fallback` | jump → "continuous gangplank ramp" when=F2; hazard:traffic, hazard:swinger → cosmetic when=F5 |
| Lighting / time of day | Bright noon with caustics on the sand (`sky=day time=12:30`). |
| Music | song `coral` variant `a`: steel-drum pop, C major, 122 BPM |
| Lane | L7 (F1-first) |

**Signature and gimmicks.** Beach, pier boardwalk (wood 0.98), drive onto a moored galleon and off its gangplank, fish market, palm loop.

**Hazards.** Rolling barrels on the pier (traffic, 1 lane, 6 m/s, period 300); dock crane swinging a net (swinger, period 240, active 80, telegraph 36).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `net_shed` | shortcut | net-shed S | 8 m alley between net sheds, wood | 0.35 | ≈ 0.4 s |

**Props.** Galleon, cannons (static), palms, fishing nets, barrels, market stalls, lifeguard tower, lighthouse in the distance.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 136 | S 136 | Beach straight; pads at +90 and +130; item row |
| 136 | 183 | C R30 90° L | Lifeguard corner (V19) |
| 183 | 251 | S 68 | Pier boardwalk (wood) |
| 251 | 363 | WIGGLE R40 40/80/40 R | Pier S (rolling barrels, F5) |
| 363 | 431 | S 68 | Galleon deck (wood), dy +3 |
| 431 | 481 | J (50 m) | Gangplank drop: ramp 6 m @−4°, gap 6, drop 3, land 40 (F2) |
| 481 | 533 | C R25 120° L | Fish-market corner R25 (V19) |
| 533 | 619 | WIGGLE R35 35/70/35 R | Net-shed S |
| 619 | 686 | S 68 | Market lane (crane swinger, F5); item row |
| 686 | 741 | C R35 90° L | Crane corner (V19) |
| 741 | 839 | WIGGLE R40 35/70/35 L | Palm S (V19) |
| 839 | 907 | S 68 | Palm loop |
| 907 | 1033 | WIGGLE R60 30/60/30 R | Dune-grass S |
| 1033 | 1104 | C R90 45° R | Beach sweeper in |
| 1104 | 1174 | C R90 45° L | Beach sweeper out |
| 1174 | 1206 | C R60 30° R | Palm kink |
| 1206 | 1268 | C R40 90° L | Lighthouse-view corner (V19) |
| 1268 | 1350 | S 82 | To the line |

### 12.14 `kraken_lighthouse` — Kraken Lighthouse / 크라켄 등대

| Property | Value |
|---|---|
| Theme | `coral_cove` (코랄 코브) |
| Difficulty | D3 (★★★) |
| Laps × lap length | 3 × 1400 m (circuit) |
| Built for | both |
| v_ref | 35 m/s |
| Ref lap (speed / item) | 40.0 s = 2400 ticks / 44.8 s = 2688 ticks |
| Race (speed / item) | 120.0 s / 134.4 s |
| Hard cap (speed) | 21600 ticks (360 s) |
| Width | 12–15 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 16 m / 5 corners |
| Key gates | ≥ 7 |
| Item rows per lap | 6 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the harbour straight |
| Feature ladder | F5 (cannonballs, tentacles); F6 (360° lighthouse helix) |
| `@signature` | helix, hazard:swinger, hazard:geyser |
| `@fallback` | helix → "300° non-overlapping spiral climb, dy +9" when=F6; hazard:swinger → "static tentacle arches" when=F5 |
| Lighting / time of day | Sunset (`sky=sunset time=18:30`). |
| Music | song `coral` variant `b`: sea-shanty electro in 6/8, A minor, 136 BPM |
| Lane | L7 |

**Signature and gimmicks.** Cliffside climb (R18); lighthouse helix 360° up; cliff-edge straight with a kill plane; cannon-fort straight; sea-cave tunnel with kraken tentacles.

**Hazards.** Cannonballs: target circles shown 60 ticks ahead, impact = `launch` (geyser-type cylinder, period 240, active 20, telegraph 60); kraken tentacles (swinger, period 300, active 90, telegraph 48).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `waterfall_cave` | shortcut | cove descent → tide-pool corner | 8 m cave behind a waterfall, wet 0.92 | 0.55 | ≈ 0.7 s |

**Props.** Striped lighthouse (landmark), cannon fort, cliffs, sea stacks, kraken tentacles, shipwreck, gulls.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 89 | S 89 | Harbour straight; pads at +60 and +90; item row |
| 89 | 117 | C R18 90° L | Harbour corner R18 (V19) |
| 117 | 165 | S 47 | Cliffside climb, dy +6 |
| 165 | 221 | WIGGLE R18 45/90/45 R | Cliff S R18 (V19 ×2) |
| 221 | 251 | S 30 | Lighthouse approach |
| 251 | 439 | HELIX R30 360° L | Lighthouse helix 360° up, dy +9 (V19; F6 stacking) |
| 439 | 487 | S 47 | Cliff-edge straight, kill below |
| 487 | 557 | WIGGLE R25 40/80/40 L | Cliff-edge S (V19) |
| 557 | 616 | S 59 | Cannon-fort straight (cannonball circles, F5); item row |
| 616 | 658 | C R16 150° R | Fort hairpin (V19) |
| 658 | 719 | WIGGLE R22 40/80/40 L | Rampart S (V19) |
| 719 | 767 | S 47 | Cove descent, dy −9; the waterfall-cave branch splits |
| 767 | 814 | C R30 90° L | Tide-pool corner (tide lane, F5) |
| 814 | 861 | S 47 | Sea-cave tunnel (tentacle timers, F5) |
| 861 | 987 | WIGGLE R60 30/60/30 R | Grotto S |
| 987 | 1018 | C R20 90° R | Cave exit (V19) |
| 1018 | 1060 | C R40 60° L | Harbour return |
| 1060 | 1147 | C R100 50° L | Breakwater sweeper in |
| 1147 | 1235 | C R100 50° R | Breakwater sweeper out |
| 1235 | 1282 | C R30 90° L | Quay corner |
| 1282 | 1329 | C R30 90° R | Quay exit |
| 1329 | 1400 | S 71 | To the line |

*Notes:* 04 had 2 laps × 1700 m; the roster uses gap-3 3 × 1400 m. 04 "tide floods one lane every 8 s" is replaced by a static wet lane (no timed zones in v1).

### 12.15 `rainline_blvd` — Rainline Boulevard / 레인라인 대로

| Property | Value |
|---|---|
| Theme | `neon_harbor` (네온 하버) |
| Difficulty | D3 (★★★) |
| Laps × lap length | 3 × 1350 m (circuit) |
| Built for | both |
| v_ref | 35 m/s |
| Ref lap (speed / item) | 38.6 s = 2314 ticks / 43.2 s = 2592 ticks |
| Race (speed / item) | 115.7 s / 129.6 s |
| Hard cap (speed) | 20829 ticks (347 s) |
| Width | 12–15 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 16 m / 5 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 5 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the boulevard |
| Feature ladder | F5 (traffic); F1 (alley branch, wet surface); stacking (overpass over the boulevard) |
| `@signature` | hazard:traffic, surfaces, branch, stacked |
| `@fallback` | hazard:traffic → "parked cars as static obstacles lining lanes 1 and 6" when=F5 |
| Lighting / time of day | Rainy night, headlights on (`sky=night headlights=on`, wet material). |
| Music | song `neon` variant `a`: synthwave, F♯ minor, 118 BPM |
| Lane | L6 (layout first, traffic later) |

**Signature and gimmicks.** 6-lane boulevard with ambient traffic in two lanes; wet asphalt 0.92 with reflections and puddle splashes; overpass 9 m over the boulevard; 270° spiral exit ramp.

**Hazards.** Traffic: 2 lanes (d −4.5 and −1.5), 12–16 vehicles total, 18 m/s, spacing ≥ 40 m; lanes d +1.5 … +4.5 always clear.

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `alley` | shortcut | arcade S exit → harbour-crane corner | 7 m neon alley | 0.5 | ≈ 0.6 s |

**Props.** Neon signs (original names only), arcades, noodle bars, harbour cranes, containers, sodium lamps, rain streaks.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 88 | S 88 | 6-lane boulevard, wet 0.92, traffic in 2 lanes (F5); pads at +80 and +120 |
| 88 | 120 | C R20 90° L | Neon-arcade corner (V19) |
| 120 | 190 | WIGGLE R25 40/80/40 R | Arcade S (V19) |
| 190 | 225 | S 35 | The alley branch splits (7 m) |
| 225 | 272 | C R30 90° L | Harbour-crane corner |
| 272 | 316 | S 44 | Container row; item row |
| 316 | 358 | C R16 150° R | Crane hairpin (V19) |
| 358 | 393 | S 35 | Overpass ramp up, dy +9 |
| 393 | 435 | C R40 60° L | Overpass bend |
| 435 | 498 | C R60 60° R | Overpass counter-bend |
| 498 | 533 | S 35 | Elevated deck, 9 m over the boulevard |
| 533 | 675 | HELIX R30 270° L | Spiral exit down 270°, dy −9 (V19) |
| 675 | 719 | S 44 | Market street; item row |
| 719 | 761 | C R20 120° L | Noodle-bar corner (V19) |
| 761 | 844 | WIGGLE R30 40/80/40 R | Sodium-lamp S |
| 844 | 889 | S 44 | Sodium-lamp straight |
| 889 | 1035 | WIGGLE R70 30/60/30 L | Tram-line S |
| 1035 | 1098 | C R90 40° L | Canal sweeper in |
| 1098 | 1161 | C R90 40° R | Canal sweeper out |
| 1161 | 1203 | C R40 60° R | Plaza kink |
| 1203 | 1250 | C R30 90° L | Plaza corner |
| 1250 | 1297 | C R30 90° R | Plaza exit |
| 1297 | 1350 | S 53 | To the line |

*Notes:* 04 had 2 laps × 1800 m; roster is 3 × 1350 m (gap-3).

### 12.16 `skyway_interchange` — Skyway Interchange / 스카이웨이 나들목

| Property | Value |
|---|---|
| Theme | `neon_harbor` (네온 하버) |
| Difficulty | D4 (★★★★) |
| Laps × lap length | 2 × 2000 m (circuit) |
| Built for | speed★ |
| v_ref | 34 m/s |
| Ref lap (speed / item) | 58.8 s = 3529 ticks / 65.9 s = 3953 ticks |
| Race (speed / item) | 117.6 s / 131.8 s |
| Hard cap (speed) | 21177 ticks (353 s) |
| Width | 12–14 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 12 m / 7 corners |
| Key gates | ≥ 8 |
| Item rows per lap | 8 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the toll-plaza straight |
| Feature ladder | F6 (3-level cloverleaf 0/9/18 m, stacked); F5 (subway train); F2 (rooftop jump) |
| `@signature` | cloverleaf, stacked, hazard:train, jump |
| `@fallback` | cloverleaf → "2-level (0/9 m) interchange with 180° ramps" when=F6; hazard:train → "no train" when=F5 |
| Lighting / time of day | Dusk into night (`sky=sunset time=19:30 headlights=on`). |
| Music | song `neon` variant `b`: future-funk, B♭ minor, 142 BPM |
| Lane | L6 |

**Signature and gimmicks.** Three-level cloverleaf (270° R35 ramps at 5.5%); level-2 skyway at 18 m; rooftop jump; subway with a train on a parallel track; strobing tunnel.

**Hazards.** Subway train every 600 ticks (10 s) across the platform branch (train, crossing closed ≤ 50% of the period, telegraph 60 ticks lights + horn); construction barriers (static).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `platform` | risk | subway approach → strobe tunnel | 8 m through the platform, closed while a train passes | 0.7 | ≈ 1.0 s |

**Props.** Overpass pylons, billboards (original brands), skyscraper silhouettes, toll booths, subway station, strobe lights.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 62 | S 62 | Toll-plaza straight; pads at +50 and +90 |
| 62 | 101 | C R25 90° L | Toll corner (V19) |
| 101 | 134 | S 33 | Ramp to level 1, dy +4.5 |
| 134 | 299 | HELIX R35 270° L | Cloverleaf ramp A 270° R35, 5.5% grade, 0 → 9 m (V19) |
| 299 | 340 | S 41 | Level-1 deck (9 m) |
| 340 | 371 | C R20 90° R | Deck corner (V19) |
| 371 | 404 | S 33 | Ramp to level 2, dy +4.5 |
| 404 | 569 | HELIX R35 270° L | Cloverleaf ramp B 270°, 9 → 18 m (V19) |
| 569 | 610 | S 41 | Level-2 skyway (18 m); the rooftop branch splits |
| 610 | 652 | C R16 150° R | Skyway hairpin (V19) |
| 652 | 685 | S 33 | Rooftop run |
| 685 | 760 | J (75 m) | Rooftop jump: ramp 10 m @6°, gap 16, drop 6, land 45 (F2) |
| 760 | 807 | C R30 90° R | Billboard corner |
| 807 | 972 | HELIX R35 270° R | Cloverleaf ramp C down 270°, 12 → 0 m (V19) |
| 972 | 1013 | S 41 | Subway approach; a train crosses every 600 ticks (F5) |
| 1013 | 1044 | C R20 90° L | Subway corner (V19) |
| 1044 | 1077 | S 33 | Strobe tunnel |
| 1077 | 1121 | C R14 180° L | Tunnel hairpin (V19) |
| 1121 | 1184 | WIGGLE R20 45/90/45 R | Service-road S (V19) |
| 1184 | 1225 | S 41 | Service road; item row |
| 1225 | 1288 | C R40 90° R | Toll return |
| 1288 | 1340 | C R100 30° L | Toll kink |
| 1340 | 1511 | WIGGLE R70 35/70/35 R | Frontage S |
| 1511 | 1678 | WIGGLE R80 30/60/30 L | Frontage S 2 |
| 1678 | 1783 | C R100 60° L | On-ramp sweeper |
| 1783 | 1888 | C R100 60° R | On-ramp exit |
| 1888 | 1951 | C R30 120° L | Toll-gate hairpin (V19) |
| 1951 | 2000 | S 49 | To the line |

### 12.17 `spark_grand_circuit` — Spark Grand Circuit / 스파크 그랜드 서킷

| Property | Value |
|---|---|
| Theme | `spark_circuit` (스파크 서킷) |
| Difficulty | D1 (★) |
| Laps × lap length | 3 × 1500 m (circuit) |
| Built for | speed★ / racing-line tutorial |
| v_ref | 37 m/s |
| Ref lap (speed / item) | 40.5 s = 2432 ticks / 45.4 s = 2724 ticks |
| Race (speed / item) | 121.6 s / 136.2 s |
| Hard cap (speed) | 21892 ticks (365 s) |
| Width | 15–18 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 30 m / 3 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 6 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the pit straight (+150, +220), 2 in the pit lane |
| Feature ladder | F1 (pit-lane branch, boost pads, kerbs) |
| `@signature` | branch, pads |
| `@fallback` | none needed (F1 only) |
| Lighting / time of day | Clear day (`sky=day time=13:00`). |
| Music | song `spark` variant `a`: stadium EDM, A major, 128 BPM |
| Lane | L7 (F1-first) |

**Signature and gimmicks.** 300 m pit straight; wide esses; R30 hairpin with a huge run-off; rideable kerbs; optional racing-line overlay (Time Attack).

**Hazards.** None.

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `pit_lane` | alt | pit straight, parallel | 9 m pit lane with its own 2 pads | 0.2 | ≈ 0 m (alternative line) |

**Props.** Grandstands with instanced crowd cards, pit buildings, drone camera, sponsor boards (original names), red-white kerbs, tyre stacks.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 258 | S 258 | Pit straight; pads at +150 and +220; the pit-lane branch runs alongside |
| 258 | 321 | C R40 90° L | Turn 1 (V19) |
| 321 | 385 | S 64 | Grandstand run; item row |
| 385 | 553 | WIGGLE R60 40/80/40 R | Esses |
| 553 | 617 | S 64 | Esses exit |
| 617 | 712 | C R30 180° L | Hairpin R30 with a huge run-off (V19) |
| 712 | 841 | S 129 | Back straight; item row |
| 841 | 919 | C R50 90° L | Stadium corner (V19) |
| 919 | 975 | C R80 40° R | Kink |
| 975 | 1031 | C R80 40° L | Kink return |
| 1031 | 1165 | WIGGLE R55 35/70/35 R | Sponsor S |
| 1165 | 1230 | S 64 | Sponsor-board straight |
| 1230 | 1300 | C R45 90° R | Tower corner |
| 1300 | 1371 | C R45 90° L | Final corner (V19) |
| 1371 | 1500 | S 129 | To the line |

*Notes:* 04 had an R16 hairpin; D1 minimum is R30.

### 12.18 `sunset_arena_rally` — Sunset Arena Rally / 선셋 아레나 랠리

| Property | Value |
|---|---|
| Theme | `spark_circuit` (스파크 서킷) |
| Difficulty | D3 (★★★) |
| Laps × lap length | 2 × 1950 m (circuit) |
| Built for | both |
| v_ref | 35 m/s |
| Ref lap (speed / item) | 55.7 s = 3343 ticks / 62.4 s = 3744 ticks |
| Race (speed / item) | 111.4 s / 124.8 s |
| Hard cap (speed) | 20058 ticks (334 s) |
| Width | 12–15 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 16 m / 5 corners |
| Key gates | ≥ 7 |
| Item rows per lap | 8 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the bowl straight |
| Feature ladder | F2 (two rally jumps); F1 (gravel/dirt); stacking (crossover bridge) |
| `@signature` | jump, surfaces, stacked |
| `@fallback` | jump → "rally crests (humps, no air)" when=F2 |
| Lighting / time of day | Sunset matching the lobby (`sky=sunset time=18:00`). |
| Music | song `spark` variant `b`: anthemic rock-EDM, D major, 134 BPM |
| Lane | L7 |

**Signature and gimmicks.** Stadium bowl lap; mixed tarmac and gravel (0.85); two rally jumps; wooded dirt S; off-camber corner (bank −5°); crossover bridge ≥ 8 m over the gravel straight; stadium tunnel.

**Hazards.** Dust clouds (cosmetic particles).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `service_road` | shortcut | quarry S → tunnel entry | 8 m dirt service road | 0.45 | ≈ 0.6 s |

**Props.** Stadium bowl matching the lobby, floodlights, rally banners, hay bales, pines, gravel spray.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 75 | S 75 | Stadium-bowl straight; pads at +70 and +110 |
| 75 | 169 | C R30 180° L | Bowl hairpin (V19) |
| 169 | 209 | S 40 | Stadium gate |
| 209 | 248 | C R25 90° R | Gate corner onto gravel (V19) |
| 248 | 298 | S 50 | Gravel straight (gravel 0.85); item row |
| 298 | 363 | J (65 m) | Rally jump 1: ramp 8 m @8°, gap 12, drop 2, land 45 (F2) |
| 363 | 442 | WIGGLE R25 45/90/45 L | Wooded S, dirt (V19 ×2) |
| 442 | 482 | S 40 |  |
| 482 | 547 | J (65 m) | Rally jump 2 (F2) |
| 547 | 589 | C R20 120° R | Off-camber corner, bank −5° (V19) |
| 589 | 629 | S 40 | Crossover-bridge approach, dy +9 |
| 629 | 692 | C R40 90° L | Crossover bridge, ≥ 8 m over the gravel straight |
| 692 | 731 | S 40 | Bridge descent, dy −9; item row |
| 731 | 773 | C R16 150° L | Quarry hairpin (V19) |
| 773 | 835 | WIGGLE R22 40/80/40 R | Quarry S (V19) |
| 835 | 885 | S 50 | Tarmac return |
| 885 | 1031 | C R70 120° L | Quarry-rim sweeper |
| 1031 | 1178 | WIGGLE R70 30/60/30 R | Forest-road S |
| 1178 | 1346 | WIGGLE R80 30/60/30 L | Forest-road S 2 |
| 1346 | 1433 | C R100 50° L | Paddock sweeper in |
| 1433 | 1520 | C R100 50° R | Paddock sweeper out |
| 1520 | 1567 | C R30 90° R | Tunnel entry |
| 1567 | 1607 | S 40 | Stadium tunnel |
| 1607 | 1662 | C R35 90° L | Tunnel exit (V19) |
| 1662 | 1746 | WIGGLE R30 40/80/40 L | Grandstand S |
| 1746 | 1796 | S 50 | Grandstand straight |
| 1796 | 1859 | C R40 90° L | Bowl entry |
| 1859 | 1890 | C R30 60° R | Bowl kink |
| 1890 | 1950 | S 60 | To the line |

### 12.19 `token_foundry` — Token Foundry / 토큰 주조소

| Property | Value |
|---|---|
| Theme | `orbital_nexus` (오비탈 넥서스) |
| Difficulty | D3 (★★★) |
| Laps × lap length | 3 × 1350 m (circuit) |
| Built for | item★ |
| v_ref | 35 m/s |
| Ref lap (speed / item) | 38.6 s = 2314 ticks / 43.2 s = 2592 ticks |
| Race (speed / item) | 115.7 s / 129.6 s |
| Hard cap (speed) | 20829 ticks (347 s) |
| Width | 14–17 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 16 m / 5 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 5 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the assembly-hall straight |
| Feature ladder | F5 (presses); F1 (conveyors ±15%); F3 (gutter custom profile) |
| `@signature` | hazard:press, conveyor |
| `@fallback` | hazard:press → "static press columns (walls)" when=F5; gutter profile → flat when=F3 |
| Lighting / time of day | Clean studio light with orange accents (`sky=space` interior lighting preset `studio`). |
| Music | song `orbital` variant `a`: glitch-house, G minor, 124 BPM |
| Lane | L6 (without presses first) |

**Signature and gimmicks.** Assembly hall with conveyor belts (split lanes ×1.15 / ×0.85); press gauntlet; server-rack canyon; coolant-pipe tunnel with a gutter profile; elevator ramp; gantry deck ≥ 8 m over the hall.

**Hazards.** Three hydraulic presses: period 240 ticks, down 120 (50%), telegraph 36 (warning light), offsets 0/80/160; contact = `squash` (stun 45 ticks, speed ×0.3).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `catwalk` | risk | gantry deck → gantry drop | 7 m maintenance catwalk, no walls, kill below | 0.6 | ≈ 0.5 s |

**Props.** Glowing token cubes streaming along belts (particles), press frames, server racks with LED blinks, coolant pipes, gantry cranes.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 108 | S 108 | Assembly-hall straight, conveyors ±15% in split lanes; pads at +80 and +120; item row |
| 108 | 139 | C R20 90° L | Hall corner (V19) |
| 139 | 183 | S 43 | Press gauntlet: 3 presses, 120 ticks down / 120 up (F5) |
| 183 | 230 | C R30 90° R | Press exit |
| 230 | 285 | WIGGLE R20 40/80/40 L | Server-rack canyon S (V19 ×2) |
| 285 | 329 | S 43 | Coolant-pipe tunnel (gutter profile) |
| 329 | 371 | C R16 150° R | Pipe hairpin (V19) |
| 371 | 414 | S 43 | Elevator ramp up, dy +8; item row |
| 414 | 469 | C R35 90° L | Gantry corner |
| 469 | 523 | S 54 | Gantry deck, ≥ 8 m over the hall |
| 523 | 562 | C R25 90° L | Gantry drop corner, dy −8 (V19) |
| 562 | 632 | WIGGLE R25 40/80/40 R | Token-stream S |
| 632 | 686 | S 54 | Token-stream straight |
| 686 | 749 | C R30 120° L | Kiln corner (V19) |
| 749 | 790 | C R40 60° L | Hall return |
| 790 | 845 | C R35 90° R | Loading-bay corner |
| 845 | 877 | C R30 60° L | Loading-bay exit |
| 877 | 1034 | C R50 180° L | Crucible U-turn (V19) |
| 1034 | 1160 | WIGGLE R60 30/60/30 R | Cooling-line S |
| 1160 | 1222 | C R90 40° L | Belt sweeper in |
| 1222 | 1285 | C R90 40° R | Belt sweeper out |
| 1285 | 1350 | S 65 | To the line |

### 12.20 `orbital_express` — Orbital Express / 궤도 급행선

| Property | Value |
|---|---|
| Theme | `orbital_nexus` (오비탈 넥서스) |
| Difficulty | D5 (★★★★★) |
| Laps × lap length | 1 × 3800 m (p2p) |
| Built for | speed★ (1-lap journey) |
| v_ref | 33 m/s |
| Ref lap (speed / item) | 115.2 s = 6909 ticks / 129.0 s = 7738 ticks |
| Race (speed / item) | 115.2 s / 129.0 s |
| Hard cap (speed) | 20728 ticks (345 s) |
| Width | 11–12 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 9 m / 9 corners |
| Key gates | ≥ 12 |
| Item rows per lap | 15 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | ≈ 15 (launch 3, sky-rail 6, city 6) |
| Feature ladder | F6 (360° loop, zero-g tube, 540° docking helix); F4 (warp gate); F5 (trains, laser gates); F2 (gap-jump branch, void kill) |
| `@signature` | loop, zeroG, helix, warp, hazard:train, hazard:press, jump, kill |
| `@fallback` | loop → "HELIX R20 360° climb + drop (stacked)" when=F6; zeroG → "long jump with world gravity (ramp 12 @10°, gap 30)" when=F6; warp → "long descending S (S 200 dy −12)" when=F4; hazard:train, hazard:press → none when=F5 |
| Lighting / time of day | Starfield with a planet rim light (`sky=space`). |
| Music | song `orbital` variant `b`: cinematic trance (supersaw), C minor, 145 BPM |
| Lane | L6 |

**Signature and gimmicks.** Launch-tube start; sky-rail with dense boost pads (≈ every 200 m); 360° vertical loop (rmf frames, track gravity); zero-g tube (low gravity ×0.35); glass-tube S; 540° docking-ring helix; warp gate to the city; cityscape finale.

**Hazards.** Trains crossing the train straight every 480 ticks (train, telegraph 60); laser gates on the laser hairpin (press with effect `block`, period 240, active 90, telegraph 36); falling off the edge into the void (kill).

| Branch | Kind | Span | Shape | aiMinSkill | Saves |
|---|---|---|---|---|---|
| `rail_gap` | risk | warp approach, between the two sky rails | 8 m, gap jump over the void, kill below | 0.8 | ≈ 1.0 s |

**Props.** Starfield, ringed planet, sky rails, glass tubes, hologram billboards, docking ring, city towers in Claude-orange accents.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 47 | S 47 | Launch-tube start; pads at +40, +90, +140 |
| 47 | 94 | C R30 90° L | Tube exit (V19) |
| 94 | 141 | S 47 | Sky-rail straight, pads every ~200 m |
| 141 | 267 | WIGGLE R60 30/60/30 L | Sky-rail sweep S |
| 267 | 456 | C R120 90° L | Sky-rail sweeper |
| 456 | 523 | WIGGLE R16 60/120/60 R | Sky-rail S (V19 ×2) |
| 523 | 576 | WIGGLE R14 55/110/55 L | Pylon S (V19 ×2) |
| 576 | 605 | S 28 | Loop approach |
| 605 | 711 | feature (106 m) | 360° vertical loop R12, shift 12, 15 m easements (rmf, track gravity) (F6) |
| 711 | 753 | C R20 120° L | Loop exit (V19) |
| 753 | 781 | S 28 | Zero-g tube entry |
| 781 | 1081 | feature (300 m) | Zero-g tube: low gravity ×0.35, long glide (F6) |
| 1081 | 1125 | C R14 180° R | Tube hairpin (V19) |
| 1125 | 1188 | WIGGLE R18 50/100/50 L | Glass-tube S (V19 ×2) |
| 1188 | 1243 | WIGGLE R16 50/100/50 R | Glass-tube S 2 (V19 ×2) |
| 1243 | 1291 | S 47 | Train-crossing straight (trains every 480 ticks, F5) |
| 1291 | 1330 | C R25 90° R | Station corner |
| 1330 | 1594 | HELIX R28 540° L | Docking-ring helix 540° down, dy −14, bank 12 (V19) |
| 1594 | 1622 | S 28 | Ring exit |
| 1622 | 1748 | WIGGLE R60 30/60/30 R | Ring-exit S |
| 1748 | 1905 | C R100 90° R | Station sweeper |
| 1905 | 1943 | C R12 180° R | Laser-gate hairpin (V19) |
| 1943 | 2012 | WIGGLE R20 50/100/50 L | Laser S (V19) |
| 2012 | 2050 | S 38 | Warp approach; the gap-jump branch runs between the rails |
| 2050 | 2110 | feature (60 m) | Warp gate: 48-tick transit to the city (F4) |
| 2110 | 2157 | S 47 | Cityscape finale 1, pads |
| 2157 | 2283 | WIGGLE R60 30/60/30 L | Canyon-of-towers S |
| 2283 | 2471 | C R120 90° R | Tower sweeper |
| 2471 | 2639 | WIGGLE R80 30/60/30 R | Bridge S |
| 2639 | 2708 | WIGGLE R22 45/90/45 L | Skyscraper S (V19) |
| 2708 | 2771 | WIGGLE R18 50/100/50 R | Tower S (V19) |
| 2771 | 2818 | S 47 | Cityscape finale 2 |
| 2818 | 2944 | WIGGLE R60 30/60/30 L | Hologram S |
| 2944 | 3101 | C R100 90° L | Hologram sweeper |
| 3101 | 3268 | WIGGLE R80 30/60/30 L | Neon S |
| 3268 | 3394 | WIGGLE R60 30/60/30 R | Final S |
| 3394 | 3436 | C R16 150° R | Plaza hairpin (V19) |
| 3436 | 3506 | WIGGLE R20 50/100/50 L | Plaza S (V19) |
| 3506 | 3553 | S 47 | Avenue |
| 3553 | 3637 | WIGGLE R30 40/80/40 R | Arch S |
| 3637 | 3674 | C R12 180° L | Arch hairpin (V19) |
| 3674 | 3729 | C R35 90° L | Final corner |
| 3729 | 3800 | S 71 | Finish straight to the gate at s = 3800 |

*Notes:* Manifest topology is `p2p` (1 lap).

### 12.21 `proving_ring` — Proving Ring / 시험 주행 링

| Property | Value |
|---|---|
| Theme | `spark_circuit` (스파크 서킷) |
| Difficulty | D1 (★) |
| Laps × lap length | 5 × 700 m (circuit) |
| Built for | off-roster tutorial and CI ring |
| v_ref | 37 m/s |
| Ref lap (speed / item) | 18.9 s = 1135 ticks / 21.2 s = 1271 ticks |
| Race (speed / item) | 94.6 s / 105.9 s |
| Hard cap (speed) | 17028 ticks (284 s) |
| Width | 15–18 m main line; ≥ 11 m in corners; branches 7–9 m |
| Min R / V19 N | 30 m / 3 corners |
| Key gates | ≥ 6 |
| Item rows per lap | 3 ± 1 (≈ L/250), rows of 4–6 boxes |
| Boost pads | 2 on the main straight (+60, +110) |
| Feature ladder | F1 (pads) |
| `@signature` | pads |
| `@fallback` | none |
| Lighting / time of day | Clear day (`sky=day`). |
| Music | song `spark` variant `a`: stadium EDM, A major, 128 BPM |
| Lane | M1 core (L4/L5) |

**Signature and gimmicks.** A 5-lap oval used for the tutorial, the first online test race (1 lap in e2e) and CI smoke races.

**Hazards.** None.

**Props.** Spark Circuit kit: kerbs, tyre walls, a small grandstand, tutorial signboards.

**Block-out** (s in metres from the line):

| s from | s to | Segment | Notes |
|---|---|---|---|
| 0 | 199 | S 199 | Main straight; pads at +60 and +110 (tutorial "부스터!") |
| 199 | 325 | C R40 180° L | Turn 1 (tutorial "드리프트!") |
| 325 | 524 | S 199 | Back straight; item row |
| 524 | 650 | C R40 180° L | Turn 2 (tutorial "순간 부스터!") |
| 650 | 700 | S 50 | To the line |

*Notes:* Exempt from V14 and V19 (2 corners only); laps = clamp(round(115/18.9)) = 6 → clamped to 5.


---

## 13. Per-track workflow and deliverables (world lanes)
1. **Brief** (this section's row) → `docs/tracks/<id>.md` with the layout sketch, signature, fallback and budget notes (≈ 0.5 h).
2. **DSL block-out** with macros and `CLOSE` → `tracks/<themeId>/<id>.ctd` (0.5–1 day). Start from the block-out table; keep `@signature` and `@fallback` lines at the top.
3. **Validate and preview loop**: `pnpm trackc build <id> --validate --preview`; read the SVG, elevation/curvature/width plots and the flythrough contact sheet (agents read the PNGs).
4. **Ghost tuning**: `--ghost` sets `refLapSec`; tune straight lengths and corner widths until V13 (±8% of the table) and V19 pass.
5. **Theme dressing** from the shared kit (`render/themes/<themeId>/`): PROPS rows, landmarks, terrain, lighting per the art bible (≈ 1 day).
6. **Bot suites**: speed and item, 8 bots, thresholds in `50-test-plan.md` §6.
7. **Done** when V1–V20 pass, the ghost is within ±8%, the signature feature is present (or its fallback is recorded), both-mode bot suites pass, and the preview contact sheet has been self-reviewed.

Twenty tracks at roughly two days each is about eight agent-weeks (gap-3 §9).
