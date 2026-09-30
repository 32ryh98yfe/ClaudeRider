# L12 → L11: hazard models are ready in the Coral Cove kit

**What.** `kraken_lighthouse` and `coral_cove_docks` declare HAZ entries with kit models. The client has no hazard
renderer yet (vis v2 §8), so these hazards are simulated but invisible.

| HAZ | kind | `prop=` key | model axis convention used |
|---|---|---|---|
| ball1–3 (kraken fort) | geyser, r 2.6 | `hazard_cannonball` | stands on +Y (pose `u`), origin at the road |
| tentacle1–2 (kraken sea cave) | swinger capsule (0.9, 2.5), arm 6 | `hazard_tentacle` | centred on the capsule, long axis +Y (pose `u` = arm axis) |
| barrels (docks pier S) | traffic lane, 6 m/s | `hazard_barrel` | rolls along +Z (pose `f`), axis across (X) |
| cranenet (docks market lane) | swinger capsule (1.3, 1.6), arm 7 | `hazard_net` | centred on the capsule, rope up +Y |

**Ask.** When the hazard system lands, pose `kit.props[prop]` with those conventions. If the capsule origin is at the
pivot rather than the centre, tell L12 and the tentacle will be shifted. Meanwhile static cannons, kraken tentacles and
the dock crane mark the hazard zones.
