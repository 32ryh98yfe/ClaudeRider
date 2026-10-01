# S-AI: key gates missed by the sMain quantization (race rules bug, not AI)

**Owner of the fix:** sim race rules (`packages/sim/src/race/progress.ts`), or trackc if the gates should be baked on the grid. S-AI does not own either path.

## What happens
`advanceLaps()` credits key gate `g` when `prevS <= gs && newS > gs`. `newS` is the unquantized main-line station of this tick; `quantizeWorld()` then rounds `loc.sMain` to the 1/4096 grid (`Q.POS`), and the next tick's `prevS` is that rounded value.

Several baked gates sit just below a grid point because of float accumulation in the bake: `spark_grand_circuit` gate 5 is `1299.9999999999998`, and an earlier one is `699.9999999999998`. When a kart's raw `newS` lands in `(gs − 1/8192, gs]`:
- this tick: `newS <= gs`, so the gate is not credited;
- quantization rounds `sMain` up to `1300.0`;
- next tick: `prevS = 1300.0 > gs`, so the gate is never credited.

The kart then crosses the line without a full `keyMask`. No lap is counted and `raceDist` drops back by a lap length, so the kart drives a whole extra lap. Point-to-point finishes have the same problem whenever `L` is just below a grid point (`prevS <= L && newS > L`).

## Repro
- **8 Pro race.** races.test setup: `makeRig(bakedTrack('spark_circuit/spark_grand_circuit'), { mode: 'speed', slots: 8 pro bots, seed: 4242 })` at S-AI commit `f1a270e`.
  - Kart 1 at tick 4785: `prev sMain 1299.43335 → 1300.0`; `keyMask` stays `31` (gates 0–4).
  - It drives on at 33–45 m/s for 2400 ticks while `raceDist` stays a lap behind its peak.
  - races.test reported this as "stuck 2408 ticks", and only 7/8 karts finished.
- **Ghost.** Legend ghost, `startOffset 1`, seed 1: gate missed at tick 1459, which costs one extra lap (159 s race).

## Fix (either one)
1. In `progress.ts`, compare against the gate rounded to the grid that `sMain` is stored on:
   ```diff
   -        const gs = gates[g]!;
   +        const gs = Math.round(gates[g]! * Q.POS) / Q.POS; // sMain lives on the Q.POS grid (quantizeWorld)
   ```
   Make this change in both gate loops (circuit and point-to-point), and do the same for the point-to-point finish `L`. With the gate on the grid, a raw `newS` just below it rounds to exactly `gs`, and the next tick's `prevS <= gs && newS > gs` credits it.
2. Or bake `keyGates` (and the point-to-point length) onto the 1/4096 grid in trackc.

The change alters the simulation, so it needs a `SIM_VERSION` bump.

## Interim
`packages/sim/test/races.test.ts` now measures "stuck" by the distance driven along the main line rather than by `raceDist`, so a lap-credit miss is no longer reported as a stuck bot. The ≥ 7/8 finisher bound still applies.
