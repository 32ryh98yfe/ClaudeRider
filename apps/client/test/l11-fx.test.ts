// L11: load-time terrain repair of non-finite heights (trackc NaN bug, contract-requests/L11-terrain-nan.md).
import { describe, expect, it } from 'vitest';
import { repairTerrain } from '../src/render/track/repair.ts';

function grid(n: number, step: number, h: (ix: number, iz: number) => number): { pos: Float32Array; nrm: Float32Array } {
  const pos = new Float32Array(n * n * 3), nrm = new Float32Array(n * n * 3);
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const v = (iz * n + ix) * 3;
    pos[v] = -3.7 + ix * step; pos[v + 1] = h(ix, iz); pos[v + 2] = 11.3 + iz * step;
    nrm[v + 1] = 1;
  }
  return { pos, nrm };
}

describe('repairTerrain', () => {
  it('is a no-op on finite terrain', () => {
    const { pos, nrm } = grid(6, 8, (x, z) => x * 0.1 + z * 0.2);
    const before = pos.slice();
    expect(repairTerrain(pos, nrm)).toBe(0);
    expect([...pos]).toEqual([...before]);
  });

  it('fills NaN heights from neighbours and rebuilds unit normals', () => {
    const { pos, nrm } = grid(8, 8, (x, z) => (x >= 5 && z >= 5 ? NaN : 2));
    for (let v = 0; v < nrm.length; v += 3) if (!Number.isFinite(pos[v + 1]!)) nrm[v] = NaN;
    expect(repairTerrain(pos, nrm)).toBeGreaterThan(0);
    for (let v = 0; v < pos.length; v += 3) {
      expect(pos[v + 1]).toBeCloseTo(2, 5); // every finite neighbour is 2
      expect(Math.hypot(nrm[v]!, nrm[v + 1]!, nrm[v + 2]!)).toBeCloseTo(1, 5);
    }
  });
});
