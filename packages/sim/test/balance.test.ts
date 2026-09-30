// Archetype balance (02-contracts L1 done criterion): with a Legend bot driving each of the 8 bodies alone, race
// times on meadow_loop and proving_ring stay within ±2% of their mean; every run finishes without a respawn.
// `node tools/bench/balance.ts` prints the table.
import { describe, expect, it } from 'vitest';
import { balanceTable } from './balance.ts';

describe('archetype lap spread ≤ ±2% (Legend, solo)', () => {
  it.each(['clayhill_village/meadow_loop', 'spark_circuit/proving_ring'])('%s', (rel) => {
    const rows = balanceTable(rel);
    for (const r of rows) {
      expect(r.ticks, `${r.kart} finished`).toBeGreaterThan(0);
      expect(r.respawns, `${r.kart} respawns`).toBe(0);
      expect(Math.abs(r.dev), `${r.kart} ${(r.dev * 100).toFixed(2)}%`).toBeLessThanOrEqual(0.02);
    }
  });
});
