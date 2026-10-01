// L6 §8: a global KILL plane lays collision strips only under spans a kart can fall from (open edges, gaps, warps,
// kill spans, ±20 m), not under every walled metre of road (that cost ≈ 600 KB of .ctrk on a 3.9 km track).
import { describe, expect, it } from 'vitest';
import { bakeSrc } from './helpers.ts';

const RING = (ledge: string): string => `TRACK ks name="KS" theme=spark_circuit diff=2 laps=3 topo=circuit
DEFAULTS w=14 surf=asphalt wall=barrier:1.0 blend=16
START pos=(0,0,0) hdg=0
S ?a @home
C R50 180 L
S ?a ${ledge} @back
C R50 180 L
CLOSE solve=[?a] length=1200
KILL void belowY=-30 surf=void
`;

describe('global kill plane strips', () => {
  it('a fully walled track gets no strips; one open ledge gets strips around it only', () => {
    const walled = bakeSrc(RING(''));
    expect(walled.stats.killTris).toBe(0);
    const ledge = bakeSrc(RING('wallR=none'));
    expect(ledge.stats.killTris).toBeGreaterThan(0);
    // the open span (wall=none persists into the next corner) ± 20 m at a 6 m step, 2 triangles per step
    const main = ledge.model.paths[0]!;
    const openLen = main.samples.filter((q) => q.wallR.type === 'none').length * main.step;
    expect(openLen).toBeLessThan(main.length * 0.7);
    expect(ledge.stats.killTris).toBeLessThanOrEqual(2 * Math.ceil((openLen + 2 * 20 + 12) / 6));
    expect(ledge.ctrk.byteLength).toBeGreaterThan(walled.ctrk.byteLength);
  });
});
