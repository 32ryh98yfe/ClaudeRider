// BakedTrack queries never throw: out-of-range or non-finite inputs, and files missing a section, query as
// "nothing here" (regression: L11 saw `TypeError: Cannot read properties of null (reading '9150')` in groundRay
// inside step() on f5_hazards).
import { describe, expect, it } from 'vitest';
import { CTRK_MAGIC, CTRK_VERSION, loadCtrk, readContainer, toArrayBuffer, writeContainer, type TypedArray } from '@cr/sim';
import { bake, contacts, frame, hit, reload } from './helpers.ts';
import { place, simRig } from './simrig.ts';

const r = bake('_test/f5_hazards.ctd', { props: false, terrain: false });
const t = reload(r);

/** The same .ctrk without the arrays whose names match `drop`. */
function without(drop: RegExp): ReturnType<typeof loadCtrk> {
  const c = readContainer(toArrayBuffer(r.ctrk), CTRK_MAGIC, CTRK_VERSION);
  const arrays: [string, TypedArray][] = [...c.arrays.entries()].filter(([k]) => !drop.test(k));
  return loadCtrk(toArrayBuffer(writeContainer(CTRK_MAGIC, CTRK_VERSION, c.meta as never, arrays)));
}

describe('BakedTrack robustness', () => {
  const f = frame();
  t.frameAt(0, 100, f);

  it('non-finite and far out-of-range rays and spheres return nothing, quickly', () => {
    const h = hit(), cs = contacts();
    const bad = [Number.NaN, Infinity, -Infinity, 1e9, -1e9];
    const t0 = Date.now();
    for (const v of bad) {
      expect(t.groundRay(v, f.py + 1, f.pz, 0, -1, 0, 2, h)).toBe(false);
      expect(t.groundRay(f.px, v, f.pz, 0, -1, 0, 2, h)).toBe(false);
      expect(t.sphereWalls(v, f.py, f.pz, 1, cs, 8)).toBe(0);
      if (v !== 1e9) {
        expect(t.groundRay(f.px, f.py + 1, f.pz, 0, -1, 0, v, h)).toBe(false); // non-finite or negative length
        expect(t.sphereWalls(f.px, f.py, f.pz, v, cs, 8)).toBe(0);            // non-finite or negative radius
      }
    }
    expect(t.groundRay(f.px, f.py + 1, f.pz, 0, -1, 0, -5, h)).toBe(false);
    // an enormous ray is clamped to the grid instead of walking 10^12 cells
    expect(t.groundRay(f.px, f.py + 100, f.pz, 0, -1, 0, 1e12, h)).toBe(true);
    expect(h.y).toBeCloseTo(f.py, 1);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('a file without ground normals uses geometric normals', () => {
    const u = without(/^g\.(noct|nrm)$/), h = hit();
    expect(u.groundRay(f.px, f.py + 1, f.pz, 0, -1, 0, 2, h)).toBe(true);
    expect(h.ny).toBeGreaterThan(0.99);
  });

  it('a file without a wall section or a ground hash queries as empty instead of throwing', () => {
    const noWalls = without(/^w\./), cs = contacts(), h = hit();
    expect(noWalls.sphereWalls(f.px, f.py, f.pz, 30, cs, 8)).toBe(0);
    expect(noWalls.groundRay(f.px, f.py + 1, f.pz, 0, -1, 0, 2, h)).toBe(true);
    const noHash = without(/^g\.(hd|hk|hs|ht)$/);
    expect(noHash.groundRay(f.px, f.py + 1, f.pz, 0, -1, 0, 2, h)).toBe(false);
  });

  it('a kart thrown far outside the track keeps stepping and respawns (sim)', () => {
    const rig = simRig(t);
    place(rig, 0, 100, 0, 0);
    const b = rig.w.karts[0]!.body;
    b.px += 5000; b.pz -= 5000; b.py += 400; b.vx = 80; b.vy = 30;
    expect(() => rig.tick(400, (_w, inp) => { inp.throttle = 15; })).not.toThrow();
    expect(rig.w.karts[0]!.stats.respawns).toBeGreaterThan(0);
  });
});
