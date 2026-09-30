// Spline-route mapping for item objects: pathS() inverts BakedTrack.toMainS() on the main path and on branches,
// including a circuit branch that crosses the line and a point-to-point main path with a start-line offset.
import { describe, expect, it } from 'vitest';
import type { BakedTrack } from '@cr/sim';
import { pathCovers, pathS, sMainOf } from '../src/items/route.ts';

interface FakePath { length: number; map?: { host: number; fromS: number; toS: number } }
function fake(topology: 'circuit' | 'p2p', L: number, paths: FakePath[], lineS = 0): BakedTrack {
  const t = {
    topology, lapLength: L, nPaths: paths.length,
    path: (p: number) => ({ id: `p${p}`, kind: p ? 'branch' : 'main', closed: topology === 'circuit' && p === 0, length: paths[p]!.length, n: 0, ds: 1, map: paths[p]!.map, aiMinSkill: 0 }),
    toMainS(p: number, s: number): number {
      if (p === 0) return topology === 'p2p' ? s - lineS : s;
      const pm = paths[p]!.map;
      if (!pm) return 0;
      let to = pm.toS;
      if (to < pm.fromS) to += paths[0]!.length;
      let v = pm.fromS + (to - pm.fromS) * (s / paths[p]!.length);
      if (topology === 'circuit' && v >= paths[0]!.length) v -= paths[0]!.length;
      return v;
    },
  };
  return t as unknown as BakedTrack;
}

describe('item routes', () => {
  it('invert toMainS on the main path and on a branch; cover only the mapped span', () => {
    const T = fake('circuit', 1400, [{ length: 1400 }, { length: 120, map: { host: 0, fromS: 100, toS: 200 } }]);
    for (const s of [0, 30, 60, 119.5]) expect(pathS(T, 1, T.toMainS(1, s))).toBeCloseTo(s, 9);
    expect(pathS(T, 0, 777)).toBe(777);
    expect([pathCovers(T, 1, 99), pathCovers(T, 1, 100), pathCovers(T, 1, 200), pathCovers(T, 1, 201)]).toEqual([false, true, true, false]);
    expect(sMainOf(T, 1400 * 2 + 55)).toBeCloseTo(55, 9);
  });

  it('handles a circuit branch that crosses the start line', () => {
    const T = fake('circuit', 1400, [{ length: 1400 }, { length: 110, map: { host: 0, fromS: 1350, toS: 50 } }]);
    for (const s of [0, 40, 49.9, 55, 109]) expect(pathS(T, 1, T.toMainS(1, s))).toBeCloseTo(s, 9);
    expect([pathCovers(T, 1, 1340), pathCovers(T, 1, 1380), pathCovers(T, 1, 20), pathCovers(T, 1, 60)]).toEqual([false, true, true, false]);
  });

  it('follows a point-to-point start-line offset on the main path', () => {
    const T = fake('p2p', 2000, [{ length: 2030 }], 30);
    expect(pathS(T, 0, -12)).toBeCloseTo(18, 9);   // on the grid, behind the line
    expect(pathS(T, 0, T.toMainS(0, 900))).toBeCloseTo(900, 9);
    expect(sMainOf(T, 123)).toBe(123);
  });
});
