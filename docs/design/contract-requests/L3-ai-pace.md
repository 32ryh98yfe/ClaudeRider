# L3 request: AI tier pace, the ADR-009 constants, and the trackc reference ghost

Owner: L3 (AI). Affects: ADR-009 (orchestrator), `packages/trackc/src/ghost.ts` (L4).

## 1. What the tiers hit now

`node tools/balance/tiers.ts --seeds 2` is solo pace vs the noise-free Legend ghost, driven through the 8-tick RaceRoom
lookahead and averaged over all 12 characters. The full table covers all 16 baked tracks. `packages/sim/test/ai-pace.test.ts`
holds meadow_loop (all four tiers) and proving_ring (Pro and Legend) inside their bands.

- The reference tracks meadow_loop and bal_switchback, plus aurora, coral, fernwood, manor, sandglass, spark, sunset
  and sunstone, pass all four tiers, apart from the odd ±0.3-point edge case.
- **proving_ring** (a 700 m oval, 5 laps): Rookie is about 80% and Racer about 89%, with Pro and Legend in band.
- **belltower_piazza** (plaza) and **snowglobe_halfpipe** (halfpipe) have every tier 1–3 points fast. The *ghost* is
  the weak driver there: on belltower it hits the walls 11–14 times per race, and its time varies by 1.5 s across start
  offsets. The fix belongs in plaza and halfpipe driving (a Phase-B follow-up), not in the tier tables.

## 2. Why proving_ring cannot meet Rookie 88% / Racer 94% with the ADR-009 constants

ADR-009 fixes both `vMul` (0.93 / 0.97 / 1 / 1) and `instBoostRate` (0.15 / 0.45 / 0.8 / 0.95). Single-factor
sensitivity for Rookie, in pace points:

| change | meadow_loop | proving_ring |
|---|---|---|
| `vMul` 0.93 → 1.0 | +6.6 | +8.3 |
| `instBoostRate` 0.15 → 0.95 | +1.7 | +5.7 |
| corner/grip speed, boost skill, mistakes, line noise | ≈ 0 | ≈ 0 |

The oval's pace is mostly two long straights (vMul) and ten 180° drifts whose instant boosts carry the exit
(instBoostRate). Both levers are ADR constants and both cost more on this track than on any other. No execution knob
left to L3 separates the tracks: Rookie is 87% on meadow_loop and 80% on proving_ring with the same profile.

**Options (orchestrator's choice):**
1. *(preferred)* Amend ADR-009 so the pace targets hold on the average over the baked roster and on each reference
   track (meadow_loop, bal_switchback). Allow ±4 points per track for Rookie and Racer on instant-boost-dominated
   ovals.
2. Or retune the ADR constants: Rookie `instBoostRate` 0.15 → 0.45 and Racer 0.45 → 0.65. The pace would then come
   from `vMul` 0.91 / 0.96. That pulls the track spread from about 7 points to about 3.

## 3. Deviations from the 14-ai §2 table (not ADR values; my lane)

- Pro `driftSkill` 0.80 → **0.75**. At 0.80, Pro ran 99.5–100.6% on seven tracks, above its 99.5% ceiling. At 0.70,
  proving_ring drops to 96.3%. 0.75 is the compromise; the same kind of change as the spec's own "Legend raised" note.
- AI_EXECUTION Rookie `cornerSpeedMul` 0.90 → 0.88 (magma_switchback 90.1% → 89.0%).
- Drift styles are flavour and stay inside the tier band. `chain` no longer chops long corners into several drifts,
  which cost 2–4% on sandglass, spark and proving. It still cuts earlier, re-kicks, and keeps its +0.05 instant-boost
  rate. `long` shifts at 0.35 instead of 0.30.

## 4. trackc reference ghost (L4, `packages/trackc/src/ghost.ts`)

`meta.refLapTicks` comes from a Legend bot with the default personality and ±5% skill jitter, driven without a
lookahead. The pace reference defined in 14-ai §2 is the noise-free ghost: σ 0, driftSkill 1, instBoostRate 1, no
mistakes. The ghost's lap time is chaotic, about ±1.4% by start offset, so `ghostRaceSec` averages start offsets 0..6.
Proposed diff:

```diff
-  const driver = createAiDriver(track, content, 0, AI_TIERS.legend, {}, 11);
+  // 14-ai §2 reference: the noise-free Legend ghost (no personality, no jitter, no mistakes)
+  const driver = createAiDriver(track, content, 0, AI_TIERS.legend, { role: 'ghost', noJitter: true }, 11);
```

Optional: take `refLapTicks` as the mean best lap over `startOffsetTicks` 0..6 (`AiDriverExtras.startOffsetTicks`).
This matches `ghostRaceSec` in `packages/sim/src/ai/balance.ts`.
