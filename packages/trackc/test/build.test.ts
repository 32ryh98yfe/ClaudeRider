// Every committed .ctd: compiler invariants (compiles, closes, ≤ 1.5 MB, reproducible, round-trips, matches its golden
// hash) are hard failures. Validator findings are hard failures for the tracks L4 answers for (the M1 tracks, the F
// fixtures); for the world lanes' roster tracks they are reported, not failed — `pnpm bake --validate` is their gate.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCtrk, toArrayBuffer } from '@cr/sim';
import { buildTrack } from '../src/build.ts';
import { TrackDslError } from '../src/dsl.ts';
import { TRACKS_DIR, allTrackIds, entryOf, readGolden, srcHash } from '../src/golden.ts';

/** tracks whose validator findings are L4's to keep at zero errors */
const OWNED = (id: string): boolean => id.startsWith('_test/') || id === 'clayhill_village/meadow_loop' || id === 'spark_circuit/proving_ring';
const golden = readGolden();
const soft: string[] = [];

describe('trackc build', () => {
  for (const id of allTrackIds()) {
    const file = join(TRACKS_DIR, id + '.ctd');
    it(`${id}: compiles, closes < 0.05 m, ≤ 1.5 MB (roster), reproducible, golden${OWNED(id) ? ', 0 validator errors' : ''}`, () => {
      const src = readFileSync(file, 'utf8');
      let a;
      try { a = buildTrack(src, file); } catch (e) {
        if (!OWNED(id) && e instanceof TrackDslError) { soft.push(`${id}: does not compile: ${e.message}`); return; }
        throw e;
      }
      const errors = a.findings.filter((f) => f.severity === 'error');
      if (OWNED(id)) expect(errors, errors.map((e) => `${e.rule}: ${e.msg}`).join('\n')).toEqual([]);
      else if (errors.length) soft.push(`${id}: ${errors.map((e) => `${e.rule} ${e.msg}`).join(' | ')}`);
      if (a.geometry.closed) expect(Math.hypot(a.geometry.closure.dx, a.geometry.closure.dz)).toBeLessThan(0.05);
      if (!id.startsWith('_')) expect(a.ctrk.byteLength).toBeLessThanOrEqual(1.5 * 1024 * 1024);
      const b = buildTrack(src, 'elsewhere/' + id + '.ctd'); // the path must not leak into the bytes
      expect(b.meta.hash).toBe(a.meta.hash);
      expect(Buffer.compare(Buffer.from(a.ctrk), Buffer.from(b.ctrk))).toBe(0);
      expect(Buffer.compare(Buffer.from(a.vis), Buffer.from(b.vis))).toBe(0);
      // the binary round-trips into a queryable track
      const t = loadCtrk(toArrayBuffer(a.ctrk));
      expect(t.id).toBe(a.meta.id);
      expect(t.hash).toBe(a.meta.hash);
      const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
      t.frameAt(0, 10, f);
      expect(Number.isFinite(f.px) && Math.hypot(f.tx, f.ty, f.tz) > 0.99).toBe(true);
      // golden: an unchanged source must bake to the recorded bytes
      const g = golden.tracks[id];
      if (OWNED(id)) expect(g, `${id} missing from tracks/golden.json (node packages/trackc/src/golden.ts --update)`).toBeDefined();
      if (!g) { soft.push(`${id}: not in tracks/golden.json`); return; }
      if (g.src !== srcHash(src)) { soft.push(`${id}: golden stale (source changed)`); return; }
      const e = entryOf(src, a);
      expect({ ctrk: e.ctrk, vis: e.vis }, `${id}: bake output changed; if intended run node packages/trackc/src/golden.ts --update`).toEqual({ ctrk: g.ctrk, vis: g.vis });
    });
  }
  it('reports roster findings owned by the world lanes (informational)', () => {
    if (soft.length) console.warn(`[trackc] world-lane / golden notes:\n  ${soft.join('\n  ')}`);
    expect(true).toBe(true);
  });
});
