# Reference fidelity version 8

The user's approved fidelity plan supersedes the old track-byte and corner-number
preservation requirement. Orchestrator-approved frozen change: `SIM_VERSION`
5→6 in `packages/sim/src/core/state.ts`, then 6→7 when the subsequent warp/CC
interaction changes physical trajectories after the version-6 checkpoint was
published. Older ghosts must remain rejected by the existing version gate.
The final grounded-contact fallback advances 7→8 after the version-7 checkpoint
was published. It retries a missed grounded normal ray along compatible gravity;
airborne landing rules and all persistent fields remain unchanged.
The wire/state layout is unchanged; warp entry speed and effect impact speed use
their existing serialized fields.
`contracts.lock` records the new version. The public `SHARED` parameter export
lets the track compiler use calibrated brake data and include it in cache keys.
See `17-reference-fidelity.md` for coefficients, evidence, map changes and gates.
