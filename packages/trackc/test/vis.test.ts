// .vis LOD1 index buffers and PVS bitsets (+ V20's worst visible set).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toArrayBuffer } from '@cr/sim';
import { decodeVis } from '@cr/sim/track/vis-format.ts';
import { TRACKS, bake, bakeSrc } from './helpers.ts';
import { sceneBvh } from '../src/ao.ts';
import { DEFAULT_PVS, buildPvs } from '../src/pvs.ts';
import type { RenderSlot } from '../src/render.ts';

const r = bake('_test/f5_hazards.ctd', { props: false, pvs: true });
const v = decodeVis(toArrayBuffer(r.vis));

describe('LOD1', () => {
  it('every slot has a LOD1 range per chunk, ≤ 40% of the LOD0 triangles overall, kerbs and decals dropped', () => {
    let lod0 = 0, lod1 = 0;
    v.meta.slots.forEach((s, j) => {
      const g = v.slot(j);
      expect(g.idx1).not.toBeNull();
      expect(s.lod1!.map((x) => x.chunk)).toEqual(s.chunks.map((x) => x.chunk!));
      const nv = g.pos.length / 3;
      for (const x of g.idx1!) expect(x).toBeLessThan(nv);
      const t0 = g.idx.length / 3, t1 = g.idx1!.length / 3;
      if (['kerb', 'startline', 'boostpad'].includes(s.material)) expect(t1).toBe(0);
      if (t0 > 500) expect(t1 / t0).toBeLessThanOrEqual(0.4 + 1e-9);
      lod0 += t0; lod1 += t1;
    });
    expect(lod1 / lod0).toBeLessThanOrEqual(0.4);
    expect(lod1 / lod0).toBeGreaterThan(0.05);
  });

  it('keeps the facing of every kept triangle (no inverted faces at distance)', () => {
    v.meta.slots.forEach((s, j) => {
      const { pos: P, nrm: N, idx1 } = v.slot(j);
      for (let t = 0; t < idx1!.length; t += 3) {
        const a = idx1![t]!, b = idx1![t + 1]!, c = idx1![t + 2]!;
        const e1 = [P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!];
        const e2 = [P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!];
        const g = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
        const n = [N[a * 3]! + N[b * 3]! + N[c * 3]!, N[a * 3 + 1]! + N[b * 3 + 1]! + N[c * 3 + 1]!, N[a * 3 + 2]! + N[b * 3 + 2]! + N[c * 3 + 2]!];
        expect(g[0]! * n[0]! + g[1]! * n[1]! + g[2]! * n[2]!, `${s.name} t${t / 3}`).toBeGreaterThan(0);
      }
    });
  });
});

describe('PVS', () => {
  it('ships one bitset per 10 m of progress; the chunk under the camera is always visible', () => {
    expect(v.meta.pvsStep).toBe(10);
    expect(v.meta.pvsBytes).toBe(Math.ceil((Math.max(...v.meta.chunks!.map((c) => c.id)) + 1) / 8));
    const out: number[] = new Array<number>(v.meta.chunks!.length).fill(0);
    for (let s = 0; s < r.meta.lapLength; s += 50) {
      const n = v.visibleChunks(s, out);
      expect(n).toBeGreaterThan(0);
      const here = v.meta.chunks!.find((c) => c.kind === 'track' && c.path === 0 && s >= c.s0 && s < c.s1);
      if (here) expect(out.slice(0, n)).toContain(here.id);
    }
  });

  it('occlusion: with a tall wall across the infield, the far straight drops out beyond the near radius', () => {
    const b = bakeSrc(readFileSync(TRACKS + '_test/f5_hazards.ctd', 'utf8'));
    const chunks = b.visMeta.chunks!.map((c) => ({ id: c.id, bbox: c.bbox, groups: c.groups, tris: c.tris, lod1Tris: 0 }));
    // the stadium's straights run along ±z at x ≈ 0 and x ≈ 90: a 60 m high, 1400 m long wall at x = 45
    const wall: RenderSlot = {
      name: 'test', material: 'wall', variant: 'test', triChunk: [], chunks: [],
      pos: [45, -10, -700, 45, 60, -700, 45, 60, 700, 45, -10, 700], nrm: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0], uv: [0, 0, 0, 0, 0, 0, 0, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2, 0, 2, 3],
    };
    const open = buildPvs(b.model, chunks, b.slots, sceneBvh(b.slots).bvh, { ...DEFAULT_PVS, near: 10 });
    const walled = buildPvs(b.model, chunks, b.slots, sceneBvh([...b.slots, wall]).bvh, { ...DEFAULT_PVS, near: 10 });
    expect(walled.meanVisible).toBeLessThan(open.meanVisible * 0.8);
  });

  it('V20 gets the worst visible static set, and a PVS bake is byte-identical', () => {
    expect(r.pvsWorst!.draws).toBeGreaterThan(0);
    expect(r.pvsWorst!.tris).toBeGreaterThan(1000);
    const again = bake('_test/f5_hazards.ctd', { props: false, pvs: true, seed: undefined });
    expect(Buffer.compare(Buffer.from(again.vis), Buffer.from(r.vis))).toBe(0);
  });
});
