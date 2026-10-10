# 20 — Shared track contacts, finished karts and course maps

This is the simulation-10 implementation contract accompanying
`19-continuous-handling.md`. The theme and overall route of each track are retained.
Local clearance, placement and jump-budget repairs are permitted by the user's
approved plan. The original video remains a local reference, not an instruction
source or repository asset.

## Visible solids and physical contacts

`packages/content/src/prop-contact/policies.json` assigns each used model a solid
or cosmetic policy. Renderer geometry marks foliage, cloth, loose rope and water
separately from trunks, posts, buildings and rigid furniture. Generated contacts
retain every authored hard triangle, removing only duplicates and quantizing
local coordinates at 1/4096 m. Mesh simplification was rejected after an
independent bidirectional surface check found errors up to approximately 15 cm.
The final exact catalog's maximum matched-vertex error is 0.209 mm before scaling.
That is a measured storage error, not a claim that every transformed instance has
already passed route clearance.

The compiler resolves all final prop transforms. CTRK and CVIS carry identical
matrix/geometry-index/flag/contact-range/support-credit arrays; the renderer does
not subsequently relocate a collider-bearing model. Local meshes are shared
across instances instead of duplicating hundreds of thousands of world triangles.
There is no distance or reachability cutoff that silently deletes distant solids.
Arch posts and beams retain their actual openings.

The version-3 storage budget is **5 MiB per CTRK** and **3 MiB gzip per CVIS**,
enforced by compiler tests. The old 1.5/2 MiB limits predated exact hard-body
contacts and clipped structural skins. Candidate2's largest files are Aurora:
3,753,640 physics bytes and 2,885,775 compressed visual bytes. Instancing retains
all solids within the new bounds; flattening the same prop faces previously
produced a Manor physics file over 10 MiB. These are explicit storage tradeoffs,
not relaxed collision or drivability assertions. The final report records final
sizes and rendered performance separately.

At load, a world instance BVH and one triangle BVH per local mesh are built.
Sphere queries transform only candidate triangles into world coordinates, which
keeps contact exact under nonuniform scale, shear and reflection. Static and
instanced contacts share a stable virtual triangle identity and retain the deepest
contacts when the caller's output is bounded. Audit queries expand their capacity
when saturated; absence from a bounded response alone is not a missing collider.

Road undersides follow actual road triangles, including gutter and bowl profiles.
Skirts and undersides are clipped against whole driving-clearance prisms, not just
sampled points. Shared vertex-normal prism hulls close gaps between adjacent
noncoplanar faces. Foundation/deck faces receive ground-support credit only where
they coincide with real driving geometry. Support and cosmetic exclusions are
independently checked against the final files.

Structural skins carry an authored outward normal. A kart rising into a ceiling
is expelled downward, and its inward normal velocity is removed. The swept foot
segment checks a real front-facing road crossing before resolving its underside;
the latter must never turn a missed road landing into a fall-through. High-speed
wall movement is subdivided without reintegrating forces.

Solid hazards separate physical touch from their timed effect. Immunity prevents
reapplying the effect but does not let a kart pass through an active visible train,
vehicle, bookcase or log. A hazard's displacement is checked against road walls
and support so it cannot eject a grounded kart through a static barrier.

## Finishing and recovery

The authoritative finish/retire state rejects new driving and item inputs. Drift,
boost propulsion, attachment and interfering effects end immediately. On support,
velocity decreases linearly over 48 ticks (0.8 s), then remains exactly zero.
Other competitors continue; finished/retired bodies are excluded from vehicle
contacts and targeting. Road and wall constraints remain active.

An airborne finisher retains gravity and completes its landing. If no landing
exists and it reaches the kill plane, it parks at a compiled safe recovery anchor
while retaining the recorded result. It does not enter a controllable respawn
phase. Held inputs cannot resume driving after either kind of stop.

Declared jump grace is bounded by `airTicks`, not by the already-clamped
`noGroundTicks`. The previous condition could repeatedly renew the same 71-tick
counter forever. Unsupported jump flight now leaves grace after 400 airborne
ticks. A zero-gravity regression isolates and checks that expiry.

Random-drop tests explicitly use unscored active karts; they no longer set
`finishTick` as a shortcut to bypass race progress. A free drop must meet physical
ground or a kill plane. Once a solid prop catches it, ordinary unsupported-body
recovery is allowed and reported separately. Swept ground crossing, finite state,
and zero unexplained stalls remain required assertions.

## Course HUD and compatibility

The actual course map is the default in every mode. The legacy speed-mode setting
`minimapInSpeed:false` migrates to `raceMap:'track'`. The progress rail remains an
explicit setting. Each main/branch path supplies its own connectivity; only
closed paths close their SVG polyline. All path points and player markers use one
world-to-map transform, including point-to-point tracks.

Client/server deployment must use simulation 10, lobby protocol 3 and the same
track hash. A track hash mismatch aborts loading with the existing reload message.
Ghost format 2 carries the changed input layout; incompatible previous ghosts
remain rejected. The original baseline is retained at commit `5db2299`.

## Reproduction and evidence boundaries

Use `pnpm gen:contacts`, `pnpm check:contacts`, and `pnpm bake` for data generation.
`tools/reference/audit-track-contact.ts` checks all final ground faces, triangle
interiors, shoulders, branches, transformed props, launch corridors, warp exits
and hazard phases with an independent geometry oracle. Physical launch direction
comes from the actual last driving surface, not a spline tangent blended toward
the downward chord across a gap. Wall contact and effect immunity are checked
separately.

`tools/reference/map-matrix.ts` runs speed, item, infinite and solo time attack
over seeds 4242/2026/7301. `build-handling-fixtures.ts` renders the exact U-turn
geometry used by the physics tests. `keyboard-play.mjs` sends real browser key
events and records received transitions, generated ticks and authoritative input.
It never corrects the running world position.

The source comparison is a labelled deterministic 30 fps render replay, two
physics ticks per frame. Native keyboard footage is recorded at wall-clock speed
and evaluated separately. Per-clip Node/browser hashes validate every captured
physical state. Original absolute video-speed errors are still reported, but the
user's explicit lower speed targets supersede the previous 5% pass condition.
Complete-map and multiplayer acceptance must be supported by the final reports;
focused handling tests and selected captures cannot substitute for those checks.
