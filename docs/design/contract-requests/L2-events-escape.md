# L2 request: `escape` sim event (additive, `packages/sim/src/core/events.ts`)

**Lane:** L2 ITEMS · **Status:** applied under the additive grant; `node tools/check-frozen.mjs --update` was run.

## What
One new member of the `SimEventBody` union. No existing member changed.

```diff
   | { t: 'mash'; kart: number; remaining: number }
+  | { t: 'escape'; kart: number; effect: number; fast: boolean; credits: number } // L2: a mash-out trap ended ("빠른 탈출!" when fast)
   | { t: 'lap'; kart: number; lap: number; lapTicks: number; best: boolean }
```

## Why
The HUD must show "빠른 탈출! / Quick escape!" when a trap (`trap_bomb`, `trap_bug`) ends at its 48-tick floor (12-items-spec §6.4, 31-ui-spec "Mash prompt"). By the time the client sees `effectEnd`, `KartStatus.ccStart/ccEnd` are already canonicalized to 0, so it can't work out whether the escape was fast. Challenges also count `trapsEscapedFast` (13-modes-rules §10).

- Emitted in phase 8 by `items/effects.ts endEffects()` when a hard CC with a `mash` definition ends.
- Fields:
  - `effect`: the trap's effect code.
  - `fast`: `ccEnd − ccStart ≤ floorTicks`.
  - `credits`: the number of credited taps.
- Dedupe key: `evKey(tick, 92, kart)`.

## Impact
- Purely additive. `switch (e.t)` statements without a `default` branch keep compiling.
- No wire change: sim events are cosmetic and are not in snapshots or EVENTS.
- The other state files (`state.ts`, `world.ts`, `quant.ts`, `hash.ts`) are **unchanged**. The item runtime fits into the existing B2 fields (see `L2-notes.md` §1), so there's no snapshot-codec impact for L9.
