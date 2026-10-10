# Full-volume track contact, simulation v10

The approved obstacle work changes the baked track contract. Rendered rigid scenery and collision now share a final transform and explicitly authored hard-body geometry. Leaves, cloth, water and flexible suspension parts have named cosmetic roles. The compiler and simulator read a data-only catalog; neither imports the client renderer. An offline generator extracts the catalog from the actual procedural models and checks its fingerprint and reproducibility.

## File contracts

- `CTRK_VERSION=3`, `CVIS_VERSION=2`, compiler `trackc/3.0`.
- `CtrkMeta.propContacts.version=2` identifies instanced static collision. `geometries` names unique local `pcgN.pos` Float32 and `pcgN.idx` Uint32 arrays. Exact hard model faces are retained; there is no distance-based reachability omission or enclosing-box approximation.
- Per prop set, `propN.mat` stores the final 4×4 instance transform; `propN.geo` indexes a geometry or uses `0xffffffff` for no physical body; `propN.flags` stores contact policy. `propN.contacts` records a stable virtual first-triangle ID and count for each instance. IDs are contiguous after structural wall triangles even when local geometry is shared. `propN.support` records ground-credit clipping counts for diagnostics.
- The `.vis` `pN.mat`, `.geo`, `.flags`, `.contacts` and `.support` arrays must match the corresponding `.ctrk` arrays bit for bit. Rendering uses these matrices directly. The v2 prop contract has no runtime hiding or resizing fallback.
- Structural deck skins use `TFLAG.ORIENTED=128` with their outward winding. Their collision normal stays outward after earlier contacts move the body; ordinary two-sided walls and prop triangles retain nearest-point normals. Existing `SOFT` and `GORE` response flags are preserved on all wall faces.
- A hazard's `contact` policy (`solid` or `trigger`) is independent of its damage effect and immunity. Mechanical heads, traffic, trains and logs remain physical while a kart is damage-immune; inactive steam is a trigger. A train's parked off-track phase is absent consistently from rendering and contact.

## Geometry rules

The actual final ground mesh supplies clearance, including junctions, shoulders, areas and profiled roads. Ground winding is aligned with authored surface normals before one-sided ray data is emitted. This prevents tiny reversed triangles at tight landing-row transitions from behaving as downward-facing ground.

Clearance subtracts convex swept kart volumes from erroneous underside and skirt geometry. The lowest sphere centre is 0.6m above the supporting point, its radius is 0.85m, and a 2.25m centre column protects the visible body. The volume includes the kart overhang beyond a road edge and interpolated-normal normalization. Real external deck skins remain collidable. Clipping processes microscopic polygons too, because Float32 storage can turn a near-collinear remnant into a contacting triangle. The independently sampled final stored meshes, rather than the clipping implementation alone, are the acceptance evidence.

A source face may receive ground credit only where its complete polygon intersects the actual ground support band: −0.3m to +0.02m for a buried foundation, or −0.15m to +0.15m for an explicitly declared supporting deck. Triangle-interior clipping preserves unsupported overhangs as physical geometry. Openings remain open. Conflicting props are resized only for declared openings or relocated at bake time, with the same matrix used for display and contact.

The visible 0.45m road-wall thickness is shared with collision: inner face, top and outer face are physical. This covers airborne and outside approaches without moving the inner driving edge. Rail clearance uses its authored up vectors; using an unlabelled triangle's winding as its up vector had inverted that virtual volume and missed adjacent lantern bodies.

Magma's former boost pad on the 30m underpass entered a curved wall after 46.4m / 1.4s with the actual unsteered boost probe. That pad moves to `@plateau+1`, where the same probe travels 65.19m over 120 ticks without wall contact. The path and theme are unchanged.

## Motion and visual contact

High-speed movement is subdivided by distance. Airborne foot sweeps accept only front-facing surfaces crossed from above. A second sweep is needed only for a kart that began the segment airborne, when a wall response changes the position and the ray crosses a positive distance: a tilted falling sphere can touch a solid underside before the foot crosses the upper surface, so the wall correction must not carry a previously above-ground foot through that surface. Approaches from beneath both surfaces remain rejected. Grounded tangent travel never uses this correction: accepting a distance-zero hit on the previous flat face at a shallow downward seam would rewind valid progress while leaving nonzero velocity. The measured Orbital station402.844 regression asserts forward displacement across that seam. No new persistent simulation state is introduced by these query scratch values.

Press warnings keep their indicators but no longer displace the entire rigid head away from the shared physical pose. Magma vents use flat metal grates supported by the actual road (independent dense measurement: 1–3.5mm above it); the steam remains a trigger. Token's formerly rigid exposed piston is a 0.07m-diameter flexible suspension cable. All five suspension factories explicitly label this cosmetic part as `flexible-suspension`.

Kraken's splash hazards retain their timing and launch behavior, but their old iron spheres and raised rigid rings are replaced by an open cyan water jet, separate foam droplets and a flat ripple. Their material is nonmetallic, transparent at opacity0.65 and does not write depth. Custom trigger bodies declare `hazardBodyRole: 'fluid-trigger'`, propagated onto the actual rendered object; the default steam plume uses the same explicit role. The independent renderer audit checks these material facts as well as geometric containment, so a rigid object cannot acquire a pass-through exemption merely by being renamed.

## Verification

Focused tests cover original measured pass-through/road-block points, triangle-interior clearance, ground-edge overhang, the Belltower Float32 sliver, Pumpkin inverted winding, complete road-wall surface parity, instanced transform/triangle-ID parity, external contact outside the wall hash, physical immunity behavior, descending press escape, thin swept traps and post-wall falling support. The independent audit uses a separate BVH and barycentric sampling over final stored geometry; it does not call the compiler's clearance predicates. Whole-track audit/matrix artifacts are generated by the integration run and carry final file hashes. A compiler change alone is not evidence that those final checks passed.
