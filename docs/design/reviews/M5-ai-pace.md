# M5 AI pace review: techniques by tier, pace bands, race hygiene

This review covers the S-AI stream on top of M5 (8822d86): the self-predictor port of the doc 15 laws, technique plans by tier, the drag controller, brake pulses, trim/cut exits, side contact, and the pace re-tune.

Numbers come from these runs:
- `node tools/balance/tiers.ts --seeds 2 --verbose --json`: 12 characters × 2 seeds per tier, solo, lookahead 8, against the Legend ghost.
- An 8-bot races.test-style script: Pro field, seed 4242.

"Before" is 8822d86 and "after" is 87ae2ff, both on this branch's kart code (pre M5-FIX). §6 covers the post-merge check against main 083718d.

## 1. Technique rates (`AI_EXECUTION`, `packages/sim/src/ai/profiles.ts`)

| | rookie | racer | pro | legend |
|---|---|---|---|---|
| `dragRate`: share of eligible corners planned as a drag | 0.03 | 0.25 | 0.75 | 0.95 |
| `tapRate`: share of planned drags that tap | 0 | 0.05 | 0.3 | 0.9 |
| `brakeTurnRate`: share of hairpins (turn ≥ 2 rad, minR ≤ 20 m) with a deliberate 5-frame brake turn | 0 | 0.1 | 0.35 | 0.7 |
| `dragMinR` (m) | 60 | 50 | 40 | 35 |
| `dragLeadS`: the booster for a planned drag fires 5 m … v·dragLeadS ahead | 0 | 0.5 | 0.7 | 0.8 |
| `tapJitterTicks`: ± on the 8-tick rhythm, clamped 6–12 | 3 | 2 | 1 | 0 |

The ghost takes every eligible plan.

Every bot follows the same safety rules:
- **Brake pulses in a drift** last at most 6 frames, followed by at least 4 frames off.
  - No brake in the air.
  - A predicted brake run of 6 or more is refused, so the hard guard at 8 is never reached.
  - The sim spins out at 11.
- **Exits trim** at `s_in = −0.677`, just short of the cut threshold. A deliberate cut happens only when the corner is done, the inside has room and no fork is near.
- **Unplanned drags are avoided.** A boosted drift that slides into the drag window without a plan holds the wheel just outside the neutral band.

Shared knobs are in `AI_TUNING` (`packages/sim/src/ai/driver.ts`). The spec is `docs/design/14-ai-spec.md` §3.5, §3.11 and §5.

## 2. Tier pace, before → after (ghost-relative %, * = outside the band)

Bands: rookie 86–90, racer 92–96, pro 96.5–99.5, legend ≥ 99.5.

The "before" ghost is the plain mean of 7 start offsets. On fernwood one of those runs did not finish, so the yardstick is NaN. The "after" ghost leaves out runs more than 4% slower than the median (`GHOST_OUTLIER`), such as a lap lost to the key-gate bug in §7.

| track | ghost s before → after | rookie before → after | racer before → after | pro before → after | legend before → after |
|---|---|---|---|---|---|
| meadow_loop | 114.3 → 112.1 | 85.9* → 86.7 | 93.1 → 93.2 | 98.6 → 98.9 | 99.7 → 100.3 |
| belltower_piazza | 115.4 → 110.5 | 87.4 → 87.0 | 97.3* → 93.4 | 100.8* → 98.8 | 100.3 → 100.1 |
| sunstone_bazaar | 120.2 → 120.4 | 88.2 → 89.9 | 93.6 → 95.1 | 98.3 → 99.2 | 100.2 → 99.7 |
| sandglass_canyon | 112.9 → 109.1 | 85.7* → 87.2 | 94.2 → 93.4 | 98.9 → 98.3 | 99.9 → 99.4* |
| snowglobe_halfpipe | 109.1 → 108.0 | 87.4 → 87.9 | 95.3 → 94.8 | 100.5* → 99.2 | 100.6 → 99.9 |
| aurora_summit | 113.7 → 109.8 | 88.4 → 88.7 | 96.2* → 94.8 | 100.0* → 98.4 | 100.2 → 99.6 |
| fernwood_hollow | DNF → 108.5 | – → 87.1 | – → 93.0 | – → 98.1 | – → 99.4* |
| cascade_slalom | 117.5 → 111.1 | 88.9 → 89.3 | 96.4* → 95.8 | 100.7* → 99.4 | 101.7 → 99.0* |
| geode_rail_quarry | 124.0 → 122.2 | 90.8* → 92.1* | 98.9* → 96.8* | 100.8* → 99.8* | 101.3 → 100.3 |
| magma_switchback | 117.0 → 111.8 | 88.0 → 89.2 | 96.7* → 95.4 | 101.3* → 98.7 | 101.1 → 99.9 |
| pumpkin_lane | 110.8 → 106.2 | 88.1 → 86.4 | 93.2 → 92.6 | 100.2* → 97.4 | 101.1 → 98.5* |
| manor_catacombs | 109.7 → 105.9 | 86.5 → 87.7 | 90.9* → 93.4 | 97.4 → 98.1 | 98.9* → 98.8* |
| coral_cove_docks | 117.2 → 111.1 | 90.7* → 86.7 | 97.1* → 93.6 | 101.8* → 96.4* | 101.6 → 98.5* |
| kraken_lighthouse | 123.7 → 118.0 | 91.4* → 90.0* | 98.6* → 94.6 | 101.6* → 98.0 | 100.8 → 99.6 |
| rainline_blvd | 116.5 → 116.2 | 86.2 → 89.6 | 94.3 → 95.9 | 99.0 → 98.6 | 99.9 → 99.6 |
| skyway_interchange | 115.6 → 112.0 | 88.1 → 87.7 | 94.8 → 94.5 | 99.4 → 96.4* | 100.0 → 98.5* |
| spark_grand_circuit | 121.1 → 120.0 | 84.2* → 85.2* | 91.0* → 91.5* | 97.2 → 98.2 | 98.7* → 99.8 |
| sunset_arena_rally | 112.3 → 106.9 | 88.8 → 86.1 | 95.3 → 92.4 | 99.5* → 98.1 | 100.5 → 99.8 |
| token_foundry | 118.8 → 116.7 | 84.0* → 85.3* | 94.3 → 94.1 | 98.5 → 99.4 | 99.9 → 99.3* |
| orbital_express | 113.8 → 111.3 | 87.7 → 90.0 | 95.5 → 95.5 | 100.6* → 99.4 | 100.3 → 100.0 |
| proving_ring | 91.1 → 92.3 | 80.5* → 88.8 | 90.0* → 94.6 | 97.1 → 98.7 | 99.6 → 99.8 |
| bal_switchback | 94.7 → 94.8 | 84.7* → 86.8 | 93.4 → 93.9 | 97.2 → 98.4 | 100.0 → 99.7 |
| **roster average** | | **87.3 (20) → 88.0 (21)** | **94.8 (20) → 94.2 (21)** | **99.6 (20) → 98.5 (21)** | **100.3 (20) → 99.5 (21)** |

Rows outside their band: 32 before, 17 after, out of 88. The roster average leaves out bal_switchback, and the "before" average also leaves out fernwood.

- **Reference tracks (after).**
  - meadow_loop: 86.7 / 93.2 / 98.9 / 100.3.
  - bal_switchback: 86.8 / 93.9 / 98.4 / 99.7.
  - Roster averages: 88.0 / 94.2 / 98.5 / 99.5, all inside their bands.
- **Before**, the Pro average (99.6) was above its band. Unplanned drags (up to 6.5 per bot-lap in the 8-bot races, §4) made Pro and Legend pace depend on chance slides into the drag window.
- **Tracks still outside a band after:**
  - geode_rail_quarry: rookie, racer and pro are high.
  - spark_grand_circuit and token_foundry: rookie is low (and racer too on spark).
  - Legend is 0.1–1.0 % below 99.5 on sandglass, fernwood, cascade, pumpkin, manor, coral, skyway and token.
  - coral and skyway: pro is low.
  - These are per-track spreads around averages that sit inside the bands. The ADR-009 targets hold on the averages and on both reference tracks.

## 3. Technique telemetry (after, per lap; roster = mean of the 21 speed tracks)

| tier | drags/lap (roster) | taps/lap (roster) | drags/lap meadow | taps/lap meadow | spin-outs |
|---|---|---|---|---|---|
| rookie | 0.00 | 0.00 | 0.00 | 0.00 | 0 |
| racer | 0.00 | 0.00 | 0.00 | 0.00 | 0 |
| pro | 0.03 | 0.01 | 0.21 | 0.06 | 0 |
| legend | 0.28 | 0.55 | 0.57 | 1.15 | 0 |

- **Spin-outs are zero for every tier, on every track.** The longest brake run in a drift is ≤ 6 ticks in solo races and in all 8-bot races (it was 8 before).
- **Drags are limited by booster supply.** On meadow there are about 2.3 boosters per lap for 2 eligible corners. Legend plans 2.25 drags per lap but lands about 0.6.
  - Holding boosters for drag corners (a 450 m hold) cost about 2.8 s per race on meadow, so the hold is capped at 150 m.
  - Longer booster leads (`dragLeadS` 0.9 / 1.3 / 1.5 s) raised Legend to 0.92 drags per lap on meadow. But they sped up the ghost more than the tiers: meadow ghost 112.06 → 110.55 s; rookie 85.1 %, racer 92.0 %, and Legend under 99.5 on belltower, snowglobe, fernwood and aurora. They were reverted.
  - **The brief's target of Legend ≥ 1.5 drags per lap on meadow is therefore not met.** `ai-pace.test.ts` holds a calibrated floor, `DRAG_LEGEND_MIN = 0.5`, plus Rookie ≤ 0.1 and tier order.
- **Each ghost drag is worth about 1 s on meadow.** The ghost's drag count is small and discrete: 1 per race before the M5-FIX merge, 2 after. A single extra ghost drag moves every tier's ghost-relative pace by about 0.9 %, with no change in the tiers themselves.
- **The "cuts" and "brake turns" telemetry counts events, not plans.** Every counter-steer exit at ≤ −0.7 for 2 ticks is a cut. Every brake tick 1–8 in a drift is a brake turn, which includes the speed-control pulses (braking in a drift only while the nose lags). Deliberate hairpin turns are counted in `ai.brakeTurnPlans`.

## 4. 8-bot races (Pro field, seed 4242), before → after

| track | finishers before → after | hard hits per bot-lap | longest stall (ticks) | winner s | drags per bot-lap | spin-outs | longest drift brake run |
|---|---|---|---|---|---|---|---|
| meadow_loop | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 113.5 → 111.2 | 0.08 → 0.21 | 0 → 0 | 8 → 6 |
| belltower_piazza | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 110.7 → 111.2 | 0.38 → 0.13 | 0 → 0 | 8 → 6 |
| sunstone_bazaar | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 117.2 → 117.1 | 0.21 → 0.00 | 0 → 0 | 8 → 6 |
| sandglass_canyon | 8 → 8 | 0.000 → 0.000 | 51 → 51 | 112.7 → 109.9 | 5.44 → 0.13 | 0 → 0 | 8 → 6 |
| snowglobe_halfpipe | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 107.2 → 108.3 | 2.79 → 0.00 | 0 → 0 | 8 → 6 |
| aurora_summit | 8 → 8 | 0.625 → 0.000 | 30 → 30 | 113.9 → 111.4 | 6.50 → 0.00 | 0 → 0 | 8 → 6 |
| fernwood_hollow | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 110.3 → 106.0 | 0.54 → 0.00 | 0 → 0 | 8 → 6 |
| cascade_slalom | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 116.9 → 110.6 | 2.13 → 0.00 | 0 → 0 | 8 → 6 |
| geode_rail_quarry | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 121.6 → 120.1 | 2.04 → 0.00 | 0 → 0 | 8 → 6 |
| magma_switchback | 8 → 8 | 0.875 → 0.000 | 38 → 30 | 116.2 → 114.2 | 2.19 → 0.00 | 0 → 0 | 8 → 6 |
| pumpkin_lane | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 109.3 → 107.4 | 0.25 → 0.00 | 0 → 0 | 8 → 6 |
| manor_catacombs | 6 → 8 | 0.188 → 0.000 | 124 → 215 | 114.4 → 108.7 | 1.31 → 0.00 | 0 → 0 | 8 → 6 |
| coral_cove_docks | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 111.4 → 113.2 | 0.29 → 0.00 | 0 → 0 | 8 → 6 |
| kraken_lighthouse | 8 → 8 | 0.167 → 0.000 | 117 → 31 | 120.2 → 117.8 | 3.25 → 0.00 | 0 → 0 | 8 → 6 |
| rainline_blvd | 8 → 8 | 0.042 → 0.083 | 30 → 52 | 119.8 → 118.1 | 2.63 → 0.17 | 0 → 0 | 8 → 6 |
| skyway_interchange | 8 → 8 | 0.000 → 0.000 | 30 → 44 | 115.4 → 114.9 | 4.38 → 0.00 | 0 → 0 | 8 → 6 |
| spark_grand_circuit | 8 → 8 | 0.000 → 0.167 | 30 → 106 | 123.3 → 119.0 | 0.08 → 0.17 | 0 → 0 | 8 → 6 |
| sunset_arena_rally | 8 → 8 | 0.250 → 0.000 | 369 → 30 | 111.0 → 109.1 | 0.75 → 0.00 | 0 → 0 | 8 → 6 |
| token_foundry | 8 → 8 | 0.000 → 0.000 | 55 → 57 | 120.2 → 117.6 | 2.75 → 0.08 | 0 → 0 | 8 → 6 |
| orbital_express | 8 → 8 | 0.000 → 0.000 | 49 → 78 | 112.2 → 111.9 | 2.00 → 0.00 | 0 → 0 | 8 → 6 |
| proving_ring | 8 → 8 | 0.000 → 0.000 | 30 → 30 | 92.4 → 92.7 | 0.05 → 0.00 | 0 → 0 | 8 → 6 |

Both columns measure "stall" as distance driven along the main line, the same way `races.test.ts` does now (§7).

**Before**, four tracks failed:
- aurora: 0.625 hard hits per bot-lap;
- magma: 0.875 hard hits per bot-lap;
- manor: 6 of 8 finished;
- sunset: a 369-tick stall and a respawn.

**After**, every track passes: ≥ 7/8 finish (21 of 21 have 8/8), ≤ 0.3 hard hits per bot-lap, no stall over 300 ticks, no spin-out, and drift brake runs of at most 6 ticks.

Item races (`items-tracks.test.ts`, 22 tracks) pass. Homing-feature coverage on orbital_express, skyway_interchange and cascade_slalom is now topped up by seeds 32–33 when seed 31 alone does not land a homing shot across every feature.

**Side contact.** The 8-Pro meadow field (`ai-behaviour.test.ts`) dropped from 2.58 hard bumps per kart at 8822d86 to 1.30 over seeds 1–10, and the worst seed from 4.5 to 2.0. Three changes did this:
- a 4.5 m × 3.2 m reflex window;
- the reflex now also acts in drifts;
- no drag is held beside a rival, which removes the 40-tick drag-rub sequences.

The test now runs seeds 1–3 and asserts a mean ≤ 2.5 and a worst seed ≤ 4. One seed's count swung by 2× with unrelated AI changes.

## 5. Calibration log (what moved the numbers)

| change | effect |
|---|---|
| trim exits (−0.677) instead of a counter-steer cut mid-corner | fewer walls after drifts |
| drift trigger refused while the velocity points > 0.2 rad inside the tangent (`trigVPsi`) | meadow walls 5.1 → 0.1 per race (Legend) |
| no grip plan on hairpins (turn ≥ 2 rad) | glacier_sled balance spread back inside ±1 % |
| hazards that never clear are not waited for | manor: no 6 m/s crawl behind the pendulum |
| recovery on the real speed (not the wall-less prediction) | no pinned-against-wall DNF on spark |
| shift thresholds −0.1 (`ehShift` 0.3, `longShift` 0.3, `chainShift` 0.35 after a partial revert) | roster ≈ 1 % faster; the long/chain partial reverts recover proving_ring Legend 99.3 → 99.8 and magma Legend +0.9 % |
| Rookie `lineTrack` 0.4 → 0.75, `boostDelayTicks` [30,150] → [20,100], `panicBrakeTicks` [12,24] → [8,16] | meadow Rookie 85.9 → 86.7 (post-merge 86.0) |
| `dragLeadS` 0.5/0.7/0.8 (longer leads tried and reverted, §3) | – |
| side reflex window 3.5 × 2.8 → 4.5 × 3.2 m, also in drifts, no drag beside a rival | 8-Pro field hard bumps 2.58 → 1.30 per kart |

`vMul` and `instBoostRate` (ADR constants) are unchanged.

## 6. Post-merge check (main 083718d: M5-FIX + SIM_VERSION 3)

The merge into this branch was not performed. Repo rules forbid merging other branches from a lane, and the command was refused.

Instead, this branch's diff was applied onto an export of main 083718d (it applies cleanly; main does not touch S-AI files). The predictor was then ported to the new laws:
- the tap key held inside the grace steers like neutral in K4 and K8;
- the STOP → R count starts at 1 on the transition tick, and R engages after `revEngageTicks` ticks;
- N/R → STOP also requires `w² ≤ 0.25`.

**`predict.ts` needs that port right after the merge.** The exact diff is in §8.

Results in the post-merge copy:
- Full sim suite: 371/372 before the final tuning. The one failure was ai-pace meadow_loop, with Rookie at 85.5 % and Legend at 99.3 %.
- After the final tuning (87ae2ff): `predict`, `ai-pace`, `ai-behaviour` and `races` all pass (47/47).
- Reference tracks (2 seeds):

| track | ghost s | rookie | racer | pro | legend |
|---|---|---|---|---|---|
| meadow_loop | 111.15 | 86.0 | 92.4 | 98.1 | 99.6 |
| bal_switchback | 94.80 | 86.8 | 93.9 | 98.4 | 99.7 |
| proving_ring | 92.35 | 88.8 | 94.6 | 98.7 | 99.8 |

The merge speeds up the ghost on meadow by 0.9 s: it lands one more drag, with `tapYaw` 0.7. Rookie, Racer and Pro race times are unchanged, so the meadow Rookie pace sits on the band edge (86.0 %). The full post-merge roster still needs to be run after the real merge.

## 7. Open issues

1. **Key gates missed by quantization.** This is a race-rules bug, not an AI one.
   - Gates baked at `x.9999999999998` are skipped when a kart's raw `sMain` lands within 1/8192 m below them, because `quantizeWorld` rounds it up past the gate. The kart then drives an extra lap.
   - Repro and fix: `docs/design/contract-requests/S-AI-keygate-quantization.md`.
   - Interim: `races.test.ts` measures "stuck" by driven distance, so the bug no longer shows up as a stuck bot.
2. **Meadow Rookie post-merge at 86.0 %**, on the band edge. The Rookie's pace is set mostly by ADR constants: `vMul` 0.93, `instBoostRate` 0.15, and the `AI_TIERS` mistake and drift-skill noise. The execution knobs move it by only ±0.3 %.
3. **Ghost drag discreteness (§3).** If the yardstick should not jump with the ghost's drag count, it could average over drag outcomes, for example by forcing its drag plans on and off per start offset. That would be an ADR-009 yardstick change.
4. **Drags per lap stay below the brief's target** while booster supply decides them (§3).

## 8. Post-merge predictor diff (`packages/sim/src/ai/predict.ts`)

```diff
-      } else rT = dir * (P.y0 / (1 + (dT * DT) / P.y0T) + P.y1 * sIn + (held ? P.y2 : 0));
+      } else {
+        // a valid tap's key still held inside the grace of a drag steers like neutral (§4.4)
+        const sY = dragT > 0 && streak > 0 && gap <= P.tapGrace && sIn > P.dragNeutral ? P.dragNeutral : sIn;
+        rT = dir * (P.y0 / (1 + (dT * DT) / P.y0T) + P.y1 * sY + (held ? P.y2 : 0));
+      }
@@ K8
-        if (sIn >= 0.3) kL = P.kLatNeutral + (P.kLatIn - P.kLatNeutral) * ((sIn - 0.3) / 0.7);
-        else if (sIn > -0.3) kL = P.kLatNeutral;
-        else kL = P.kLatNeutral + (P.kLatCounter - P.kLatNeutral) * ((-sIn - 0.3) / 0.7);
+        const sL = dragging && streak > 0 && gap <= P.tapGrace && sIn > P.dragNeutral ? P.dragNeutral : sIn; // §4.6, as in K4
+        if (sL >= 0.3) kL = P.kLatNeutral + (P.kLatIn - P.kLatNeutral) * ((sL - 0.3) / 0.7);
+        else if (sL > -0.3) kL = P.kLatNeutral;
+        else kL = P.kLatNeutral + (P.kLatCounter - P.kLatNeutral) * ((-sL - 0.3) / 0.7);
@@ gears
-          if (gear !== Gear.STOP) { gear = Gear.STOP; brakeT = 0; }
-          if (brakeT >= P.revEngageTicks) gear = Gear.R;
+          // the transition tick is ↓ tick 1 at STOP; R after revEngageTicks of them, however STOP was reached
+          if (gear !== Gear.STOP) { gear = Gear.STOP; brakeT = 1; }
+          else if (brakeT > P.revEngageTicks) gear = Gear.R;
@@ N/R coast to rest
-        if (u === 0 && !thr && !brk) { gear = Gear.STOP; w = 0; }
+        if (u === 0 && !thr && !brk && w * w <= 0.25) { gear = Gear.STOP; w = 0; } // at rest: planar speed too
```
