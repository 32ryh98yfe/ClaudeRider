# Simulation 10 integration contract

Approved by the orchestrator under the user's explicit input/drift/whole-track
implementation plan and subsequent play-test instructions. The baseline remains
commit `5db2299`; changes continue on PR #1. This is authorization recorded from
the task, not an additional approval request.

- `core/input.ts`: the 8-byte wire sample carries the last digital direction and
  a four-request signed drift FIFO. Overflow remains queued, including across
  late authority samples. The packed JS value uses 49 exact integer bits. Lobby
  protocol 3 and ghost format 2 reject the incompatible previous layout.
- `core/state.ts`, `world.ts`, `quant.ts`, `hash.ts`, and the network world codec
  carry the seven continuous drift fields documented in `19-continuous-handling.md`.
  Simulation version 10 rejects previous physical trajectories.
- `core/units.ts`: speed normalization follows the reduced real kart targets.
- `step.ts`: finished/retired karts release drive forces, brake for 48 ticks,
  retain real road/wall contact, and remain parked. Existing finish/end ticks
  determine braking; no untracked duration state is introduced. A finisher whose
  airborne path ends in a void parks at the compiled safe recovery support while
  retaining its result. Unfinished competitors continue racing.
- `track/format.ts`: CTRK 3, CVIS 2 and compiler 3 carry explicit prop policy,
  shared local contact geometry, identical final visual/physical instance
  transforms, stable virtual triangle ranges, and ground-support credits.
  `TFLAG.ORIENTED=128` gives repaired structural skins an authored outside;
  an underside can never expel a kart upward through its driving surface.
- `meta/save.ts`: new `raceMap` defaults to the actual course. Legacy
  `minimapInSpeed:false` migrates to that default; an explicit new progress-map
  choice remains respected. No save reset is required.

The local original video and rendered movies remain outside Git. Contact catalog
generation is deterministic (`pnpm gen:contacts`); `pnpm check:contacts` rejects
stale data. CI and `pnpm verify` bake the complete roster before tests so a fresh
checkout cannot silently skip cached-map acceptance.

All frozen hashes are updated by the orchestrator only after integration review.
