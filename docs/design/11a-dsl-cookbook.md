# 11a — Track DSL cookbook (for world lanes)

Owner: L4 TRACKC. Companion to `11-track-spec.md` (the spec) — this file is the practical guide: every command with a
copy-paste example, the validator messages you will meet and how to fix them, and one recipe per feature-ladder step.
Fixtures that exercise every feature live in `tracks/_test/f*_*.ctd`; they always bake, so copy from them.

```
node packages/trackc/src/cli.ts build <id>[,<id>…] --validate --preview     # writes apps/client/public/tracks/<id>.*
node tools/scratch/svg2png.mjs apps/client/public/tracks/<id>.svg out.png   # (local helper) look at the preview
```

---

## 0. Coordinates, s and the turtle
- World: x east, y up, north = −z. Heading `hdg` is degrees counter-clockwise from +x (`hdg=90` drives north).
- The turtle walks segments in order; **s** is the arc length along the path. On circuits the bake rotates s so the
  `LINE start` sits at s = 0; content given as a number is **DSL s** (before that rotation), labels are the safest.
- Lateral offset **d** (`d=` on pads, zones, hazards) is + to the right of the driving direction.
- Circuits must close: position < 0.05 m, heading 0°, Σdy = 0 (V1). Let `CLOSE` solve free straights (`?a`).

## 1. Lexical rules
- One command per line; `;` separates several; a line may also hold several commands that each start with a
  multi-letter keyword (`START pos=(0,0,0) hdg=0   GRID rows=4 …`).
- `#` starts a comment when it begins a token (`fog=#cfe6f5:120:900` is a value, not a comment).
- An indented line whose first token is `key=value` continues the previous command (long `AREA`/`RAIL` lines); a
  trailing `\` also continues.
- `@name` on a line labels the **start** of that statement (or of the next statement when alone on a line). Use
  `@name+30` / `@name-10` anywhere an s is expected.
- Attributes **persist** until changed: `w`, `surf`, `wall/wallL/wallR`, `shoulders/shoulder*/shoulderSurf`, `crown`.
  **One-shot** (this segment only): `dy`, `bank`, `prof`, `area`, `kill`, `frame`, `gravity`, `noitem`, `warp`, `tag`,
  `wallIn/wallOut`, `surf=<id>@<from>+<len>`. So `S 120 surf=cobble` keeps every later segment cobble until
  `surf=asphalt` — write it explicitly when a surface section ends.

## 2. Header and directives
```
TRACK sunstone_bazaar name="Sunstone Bazaar" theme=sunstone_desert diff=1 laps=3 topo=circuit
@signature branch, surfaces, jump
@fallback jump -> "dune hump (no air)" when=F2
DEFAULTS w=18 surf=asphalt wall=barrier:1.0 shoulders=2:grass blend=15
START pos=(0,0,0) hdg=0
GRID rows=4 cols=2 pitch=6 stagger=3 d=4
LINE start at=@home+100
CLOSE solve=[?a,?b,?c] length=1450
```
- `topo=p2p` for point-to-point (1-lap) tracks; the finish is `finishBefore=20` m before the path end (header attr).
- `@signature` lists the features the track must ship; a missing one without an `@fallback` is an error (V0).
  **A track with `@signature` is validated in strict mode** (design rules become errors, §9 below).
- `DEFAULTS blend=` is the attribute blend length (≥ 15, V4). `prof=` sets the default profile.
- `CLOSE solve=[?a]` solves one straight from `length=`; `[?a,?b]` solves x/z closure; `[?a,?b,?c]` solves x, z and
  length. Free straights must have different headings (parallel ones make the system singular). The same `?a` may be
  used twice (both straights get the same length, e.g. an oval).

## 3. Segments
| Command | Example | Notes |
|---|---|---|
| `S <len>` / `S ?a` | `S 120 dy=+2 w=16` | straight; `?a=128.94` keeps the last solved value as a hint |
| `C R<r> <deg> L\|R` | `C R40 90 L bank=6` | circular arc; with `dy` it is a helix |
| `HELIX R<r> <deg> L\|R dy=` | `HELIX R28 540 L dy=-14 bank=12 wallOut=rock:1.5 wallIn=pillar` | alias of C; `wallIn/wallOut` map to the inside/outside |
| `HAIRPIN R<r> L\|R` | `HAIRPIN R14 R bank=-8` | C R 180 |
| `WIGGLE R<r> a/b/a L\|R` | `WIGGLE R60 40/80/40 L dy=+2 bank=4` | a° L, b° R, a° L; dy spread by angle; bank flips with the turn |
| `CHICANE R<r> a/b/a L\|R` | `CHICANE R18 70/140/70 L w=11` | same expansion as WIGGLE |
| `E R<r0>-><r1> <deg> L\|R` | `E R0->40 20 L` | clothoid (linear curvature), `R0`/`Rinf` = straight |

Segment attributes: `w= dy= bank= surf= prof= wall= wallL= wallR= wallIn= wallOut= shoulders=<w>:<surf>
shoulderL=<w>:<surf> shoulderR=<w>:<surf> crown= area= kill= frame=worldUp|rmf gravity=world|track|low:<scale>
noitem=1 warp=<id> tag=<name>`.
Wall spec: `type:height[:soft][:ledgeKill]`, type ∈ `none curb barrier fence rock parapet building invisible planter
pillar` (`none` = open ledge, `curb` = painted kerb, no collision, `invisible` = collision only).

## 4. Content
```
ITEMS at=@market+20,@lane+40(n=6,span=12),905 n=5          # rows of 4–6 boxes; span defaults to w − 3
PAD at=@home+110,@home+160 d=0 len=6 w=4                   # boost pads (surface boost_pad)
PAD at=@meadow+30 d=0 len=5 w=4 kind=jump                  # jump pad (mushroom bounce)
PAD at=40 path=alley                                        # s on a branch is branch-local
ZONE surface from=@t3 to=@t3+40 d=[-8,-3] surf=sand         # partial-width surface patch
ZONE conveyor from=1120 to=1185 d=[0,5.5] mul=1.15          # conveyor_fwd / conveyor_back by mul
ZONE noItem from=@bridge to=@bridge+60
ZONE camera from=@tunnel to=@tunnel+80 hint=low
KEYS @home+230,@t1+30,@far+140,…                            # ≥ 6 key gates, main line, outside branch/rail/warp spans
THEME sunstone_desert sky=day time=16:00 fog=#e8d2a8:150:900 scatter=palm,rock density=6 hills=6
```
Without `KEYS` the compiler places ≥ 7 key gates evenly, outside forbidden spans. Ordinary gates (every 30 m) are
automatic.

### Props
```
PROPS kind=lamp along=main side=both every=30 offset=3 from=@home to=@home+180
PROPS kind=bush along=alley side=both every=12 offset=1.5 jitter=1 scale=0.8-1.2 seed=7
PROP  kind=windmill at=(120,0,-340) yaw=35 scale=1.5              # landmark
```
Placement rules (automatic): rows skip ±10 m around the line, pads and item rows ±6 m, junction windows, hazards ±8 m,
jump gaps and warps; a point that falls on any drivable surface is dropped; props sit on the terrain and are dropped
where the terrain is > 3 m below the road edge (no floating props). The compiler adds `chevron` boards (outside of tight
corners with a wall), the start `gantry`, `gore_cushion`s and `pillar`s under elevated decks.

## 5. F1 recipes
### Shortcut / alternative branch
```
BRANCH alley from=@riverside to=@riverside+113.4 kind=shortcut aiMin=0.45 w=8 wall=building:4 surf=cobble {
  C R25 45 L ; S ?x ; C R25 45 L ; S ?y
}
```
- The branch starts on the host centreline at `from` with the host's heading and ends on it at `to`. Its turns must
  add up to the host's heading change over [from, to] (V18: rejoin tangent ≤ 5°).
- Give the block two free straights (`?x`, `?y`, different headings): the compiler solves them so the end lands exactly
  on the host. With none, the residual is blended out with a smoothstep and V18 warns above 2 m.
- `kind=shortcut|risk|alt`, `aiMin=` ∈ [0,1] (0.2 free … ≥ 0.8 expert), `gore=none` or a wall spec (default soft barrier).
- Width ≥ 7 m (V4). Keep host bank ≤ 4° at the junctions (V18 warns) and put ≥ 1 key gate between consecutive branches.
- Junction geometry is automatic: the branch surface is cut to the host road edge, the host's shoulder and wall open
  where the branch covers them, and both walls meet in a V at the gore tip, which gets a soft crash cushion.
- Items/pads/props on the branch: `path=<id>` with branch-local s.

### Surfaces
- Per segment: `S 150 surf=cobble`, then `surf=asphalt` where it ends. Sub-range: `S 57 surf=gravel@20+30`.
- Shoulders (drivable off-road): `shoulders=2:grass`, `shoulderL=3:sand shoulderR=0`.
- Per zone (partial width): `ZONE surface … d=[a,b] surf=<id>`; lava zones are kill surfaces.
- Conveyors: `ZONE conveyor … mul=1.15` (or `0.85`); also `surf=conveyor_fwd` on a segment.

### Boost pads
2–4 per lap (V10 warns otherwise), ≥ 15 m from the apex of an R < 30 corner, not in landing zones, and ≥ 89 m of clear
road straight ahead (2 s at 44.4 m/s) — put them early on long straights.

## 9. Validators and common errors
Severity: structural rules are always errors. **V5 V6 V9 V10 V13 V14 V19 V20 are errors only in strict mode** (tracks
with `@signature`, or `--strict`); M1-era tracks see them as warnings.

| Message | Fix |
|---|---|
| V1 `closure error …` / `heading closure …` | Add or free up `?a` straights in `CLOSE`; turns must sum to ±360°. |
| V1 `elevation does not close (Σdy = …)` | Balance the `dy` values (a J segment contributes −drop). |
| V1 `turning number 2` | Only allowed with stacked crossings (helix); otherwise fix the turns. |
| V0 `@signature X is missing` | Build the feature or add `@fallback X -> "…" when=Fn`. |
| V2 `footprints overlap with only … m vertical separation` | Separate crossing decks by ≥ 8 m (dy on the approach) or move them apart in plan. |
| V3 `radius … below the D… minimum` | Rmin D1–D5 = 30/22/16/12/9 m (branches −20%). |
| V3 `inner edge radius … < 3 m` | Radius − w/2 must stay ≥ 3 m; widen R or narrow w. |
| V4 `corner width … < 11 m` | Corners need ≥ 11 m and the D band minimum (15/14/12/12/11). 9–10 m only on straights < 60 m. |
| V4 `branch width … < 7 m` | Branches ≥ 7 m. |
| V5 `sustained grade … over 30 m` | Spread `dy` over longer segments (D1–2 ≤ 8%, D3 10%, D4–5 12%, p2p D5 downhill 15%). |
| V5 `crest vertical radius …` | Crests need Rv ≥ 71 m: lengthen the straights around a hump or raise `blend`. |
| V6 `bank rate … > 1.5°/m` | Bank changes blend over `blend` m; avoid large bank flips on short arcs. |
| V8 `only N key gates` / `key gate … inside a branch …` | Add `KEYS` outside branch/rail/warp spans (or drop KEYS to auto-place). |
| V9 `item rows only … apart` / `first item row …` | Rows ≥ 150 m apart, first ≥ 60 m after the line, ≈ L/250 ± 1 per lap. |
| V9 `local radius … within ±10 m` | Move rows onto straights or radii ≥ 60 m (plazas ≥ 24 m wide are exempt). |
| V10 `wall … straight ahead of the boost pad` | Move the pad earlier on the straight. |
| V14 `straight ratio …` | Adjust straights vs corners toward the D band (R ≥ 150 counts as straight). |
| V15 `samples have no ground` | Something removed the road: check `warp=`, jump spans, area clipping. |
| V18 `rejoin tangent error` | The branch's turns must match the host heading change between from and to. |
| V18 `no key gate between branch …` | Add a KEYS entry between the merge of one branch and the split of the next. |
| V19 `corners where drift beats grip` | Needs N(D) = 3/4/5/7/9 drift corners; without a ghost this is an analytic estimate (warning). |
