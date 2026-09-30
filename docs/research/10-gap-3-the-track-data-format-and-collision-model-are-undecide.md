
# ClaudeRider track pipeline v1: collision model, frames, schema, lap table, two authored tracks, and an authoring DSL

## 0. Decisions

1. **Collision uses a baked triangle mesh with a semantic spline graph on top.** Karts touch real geometry only through three-mesh-bvh. There are two BVHs:
   - **Ground BVH:** every drivable surface, including halfpipe walls up to 60°, plazas, ramps and junction pads. Karts query it with a ray along −up.
   - **Wall BVH:** barriers, props, the tower, gore wedges and low ceilings. Karts query it with a sphere shapecast.

   The spline graph never pushes a kart. It supplies progress, laps, rank, wrong-way, respawn, AI and item routes, the gravity direction on loops and zero-g sections, the "up hint" that points the ground ray, and the triggers for rails, warps, conveyors and zones.
   - This settles the dossier conflict. The maps and driving reports were right that the spline must own progress and "up". The physics report was right that only a mesh can express plazas, merges, props, bridges and free landings.
2. **Bake offline and ship one binary.** CI (Node) produces `.ctrk`: vertex buffers, a serialized BVH, 1 m frame samples, the graph, gates and the grid. Client and server both load the same bytes. At runtime the sim calls no trig for track data. MDN notes that many `Math` functions have implementation-dependent precision across browsers.
3. **Frames are written by us.** Up-constrained frames are the default. Double-reflection RMF (Wang et al. 2008) is used only where the tangent approaches vertical: loops, corkscrews and zero-g tubes. Twist is distributed by arc length, and bank is applied last. `computeFrenetFrames` and `tension` are dropped.
4. **Progress on branches is an affine map into the main line's s-span.** It stays continuous at the split and the merge, and it is monotonic. Key gates sit only on main-line stretches outside every branch, rail and warp span.
5. **Laps: 12×3, 6×2, 2×1 across the 20 roster tracks.** The 5-lap mini oval becomes the off-roster tutorial and CI ring "Proving Ring" (5×700 m).
   - The per-lap CI window (28–45 s) is replaced by `laps == clamp(round(115/refLapSec),1,5)` plus a race window of 100–130 s in speed mode.
   - The ×0.4 width / 1:1 length mix is abandoned. Widths are sized from kart density, lengths from a time budget.
6. **Authoring is a turtle DSL.** A `CLOSE` solver computes free straights for exact closure and target length. Both example tracks below were produced this way, with closure error below 0.01 m.

---

## 1. How other kart engines represent tracks

### SuperTuxKart (driveline = quads + graph; physics against the mesh)
- **Quads.** `quads.xml` is a list of `<quad p0 p1 p2 p3/>` elements. Shared corners use the `"i:3"` form, for example `p0="0:3" p1="0:2"`.
  - In the hacienda track, quads are about 8 m wide and about 10 m long.
- **Graph.** `graph.xml` has `<node-list from-quad to-quad/>`, a main `<edge-loop from="0" to="1054"/>`, and branches of the form edge → edge-line → edge.
  - Example from Black Forest: `<edge from="454" to="1055"/><edge-line from="1055" to="1089"/><edge from="1089" to="514"/>`. That track has six such shortcuts.
- **Distance from start** is computed by recursive traversal. When branches merge, the larger distance wins.
  - Lap length = max over nodes of (distFromStart + distToSuccessor(0)).
  - Successor 0 is the main driveline, and pathfinding prefers it.
  - `ai_ignore` and `invisible` flags filter successors for the AI only. Distances are unaffected.
- **Finding the kart's quad.** `findRoadSector` tests the previous sector first, then the other quads.
  - Heights are accepted only within `MIN_HEIGHT_TESTING = −1` and `MAX_HEIGHT_TESTING = 5`. The code comments say this avoids false hits under bridges.
  - `findOutOfRoadSector` uses 2D distance with the same height filter, then relaxes it.
  - `DriveNode3D` (a 3D bounding box plus a normal) handles loops.
- **Checklines.** `<check-lap>` plus `<check-line kind="activate" same-group other-ids p1 p2>`. Black Forest has 25 check-lines.
- **Direction.** Relative angles below 0.1 rad count as straight.

### Mario Kart Wii (KCL collision + KMP routes)
- **KCL** is a triangle soup (positions, normals, prisms) with an octree. Each triangle has a 16-bit flag:
  - bits 0–4: basic type (Road, Off-Road, Wall, Boost Panel, Invisible Wall …)
  - further bits: variant, intensity and effect.
- **KMP routes:**
  - **ENPT:** pos, deviation/range (the width CPUs may wander in), setting1 behaviour flags, setting2 hint (drift, mushroom…).
  - **ENPH/ITPH/CKPH:** groups with up to 6 previous and 6 next groups (0xFF = unused), which gives the branch/merge graph.
  - **CKPT** is 2D only: x1, z1, x2, z2 left and right ends, respawnIndex, type (0 = lap counter, 1..254 = key checkpoint, 0xFF = ordinary), prev and next.
  - **JGPT:** respawn points.
- **Checkpoint search.** Kinoko's `CourseMap::findSector` searches outward from the current checkpoint, guided by the distance ratio, up to `MAX_DEPTH = 6`, before a regional search.
  - Because MKW checkpoints are 2D, overlapping levels are told apart purely by this graph-local search. We copy the idea.

### TrackMania
- Tracks are snap-together blocks on a 32 m × 8 m × 32 m grid (the vjeux trackmania-tas geometry tool bounds maps by `size·32 m` and `size_y·8`).
- Physics runs against the block meshes' collision surfaces. Progress comes from checkpoint blocks.
- **Lesson:** a small vocabulary of parametric pieces is what makes many tracks cheap to build. Our DSL is the continuous equivalent.

### three.js r186 facts that matter
- **`CatmullRomCurve3`** defaults to `'centripetal'`. `tension` is used only by `'catmullrom'`, so passing tension 0.5 with centripetal is a no-op.
- **`Curve.arcLengthDivisions` defaults to 200.** On a 2 km track that is 10 m per division, so `getPointAt` and `getSpacedPoints` are not good enough for 1 m resampling.
- **`computeFrenetFrames`**:
  - seeds the first normal on the axis of the tangent's smallest component, not on world up;
  - transports each normal by rotating it about T(i−1) × T(i) by acos(T(i−1)·T(i)). This is a 2nd-order discrete RMF (bezier-kit's notes say it equals one reflection), not Wang's 4th-order double reflection;
  - on closed curves, corrects the twist as θ/segments applied by index.
  - The tech-rendering critique of it is correct.

### three-mesh-bvh 0.9.15 (peer three ≥ 0.159)
- **Constructor defaults:** `strategy = CENTER`, `maxDepth = 40`, `targetLeafSize = 10`, `indirect = false`.
- **Index reordering.** `indirect = false` reorders the geometry index in place. `indirect = true` keeps it and exposes `resolveTriangleIndex`. The `shapecast` `intersectsTriangle(tri, index, contained, depth)` index is the post-reorder index.
- **Query API:**
  - `raycastFirst(ray, side = FrontSide, near = 0, far = ∞)`;
  - `closestPointToPoint(p, target, min, max)` returns `{point, distance, faceIndex}`;
  - raycast results respect groups and `materialIndex`;
  - `MeshBVH.serialize` / `deserialize`, `refit`, and worker builders.
- **Character example:** the capsule is transformed into collider space, then `shapecast` runs `tri.closestPointToSegment` and pushes out by (radius − distance). It uses 5 physics substeps and treats the character as grounded when the correction's y exceeds |Δt·v_y·0.25|.

### KartRider reference data (used only for ratios; not copied)
- **Track counts** (namu.wiki scrape in KartTrack-lap/Kartrider-game-analysis, about 290 tracks; the counts are approximate):
  - speed mode: about 35 one-lap, 55 two-lap and 15 three-lap tracks;
  - item mode: about 8 one-lap, 15 two-lap and 105 three-lap tracks;
  - difficulty 4–5 tracks cluster at 1–2 laps.
- **Measurements from KR track assets** (a third-party reverse-engineering doc, OrangeCarrrrrPhysics):
  - standard road = 40 u = 22 kart widths; narrow = 20–24 u; extreme minimum = 12 u (6.7 kart widths); open areas = 80–100 u;
  - median about 50 gates per lap, spaced 30–45 u normally, 20–25 u where cutting must be prevented, 60–90 u in boost and jump zones;
  - 3 of 15 tracks have shortcut sections of 2–7 gates.
- **Implication:** KR roads are about twice as wide relative to the kart as a 16 m road with a 1.5 m kart. Our typical widths should sit at the upper end of the bands in §5.

---

## 2. Chosen architecture

### 2.1 What collides against what

| Mover | Ground BVH-G | Wall BVH-W | Dynamic hazards | Other karts | Zones | Spline graph |
|---|---|---|---|---|---|---|
| Kart | `raycastFirst` along −n̂ (FrontSide), origin +1.0 m, far 2.0 m; 4 offset rays (0.3 m) on a miss; 0.1 s coyote time | sphere r = 0.85 m centred 0.6 m above ground, shapecast, push-out plus velocity reflection | analytic OBB/cylinder vs sphere at the tick's phase | sphere–sphere | AABB, or (s,u,h) boxes: kill, conveyor, rail capture, warp | progress, gravity mode, up hint, respawn |
| Thrown item | ray settle / bounce | sphere r = 0.4 | yes | sphere | kill → despawn | homing follows the sample route (the ITPT idea) |
| Dropped item | one settle ray | – | – | trigger sphere | – | s-tag for AI avoidance |
| Camera | – | optional r = 0.3 shapecast against occluders | – | – | – | look-ahead along samples |

**Rules for the bake:**
- Halfpipe walls up to 60° are ground, never wall. The layer is decided semantically at bake time, not by testing normal angles at runtime.
- The surface id is a per-vertex `Uint8` attribute, flat within each triangle (vertices are duplicated at surface borders). The kart reads it as `surf[face.a]`. This works whether or not the BVH reordered the index.
- Smooth normals come from the vertex normals written from the analytic frame and profile, interpolated with `THREE.Triangle.getInterpolation`.
- Physics runs at 60 Hz with 2 substeps. At 48 m/s that is at most 0.4 m per substep, less than half the sphere radius, so the kart cannot tunnel through zero-thickness wall triangles.

### 2.2 Why this hybrid

**Spline-only collision cannot handle:**
- a 270° plaza with a tower;
- merge pads where two ribbons meet;
- props;
- landing on a different path after a jump;
- cloverleaf ramps;
- self-crossing decks where more than one candidate surface exists;
- making the physics match what is rendered.

**Mesh-only collision has no:**
- up direction for loops, zero-g, or ray direction;
- progress or AI routing.

**The old objections to meshes, and how each is handled:**
- *Seams:* welded 2D-union seams and smooth normals.
- *Cost:* about 2k BVH queries per second per room, which is negligible.
- *Determinism:* offline bake, serialized BVH, and only + − × ÷, sqrt and compares at runtime.

JS does not fuse multiply-adds, so this arithmetic should be bit-identical across engines. It is still worth a CI check against Chrome, Firefox and Safari. The server remains authoritative, with reconciliation.

### 2.3 Telling stacked levels apart
1. **Validation guarantees separation:** at least 8 m deck-to-deck wherever footprints overlap (V2).
2. **Physics.** The ground ray window is at most 1 m above and 2 m below the kart, which is far less than 8 m, and it uses FrontSide. It therefore cannot reach another deck. Landing uses a swept sphere, which is simply physical.
3. **Semantics** use a graph-local "plane-crossing" search from `segHint`: ±20 samples at 1 m spacing, following successors and predecessors across junctions.
   - A candidate is accepted if −2 ≤ h ≤ 6 m (STK uses −1..5) and |u| ≤ half-width + 3 m.
4. **Fallback** only on respawn, landing, warp exit, or more than 1 s off-graph: a 2D 16 m grid returns (path, sample-run) candidates.
   - Cost = 0.1·u² + h² + 400 if the candidate is more than 60 m of graph distance from the previous position.
   - A jump's declared `landingS` or a warp's `exit.s` seeds the search.

### 2.4 A monotonic progress value over branches
- Each non-main path (branch, rail, warp) carries `map = {host, fromS, toS}`. Then `sMain(u) = fromS + (toS − fromS)·u/L_path`.
  - When the span crosses the line (toS < fromS), add L_main.
  - Nested branches compose their maps; depth is limited to 2.
- **Race distance** D = lap·L_main + sMain. Rank is D descending, ties broken by the previous rank.
  - A shortcut accumulates D faster, which is the honest result for ranking.
  - Lap length = L_main. This differs from STK's max-over-paths rule because branches are mapped, not measured.
- **Lap validation (MKW key-checkpoint style):**
  - at least 6 key gates, all on main-line stretches outside every branch, rail and warp span, which must be crossed in order;
  - the finish is sMain wrapping from above L − 50 to below 50 with all keys held.
- **Anti-cut.** A new s is accepted only if it is graph-reachable within Δs ≤ v·dt + 10 m, except for declared jumps, warps and rails.
  - Otherwise D freezes. After 3 s off-graph the kart respawns at the last valid sample.
- **Wrong-way:** v·T < −3 m/s for 1.5 s.

### 2.5 Runtime pseudocode
```ts
function stepKart(k: Kart, T: BakedTrack, tick: number) {
  const g = T.gravity(k.loc);                      // world -Y | -U(s) ('track') | scaled ('low')
  for (let sub = 0; sub < 2; sub++) {
    integrate(k, g, DT / 2);
    const up = k.grounded ? k.n : T.up(k.loc);
    ray.origin.copy(k.pos).addScaledVector(up, 1.0); ray.direction.copy(up).negate();
    const hit = T.ground.raycastFirst(ray, FrontSide, 0, 1.0 + HOVER + SNAP);  // ≈2.0 m
    if (hit && dot(nSmooth(hit), up) > COS65) { snap(k, hit); k.n = nSmooth(hit); k.surf = T.surf[hit.face.a]; }
    else k.grounded = coyote(k);
    sphere.center.copy(k.pos).addScaledVector(k.n, 0.6); sphere.radius = 0.85;
    T.walls.shapecast({
      intersectsBounds: b => b.intersectsSphere(sphere),
      intersectsTriangle: tri => { tri.closestPointToPoint(sphere.center, cp);
        const d = cp.distanceTo(sphere.center); if (d < sphere.radius) pushOut(k, cp, d); } });
    for (const h of T.hazardsActive(tick)) collideHazard(k, h, sphere);  // integer-tick phase
  }
  k.loc = locate(k.pos, k.loc, T);                // §2.3; returns path,i,s,u,h,sMain,valid
  applyZones(k, T, k.loc);                        // conveyor ±15%, rail capture, warp, kill
}
```
Hazard phase: `((tick + offsetTicks) % periodTicks)`. Integer ticks avoid floating-point drift.

---

## 3. Frames

### 3.1 Which frame where
- **worldUp (default):** R = normalize(T × Ŷ), U = R × T. This is right-handed; for T = −Z, U = +Y, it gives R = +X.
  - Use it wherever |T·Ŷ| ≤ 0.9. The compiler switches a section to RMF automatically outside that range.
  - Helices and spirals with grade below 10% stay worldUp plus explicit bank. RMF would add an unwanted inward roll there.
- **rmf:** vertical loops, corkscrews, zero-g tubes.
  - Seed from the worldUp frame at entry and propagate by double reflection.
  - Distribute the residual twist φ, relative to the worldUp frame at exit, as φ·smoothstep(arc fraction).
  - A closed curve that is RMF everywhere spreads its closure twist linearly by arc length.
- **Bank last,** θ > 0 raises the right edge: R′ = R cos θ + U sin θ; U′ = U cos θ − R sin θ.
- **Sampling.** Sample by true arc length with our own table: 64 sub-steps per Catmull-Rom segment, binary search plus one Newton step, N = round(L/1.0) so the samples close exactly.
  - Tangents use central differences with h = 0.01 m, at bake time only.

### 3.2 TypeScript pseudocode
```ts
const Y: V3 = [0, 1, 0];
function upFrame(t: V3, rPrev: V3 | null): V3 {
  let r = cross(t, Y); const l = len(r);
  if (l < 0.15) { r = rPrev ?? [1, 0, 0]; return normalize(sub(r, scale(t, dot(r, t)))); } // near-vertical: keep continuity
  return scale(r, 1 / l);
}
function doubleReflect(p0: V3, t0: V3, r0: V3, p1: V3, t1: V3): V3 {   // Wang et al. 2008
  const v1 = sub(p1, p0), c1 = dot(v1, v1);
  let rL = r0, tL = t0;
  if (c1 > 1e-12) { rL = sub(r0, scale(v1, 2 * dot(v1, r0) / c1)); tL = sub(t0, scale(v1, 2 * dot(v1, t0) / c1)); }
  const v2 = sub(t1, tL), c2 = dot(v2, v2);
  const r1 = c2 > 1e-12 ? sub(rL, scale(v2, 2 * dot(v2, rL) / c2)) : rL;
  return normalize(sub(r1, scale(t1, dot(r1, t1))));                   // re-orthogonalise
}
const signedAngle = (a: V3, b: V3, ax: V3) => Math.atan2(dot(cross(a, b), ax), dot(a, b));
function buildFrames(S: Sample[], closed: boolean) {                   // S[i]: {s,p,t,mode,bank}
  let rp: V3 | null = null; const up = S.map(q => (rp = upFrame(q.t, rp)));
  S.forEach((q, i) => { if (q.mode === 'worldUp') q.r = up[i]; });
  for (const run of rmfRuns(S, closed)) {                               // maximal cyclic runs
    const all = run.length === S.length;
    const a = all ? run.first : prev(run.first), x = all ? run.first : next(run.last);
    S[a].r = up[a];
    for (const [i, j] of pairs(a, run.last)) S[j].r = doubleReflect(S[i].p, S[i].t, S[i].r, S[j].p, S[j].t);
    const rEnd = doubleReflect(S[run.last].p, S[run.last].t, S[run.last].r, S[x].p, S[x].t);
    const phi = signedAngle(rEnd, all ? S[a].r : up[x], S[x].t);
    const span = arc(a, x);
    for (const k of indices(a, run.last)) {
      const f = arc(a, k) / span, w = all ? f : f * f * (3 - 2 * f);
      S[k].r = rodrigues(S[k].r, S[k].t, phi * w);
    }
  }
  for (const q of S) { const u0 = cross(q.r, q.t), b = rad(q.bank), c = Math.cos(b), s = Math.sin(b);
    q.r = add(scale(q.r, c), scale(u0, s)); q.u = sub(scale(u0, c), scale(q.r0 = q.r, 0) && scale(u0, 0), scale(q.r, 0)); // see note
  }
}
```
Note on the final loop: compute u′ from the pre-bank r, that is u′ = u0·cos b − r_old·sin b. Keep r_old in a temporary before overwriting r; the one-liner above is shorthand for that.

### 3.3 Loop primitive (Orbital Express)
`LOOP R12 shift=12 ease=15` gives a lateral-shift helix around a horizontal axis. The shift is width + 2 m, so the entry and exit roads do not collide. Settings: `frame=rmf`, `gravity=track`, and 15 m Euler-spiral easements at each end.

Circular-part control points relative to the entry (heading +x, right = +z):
`[0,0,0],[6,1.6,1],[10.4,6,2],[12,12,3],[10.4,18,4],[6,22.4,5],[0,24,6],[-6,22.4,7],[-10.4,18,8],[-12,12,9],[-10.4,6,10],[-6,1.6,11],[0,0,12]`

Length is 76.3 m. With track gravity there is no minimum entry speed. With world gravity at g = 28 m/s², entry would need about √(5gR) ≈ 41 m/s.

---

## 4. TrackDef v1 schema
```ts
export interface TrackDefV1 {
  schema: 'clauderider.track/1'; id: string; name: string; theme: ThemeId;
  difficulty: 1|2|3|4|5; laps: number; topology: 'circuit'|'pointToPoint';
  startLineS: number;                       // DSL s of the finish line; bake rotates s so line = 0
  paths: PathDef[];                         // paths[0] = main
  areas: AreaDef[]; junctions: JunctionDef[]; rails: RailDef[]; warps: WarpDef[]; jumps: JumpDef[];
  zones: ZoneDef[]; hazards: HazardDef[]; items: ItemRowDef[]; boostPads: BoostPadDef[];
  grid: { rows: number; cols: number; pitch: number; stagger: number; dAbs: number };
  keyGates: number[];                       // main-line s; ordinary gates auto every 30 m
  props: PropDef[]; env: EnvDef; profiles: ProfileDef[];
  targets: { refLapSec: { speed: number; item: number }; straightRatio: [number, number] };
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
export type WallSpec = { type: 'none'|'curb'|'barrier'|'fence'|'rock'|'parapet'|'building'|'invisible';
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
  period: number; activeFrom: number; activeTo: number; telegraph: number; offset: number;
  effect: 'spin'|'launch'|'squash'|'block'; lanes?: { d: number; speed: number; count: number; spacing: number }[] }
export interface ItemRowDef { s: number; n: number; span?: number; path?: string }
export interface BoostPadDef { s: number; d: number; len: number; width: number; path?: string }
```

**Surface table** (the ice and sand values are from the brief; the rest are proposed):

| surface | grip | top-speed × |
|---|---|---|
| asphalt / stone | 1.00 | 1.00 |
| cobble | 0.98 | 1.00 |
| dirt | 0.92 | 0.97 |
| sand | 0.85 | 0.92 |
| gravel | 0.85 | 0.94 |
| ice | 0.75 | 1.00 (drag −20%) |
| snow | 0.90 | 0.95 |
| grass (off-road) | 0.80 | 0.60 |
| wet | 0.92 | 1.00 |
| conveyor | – | ×1.15 / ×0.85 |
| lava | kill | – |

**Halfpipe `hp60` example:** floorHalf 5, filletR 6, wallDeg 60, wallH 4.5. The fillet ends at d = ±10.2 m, h = 3.0 m. The footprint is 22.1 m. Anything above 62° is classified as wall.

**Plaza bake:**
- Take the 2D union of the area shape with the adjacent ribbon footprints at the same y ± 0.3 m, using a polygon-clipping library. Triangulate with `THREE.ShapeUtils.triangulateShape`.
- Trim ribbon triangles inside the area so no coplanar duplicates remain.
- Build walls on area edges not joined to a ribbon.

**Junction bake:**
- Across `blendLen`, widen the main profile on the branch side to cover the branch ribbon. The branch ribbon starts where the centreline separation is at least the sum of the two half-widths plus 1 m.
- Place a gore wedge (soft wall) at the divergence point.

---

## 5. Validation rules (CI; all proposed)

**Difficulty dials:**

| D | min R | min W main | typical W | straight ratio* | sustained grade | bank |
|---|---|---|---|---|---|---|
| 1 | 30 m | 14 m | 18–24 m | 40–55% | ≤8% | ≤15° |
| 2 | 22 m | 12 m | 16–20 m | 32–45% | ≤8% | ≤18° |
| 3 | 16 m | 10 m | 14–18 m | 25–38% | ≤10% | ≤20° |
| 4 | 12 m | 8 m | 12–16 m | 18–30% | ≤12% | ≤22° |
| 5 | 9 m | 6 m | 10–13 m | 12–24% | ≤12% (≤15% point-to-point downhill) | ≤25° |

*The straight ratio counts length with R ≥ 150 m. Jump flight and landing, and rail spans, are excluded.

**Rules:**
- **V1 Closure:** position error < 0.05 m and heading error < 0.1°. Turning number is ±1, or ±2 when every crossing is z-separated. Elevation sums to zero on circuits.
- **V2 Self-overlap:** for samples more than 40 m (or 2w) apart along the graph, if the footprints come within the two half-widths + 2 × wall thickness + 1 m, require Δy ≥ 8 m at the same (x,z). RMF loops are exempt within their own span.
- **V3 Radius:** main line R ≥ Rmin(D); branches may go 20% lower. Inner-edge radius R − w/2 ≥ 3 m, which keeps the plane-crossing search single-valued.
- **V4 Width:** w ≥ Wmin(D). Branches ≥ 6 m. Attribute changes blend over at least 15 m.
- **V5 Grades:** sustained grade per the table. Ramps ≤ 30% over ≤ 12 m. Crest vertical radius Rv ≥ v²/(0.8g), about 71 m at 40 m/s with g = 28. Sags Rv ≥ 30 m.
- **V6 Bank rate:** ≤ 1.5°/m.
- **V7 Frame mode:** worldUp only where |T·Ŷ| ≤ 0.9.
- **V8 Gates:**
  - ordinary gates every 30 m; 20–25 m where the inside of a corner has a cuttable gap under 40 m;
  - at least 6 key gates, none inside a branch, rail or warp span;
  - gate width = w + 2 m.
- **V9 Item rows:**
  - at least 60 m after the finish line;
  - at least 20 m from any apex with R < 30;
  - local R ≥ 60 within ±10 m of the row (areas at least 24 m wide are exempt);
  - not in a junction blend zone, ramp, landing, rail, or within ±15 m of a hazard;
  - at least 150 m between rows; about L/250 ± 1 rows per lap; spread across the width minus 1.5 m on each side.
- **V10 Boost pads:** not within 15 m of an apex with R < 30; not in landing zones; no wall ahead within 2 s × v.
- **V11 Jumps:**
  - for every speed v in [vMin, vMax], the landing point must fall in [gapEnd + 2 m, landEnd − 5 m];
  - landing zone ≥ 40 m, with R ≥ 80 m and grade within ±10%.
- **V12 Hazards:**
  - period ≥ 2 s, active ≤ 50% of the period, telegraph ≥ 0.6 s;
  - traffic must always leave at least one safe lane.
- **V13 Timing:** laps == clamp(round(115/refLapSec),1,5). Race ref time in speed mode 100–130 s. The CI ghost's lap must be within ±8% of the table value.
- **V14 Straight ratio** within its band.
- **V15 Respawn:** every sample has ground or lies in a declared gap. Respawn slots are at least 8 m from walls and hazards.
- **V16 Areas:** the area triangulates; its guide path lies inside it.
- **V17 Rails:** exit tangent error ≤ 5°; lock time 0.8–3 s; entry is reachable from the road.
- **V18 Branches:** rejoin tangent error ≤ 5°; time saved ≤ 8% of the lap; at least one key gate between consecutive branches.
- **Compiler rules:**
  - the spacing ratio between adjacent control points must be ≤ 3, so 8 m guard points are added at straight/arc boundaries;
  - segments shorter than 4 m are merged away;
  - compiled spline vs turtle ideal must deviate by ≤ 0.5 m.

---

## 6. Lap counts and lengths

**Model** (proposed): refLapSec = L / v_ref(D). Speed-mode expert average v_ref = 37 / 36 / 35 / 34 / 33 m/s for D1–D5; Aurora uses 34 because it is downhill. Item mode = ×1.12.

**What changed:**
- **CI check:** the 28–45 s per-lap check is removed. It rejected every 2-lap track.
- **Lap split:** 12×3, 6×2, 2×1. Kraken Lighthouse and Rainline Blvd become 3-lap. Aurora becomes a 1-lap point-to-point downhill.
- **Oval:** off-roster "Proving Ring", 5×700 m, 94.6 s. The formula gives 6, clamped to 5.

| # | Track | Theme | D | Laps | Lap m | Race km | v_ref | Speed lap s | Speed race s | Item lap s | Item race s | Signature features |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
|1|Meadow Loop|Village|1|3|1400|4.20|37|37.8|114|42.4|127|wide loop, tutorial jump, grass shoulders|
|2|Belltower Piazza|Village|2|3|1350|4.05|36|37.5|112|42.0|126|270° plaza (area), alley shortcut, canal bridge|
|3|Bazaar|Desert|1|3|1450|4.35|37|39.2|118|43.9|132|market props, sand zones 0.85, awning branch|
|4|Sandglass Canyon|Desert|4|2|1950|3.90|34|57.4|115|64.2|128|warp gates, 40 m-landing jump, sand|
|5|Snowglobe Halfpipe|Ice|2|3|1300|3.90|36|36.1|108|40.4|121|hp60 halfpipe, free line choice, ice 0.75|
|6|Aurora Summit Descent|Ice|5|1 (point-to-point)|3700|3.70|34|108.8|109|121.9|122|downhill, 2×360° spiral, open ledges and kill planes|
|7|Fernwood|Forest|1|3|1350|4.05|37|36.5|109|40.9|123|log bridge, gentle branch|
|8|Cascade Slalom|Forest|4|2|1900|3.80|34|55.9|112|62.6|125|slalom, jumps, self-crossing bridge|
|9|Geode Rail Quarry|Mine|3|3|1400|4.20|35|40.0|120|44.8|134|2 rails, conveyors, mine-cart traffic|
|10|Magma Switchback|Mine|5|2|1850|3.70|33|56.1|112|62.8|126|540° helix, rail, ledge branch, geysers, 3 crossings|
|11|Pumpkin Lane|Spooky|2|3|1300|3.90|36|36.1|108|40.4|121|graveyard shortcut, swinging gates|
|12|Manor Catacombs|Spooky|4|2|1850|3.70|34|54.4|109|60.9|122|tight tunnels, presses, stacked crossing|
|13|Coral Docks|Pirate|2|3|1350|4.05|36|37.5|112|42.0|126|plank surfaces, crane hazards|
|14|Kraken Lighthouse|Pirate|3|3|1400|4.20|35|40.0|120|44.8|134|360° lighthouse helix, tentacle timers|
|15|Rainline Blvd|Neon|3|3|1350|4.05|35|38.6|116|43.2|130|traffic lanes, wet 0.92|
|16|Skyway Interchange|Neon|4|2|2000|4.00|34|58.8|118|65.9|132|3-level cloverleaf (0/9/18 m, 270° R35 ramps at 5.5%)|
|17|Spark Grand Circuit|Circuit|1|3|1500|4.50|37|40.5|122|45.4|136|pit-lane branch, boost pads|
|18|Sunset Arena Rally|Circuit|3|2|1950|3.90|35|55.7|111|62.4|125|dirt/gravel, jumps|
|19|Token Foundry|Sci-fi|3|3|1350|4.05|35|38.6|116|43.2|130|presses, ±15% conveyors, gutter profile|
|20|Orbital Express Ring|Sci-fi|5|1|3800|3.80|33|115.2|115|129.0|129|360° loop, zero-g tube, trains, warps|

Difficulty spread: D1 ×4, D2 ×4, D3 ×5, D4 ×4, D5 ×3. The formula output matches the lap column on every row.

---

## 7. Example A: Belltower Piazza (D2 item track, 3 × 1350 m)

**Coordinates.** Three.js world: x east, y up, north = −z. Heading ψ is measured counter-clockwise from +x, so dir = (cos ψ, 0, −sin ψ). The finish line is at s = 0.

**DSL source** (the solved values replace `?a/?b/?c`):
```
TRACK belltower_piazza name="Belltower Piazza" theme=village diff=2 laps=3 topo=circuit
DEFAULTS w=18 prof=flat surf=cobble wall=barrier:1.0 blend=15
START pos=(0,0,0) hdg=0          GRID rows=4 cols=2 pitch=6 stagger=3 d=4
S 80 w=20                         @home            # s 0–80
C R45 90 L bank=6                 @t1              # 80–150.7
S 30 dy=+2                                          # 150.7–180.7
C R40 45 R w=16 bank=-3 ; C R40 45 L bank=3         # canal kink 180.7–243.5
S 40 dy=+2 w=14 wall=parapet:1.0  @bridge          # 243.5–283.5
C R22 90 R w=18 bank=-4           @veerIn          # 283.5–318.1
C R27 270 L w=30 area=piazza      @plazaIn         # 318.1–445.3 (guide arc)
C R22 90 R w=18 bank=-4           @plazaOut        # 445.3–479.9
S 40 dy=-2 w=16 ; C R55 60 R bank=-3 ; C R55 60 L bank=3            # 479.9–635.1
S ?a=128.94 dy=-2 shoulders=1.5:grass @marketSt    # 635.1–764.0
C R70 35 L ; C R70 35 R ; S 20                      # 764.0–869.5
C R26 150 L w=16 bank=8           @hairpin         # 869.5–937.6
C R36 60 R bank=-4 ; S ?b=14.54 w=14                # 937.6–989.8
C R28 50 R w=14 bank=-3 ; C R28 50 L bank=3 @chicane # 989.8–1038.7
S 25                                                # alley split at 1040.0
C R42 90 L w=18 bank=5 ; S 40                       # merge at 1153.4
C R90 30 R w=20 ; C R90 30 L ; S ?c=86.08           # 1169.7–1350
CLOSE solve=[?a,?b,?c] length=1350
AREA piazza annulus c=(170.4,4,-220.6) rIn=12 rOut=42 from=270 sweep=270 surf=stone
     wallIn=curb:0.4 wallOut=planter:0.8 tower=cyl(r=10,h=38)     # SW wedge = building
BRANCH alley from=1040.0 to=1153.4 kind=shortcut aiMin=0.45 w=8 wall=building:4 {
  C R25 45 L ; S 57.56 surf=gravel@20+30 bump=48:0.5x6 ; C R25 45 L }
ITEMS at=165,335(n=6,span=26),505,690,860,1185 n=5
PAD at=400 d=+10 len=6 w=4   # outer plaza line balances the shorter inner line
PAD at=1290 d=0 len=6 w=4
KEYS 0,243.5,445.3,764,975.3,1263.9
```

**Main control points** (116 points, closed, centripetal):
- Each point inherits w, bank and surface from the segment that emitted it.
- Compiled spline vs turtle ideal: max deviation 0.42 m; spline length 1349.8 m.

`[0,0,0],[8,0,0],[40,0,0],[72,0,0],[80,0,0],[91.6,0,-1.5],[102.5,0,-6],[111.8,0,-13.2],[119,0,-22.5],[123.5,0,-33.4],[125,0,-45],[125,0.5,-53],[125,1.5,-67],[125,2,-75],[126.4,2,-85.4],[130.4,2,-95],[136.7,2,-103.3],[143.1,2,-111.6],[147.1,2,-121.2],[148.4,2,-131.6],[148.4,2.4,-139.6],[148.4,3.6,-163.6],[148.4,4,-171.6],[149.5,4,-178.4],[152.6,4,-184.5],[157.5,4,-189.4],[163.6,4,-192.5],[170.4,4,-193.6],[179.3,4,-195.1],[187.3,4,-199.5],[193.3,4,-206.2],[196.8,4,-214.6],[197.3,4,-223.6],[194.8,4,-232.3],[189.5,4,-239.7],[182.1,4,-244.9],[173.5,4,-247.4],[164.4,4,-246.9],[156.1,4,-243.4],[149.3,4,-237.4],[144.9,4,-229.5],[143.4,4,-220.6],[142.4,4,-213.8],[139.2,4,-207.6],[134.4,4,-202.8],[128.2,4,-199.6],[121.4,4,-198.6],[113.4,3.6,-198.6],[89.4,2.4,-198.6],[81.4,2,-198.6],[70,2,-199.8],[59.1,2,-203.3],[49.1,2,-209.1],[40.6,2,-216.8],[33.8,2,-226.1],[27,2,-235.4],[18.5,2,-243.1],[8.5,2,-248.8],[-2.4,2,-252.4],[-13.8,2,-253.6],[-21.8,1.9,-253.6],[-59.5,1.3,-253.6],[-97.1,0.7,-253.6],[-134.8,0.1,-253.6],[-142.8,0,-253.6],[-153.4,0,-252.8],[-163.8,0,-250.3],[-173.7,0,-246.3],[-182.9,0,-240.9],[-192.1,0,-235.5],[-202,0,-231.5],[-212.4,0,-229.1],[-223.1,0,-228.2],[-243.1,0,-228.2],[-251.4,0,-226.9],[-258.9,0,-222.9],[-264.7,0,-216.7],[-268.2,0,-209],[-269,0,-200.5],[-267.1,0,-192.3],[-262.6,0,-185.1],[-256.1,0,-179.7],[-248.6,0,-174],[-242.9,0,-166.6],[-239.3,0,-157.9],[-238.1,0,-148.6],[-238.1,0,-134],[-239.2,0,-126],[-242.7,0,-118.6],[-248.1,0,-112.6],[-253.5,0,-106.5],[-256.9,0,-99.1],[-258.1,0,-91.1],[-258.1,0,-83.1],[-258.1,0,-74.1],[-258.1,0,-66.1],[-256.6,0,-55.2],[-252.4,0,-45.1],[-245.8,0,-36.4],[-237.1,0,-29.7],[-226.9,0,-25.5],[-216.1,0,-24.1],[-208.1,0,-24.1],[-184.1,0,-24.1],[-176.1,0,-24.1],[-164.3,0,-23.3],[-152.8,0,-21.1],[-141.6,0,-17.3],[-131.1,0,-12.1],[-120.5,0,-6.9],[-109.4,0,-3.1],[-97.8,0,-0.8],[-86.1,0,0],[-78.1,0,0],[-43,0,0],[-8,0,0]`

**Alley branch** (96.8 m; map fromS 1040.0 → toS 1153.4, so sMain = 1040 + 1.1715·u):
`[-258.1,0,-89.8],[-257.2,0,-83.3],[-254.8,0,-77.3],[-250.8,0,-72.1],[-230.4,0,-51.8],[-210.1,0,-31.4],[-204.9,0,-27.4],[-198.9,0,-25],[-192.4,0,-24.1]`
- Saves 16.6 m, about 0.45 s, but the alley is 8 m wide and has gravel (0.85).
- Its centreline stays within 21.7 m of the main corner, which leaves about a 9.7 m building between them.
- Split and merge blend zones are about 25 m and 22 m.

**Derived checks:**

| check | result | limit |
|---|---|---|
| straight ratio | 37.4% | D2 band 32–45% |
| tightest R | 22 m (the veers) | ≥ 22 |
| hairpin | R26 | – |
| min width | 14 m (bridge) | ≥ 12 |
| max grade | 6.7% | – |
| elevation | 0–4 m; plaza at y = 4 | – |
| closure error | < 0.01 m | < 0.05 |

The closest same-level approach is 25.5 m, between veer-in and veer-out, and that zone is covered by the plaza union. Six item rows are 170–330 m apart. The grid sits at s = −8 to −29 with d = ±4.

---

## 8. Example B: Magma Switchback (D5 speed track, 2 × 1850 m, helix + branch + rail)

All s values below are DSL-s. `LINE start at=40`, so baked s = (s − 40) mod 1850. The grid rows are at 32, 26, 20 and 14, staggered −3 m, with d = ±3.

```
TRACK magma_switchback name="Magma Switchback" theme=mine diff=5 laps=2 topo=circuit
DEFAULTS w=11 prof=flat surf=basalt wall=rock:1.2 blend=12
START pos=(0,30,0) hdg=0   LINE start at=40
S 70 w=14 ; C R30 60 R w=12 bank=-6 ; S 20 ; C R22 120 L w=11 bank=8     # plateau deck, s 0–167.5
S 30 dy=-1.5                               @helixIn   # 167.5–197.5
HELIX R28 540 L dy=-14 bank=12 wallOut=rock:1.5 wallIn=pillar          # 197.5–461.4, 9.33 m/turn
S 30 dy=-2 w=12 ; C R45 60 R bank=-5 ; S ?a=8.2                        # 461.4–546.7 (passes under the plateau)
WIGGLE R26 55/110/55 L ; S 20 w=10                                    # 546.7–666.5 (under north run)
@ledgeSplit WIGGLE R30 50/100/50 R ; S 20 ; WIGGLE R30 50/100/50 R @ledgeMerge  # 666.5–896.0
S 15 ; C R35 120 L bank=6 wallIn=curb:0.5  @railCorner                  # 896–984.3
J ramp=30@8 gap=14 drop=4 land=40 wland=14 vmin=25 vmax=46              # 984.3–1068.3
C R40 60 L w=12 bank=5 ; S ?b=81.64 dy=+1                              # 1068.3–1191.8
CHICANE R18 70/140/70 L w=10 bank=6 dy=+1 ; S 20                       # 1191.8–1299.8
C R12 180 R w=9 bank=-10 ; WIGGLE R60 25/50/25 R dy=+6                 # 1299.8–1442.2
C R12 180 L w=9 bank=10  ; WIGGLE R60 25/50/25 L dy=+6                 # 1442.2–1584.6
C R30 90 L bank=6 ; S ?c=1.51(merged) ; WIGGLE R50 40/80/40 L dy=+6 ; S 30 dy=+1.5 w=12
C R30 90 R w=13 bank=-6                                                 # → (0,30,0)
CLOSE solve=[?a,?b,?c] length=1850
BRANCH ledge from=666.5 to=896.0 kind=risk aiMin=0.75 w=7 wall=none kill=lava { S 203.8 surf=obsidian }
RAIL oreRail host=main from=902 to=990 d=[902:-4.5,911:-8,918:-11,977:-11,984:-8,990:-4.5] h=+1.0
     capture=(dMax 2.0, hdg 25, vMin 15) speed=(min 38, accel 3, max 42) gauge=0.30/s
HAZ geyser at=600 d=+2 r=3 period=3.6 on=0-1.0 tele=0.8 offset=0.0
HAZ geyser at=720 d=-2 r=3 period=3.6 on=0-1.0 tele=0.8 offset=1.2
HAZ geyser at=845 d=+2 r=3 period=3.6 on=0-1.0 tele=0.8 offset=2.4
ZONE conveyor from=1120 to=1185 d=[0,5.5] mul=1.15 ; ZONE conveyor from=1120 to=1185 d=[-5.5,0] mul=0.85
KILL lava belowY=6 aabb=(-330,-60 .. 180,240)
ITEMS at=480,656,1140,1295,1788 n=4     PAD at=468,1072,1790
KEYS 40,197.5,461.4,646.5,899,1110,1480,1631
```

**Main control points** (192 points after dropping the merged 1.5 m point `[-30,22.5,188.6]`; spline 1850.7 m; max deviation 0.34 m):
`[0,30,0],[8,30,0],[35,30,0],[62,30,0],[70,30,0],[80.3,30,1.8],[89.3,30,7],[96,30,15],[106,30,32.3],[110.9,30,38.2],[117.5,30,42],[125,30,43.3],[132.6,30,42],[139.2,30,38.2],[144.1,30,32.3],[148.1,29.6,25.4],[155.1,28.9,13.3],[159.1,28.5,6.3],[162.4,28,-2.8],[162.4,27.5,-12.5],[159.1,26.9,-21.7],[152.8,26.4,-29.1],[144.4,25.9,-34],[134.8,25.4,-35.7],[125.3,24.9,-34],[116.8,24.4,-29.1],[110.6,23.8,-21.7],[107.3,23.3,-12.5],[107.3,22.8,-2.8],[110.6,22.3,6.3],[116.8,21.8,13.8],[125.3,21.2,18.7],[134.8,20.7,20.3],[144.4,20.2,18.7],[152.8,19.7,13.8],[159.1,19.2,6.3],[162.4,18.6,-2.8],[162.4,18.1,-12.5],[159.1,17.6,-21.7],[152.8,17.1,-29.1],[144.4,16.6,-34],[134.8,16.1,-35.7],[125.3,15.5,-34],[116.8,15,-29.1],[110.6,14.5,-21.7],[106.6,14,-14.7],[99.6,13,-2.6],[95.6,12.5,4.3],[88.4,12.5,13.6],[79.1,12.5,20.8],[68.3,12.5,25.3],[56.6,12.5,26.8],[48.4,12.5,26.8],[40.2,12.5,28.1],[32.9,12.5,32],[27.1,12.5,37.9],[21.3,12.5,43.8],[14,12.5,47.7],[5.8,12.5,49],[-2.4,12.5,47.7],[-9.7,12.5,43.8],[-15.5,12.5,37.9],[-21.2,12.5,32],[-28.6,12.5,28.1],[-36.8,12.5,26.8],[-56.8,12.5,26.8],[-65.4,12.5,25.6],[-73.3,12.5,21.9],[-79.8,12.5,16.1],[-87.7,12.5,9.4],[-97.5,12.5,5.8],[-107.9,12.5,5.8],[-117.7,12.5,9.4],[-125.7,12.5,16.1],[-132.2,12.5,21.9],[-140.1,12.5,25.6],[-148.7,12.5,26.8],[-168.7,12.5,26.8],[-177.3,12.5,25.6],[-185.2,12.5,21.9],[-191.7,12.5,16.1],[-199.7,12.5,9.4],[-209.5,12.5,5.8],[-219.9,12.5,5.8],[-229.7,12.5,9.4],[-237.6,12.5,16.1],[-244.1,12.5,21.9],[-252,12.5,25.6],[-260.6,12.5,26.8],[-275.6,12.5,26.8],[-285.9,12.5,28.4],[-295.3,12.5,32.9],[-303,12.5,40],[-308.2,12.5,49],[-310.5,12.5,59.2],[-309.7,12.5,69.6],[-305.9,12.5,79.3],[-301.9,12.5,86.2],[-294.9,12.5,98.4],[-290.9,12.5,105.3],[-283.9,8.5,117.4],[-279.9,8.5,124.4],[-267.9,8.5,145.1],[-263.9,8.5,152.1],[-257.6,8.5,160.4],[-249.3,8.5,166.7],[-239.6,8.5,170.7],[-229.3,8.5,172.1],[-221.3,8.6,172.1],[-188.5,9,172.1],[-155.7,9.4,172.1],[-147.7,9.5,172.1],[-142.2,9.6,171.2],[-137.3,9.6,168.8],[-133.4,9.7,165],[-130.7,9.7,160.2],[-127.6,9.8,154.8],[-122.8,9.9,150.8],[-117,10,148.7],[-110.7,10,148.7],[-104.8,10.1,150.8],[-100,10.2,154.8],[-96.9,10.2,160.2],[-94.3,10.3,165],[-90.3,10.4,168.8],[-85.4,10.4,171.2],[-80,10.5,172.1],[-60,10.5,172.1],[-55.9,10.5,172.8],[-52.3,10.5,174.9],[-49.6,10.5,178.1],[-48.2,10.5,182],[-48.2,10.5,186.2],[-49.6,10.5,190.1],[-52.3,10.5,193.3],[-55.9,10.5,195.3],[-60,10.5,196.1],[-68.7,11,195.4],[-77.2,11.5,193.5],[-85.4,12,190.4],[-95.2,12.6,186.9],[-105.5,13.2,185.1],[-115.9,13.8,185.1],[-126.2,14.4,186.9],[-136.1,15,190.4],[-144.2,15.5,193.5],[-152.7,16,195.4],[-161.4,16.5,196.1],[-165.5,16.5,196.8],[-169.1,16.5,198.9],[-171.8,16.5,202.1],[-173.2,16.5,206],[-173.2,16.5,210.2],[-171.8,16.5,214.1],[-169.1,16.5,217.3],[-165.5,16.5,219.3],[-161.4,16.5,220.1],[-152.7,17,219.4],[-144.2,17.5,217.5],[-136.1,18,214.4],[-126.2,18.6,210.9],[-115.9,19.2,209.1],[-105.5,19.8,209.1],[-95.2,20.4,210.9],[-85.4,21,214.4],[-77.2,21.5,217.5],[-68.7,22,219.4],[-60,22.5,220.1],[-50.7,22.5,218.6],[-42.4,22.5,214.3],[-35.7,22.5,207.7],[-31.5,22.5,199.3],[-30,22.5,190.1],[-31.3,23,177],[-35.3,23.5,166.1],[-41.7,24,156.4],[-48.1,24.5,146.7],[-52,25,135.8],[-53.4,25.5,124.3],[-52,26,112.7],[-48.1,26.5,101.8],[-41.7,27,92.1],[-35.3,27.5,82.4],[-31.3,28,71.5],[-30,28.5,60],[-30,28.9,52],[-30,29.6,38],[-30,30,30],[-28.5,30,20.7],[-24.3,30,12.4],[-17.6,30,5.7],[-9.3,30,1.5]`

**Ledge branch** (203.8 m, 7 m wide, no walls, lava kill; sMain = 666.5 + 1.1261·u):
`[-56.8,12.5,26.8],[-90.8,12.5,26.8],[-124.7,12.5,26.8],[-158.7,12.5,26.8],[-192.7,12.5,26.8],[-226.6,12.5,26.8],[-260.6,12.5,26.8]`
- Saves 25.7 m, about 0.78 s.
- The main line bows up to 21.4 m away from it through the geyser field.

**Rail:**
- The host span 902–990 is 88 m; the rail offset curve is about 67 m.
- Along the R35 corner the rail runs at d = −11, i.e. radius 24 m over the lava pool.
- Lock time is about 1.6–1.75 s at 38–42 m/s. Gauge fills at +30%/s. The rail ends tangent to the jump ramp.

**Jump check** (g = 28 m/s², lip 8°): at 25 m/s the kart lands 16.7 m past the lip; at 46 m/s, 36.9 m. The gap is 14 m and the landing zone runs from 14 to 54 m. V11 passes.

**Derived checks:**

| check | result | limit |
|---|---|---|
| straight ratio (jump excluded) | 19.6% | D5 band 12–24% |
| tightest R | 12 m (hairpins) | ≥ 9 |
| min width | 9 m | – |
| helix | 263.9 m long, 5.3% grade, 12° bank, worldUp frames | – |
| elevation | 8.5–30 m | – |
| turning number | 2 (the helix) | – |
| V2 violations | 0 | 0 |

Stacked crossings:
- helix over helix: 9.33 m per turn (≥ 8.6 m even at offset angles);
- approach over the helix's last quarter: ≥ 8.6 m;
- plateau deck over the helix-exit tunnel: about 17.0–17.5 m;
- north run over the causeway: about 16.8–17.5 m.

The jump flies under switchback leg 3 with about 7 m of headroom.

---

## 9. Authoring DSL and a workflow that scales to 20 tracks

**Grammar** (one command per line or `;`-separated; attributes stay set until changed):
- **Segments:**
  - `S len [dy= w= bank= surf= prof= wall=]`
  - `C R<r> <deg> L|R [dy= …]` (a helix is C with dy)
  - `E R<r0>-><r1> <deg> L|R` (clothoid easement)
  - `LOOP R<r> shift= ease=`
  - `J ramp=<len>@<deg> gap= drop= land= vmin= vmax=`
- **Macros:** `WIGGLE R a/b/a L|R`, `CHICANE`, `HAIRPIN`, `HELIX`, `CLOVERLEAF levels= R=`, `PLAZA`.
- **Labels:** `@label`.
- **Sub-paths:** `BRANCH id from= to= {…}`, `RAIL`, `WARP id at= to= transit=`.
- **Areas and content:** `AREA`, `ITEMS`, `PAD`, `HAZ`, `ZONE`, `KILL`, `KEYS`, `GRID`, `LINE`.
- **Closure:** `CLOSE solve=[?a,?b,?c] length=L`.

**Compiler steps:**
1. Run the turtle. It emits points every ≤ 20°, ≤ 12 m chord on arcs and ≤ 40 m on straights, with 8 m guard points.
2. Solve closure. This is the 3×3 linear system in (x, z, length) over the free straights' fixed headings, exactly as used for both examples. The solved lengths are written back into the source.
3. Check closure and elevation.
4. Build the centripetal spline and resample every 1 m.
5. Build frames (§3).
6. Bake profiles, areas and junctions.
7. Emit the ground and wall meshes and the BVHs.
8. Build the graph, the map values, gates and grid.
9. Run V1–V18.
10. Write the `.ctrk`, a top-down SVG with s ticks, elevation/curvature/width plots and a JSON report.
11. Run a headless ghost lap with the expert AI in speed and item modes; this sets refLapSec for V13.
12. Place props with a seeded procedural pass along s, respecting exclusion zones.
13. Lock a golden hash.

**Per-track workflow** (proposed estimates):
1. Brief (the table row): about 0.5 h.
2. DSL block-out with macros and CLOSE: about 0.5–1 day.
3. Validate and preview loop.
4. Ghost tuning of lengths and widths to hit the ±8% lap target.
5. Theme dressing from shared kits: about 1 day.
6. Playtest.

Twenty tracks at roughly 2 days each is about 8 person-weeks.

---

## 10. Open issues and risks
- **Kart and physics numbers are proposed** and must come from the driving-mechanics owner: sphere r = 0.85, hover 0.35, g = 28 m/s², and the v_ref table.
- **Road width.** KR kart-relative widths suggest wider roads than 16 m. Playtest the upper ends of the width bands.
- **Math.sqrt determinism.** It is assumed to be correctly rounded in all engines; prove it with a cross-browser CI test.
- **Polygon clipping library** for plazas and junctions (e.g. polygon-clipping or Clipper2): not yet evaluated.
- **three-mesh-bvh names.** The API doc lists `targetLeafSize`, while older docs say `maxLeafSize`. Pin the version and check `deserialize` option names.


## Key parameters

- **collision_architecture**: Hybrid: baked ground mesh (three-mesh-bvh raycast along -n) + wall mesh (sphere shapecast) + analytic dynamic hazards; spline graph for progress/lap/AI/respawn/up-hint/gravity/rails/warps/zones only [proposed] — Synthesis of STK (Bullet mesh + quad graph) and MKW (KCL + KMP) patterns
- **three_mesh_bvh_version**: 0.9.15 (peer three >= 0.159) [sourced] — https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/package.json
- **bvh_defaults**: strategy=CENTER, maxDepth=40, targetLeafSize=10, indirect=false (reorders index in place); use SAH, targetLeafSize 8 for track [sourced] — https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/API.md
- **surface_id_storage**: per-vertex Uint8 attribute 'surf', flat per triangle, read surf[face.a] (robust to BVH index reorder) [proposed]
- **ground_ray**: origin +1.0 m along up hint, far = 2.0 m (1.0+hover 0.35+snap 0.65), FrontSide; 4 fallback rays at 0.3 m; coyote 0.1 s; ground if dot(n,up)>cos65° [proposed]
- **kart_wall_sphere**: r=0.85 m centred 0.6 m above ground; 60 Hz x 2 substeps (<=0.4 m/substep at 48 m/s) [proposed]
- **min_vertical_separation_stacked**: 8 m deck-to-deck at same (x,z) [proposed]
- **stk_height_window**: MIN_HEIGHT_TESTING=-1 m, MAX_HEIGHT_TESTING=5 m [sourced] — https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/tracks/graph.cpp
- **progress_height_window**: -2 m <= h <= +6 m, |u| <= halfWidth+3 m [proposed]
- **sample_spacing**: 1.0 m arc-length (N = round(L/1.0)); own arc-length table, 64 substeps per CR segment [proposed]
- **segHint_window**: ±20 samples (±20 m) following succ/pred across junctions [proposed]
- **fallback_grid**: 2D uniform grid 16 m cells -> (path, sample-run); cost = 0.1u^2 + h^2 + 400 if graph jump > 60 m [proposed]
- **mkw_checkpoint_search_depth**: MAX_DEPTH = 6 (graph-local search before regional) [sourced] — https://raw.githubusercontent.com/vabold/Kinoko/33ea3cfcf670e12e1450daf50a95a709176849fe/source/game/system/CourseMap.cc
- **mkw_ckpt_type**: 0 = lap counter, 1..254 = key checkpoint, 0xFF = ordinary; 2D left/right points; up to 6 prev/next groups [sourced] — https://raw.githubusercontent.com/patchzyy/MkwTrackEditor/a467a0149e577622d372d601ff2a4137dbcd0bae/src/lib/kmpFile.ts
- **branch_progress_mapping**: sMain(u) = fromS + (toS-fromS)*u/L_path; race distance D = lap*L_main + sMain [proposed]
- **anti_cut**: accept new s only if graph-reachable within v*dt+10 m (except jump/warp/rail); else freeze D; respawn after 3 s off-graph [proposed]
- **wrong_way**: v·T < -3 m/s for 1.5 s [proposed]
- **key_gates**: >=6, main-line only, outside branch/rail/warp spans; ordinary gates every 30 m (20-25 m anti-cut) [proposed] — KR gate spacing 30-45u general / 20-25u anti-cut, median ~50 gates/lap (OrangeCarrrrrPhysics doc)
- **frame_modes**: worldUp (R=norm(T×Y), U=R×T) where |T·Y|<=0.9; RMF double reflection (Wang 2008) otherwise; twist distributed by smoothstep of arc fraction; bank applied last (+ raises right edge) [proposed] — three.js Curve.js computeFrenetFrames (min-component seed, not up-aligned)
- **catmullrom_tension**: tension ignored for centripetal; drop from schema; use curveType 'centripetal' [sourced] — https://raw.githubusercontent.com/mrdoob/three.js/dev/src/extras/curves/CatmullRomCurve3.js
- **three_arcLengthDivisions_default**: 200 (too coarse for 1 m resampling of km-scale tracks) [sourced] — https://raw.githubusercontent.com/mrdoob/three.js/dev/src/extras/core/Curve.js
- **lap_formula**: laps = clamp(round(115/refLapSec),1,5); speed race ref 100-130 s; CI ghost within ±8% [proposed]
- **lap_split**: 12x3, 6x2, 2x1 (+ off-roster Proving Ring 5x700 m) [proposed] — KR scrape: speed mostly 2-lap, item mostly 3-lap, D4-5 cluster at 1-2 laps
- **v_ref_speed_mode**: D1 37, D2 36, D3 35, D4 34, D5 33 m/s (Aurora downhill 34) [proposed]
- **item_mode_time_factor**: x1.12 vs speed mode [proposed]
- **min_radius_by_D**: 30/22/16/12/9 m; inner edge R - w/2 >= 3 m [proposed]
- **min_width_by_D**: 14/12/10/8/6 m main; branches >= 6 m; typical 18-24/16-20/14-18/12-16/10-13 m [proposed] — KR standard road 40u = 22 kart widths, extreme min 12u = 6.7 kart widths
- **straight_ratio_bands**: D1 40-55%, D2 32-45%, D3 25-38%, D4 18-30%, D5 12-24% (R>=150 counts straight; jumps/rails excluded) [proposed]
- **grade_limits**: sustained <=8% (D1-2), 10% (D3), 12% (D4-5), 15% P2P downhill; ramps <=30% over <=12 m; crest Rv >= v^2/(0.8g) [proposed]
- **bank_limits**: <=15/18/20/22/25° by D; rate <=1.5°/m [proposed]
- **halfpipe_profile_hp60**: floorHalf 5, filletR 6, wallDeg 60, wallH 4.5 -> footprint 22.1 m; >62° = wall [proposed]
- **surface_grip**: ice 0.75, sand 0.85, gravel 0.85, dirt 0.92, wet 0.92, snow 0.90, grass 0.80 (x0.60 top speed), conveyor x1.15/x0.85 [proposed] — ice/sand/conveyor values given in brief
- **game_gravity**: 28 m/s^2 [proposed]
- **jump_landing_zone**: >= 40 m; all v in [vMin,vMax] must land in [gapEnd+2, landEnd-5] [proposed]
- **item_row_rules**: >=60 m after line; >=20 m from apex R<30; local R>=60 ±10 m (areas exempt); >=150 m apart; ~L/250 rows/lap [proposed]
- **hazard_rules**: period >=2 s, active <=50%, telegraph >=0.6 s, integer-tick phase [proposed]
- **compiler_fidelity**: guard points 8 m; adjacent spacing ratio <=3; min segment 4 m; spline vs turtle deviation <=0.5 m (achieved 0.42 m / 0.34 m) [proposed]
- **belltower_piazza**: D2, 3x1350 m, straight 37.4%, min R 22, min W 14, alley 96.8 m saves 16.6 m, plaza annulus rIn 12 rOut 42 sweep 270 at (170.4,4,-220.6) [proposed]
- **magma_switchback**: D5, 2x1850 m, straight 19.6%, helix 540° R28 dy -14 (9.33 m/turn), ledge 203.8 m saves 25.7 m, rail ~67 m over host 88 m, jump gap 14 land 40 [proposed]
- **loop_primitive**: R12, lateral shift 12 m, length 76.3 m, frame rmf, gravity track, 15 m easements [proposed]
- **trackmania_grid**: 32 m x 8 m x 32 m blocks [sourced] — github.com/vjeux/trackmania-tas tools/mapgeom/src/main.rs
- **stk_quad_size**: ~8 m wide x ~10 m long quads (hacienda) [sourced] — PortsMaster/PortMaster-New supertuxkart hacienda quads.xml

## Open questions

- WebSearch hit its 200-call session limit, so all research went through direct WebFetch and GitHub code search. supertuxkart.net, wiki.tockdom.com, wiki.trackmania.io, kartrider.fandom.com, developer.mozilla.org and tc39.es were blocked. Should any claims be double-checked once search is available?
- Kart dimensions, hover height, arcade gravity (proposed 28 m/s^2) and the per-difficulty v_ref (37..33 m/s) must be confirmed by the driving-mechanics owner. They drive the lap table, the jump checks and V13.
- Is the netcode server-authoritative with reconciliation (assumed here), or does it need bit-exact lockstep or rollback? The latter needs a cross-browser CI test of BVH query and Math.sqrt determinism.
- KR kart-relative road widths (22 kart widths standard) suggest wider roads than 16 m with a 1.5 m kart. Should typical widths move to the upper end of the proposed bands after playtest?
- Which 2D polygon union library should be used for plaza and junction bakes (polygon-clipping vs a Clipper2 port)? Neither has been evaluated for determinism or bundle size.
- three-mesh-bvh option naming: API.md lists targetLeafSize, while older docs say maxLeafSize. The deserialize options (setIndex) need checking against the pinned 0.9.15 before implementation.
- The item-mode time factor (x1.12) is a guess. It should be measured with item-mode AI ghosts, since the KR item-mode kart class and absence of drift boost are not modelled yet.

## Sources

- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/tracks/drive_graph.hpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/tracks/drive_graph.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/tracks/graph.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/tracks/track_sector.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/tracks/quad.cpp
- https://raw.githubusercontent.com/supertuxkart/stk-code/master/src/tracks/drive_node_3d.cpp
- https://raw.githubusercontent.com/PortsMaster/PortMaster-New/12e229443e509d193456708a6dc43e4fc0104cd3/ports/supertuxkart/supertuxkart/data/tracks/black_forest/graph.xml
- https://raw.githubusercontent.com/PortsMaster/PortMaster-New/12e229443e509d193456708a6dc43e4fc0104cd3/ports/supertuxkart/supertuxkart/data/tracks/black_forest/scene.xml
- https://raw.githubusercontent.com/PortsMaster/PortMaster-New/12e229443e509d193456708a6dc43e4fc0104cd3/ports/supertuxkart/supertuxkart/data/tracks/hacienda/graph.xml
- https://raw.githubusercontent.com/PortsMaster/PortMaster-New/12e229443e509d193456708a6dc43e4fc0104cd3/ports/supertuxkart/supertuxkart/data/tracks/mines/graph.xml
- https://raw.githubusercontent.com/PortsMaster/PortMaster-New/12e229443e509d193456708a6dc43e4fc0104cd3/ports/supertuxkart/supertuxkart/data/tracks/snowmountain/graph.xml
- https://github.com/PortsMaster/PortMaster-New (supertuxkart data/tracks/*/quads.xml via GitHub code search)
- https://raw.githubusercontent.com/hlorenzi/kmp-editor/master/README.md
- https://raw.githubusercontent.com/hlorenzi/kmp-editor/master/src/util/kmpData.js
- https://raw.githubusercontent.com/hlorenzi/kmp-editor/master/src/util/kclLoader.js
- https://raw.githubusercontent.com/patchzyy/MkwTrackEditor/a467a0149e577622d372d601ff2a4137dbcd0bae/src/lib/kmpFile.ts
- https://raw.githubusercontent.com/patchzyy/MkwTrackEditor/a467a0149e577622d372d601ff2a4137dbcd0bae/docs/PLAYTEST.md
- https://raw.githubusercontent.com/vabold/Kinoko/33ea3cfcf670e12e1450daf50a95a709176849fe/source/game/system/CourseMap.cc
- https://github.com/vjeux/trackmania-tas/blob/bb5e38919aa76ca5e9ec63ae0fb713e06fc6d66f/tools/mapgeom/src/main.rs
- https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/README.md
- https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/API.md
- https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/package.json
- https://raw.githubusercontent.com/gkjohnson/three-mesh-bvh/master/example/characterMovement.js
- https://github.com/gkjohnson/three-mesh-bvh/blob/master/src/core/MeshBVH.js
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/extras/core/Curve.js
- https://raw.githubusercontent.com/mrdoob/three.js/dev/src/extras/curves/CatmullRomCurve3.js
- https://www.microsoft.com/en-us/research/wp-content/uploads/2016/12/Computation-of-rotation-minimizing-frames.pdf
- https://raw.githubusercontent.com/giacomoguidotto/guidotto.dev/2d0ed87ca1a18e3255534b62a5107979b0158a2d/src/components/attractor/tube.ts
- https://github.com/sumisonic/bezier-kit/blob/07fa93bc536a1f582912a737c464a71057fb697e/packages/core/src/frenet.ts
- https://raw.githubusercontent.com/mdn/content/main/files/en-us/web/javascript/reference/global_objects/math/index.md
- https://raw.githubusercontent.com/KartTrack-lap/Kartrider-game-analysis/5cf1875f019fee6085b06236abbc1b79ec75e47b/raw-data/scraping-rawdata.csv
- https://raw.githubusercontent.com/overjoy1008/OrangeCarrrrrPhysics/4e8126b2f568ee5634d1110ffb12cc00a14c075f/docs/TRACK_DESIGN_LIVINGROOM.md
