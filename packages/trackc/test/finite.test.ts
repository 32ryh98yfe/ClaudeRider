// No NaN/Infinity may reach a baked file (the terrain far field used to emit ~5% NaN vertices: y = Infinity·0).
import { describe, expect, it } from 'vitest';
import { CTRK_MAGIC, CTRK_VERSION, CVIS_MAGIC, CVIS_VERSION, readContainer, toArrayBuffer } from '@cr/sim';
import { bake } from './helpers.ts';
import { NonFiniteError, assertFinite, findNonFiniteMeta } from '../src/finite.ts';

describe('bake finite assertion', () => {
  it('finds the first non-finite number in meta, with its path', () => {
    expect(findNonFiniteMeta({ a: 1, b: [0, { c: 2 }] })).toBeNull();
    expect(findNonFiniteMeta({ a: 1, b: [0, { c: Number.NaN }] })).toBe('meta.b[1].c');
    expect(findNonFiniteMeta({ bounds: [0, Infinity] })).toBe('meta.bounds[1]');
  });

  it('throws on a NaN or Infinity in a float array, ignores integer arrays', () => {
    expect(() => assertFinite('.vis', {}, [['s0.pos', Float32Array.from([0, 1, Number.NaN])]])).toThrow(NonFiniteError);
    expect(() => assertFinite('.vis', {}, [['s0.pos', Float32Array.from([0, 1, 2])]])).not.toThrow();
    expect(() => assertFinite('.ctrk', {}, [['g.pos', Float64Array.from([Infinity])]])).toThrow(/\.ctrk array g\.pos\[0\]/);
    expect(() => assertFinite('.ctrk', {}, [['g.idx', Uint32Array.from([1, 2, 3])]])).not.toThrow();
  });

  it('meadow_loop with terrain bakes, and every float in both files is finite (terrain far field included)', () => {
    const r = bake('clayhill_village/meadow_loop.ctd');
    for (const [magic, ver, buf] of [[CTRK_MAGIC, CTRK_VERSION, r.ctrk], [CVIS_MAGIC, CVIS_VERSION, r.vis]] as const) {
      const c = readContainer(toArrayBuffer(buf), magic, ver);
      for (const [name, a] of c.arrays) {
        if (!(a instanceof Float32Array || a instanceof Float64Array)) continue;
        let bad = 0;
        for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i]!)) bad++;
        expect(bad, name).toBe(0);
      }
    }
    const vm = readContainer(toArrayBuffer(r.vis), CVIS_MAGIC, CVIS_VERSION);
    const j = (vm.meta as { slots: { name: string }[] }).slots.findIndex((s) => s.name === 'terrain');
    expect(j).toBeGreaterThanOrEqual(0);
    expect(vm.arrays.get(`s${j}.pos`)!.length / 3).toBeGreaterThan(5000);
  });
});
