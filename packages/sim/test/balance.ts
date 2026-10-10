// Archetype lap spread: four predeclared Legend runs per body, keeping the old rig's actual AI seed and the
// three general-regression seeds. Per-corner plan RNG depends on the trajectory: a single run confounds a small
// kart difference with an extra booster/drag plan. Compare body means at the unchanged ±2% threshold, and keep
// every run's finish/collision/recovery result. Method and all observed rows: control-balance-validation.md.
import { AI_TIERS, Phase, createAiDriver, raceTicksOf } from '@cr/sim';
import { bakedTrack, getContent, makeRig } from './rig.ts';

export const KART_IDS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;

export const BALANCE_SAMPLES = [
  // makeRig historically ignored cfg.seed for the driver and always constructed slot 0 with AI seed 99.
  { label: 'legacy', raceSeed: 4242, driverSeed: 99 },
  ...[4242, 2026, 7301].map((seed) => ({ label: String(seed), raceSeed: seed, driverSeed: (seed * 7919) >>> 0 })),
] as const;
export interface BalanceTrial { label: string; raceSeed: number; driverSeed: number; ticks: number; respawns: number; hardHits: number }
export interface BalanceRow { kart: string; ticks: number; dev: number; respawns: number; hardHits: number; trials: BalanceTrial[] }

/** Race time (ticks) of one Legend bot on `kart`, alone on the track; −1 if it did not finish. */
export function soloLegend(rel: string, kart: string, laps?: number, sample: (typeof BALANCE_SAMPLES)[number] = BALANCE_SAMPLES[0]): { ticks: number; respawns: number; hardHits: number } {
  const slots = [{ kind: 'bot' as const, characterId: 'clay' as const, kartBodyId: kart as 'pebble', name: kart, ai: 'legend' as const, vMul: AI_TIERS.legend.vMul }];
  const rig = makeRig(bakedTrack(rel), { mode: 'speed', slots, seed: sample.raceSeed, laps });
  rig.bots[0] = createAiDriver(rig.track, getContent(), 0, AI_TIERS.legend, {}, sample.driverSeed);
  const w = rig.w, k = w.karts[0]!;
  while (w.phase !== Phase.DONE && k.race.finishTick < 0 && w.tick < 60 * 60 * 6) rig.tick();
  return { ticks: k.race.finishTick >= 0 ? raceTicksOf(w, k) : -1, respawns: k.stats.respawns, hardHits: k.stats.hardHits };
}

export function balanceTable(rel: string, laps?: number): BalanceRow[] {
  const rows = KART_IDS.map((kart) => {
    const trials = BALANCE_SAMPLES.map((sample) => ({ ...sample, ...soloLegend(rel, kart, laps, sample) }));
    return { kart, trials, ticks: trials.every((r) => r.ticks > 0) ? trials.reduce((s, r) => s + r.ticks, 0) / trials.length : -1,
      respawns: trials.reduce((s, r) => s + r.respawns, 0), hardHits: trials.reduce((s, r) => s + r.hardHits, 0), dev: 0 };
  });
  const done = rows.filter((r) => r.ticks > 0);
  const mean = done.reduce((a, r) => a + r.ticks, 0) / Math.max(1, done.length);
  for (const r of rows) r.dev = r.ticks > 0 ? r.ticks / mean - 1 : NaN;
  return rows;
}
