# M4 (orchestrator): hashWorld covers every field that changes a later tick

Source: the M4 determinism review. Applied by the orchestrator.

`core/hash.ts` now also mixes:
- **Race state:** `race.loc.u/h/valid`, all of `race.lastValid` (the respawn placement), `offGraphTicks`, `noGroundTicks`, `manualCooldownUntil`, `finishFrac`.
- **Lap times:** `lapStartTick`, `bestLapTicks`, `lastLapTicks`, at 1/64 tick.
- **Stats:** every `stats.*`, including `startTier`, which gates the start boost.
- **Objects:** projectile `px/py/pz`, hazard `team/radius`.

NaN, +∞ and −∞ now hash to their own sentinels instead of folding into 0.

Before this change, two worlds that differed only in these fields hashed equal, and the difference surfaced ticks or laps later. For example, a respawn 80 m apart went undetected until placement. `determinism.test`, `items-predictor` and the Node-vs-Chromium selftest all rely on this hash.

Effect: hash values change, and nothing on the wire changes; the netcode uses `flatHash`. Time Attack ghosts saved before this change fail their `finalHash` check and are re-recorded on the next best run.
