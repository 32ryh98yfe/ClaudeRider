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

## 6. F2 recipes
### Jump with a real gap
```
S 40                                                   # flat run-up (≥ 30 m, no bank)
J ramp=10@8 gap=10 drop=2 land=45 wland=18 vmin=22 vmax=46
S 30                                                   # the landing continues straight
```
- The J is one straight primitive of `ramp + gap + land` metres. The ramp is a smooth kicker from the approach level
  up to the lip: lip height = `ramp·tan(lip)/2`, surface angle at the lip = `lip`°.
- **`drop` is the landing's height below the approach road**; the J's net elevation change is `−drop` (count it in
  your Σdy = 0 balance). A kart therefore falls `lipH + drop` from the lip to the landing.
- The gap has no ground and no walls. By default a kill floor sits 5 m below the lower of lip and landing
  (`floor=none` removes it — only for gaps over other track). The landing's front edge is a solid face (a kart that
  falls short hits a wall, not the road top). `wland=` widens the landing.
- **V11** checks every speed in [vmin, vmax] (G = 28 m/s²): the landing point must fall in
  `[gap + 2, gap + land − 5]` past the lip; landing ≥ 40 m, straight, ±10% grade. Tune `vmin` to the slowest
  realistic approach (after the preceding corner) and lengthen `land` for fast approaches.
  Worked numbers: lip 8°, lipH 0.70, drop 2 → 12.2 m at 22 m/s, 33 m at 46 m/s.
- Tutorial hop / mushroom bounce without a gap: `PAD at=… kind=jump` (the sim launches karts on `jump_pad`).

### Open ledges and kill planes
```
S 200 wallR=none shoulderR=0 kill=lava      # open right edge; falling off = respawn
C R40 90 L wallR=barrier:1.0 shoulderR=2    # put the wall back where the ledge ends
KILL lava belowY=-6 aabb=(-200,-400 .. 500,120)
```
- `wall=none` (per side: `wallL=none`) leaves the edge open. Add `kill=<id>` on the segment (one-shot) or
  `:ledgeKill` on the wall spec (`wallR=none::ledgeKill`) so karts that fall off land on a kill strip 28 m wide below
  the edge (at the KILL plane `<id>` if one is declared lower, else 4 m below the edge).
- `KILL <id> belowY=<y> [aabb=(x0,z0 .. x1,z1)] [surf=lava|water|void]` is a global kill plane: collision strips run
  under every path that stands > 2 m above it, and the renderer draws the lava/water/void plane over the aabb.
- BRANCH lines accept `kill=<id>` for the whole branch (risky ledge shortcuts).
- The terrain drops away beside open kill ledges and under jump gaps automatically.

### Shoulders
`shoulders=3:grass` (both), `shoulderL=4:sand`, `shoulderR=0`. Shoulders are drivable (grass ×0.60 top speed, sand
×0.92 …, `10-sim-spec.md` §13.1), blend over `blend`, and the wall stands at their outer edge.

## 7. F3 recipes
### Halfpipe and custom cross-sections
```
PROFILE hp60 halfpipe floorHalf=5 filletR=6 wallDeg=60 wallH=4.5        # built in; define your own variants
PROFILE gutter custom pts=[-9:1.6,-8:0.9,-7:0.3,-6:0,6:0,7:0.3,8:0.9,9:1.6]
PROFILE crowned flat crown=0.12
S 40
S 120 prof=hp60 surf=ice          # prof is one-shot: the next segment is flat again
S 60  surf=asphalt
C R40 90 L prof=gutter
```
- A profile replaces the road cross-section; the road width becomes the profile footprint (hp60 = 22.1 m).
- Profiles blend in and out over `blend` metres (the walls grow from flat), so give the pipe a straight run-in.
- Every profile segment up to **60°** is ground (the kart can ride it); walls stand on the outermost point (the lip).
  `wallDeg > 60` or a custom slope > 60° is a compile error.
- Custom `pts=[d:h[:surf],…]` in metres, left → right (d increasing); canonicalised to 17 vertices. A third field sets
  the surface of that part of the section (`-8:0.9:sand`).
- Slope triangles carry `TFLAG.SLOPE` (sim / VFX).

### Plaza (AREA)
```
C R24 90 R w=18                                @veerIn
C R33 270 L w=30 area=piazza                   @plaza     # the guide arc (progress + AI line through the plaza)
C R24 90 R w=16                                @veerOut
AREA piazza annulus rIn=18 rOut=48 surf=stone wallIn=curb:0.4 wallOut=planter:0.8 tower=cyl(r=14,h=30)
AREA market polygon pts=[(0,0),(60,0),(70,40),(10,55)] y=4 surf=cobble wall=planter:0.8 obst=cyl(x=30,z=20,r=2,h=4)
```
- `annulus`: centre, `from` and `sweep` default to the guide arc (`c=(x,y,z) from= sweep=` override — angles use the
  heading convention: point = c + r·(cos θ, −sin θ), sweep + = counter-clockwise). `PLAZA <id> [L|R]` writes the guide
  arc for you (radius = mid-ring, width = ring width).
- `polygon`: `pts=[(x,z),…]` (plan), `y=`, optional `hole=[(x,z),…]`. Make the guide segments' `w` cover the plaza
  or rely on the automatic locate reach (the compiler widens the guide's lateral reach to the plaza boundary).
- The plaza wins: ribbons (any path at the same level) are cut to its outline, and the guide ribbon inside its own span
  is replaced entirely. Boundary walls open wherever a road joins. `wallIn=curb` makes the inner edge drivable (the
  compiler fills the ring down to the tower base); `tower=cyl(r=,h=)` / `obst=cyl(x=,z=,r=,h=)` / `obst=box(x=,z=,w=,d=,h=,yaw=)`
  are solid walls (`.vis areas[]` lists them for the renderer).
- V16: the area must triangulate, the guide must stay inside it, and its height must match the area `y` (±0.3 m).

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
| V11 `at N m/s the kart lands … past the lip` | Shorten the gap, raise `lip`, add `drop`, lengthen `land`, or narrow [vmin, vmax]. |
| V11 `landing zone … < 40 m` | `land=` ≥ 40. |
| V14 `straight ratio …` | Adjust straights vs corners toward the D band (R ≥ 150 counts as straight). |
| V16 `AREA … guide path leaves the area` / `height differs` | Put the guide arc (`area=<id>`) inside the plaza and at its `y`. |
| V15 `samples have no ground` | Something removed the road: check `warp=`, jump spans, area clipping. |
| V18 `rejoin tangent error` | The branch's turns must match the host heading change between from and to. |
| V18 `no key gate between branch …` | Add a KEYS entry between the merge of one branch and the split of the next. |
| V19 `corners where drift beats grip` | Needs N(D) = 3/4/5/7/9 drift corners; without a ghost this is an analytic estimate (warning). |
