// Archetype lap spread (02-contracts L1 row, 10-sim-spec §14.8): one Legend bot alone on the track per kart body;
// the race times of all 8 bodies stay within ±2% of their mean. Shared by balance.test.ts and tools/bench/balance.ts.
import { AI_TIERS, Phase, raceTicksOf } from '@cr/sim';
import { bakedTrack, makeRig } from './rig.ts';

export const KART_IDS = ['pebble', 'clay_comet', 'arrowhead', 'tugboat', 'glacier_sled', 'neon_blade', 'jet_kettle', 'crown_cruiser'] as const;

export interface BalanceRow { kart: string; ticks: number; dev: number; respawns: number; hardHits: number }

/** Race time (ticks) of one Legend bot on `kart`, alone on the track; −1 if it did not finish. */
export function soloLegend(rel: string, kart: string, laps?: number): { ticks: number; respawns: number; hardHits: number } {
  const slots = [{ kind: 'bot' as const, characterId: 'clay' as const, kartBodyId: kart as 'pebble', name: kart, ai: 'legend' as const, vMul: AI_TIERS.legend.vMul }];
  const rig = makeRig(bakedTrack(rel), { mode: 'speed', slots, seed: 4242, laps });
  const w = rig.w, k = w.karts[0]!;
  while (w.phase !== Phase.DONE && k.race.finishTick < 0 && w.tick < 60 * 60 * 6) rig.tick();
  return { ticks: k.race.finishTick >= 0 ? raceTicksOf(w, k) : -1, respawns: k.stats.respawns, hardHits: k.stats.hardHits };
}

export function balanceTable(rel: string, laps?: number): BalanceRow[] {
  const rows = KART_IDS.map((kart) => ({ kart, ...soloLegend(rel, kart, laps), dev: 0 }));
  const done = rows.filter((r) => r.ticks > 0);
  const mean = done.reduce((a, r) => a + r.ticks, 0) / Math.max(1, done.length);
  for (const r of rows) r.dev = r.ticks > 0 ? r.ticks / mean - 1 : NaN;
  return rows;
}
