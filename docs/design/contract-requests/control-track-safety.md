# Track obstacle and hazard corrections

User requirements 3 and 7: a visible road obstruction must have meaningful contact,
while render-only dressing must not cover the drivable road; live track traps must
apply their authored effects reliably.

The orchestrator authorized `step.ts` to import `captureTrackHazardMotion` and call
it before phase 4. This scratch records each world's pre-move kart sphere centres,
is overwritten on every tick/replay, and is consumed in phase 5. It adds no world
state and no snapshot/hash/quantization fields. The orchestrator owns the simulation
version and frozen-contract update.

## Root causes and changes

- Track hazards tested only final kart/hazard positions. A path could intersect a
  narrow or moving shape between ticks and end outside. Phase 5 now advances along
  actual captured movement using distance to the analytic shape and a motion bound.
  Solids clip the remaining inward motion at contact while retaining sideways and
  outward motion; moving shapes also resolve final overlap. Traffic lane and train
  parking teleports do not sweep across a road. Current-tick activity, hard-CC
  immunity, shield bypass and effect durations retain their existing meaning.
- Custom cannonball/foam hazard bodies remained visible during inactive ticks,
  although their collider was intentionally inactive. They now show the telegraph
  ring before impact and the damaging body only while active. Built-in vent rims
  and raised mechanical presses retain their non-damaging idle presentation.
- The Manor bookcase mesh measured wider than its collider, and chandelier rings
  extended beyond their capsule radius. Their authored contacts now cover the
  rendered body. The Coral barrel used a car-sized contact despite a much smaller
  barrel; its authored box now matches the barrel.
- Render props were placed by origin-only checks. Actual geometry crossed the road
  at Cascade's forest wall (s736–744), Kraken's cliffs (s236–258), Manor tree clumps
  (s888–914), Coral's shortcut shed (path1 s46–54), and other isolated locations.
  `PropRoadClearance` checks actual triangles against the 3D drivable corridor once
  at load, retaining real openings in arches, tunnels and bridges. It suppresses
  only conflicting scenery instances. HAZ objects and baked collision meshes do
  not pass through this filter. Gore cushions already represent baked solid walls.
- Generated pillar height classes rounded above their deck. The renderer caps
  supports below the actual supporting road; any remaining lower-deck conflict is
  subject to the same clearance check. Theme gantries with too-close posts widen
  across the road until their real opening is clear.
- Meadow's decorative creek had been placed above a neighboring road section
  (s576–578). Its authored height is now below the bridge.

## Reproduction and verification

- `pnpm vitest run --project sim packages/sim/test/hazards.test.ts --maxWorkers=1`
  covers every public authored hazard's declared effect, all five kinds/four
  effects, a deterministic 8-bot race, thin box/sphere/cylinder sweeps, first-contact
  stopping, sliding/escape, activity edges, lane restarts and interleaved worlds.
- `pnpm vitest run --project client apps/client/test/track-clearance.test.ts --maxWorkers=1`
  covers triangle interiors even when all vertices lie outside the road, genuine
  arch openings, specific authored obstructions, pillar fitting and cannonball
  warning/live/idle presentation.
- After a bake, `node tools/reference/audit-track-props.mjs <report.json>` audits
  actual model triangles on all public tracks, records every rejected instance and
  its path/s coordinate, retained openings, fitted supports and load-time cost.
  Filtering has no frame/tick work and does not add scenery collision to the sim.

The clearance prism spans the drivable road except its outer metre (wall/kerb
space), from 0.35 to 2.7 metres above the road in its banked frame. Two-metre samples
with overlapping 2.1-metre longitudinal cells cover curves and grade transitions;
warp and no-ground spans have no road-clearance prism. This protects kart/driver
space without rejecting overhead architecture solely from its bounding box.

## Descending solid presses and supporting floors

The first integrated matrix exposed three Manor falls in pack races immediately
following the descending bookcase. A bottom-face contact had a downward normal;
the generic solid separation moved an otherwise grounded kart through the road.
For a supported kart, downward solid-box contact now chooses the nearest planar
exit and removes only inward motion there. It preserves sideways and outward
movement and does not disable the obstacle. The real Manor regression runs the
bookcase descent for 90 ticks, requires contact, keeps the foot above the supporting
plane and prohibits ground loss or respawn. The corrected six Manor pack races
(three fixed seeds, speed and item) finish all 48 karts with zero hard hits or
respawns.
