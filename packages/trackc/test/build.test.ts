// Every .ctd under tracks/ (fixtures excluded) bakes with zero validator errors, closes exactly and bakes reproducibly.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCtrk, toArrayBuffer } from '@cr/sim';
import { buildTrack } from '../src/build.ts';

const ROOT = new URL('../../../tracks', import.meta.url).pathname;
function ctdFiles(d = ROOT): string[] {
  const out: string[] = [];
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) { if (e !== '_fixtures') out.push(...ctdFiles(p)); } else if (e.endsWith('.ctd')) out.push(p);
  }
  return out.sort();
}

describe('trackc build', () => {
  for (const file of ctdFiles()) {
    const id = file.slice(ROOT.length + 1, -4);
    it(`${id}: 0 errors, closure < 0.05 m, ≤ 1.5 MB (roster), reproducible`, () => {
      const src = readFileSync(file, 'utf8');
      const a = buildTrack(src, file);
      const errors = a.findings.filter((f) => f.severity === 'error');
      expect(errors, errors.map((e) => `${e.rule}: ${e.msg}`).join('\n')).toEqual([]);
      if (a.geometry.closed) expect(Math.hypot(a.geometry.closure.dx, a.geometry.closure.dz)).toBeLessThan(0.05);
      if (!id.startsWith('_test/')) expect(a.ctrk.byteLength).toBeLessThanOrEqual(1.5 * 1024 * 1024);
      const b = buildTrack(src, file);
      expect(b.meta.hash).toBe(a.meta.hash);
      expect(Buffer.compare(Buffer.from(a.ctrk), Buffer.from(b.ctrk))).toBe(0);
      // the binary round-trips into a queryable track
      const t = loadCtrk(toArrayBuffer(a.ctrk));
      expect(t.id).toBe(a.meta.id);
      expect(t.hash).toBe(a.meta.hash);
      const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
      t.frameAt(0, 10, f);
      expect(Number.isFinite(f.px) && Math.hypot(f.tx, f.ty, f.tz) > 0.99).toBe(true);
    });
  }
});
