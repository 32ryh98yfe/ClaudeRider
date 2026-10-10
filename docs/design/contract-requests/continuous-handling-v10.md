# Simulation 10 continuous-handling contract

Authorized by the user's sequential handling requests and live play-test feedback.
The normative behavior is described in `../19-continuous-handling.md`.

`KartDrive` adds `driftArmed`, `driftIntentTicks`, `driftEngagement`, `driftTarget`,
`driftTightness`, `driftRecovering`, and `pendingDriftDir`. All fields initialize to
zero. The three continuous values quantize at 1/32768 and participate in the world
hash at that scale; the other four hash as integers. The network world's drift
group serializes every field in full and delta snapshots. A cloned/reconciled
world therefore retains the same input-consumption and recovery behavior.

An external drift cancellation clears all seven fields through `clearDriftTech`.
A normal completed recovery may carry one explicit pending press into the next
entry. Held Shift alone is not a new entry. Braking/counter-steering can cancel
minimum skid intent; its 36 ticks do not lock controls.

The independent input-contract changes add raw steering intent and an ordered
press FIFO. Handling consumes the FIFO in order and uses its direction independently
from steering interpolation. Existing AI held-edge production remains supported.

Simulation version 10 is a trajectory compatibility boundary. The root task owns
the version bump and final frozen-contract digest refresh. Old ghosts are rejected
by the existing version check. No migration silently rewrites old inputs or world
state, and live development sessions must start a fresh world after the schema
change.

Camera targets add optional `gripSpeed`/`boostSpeed` in m/s. These fields normalize
presentation only and do not affect simulation, replay hashing or input transport.
Adaptive high-speed movement and compiler V10 probes add no persistent world fields.

Verification includes field hash/clone coverage, snapshot/rollback integration,
shared authority/AI steering control, independent planar oracle traces, native
keyboard trajectories, and all-kart reward tests. Final full-map and network gates
are recorded by the root integration report rather than implied by this amendment.
