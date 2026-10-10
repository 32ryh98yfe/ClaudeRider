# Play-test controls and track contact validation

Baseline: `69d7845` (simulation 8). Candidate: simulation 9, specified in
[18-controls-and-track-contact.md](../design/18-controls-and-track-contact.md).
The original footage, prior reference comparison and its uncertainty remain in
[reference-driving-evidence.md](reference-driving-evidence.md); this report
addresses the seven subsequent play-test failures.

| User finding | Reproduction | Corrected behavior and evidence |
|---|---|---|
| Shift intermittently does nothing | A 20 ms down/up between 30 Hz input samples disappears; coalesced network samples also lose held transitions. | Explicit drift press edge survives keyboard/pad/replay, input merging, six-byte codec and packed ghosts. Pulse-only, held+edge and compressed re-press are exercised by Node/Chrome/Worker parity. |
| Escape does not pause | Native Chrome: the opening Escape reaches menu Back in the same event, leaving pause false and advancing 30 ticks over 500 ms. | Consumed Escape is not reprocessed. The offline tick remains 378 over the same interval; a new press resumes. Repeat, nested settings and pending-input cleanup have regression tests. |
| Noncolliding objects block the whole road | Real triangles intrude at Meadow creek, Cascade forest wall, Manor tree clumps, Coral shortcut shed and Kraken cliffs. | Correct the creek, fit support pillars and gantry openings, and exclude interfering decoration. Whole-catalog geometry audit plus native screenshots of all five sites. |
| Item boxes appear in speed mode | Meadow renders 30 boxes even in speed mode. | Render bodies/glyphs/shadows only in item mode. Native browser checks cover speed, time attack, item and infinite. |
| Drift recovery fixes the heading | Counter-recovery sets yaw to zero even while the driver requests the other direction. | Preserve requested yaw through slip-based exit. Matched probe ends the cut at −0.539 rad/s instead of zero; actual left/right native keyboard sequences continue through recovery. |
| Repeated Shift cannot gradually alter the turn | Repeat at tick 6 is discarded, while tick 12 applies a fixed heading jump. | Both pulses receive proportional, bounded yaw impulses with no repeat heading teleport. Tests compare one/two/three pulses and both directions. |
| Traps are sometimes ignored | Endpoint-only contact misses thin/moving shapes; some custom damaging meshes extend beyond their colliders; inactive custom bodies look solid. | Sweep actual motion, align damaging geometry to authored contacts, retain separate suspension decoration, and show damaging columns only when active. Native ArrowUp from the test-course grid produces an actual 66-tick airborne effect at tick 622. |

## Direction response

The same 34 m/s input sequence was applied before and after, without changing
kart statistics. After an opposing steering/Shift press:

| Measurement | Baseline | Simulation 9 |
|---|---:|---:|
| Continued rotation in the previous direction | 11.385° | 0.991° |
| Time to opposite yaw | 117 ms | 50 ms |
| Yaw at cut completion | 0 | −0.539 rad/s |
| Accepted repeats at ticks 6/12 | Only 12 | Both |
| Speed at tick 30 | 30.959 m/s | 31.561 m/s |

A separate native keyboard run at 960×720 exercises three Shift presses,
right-to-left counter-steering, immediate re-entry, the reverse transition and
Shift-before-steer, with no reference/autopilot input source and no state writes.
There are no page errors, console errors or framework overlays.

Replaying the original held-out launches with the updated real input filter gives
4.80% intermediate and 4.69% beginner nonzero-speed MARE. The beginner source kart
is different; unknown continuation initialization still prevents a whole-video
5% claim. All seven reference-fidelity assertions remain enforced.

## Geometry and trap coverage

The rebaked catalog contains 74,978 decorative props across 21 tracks. The audit
excludes 145 interfering instances (0.193%), fits 37 pillars and widens two
start gantries. Every track retains its gantry; real arches, tunnels, hollow logs,
bridges and buntings remain. The load-time audit takes at most 451 ms per track
on this machine and performs no per-frame clearance work.

The custom-hazard containment audit checks 14 model types, 29 instances and
59,256 damaging vertices against their declared convex contacts. Ten suspension
meshes remain, with immutable shared geometry and explicit owned-clone disposal.
Suspension ropes/stems are decorative, not the damaging obstacle body.

Continuous-contact tests cover all five hazard kinds and all four declared
effects, active/inactive boundaries, lane restarts, interleaved worlds, thin
box/sphere/cylinder crossings and solid sliding/escape. The descending Manor
bookcase originally forced grounded karts through the floor. Its grounded
resolution now chooses an exit with road support and a wall-free translation;
90-tick tests at lateral positions 2.3 m and 6 m enforce support and road bounds.
Six Manor pack races (three seeds, both modes) finish 48/48 without hard contacts
or respawns.

## Whole-track regression

The same declared matrix covers all 21 tracks, speed/item, solo/eight-kart fields,
and seeds 4242/2026/7301. All 252 fields and 1,134 karts finish. Speed-mode respawns,
solo hard contacts and missed gate/finish credits are zero. Candidate runtime
fingerprints remain unchanged throughout the run.

| Matrix statistic | Baseline | Simulation 9 |
|---|---:|---:|
| Hard wall contacts | 37 | 28 |
| Respawns in item battles | 8 | 11 |
| Maximum no-progress ticks | 315 | 173 |
| Item uses | 3,159 | 3,221 |
| Opponent effect hits | 2,012 | 2,022 |

The item respawns occur around jumps after damage and field collision sequences.
Changed track contacts also change baked hashes used by item draws, so these are
whole-scenario outcomes, not identical-inventory causal comparisons. Contact
checks do not disable attacks or grant artificial protection near jumps.

AI prediction and partial counter-steering match the new dynamics. Fork lane
setup begins earlier while retaining the final alignment/abandon check. The
kart-balance method and all 128 measured trials are documented in
[control-balance-validation.md](control-balance-validation.md): fixed four-run
means retain the ±2% bound, and every individual run must finish without hard
wall hits or respawns. No kart statistics were altered to fit a single AI roll.

## Reproduction

The final local suite passes **910 tests, with 61 skipped and no failures**.
TypeScript, ESLint, frozen contracts, dependency boundaries, all-track baking and
the production build pass. Fourteen production browser checks pass, including
two-client online results, online Escape keeping the shared clock running,
offline Worker parity, menus, HUD and saved-ghost replay. The first native online
run reached both results but failed its strict console check solely because its
two independently created contexts bypassed the wrapper's favicon interception;
the unchanged test passes when those contexts receive the same interception.

The item-track test distinguishes successful Interrupt Pulse drone cancellation
from an unexplained route fizzle. Its exact-target/exact-tick classifier has a
real helix-crossing projectile regression and negative controls; the unexplained
fizzle, finish, stall, height and impact-distance limits remain unchanged.

- `pnpm bake`
- `node tools/reference/audit-track-props.mjs /tmp/track-props.json`
- `node tools/reference/measure.ts /tmp/reference-v9.json`
- `node tools/reference/map-matrix.ts /tmp/matrix.json`
- `pnpm exec vitest run --maxWorkers=1`
- `pnpm check:frozen && pnpm check:deps && pnpm typecheck && pnpm lint`
- `pnpm build && pnpm e2e`

Browser plugin was unavailable. Local execution used installed Google Chrome
through Playwright, at 960×720 and 1280×720. Native browser artifacts and the
full numeric traces remain outside the repository. The production E2E tests
retain strict page-error assertions; the local wrapper intercepts only the
repository's absent favicon request.
