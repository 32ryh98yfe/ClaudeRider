// Prints the archetype balance table (Legend bot alone, four fixed runs per body) and every seed diagnostic.
// Usage: node tools/bench/balance.ts [themeId/trackId ...]   (default: meadow_loop and proving_ring)
import { balanceTable } from '../../packages/sim/test/balance.ts';

const tracks = process.argv.slice(2).length ? process.argv.slice(2) : ['clayhill_village/meadow_loop', 'spark_circuit/proving_ring'];
for (const rel of tracks) {
  const t0 = Date.now();
  const rows = balanceTable(rel);
  console.log(`${rel} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  for (const r of rows) {
    console.log(`  ${r.kart.padEnd(14)} ${(r.ticks / 60).toFixed(2).padStart(8)} s  ${(r.dev * 100).toFixed(2).padStart(6)}%  respawns ${r.respawns}  hard ${r.hardHits}`);
    for (const t of r.trials) console.log(`    seed ${t.label.padEnd(6)} AI ${String(t.driverSeed).padEnd(9)} ${(t.ticks / 60).toFixed(3)} s  respawns ${t.respawns}  hard ${t.hardHits}`);
  }
  const devs = rows.map((r) => Math.abs(r.dev)).filter((d) => d === d);
  console.log(`  max |dev| ${(Math.max(...devs) * 100).toFixed(2)}%`);
}
