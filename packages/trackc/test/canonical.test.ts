import { describe, expect, it } from 'vitest';
import { canonicalF32, canonicalMetadata, canonicalNumber } from '../src/canonical.ts';
import { RenderBuilder } from '../src/render.ts';
import { bake, reload } from './helpers.ts';

describe('portable bake serialization', () => {
  it('normalizes observed ARM64/x64 metadata residuals while preserving integer ids', () => {
    expect(canonicalNumber(-625.734126961067)).toBe(canonicalNumber(-625.7341269610672));
    expect(canonicalNumber(350.13768144555297)).toBe(canonicalNumber(350.1376814455532));
    expect(canonicalNumber(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(Object.is(canonicalNumber(-0), 0)).toBe(true);
    expect(canonicalMetadata({ x: 67.2529678394498, children: [1.6112712360990864] }))
      .toEqual(canonicalMetadata({ x: 67.25296783944978, children: [1.6112712360990866] }));
  });

  it('preserves exact path parameterization and near-grid key gates during a real bake', () => {
    const built = bake('spark_circuit/spark_grand_circuit.ctd', { terrain: false, props: false });
    const track = reload(built);
    expect(track.lapLength).toBe(built.model.lapLength);
    for (const path of built.model.paths) {
      expect(track.path(path.index).length).toBe(path.length);
      expect(track.path(path.index).ds).toBe(path.length / (path.samples.length - 1));
    }
    const sourceGates = built.content.keyGates.filter((s) => s > 5 && s < built.model.lapLength - 5).sort((a, b) => a - b);
    expect(track.keyGates).toEqual(sourceGates);
    expect(track.keyGates.some((s) => s !== Math.round(s) && Math.abs(s - Math.round(s)) < 1e-9)).toBe(true);
  });

  it('retains normal float32 values and rejects no invalid numbers by accident', () => {
    expect(canonicalF32(123.456789)).toBe(Math.fround(123.456789));
    expect(canonicalF32(9.172618220532058e-11)).toBe(0);
    expect(canonicalF32(-2.7753372006477072e-17)).toBe(0);
    expect(Object.is(canonicalF32(-0), 0)).toBe(true);
    expect(canonicalMetadata({ invalid: Infinity }).invalid).toBe(Infinity);
    expect(Number.isNaN(canonicalNumber(NaN))).toBe(true);
    expect(Number.isNaN(canonicalF32(NaN))).toBe(true);
  });

  it('welds equal stored vertices consistently across last-bit double perturbations', () => {
    const build = (delta: number) => {
      const rb = new RenderBuilder(), slot = rb.slot('road', 'asphalt'), chunk = rb.chunkOf(0, 0);
      const vertex = (x: number, z: number, perturb: boolean) => [x + (perturb ? delta : 0), 0, z, 0, 1, perturb ? delta * 0.001 : 0, x, z === 0 ? 6.808441e-8 + delta * 2 : z, 1, 1, 1];
      rb.tri(slot, chunk, vertex(7, 0, false), vertex(8, 0, false), vertex(7, 1, false));
      rb.tri(slot, chunk, vertex(7, 0, true), vertex(8, 0, true), vertex(7, 1, true));
      return rb.finalise()[0]!;
    };
    const arm = build(1e-14), x64 = build(-1e-14);
    expect(arm).toEqual(x64);
    expect(arm.pos).toHaveLength(9);
    expect(arm.idx).toEqual([0, 1, 2, 0, 1, 2]);
    expect(arm.pos).toEqual([7, 0, 0, 8, 0, 0, 7, 0, 1]);
  });
});
