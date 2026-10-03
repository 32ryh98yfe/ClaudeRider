# Reference driving: simulation version 5

Orchestrator checkpoint for the user's request to refine driving from the
reference video while preserving existing maps and terrain.

The only frozen source change is `SIM_VERSION` in
`packages/sim/src/core/state.ts`, from 4 to 5. No state field or binary layout
changes. The existing ghost and online welcome version checks must reject
version 4 trajectories because finite counter-steer recovery and repeat-kick
cooldown alter the deterministic simulation. `contracts.lock` records this
approved version change. See `docs/design/16-reference-driving.md` for the law
and evidence boundaries; all track and kart content remains unchanged.
