# L6 WORLD-B → L4 / L11: what the ember_mine, neon_harbor and orbital_nexus tracks need

Lane: L6 (geode_rail_quarry, magma_switchback, rainline_blvd, skyway_interchange, token_foundry, orbital_express).
Everything below has a fallback shipping today; none of it blocks a bake.

## 1. L4 — terrain near roads should follow the local deck, not the global minimum
`packages/trackc/src/terrain.ts` line ~48–59: near a road the height is `Math.min(target, natural)` where
`natural = baseY − 1.5 + noise·amp·ramp` and `ramp = 0` within 10 m of the edge. So next to any deck that is higher
than the lowest point of the track the terrain sits at **global** `baseY − 1.5`:
- every `PROPS` row beside such a deck is dropped (`y < yRoad − 3`), so tracks with real elevation (magma_switchback
  spans 0 … −21 m, orbital_express is all bridges) lose most of their dressing;
- the side skirts run all the way down to that global floor (20 m walls under a plateau).

**Ask:** within `edge` use `target` (the lowest *nearby* deck − 0.35) and only blend toward `natural` beyond it:
```diff
-      if (best < edge) y = Math.min(target, natural);
+      if (best < edge) y = drop ? Math.min(target, natural) : target;
```
and let the 30 m blend go from `target` to `natural` (unchanged). Stacked decks keep working because `yRef` already
picks the lowest deck near the point. Fallback today: geode_rail_quarry was re-profiled so its long main level is the
track's lowest level; magma keeps its elevation and simply carries less dressing beside its high sections.

## 2. L4 — `PROPS` rows that span the road
Rows may not start on a drivable surface, so arches, gantries and roof slabs are placed from one post
(`side=R offset=<span/2 − w/2> scale=1-1`, geometry spanning +X). That works, but a `PROPS … center=1` mode (origin on
the centreline, allowed on the road, no terrain snap) would let arches follow width changes. Optional.

## 3. L11 — `TrackView` reads the prop `variant`
`p{j}.xf` carries `variant` (stride 6) but `TrackView` only uses it for `chevron` mirroring. The compiler's `pillar`
kind encodes the deck height class in it (0–3, ≈ 6 m each). Theme kits cannot see it, so a kit pillar is either too
short under tall decks or pokes through low ones (L6 kits ship a 4.4 m pier). **Ask:** for `pillar`, scale the instance
in y by `(variant + 1)` (factory builds a 6 m unit column), or pass `variant` to `PropFactory.build`.

## 4. L11 — per-track look overrides
Both neon_harbor tracks share one ThemeKit, but rainline_blvd is a rainy night and skyway_interchange is dusk
(`THEME … sky=sunset time=19:30`, art bible §4). `visMeta.theme` already carries the THEME line. **Ask:** let a kit
expose `lookFor?(visTheme: Record<string,string>): Partial<ThemeLook>` (or read `visMeta.theme.sky/fog/time` in
`RaceRenderer`) so a theme can vary sky/sun/fog per track. Fallback: one look per theme.

## 5. L11 — MaterialLibrary
- `emissive(c, i)` is a `MeshBasicNodeMaterial` without `emissiveNode`, so it never reaches the emissive MRT and
  never blooms (NodeMaterial only assigns `emissive` when `emissiveNode`/`material.emissive` exists). Setting
  `m.emissiveNode = m.colorNode` (or using a Standard material with black colour) fixes it for every theme.
- A **vertex-coloured emissive** variant (`emissiveVC(intensity)`: `colorNode = vertexColor() · intensity`, also as
  `emissiveNode`) so one prop can carry several neon colours (signs, windows, LED strips). Fallback today: single-colour
  emissive kinds, plus vertex colours above 1.0 in `vertexLit` props for small "lit" parts (`glow()` in
  `render/themes/ember_mine/shapes.ts`).
- Kits cannot restyle the `underside` slot (fixed grey in `makeKit`); a `look.underside?: {a, b}` would let mines use
  basalt skirts and space tracks white station hulls. Fallback: L6 kits override `materials()` after `makeKit`.

## 6. L4 — `.ctrk` size for the 3.8 km point-to-point
`trackc build.test.ts` caps roster `.ctrk` at 1.5 MB. orbital_express (3800 m, 11–12 m wide) will be close; if it goes
over, please size the cap by length (≈ 0.4 KB/m) or store positions as f32 offsets.
