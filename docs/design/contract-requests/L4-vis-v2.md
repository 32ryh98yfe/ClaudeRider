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

Later ladder steps append to this file (kill planes, portals, rails, hazard visuals, LOD1, PVS).
