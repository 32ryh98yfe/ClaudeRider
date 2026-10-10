# Control repair: kart balance validation

The control repair changes repeat drift impulses and counter-steer recovery. The previous balance test used one Legend trajectory for each body, with race seed 4242. However, `makeRig` constructed its driver with seed 99 regardless of the race seed. This was a single AI execution sample, not a sample of the race seed used by the production runner.

A trace of the balance bodies showed a 0.15 m/s² acceleration variation creating about 0.03 m of position difference before a corner lookup boundary. At s = 1039.89 versus 1040.095 m, the next plan and booster decisions diverged; the reference body used 19 boosters and the other two used 15 and 14. The resulting +2.14% and +2.10% race time deviations therefore mix physical performance with discontinuous AI plan and input timing. Disabling skill jitter alone still produced a +3.23% single-run deviation in a different body.

The revised gate keeps the original driver seed 99 and adds the pre-existing general regression race seeds 4242, 2026 and 7301, using the production driver seed mapping `(raceSeed * 7919) >>> 0`. These seeds were fixed before inspecting their outcomes. Each body is compared using the mean of all four race times, at the unchanged ±2% threshold. Every individual run must finish with zero respawns and zero hard wall hits. No kart statistics were changed to fit the test.

The 128-run diagnostic includes the same four samples with and without skill jitter, on both tracks. All 128 finished with zero respawns and zero hard wall hits. The default-jitter four-sample means have maximum absolute deviation 1.225% on Meadow Loop and 1.108% on Proving Ring. Without skill jitter the maxima are 1.298% and 1.022%. The test uses ordinary skill jitter; the extra runs are diagnostics.

All ticks, exact deviations, seed mapping and collision/recovery counts are retained in [control-balance-validation.json](./control-balance-validation.json). `node tools/bench/balance.ts` reproduces the four-sample test and prints every seed.

## clayhill_village/meadow_loop, skill jitter enabled

| Body | Legacy AI 99 | Race 4242 | Race 2026 | Race 7301 | Four-run mean |
|---|---:|---:|---:|---:|---:|
| pebble | -0.311% | +1.577% | +1.229% | +0.842% | +0.838% |
| clay_comet | +2.140% | -1.496% | +0.262% | +0.843% | +0.427% |
| arrowhead | -0.842% | -0.491% | -1.274% | -0.400% | -0.752% |
| tugboat | +2.101% | +1.575% | +0.092% | +0.873% | +1.160% |
| glacier_sled | -1.167% | -1.608% | -1.218% | -0.897% | -1.225% |
| neon_blade | -0.168% | +0.409% | -0.136% | -0.510% | -0.099% |
| jet_kettle | -1.060% | -0.296% | -2.163% | -1.215% | -1.181% |
| crown_cruiser | -0.693% | +0.331% | +3.209% | +0.464% | +0.831% |

## clayhill_village/meadow_loop, skill jitter disabled

| Body | Legacy AI 99 | Race 4242 | Race 2026 | Race 7301 | Four-run mean |
|---|---:|---:|---:|---:|---:|
| pebble | -0.070% | +1.791% | +0.989% | +0.099% | +0.704% |
| clay_comet | -0.287% | -0.220% | +0.422% | +0.145% | +0.016% |
| arrowhead | +3.228% | +1.645% | -0.769% | +0.728% | +1.202% |
| tugboat | -0.149% | -0.184% | +1.698% | +0.305% | +0.421% |
| glacier_sled | -0.227% | -1.254% | -2.017% | -0.434% | -0.986% |
| neon_blade | -1.370% | -0.355% | +1.960% | -0.078% | +0.044% |
| jet_kettle | -1.429% | -1.048% | -2.043% | -0.662% | -1.298% |
| crown_cruiser | +0.304% | -0.374% | -0.240% | -0.101% | -0.103% |

## spark_circuit/proving_ring, skill jitter enabled

| Body | Legacy AI 99 | Race 4242 | Race 2026 | Race 7301 | Four-run mean |
|---|---:|---:|---:|---:|---:|
| pebble | -0.418% | -0.495% | -0.315% | -0.354% | -0.396% |
| clay_comet | -0.418% | -0.488% | -0.316% | -0.354% | -0.394% |
| arrowhead | +0.232% | -0.078% | -0.031% | +0.081% | +0.051% |
| tugboat | -0.361% | -0.489% | -0.314% | -0.363% | -0.382% |
| glacier_sled | +1.200% | +1.026% | +1.038% | +1.168% | +1.108% |
| neon_blade | -0.454% | -0.594% | -0.198% | -0.179% | -0.357% |
| jet_kettle | +0.045% | +1.187% | +0.164% | -0.008% | +0.348% |
| crown_cruiser | +0.173% | -0.069% | -0.027% | +0.009% | +0.021% |

## spark_circuit/proving_ring, skill jitter disabled

| Body | Legacy AI 99 | Race 4242 | Race 2026 | Race 7301 | Four-run mean |
|---|---:|---:|---:|---:|---:|
| pebble | -0.320% | -0.433% | -0.395% | -0.307% | -0.364% |
| clay_comet | -0.309% | -0.431% | -0.395% | -0.330% | -0.366% |
| arrowhead | +0.060% | -0.359% | -0.026% | -0.117% | -0.111% |
| tugboat | -0.292% | -0.410% | -0.327% | -0.335% | -0.341% |
| glacier_sled | +0.996% | +0.963% | +1.075% | +1.055% | +1.022% |
| neon_blade | -0.265% | -0.371% | -0.136% | -0.113% | -0.221% |
| jet_kettle | +0.087% | +1.160% | +0.224% | +0.128% | +0.400% |
| crown_cruiser | +0.042% | -0.119% | -0.020% | +0.018% | -0.020% |
