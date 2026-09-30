// Baked vertex AO (three-mesh-bvh): darker under stacked decks and at wall bases, deterministic, opt-in.
import { describe, expect, it } from 'vitest';
import { CVIS_MAGIC, CVIS_VERSION, readContainer, toArrayBuffer, type TrackLoc } from '@cr/sim';
import { bake, reload } from './helpers.ts';

const OPTS = { terrain: false, props: false };
const on = bake('_test/f6_helix.ctd', { ...OPTS, ao: true });
const off = bake('_test/f6_helix.ctd', OPTS);

function roadSlot(buf: Uint8Array): { pos: Float32Array; col: Float32Array } {
  const c = readContainer(toArrayBuffer(buf), CVIS_MAGIC, CVIS_VERSION);
  const j = (c.meta as { slots: { name: string }[] }).slots.findIndex((s) => s.name === 'road:asphalt');
  return { pos: c.arrays.get(`s${j}.pos`) as Float32Array, col: c.arrays.get(`s${j}.col`) as Float32Array };
}

describe('baked vertex AO', () => {
  const A = roadSlot(on.vis), B = roadSlot(off.vis);
  const n = A.pos.length / 3;

  it('is off unless asked for (the colours are the plain surface tint) and on only changes colours', () => {
    expect(B.col.every((x) => x === 1)).toBe(true);
    expect(A.pos).toEqual(B.pos);
    expect(on.stats.aoVertices).toBeGreaterThan(1000);
    expect(on.stats.aoMean).toBeGreaterThan(0.7);
    expect(on.stats.aoMean).toBeLessThan(1);
  });

  it('is deterministic: the same source bakes to identical .vis bytes', () => {
    const again = bake('_test/f6_helix.ctd', { ...OPTS, ao: true, seed: undefined });
    expect(Buffer.compare(Buffer.from(again.vis), Buffer.from(on.vis))).toBe(0);
  });

  it('road under a stacked helix deck is darker than open road', () => {
    // a road vertex is "covered" when another road vertex sits 8–14 m above it within 1.5 m in plan
    const cell = new Map<string, number[]>();
    const key = (x: number, z: number): string => `${Math.floor(x / 3)},${Math.floor(z / 3)}`;
    for (let i = 0; i < n; i++) { const k = key(A.pos[i * 3]!, A.pos[i * 3 + 2]!); let l = cell.get(k); if (!l) cell.set(k, (l = [])); l.push(i); }
    let cSum = 0, cN = 0, oSum = 0, oN = 0;
    for (let i = 0; i < n; i++) {
      const x = A.pos[i * 3]!, y = A.pos[i * 3 + 1]!, z = A.pos[i * 3 + 2]!;
      let covered = false;
      const gx = Math.floor(x / 3), gz = Math.floor(z / 3);
      for (let dx = -1; dx <= 1 && !covered; dx++) for (let dz = -1; dz <= 1 && !covered; dz++) {
        for (const j of cell.get(`${gx + dx},${gz + dz}`) ?? []) {
          const h = A.pos[j * 3 + 1]! - y;
          if (h > 8 && h < 14 && Math.hypot(A.pos[j * 3]! - x, A.pos[j * 3 + 2]! - z) < 1.5) { covered = true; break; }
        }
      }
      if (covered) { cSum += A.col[i * 3]!; cN++; } else { oSum += A.col[i * 3]!; oN++; }
    }
    expect(cN).toBeGreaterThan(50);
    expect(cSum / cN).toBeLessThan(oSum / oN - 0.08);
  });

  it('the road edge next to a wall is darker than the centreline', () => {
    const t = reload(on), loc: TrackLoc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 };
    let eSum = 0, eN = 0, cSum = 0, cN = 0;
    for (let i = 0; i < n; i += 7) {
      if (!t.locateGlobal(A.pos[i * 3]!, A.pos[i * 3 + 1]! + 0.3, A.pos[i * 3 + 2]!, loc)) continue;
      const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
      t.frameAt(0, loc.s, f);
      const edge = Math.min(f.wL + loc.u, f.wR - loc.u);
      if (edge < 0.3) { eSum += A.col[i * 3]!; eN++; } else if (Math.abs(loc.u) < 1) { cSum += A.col[i * 3]!; cN++; }
    }
    expect(eN).toBeGreaterThan(20);
    expect(cN).toBeGreaterThan(20);
    expect(eSum / eN).toBeLessThan(cSum / cN - 0.03);
  });
});
