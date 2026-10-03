// Archetype balance: fixed four-run body means on meadow_loop and proving_ring stay within ±2% of their mean;
// every run finishes without a respawn or hard wall hit. Keep the old seed in the sample; never select passing seeds.
// `node tools/bench/balance.ts` prints the table.
import { describe, expect, it } from 'vitest';
import { balanceTable } from './balance.ts';

describe('archetype mean lap spread ≤ ±2% (Legend, solo, four fixed seeds)', () => {
  it.each(['clayhill_village/meadow_loop', 'spark_circuit/proving_ring'])('%s', (rel) => {
    const rows = balanceTable(rel);
    for (const r of rows) {
      console.log(`${r.kart}: ${r.trials.map((t) => `${t.label}=${t.ticks.toFixed(3)}`).join(', ')}; mean deviation ${(r.dev * 100).toFixed(3)}%`);
      for (const trial of r.trials) {
        expect(trial.ticks, `${r.kart} seed ${trial.label} finished`).toBeGreaterThan(0);
        expect(trial.respawns, `${r.kart} seed ${trial.label} respawns`).toBe(0);
        expect(trial.hardHits, `${r.kart} seed ${trial.label} hard wall hits`).toBe(0);
      }
      expect(r.ticks, `${r.kart} finished`).toBeGreaterThan(0);
      expect(r.respawns, `${r.kart} respawns`).toBe(0);
      expect(Math.abs(r.dev), `${r.kart} ${(r.dev * 100).toFixed(2)}%`).toBeLessThanOrEqual(0.02);
    }
  });
});
