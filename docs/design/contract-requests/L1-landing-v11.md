# L1: jump landings and trackc V11 (no change for L4)

## Decision

**The sim changes; V11 stays as it is.** No edit to `packages/trackc` is needed.

## What was wrong

`packages/trackc/test/f2.test.ts` ("a kart flies the gap and lands where the V11 ballistic model says") measured a
touchdown 3.44 m past the V11 prediction, against a 2.5 m tolerance.

A tick-by-tick trace of that run showed that the air model already matched V11 exactly: gravity is 28 m/s², there is
no air drag, and `vy` falls by 0.467 m/s per tick. The whole gap came from a provisional landing rebound that L1 had
added. It was not in the spec:

- On a hard landing (impact above 6 m/s), the kart was kicked back up at `min(1.5, 0.08·(impact − 6))` m/s.
- That cleared `grounded` for about 3 ticks, roughly 2.3 m at 40 m/s.
- The test records `landedAt` at the first grounded tick, so it saw the kart come down again after the hop instead of
  the real touchdown.

## Change (L1, `packages/sim/src/kart/motion.ts`)

- The rebound is removed. A landing now does what 10-sim-spec §10.2 step 4 says:
  - it removes the normal speed;
  - above a 6 m/s impact, it applies the `min(0.12, 0.01·(v_imp − 6))` loss;
  - it emits `land{impact}` on every landing (the old gate `impact ≥ 2 || airTicks > 10` only existed to hide
    re-landings after a rebound);
  - the kart stays grounded from the touchdown tick.
- With the rebound gone, the F2 test measures a touchdown at s 413.83 against V11's 412.37. The 1.46 m left over is
  one tick of sampling at 43 m/s plus the tick after the lip that the test uses as takeoff. All 16 tests in f1/f2
  pass.

## Contract

The only contract visible to other lanes is the `land` event. It now fires once per landing with its `impact`,
including soft 0–2 m/s touchdowns after crest hops. The client should scale landing FX by `impact`; it should not
assume that a `land` event means a hard landing.
