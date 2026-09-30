# L4 → L11: `.vis` v2 sections to render

Lane: L4 TRACKC. Reader today: `apps/client/src/render/track/TrackView.ts` (L11). Decoder for new readers:
`packages/sim/src/track/vis-format.ts` (`decodeVis`, types `VisMeta`, `VisSlot`, `VisChunk`) — import it as
`@cr/sim/track/vis-format.ts`.

**Compatibility promise:** every v2 addition is an optional meta field or a new named array. The M1 reader keeps working
unchanged: `slots[j].material` is always an M1 key (`road`, `kerb`, `shoulder`, `wall`, `underside`, `terrain`,
`startline`, `boostpad`), `slots[j].chunks[]` still holds `{i0, n, bbox}` ranges into `s{j}.idx`, props are still
`p{j}.xf` (stride 6: x, y, z, yaw, scale, variant) and `minimap` is unchanged. Vertex colours now carry a surface tint ×
AO, so an M1 client already shows sand, ice, lava … differently through the one road material.

## 1. Slot variants (`slots[j].variant`)
Slot names are `material:variant` (or just `material`). Suggested lookup: `mats[`${material}:${variant}`] ?? mats[material]`.

| material | variants | notes |
|---|---|---|
| `road` | any `SURFACE_IDS` id (`asphalt`, `cobble`, `sand`, `ice`, `wood`, `metal`, `conveyor_fwd`, `conveyor_back`, `lava`, `basalt`, `obsidian`, `glass`, …) | uv.x 0..1 across the road (edge lines at 0.02/0.98), uv.y = s/4; plaza triangles use world-space uv (x/12, z/4) |
| `shoulder` | surface id (`grass`, `sand`, `dirt`, `snow`, `gravel`) | uv = (d/4, s/6) |
| `boostpad` | `boost`, `jump` | uv.x across the pad, uv.y along it (0..1) — the M1 chevron material works as is; `jump` wants the coral/pink look (art bible §9) |
| `kerb` | `kerb` | uv.y = s/2 (stripes) |
| `wall` | `barrier`, `fence`, `rock`, `parapet`, `building`, `planter`, `pillar`, `cliff` (jump landing faces), `rail` (F4 rail tubes), `portal` (F4) | each panel is inner face (u 0–0.33), top (0.33–0.66), outer face (0.66–1); v = s/3 |
| `underside` | `underside` (ribbon bottoms and side skirts, which now reach down to the terrain), `kill_lava`, `kill_void` (F2 kill planes) | kill planes want an emissive lava / dark void material |
| `terrain` | `terrain` | unchanged |
| `startline` | `startline` | unchanged |

## 2. Chunk table (`visMeta.chunks`)
`chunks[] = { id, path, s0, s1, kind: 'track' | 'terrain' | 'area' | 'misc', bbox, groups: [{slot, i0, n}], tris }`.
A chunk is ≈ 50 m of one path (`CHUNK_LEN`), one terrain tile (12 × 12 cells), one plaza, or misc (gores, kill planes).
`slots[j].chunks[k].chunk` names the chunk each range belongs to. Draw one mesh per group (≤ 8 per chunk on Low, V20)
and cull per chunk bbox; later steps add `lod1` ranges and a PVS (see §5).

## 3. Junctions (`visMeta.junctions`)
`[{ kind: 'split' | 'merge', gore: {x, y, z, fx, fy, fz} | null }]` — the gore tip of each split (where the host and
branch walls meet in a V) with the branch direction. Collision already has a soft cushion there; a prop `gore_cushion`
is placed at the tip (render it as a crash cushion / arrow board).

## 4. Minimap paths
`visMeta.minimapPaths = [{ id, kind, array }]` — `minimap.<pathId>` Float32 (x, z) pairs every 4 m for every branch and
rail, so the HUD can draw shortcuts.

## 5. New prop kinds placed by the compiler
| kind | meaning |
|---|---|
| `gore_cushion` | crash cushion at a split gore (yaw = branch direction) |
| `pillar` | support under elevated decks (variant 0–3 = height class, ≈ 6 m each); y is the terrain height |
| `chevron`, `gantry` | as in M1 (chevrons only where the outside of the corner has a wall) |

## 6. F2: kill planes
`visMeta.killPlanes = [{ id, y, surf: 'lava' | 'water' | 'void', aabb: [x0, z0, x1, z1] }]`; their geometry is already in
slot `underside:kill_<surf>` (40 m tiles, vertex colour lava-orange / water-blue / void-dark). Jump landings have a
`wall:cliff` face; ramp ends have an `underside` face.

## 7. F3: plazas and profiles
`visMeta.areas = [{ id, kind: 'annulus' | 'polygon', y, surf, center, rIn, rOut, from, sweep, obstacles: [{kind, x, z, r, w, d, h, yaw}] }]`.
Plaza triangles are in `road:<surf>` slots with world-space uv (x/12, z/4) and sit in their own chunk (`kind: 'area'`).
Obstacles (a tower, pillars) are collision walls and render as `wall:building` panels; dress them with a landmark prop
(`PROP kind=clock_tower at=…`). Plaza curbs render in the `kerb` slot. Halfpipe slopes are ordinary `road:<surf>`
triangles with steep normals.

## 8. F5: hazard visuals
`visMeta.hazards = [{ id, kind, name, prop, size, shape, group? }]`, one per `CtrkMeta.hazards` entry, same index.
- Every frame, the renderer (L11) poses each hazard from `track.hazardPose(id, tick, out)`:
  - `x y z`: the shape origin.
  - `f`: the long / forward axis (the right vector for a crossing train, the arm direction for a flat sweeper).
  - `u`: up. For a swinger this is the arm axis.
  - `active`, `telegraph` and `phase`.
  - No hazard state lives in the world; the pose is a pure function of the tick, so the client may render any tick.
- `prop` is a theme-kit key (defaults `hazard_geyser`, `hazard_press`, `hazard_train`, `hazard_car`, `hazard_swinger`;
  `HAZ … prop=` overrides it). A kit without it renders a placeholder primitive of `shape`/`size` and logs a dev warning.
- Sizes are in the hazard frame:
  - `cyl`: [radius, height, 0], standing on `u`. A swinger capsule is [r, len, 0] along the arm.
  - `box`: [along f, across, up u].
  - `sphere`: [r, r, r].
- Telegraph cue (≥ 0.6 s): geyser steam and ground glow, press shake, crossing bells and lights.
- Traffic vehicles of one HAZ line share `group` (one car model, varied by id).

## 9. LOD1, PVS, baked AO (CLI bakes)
- **LOD1.**
  - Each slot's `s{j}.idx1` (Uint32) is an index-only LOD over the same vertex buffer, and `slots[j].lod1` gives one
    `{ i0, n, chunk }` range per LOD0 chunk range.
  - It is at most 40% of the LOD0 triangles (0.30–0.37 on real tracks). Kerbs, the start line, boost pads and portals
    have `n = 0` (not drawn at LOD1).
  - Vertices on chunk seams are kept, so a LOD1 chunk meets a LOD0 neighbour without a crack.
  - Suggested switch: beyond 150 m (V20 counts it that way).
- **PVS.**
  - `visMeta.pvsStep = 10` and `pvsBytes`. The `pvs` Uint8 array holds one bitset per `pvsStep` metres of sMain;
    bit k is chunk id k. `TrackVis.visibleChunks(sMain, out)` decodes it.
  - It is omnidirectional (look-back works) and conservative, with no frustum test. A chunk counts as visible when:
    - it is within 120 m of the chase camera (5 m back, 2.5 m up, on every path covering that progress), or
    - it is within 1000 m and one of its bbox test points is unblocked by terrain, road or walls.
  - Readers without PVS draw everything, as before.
- **Terrain tiles** are now 24 × 24 cells (≈ 190 m). One draw each; terrain is not merged.
- **Baked AO.** The CLI multiplies vertex AO into `s{j}.col` (12 rays, 16 m). The renderer needs nothing new, though
  it may lower its own SSAO strength where the bake already darkens.
- **V20 worst visible static set, Low tier.** Per 10 m sample, V20 counts the chunks that are both in the PVS and in a
  120° forward cone within 600 m. Draws are per slot, as runs of 3 contiguous chunks (TrackView's `mergeChunks`);
  terrain is one draw per tile. Triangles are LOD0 within 150 m and LOD1 beyond. The finding lists the heaviest slots.

Later ladder steps append to this file.
