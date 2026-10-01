# M5 (orchestrator): driving techniques, part 1 of the user's physics spec

Source: the user's "Part 1: physics engine reverse-engineering spec". The plan and its decisions are in the orchestrator's plan file ("Driving algorithm Part 1"). Applied by the orchestrator.

## Frozen contract changes
- **`core/state.ts`**
  - New `Gear = { STOP 0, D 1, N 2, R 3 }`.
  - New integer `KartDrive` fields: `gear`, `postTicks`, `dragTicks`, `tapStreak`, `tapGap` (255 = none), `counterTicks`, `brakeTicks`.
  - `SIM_VERSION` 1 → 2, so Time Attack ghosts recorded under the old physics are invalidated.
- **`core/world.ts`:** `newKart` initial values (`gear` STOP, `tapGap` 255, the others 0). `copyWorld` already copies `drive` with `Object.assign`.
- **`core/hash.ts`:** mixes all 7 new fields.
- **`core/events.ts`:** `drag{on}`, `tapBoost{streak}`, `cut`, `brakeTurn`, `spinOut`, `gear{gear}`. These are cosmetic and stay off the wire.
- **`core/units.ts`:**
  - `KMH_PER_MPS` 5.4 → 205/34 ≈ 6.0294. The speedometer now reads 205 km/h at V_REF 34 m/s; physics is unchanged.
  - `V_BOOST` 44.4 → 45.11 (272 km/h).

## Coupled, non-frozen changes
- **Content kart `vBoost` ×(45.11/44.4):** 43.8 → 44.50, 44.4 → 45.11, 45.0 → 45.72, 45.2 → 45.92. Balance stays the same, since every body scales by the same factor.
- **Net snapshot codec** (`packages/net/src/protocol/world.ts`):
  - `drift` group: `dragTicks`, `tapStreak`, `tapGap`, `counterTicks`, `brakeTicks`;
  - `boost` group: `postTicks`;
  - `draft` group: `gear`.
- **`simVersion` literals** in `Session.ts` (which keys the ghosts), `ai/balance.ts`, `testing/scenario.ts` and `trackc/src/ghost.ts` now use `SIM_VERSION`.
