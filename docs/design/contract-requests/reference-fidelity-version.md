# Reference fidelity version 6

The user's approved fidelity plan supersedes the old track-byte and corner-number
preservation requirement. Orchestrator-approved frozen change: `SIM_VERSION`
5→6 in `packages/sim/src/core/state.ts`. The wire/state layout is unchanged.
`contracts.lock` records the new version. The public `SHARED` parameter export
lets the track compiler use calibrated brake data and include it in cache keys.
See `17-reference-fidelity.md` for coefficients, evidence, map changes and gates.
