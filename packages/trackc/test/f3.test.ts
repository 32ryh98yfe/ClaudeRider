// F3: halfpipe and custom profiles (slopes ≤ 60° are ground), AREA plazas (clipped ribbons, boundary walls with
// openings, obstacles, locate over the whole plaza) and the gap-3 Belltower fixture (verbatim) as a regression.
import { describe, expect, it } from 'vitest';
import { SFLAG, TFLAG, type TrackLoc } from '@cr/sim';
import { bake, contacts, frame, hit, reload, surfaceAt, surfCode, sweep } from './helpers.ts';
import { place, simRig } from './simrig.ts';

const r = bake('_test/f3_halfpipe.ctd');
const t = reload(r);
const L = (name: string): number => r.model.toMain(r.model.paths[0]!.labels.get(name)!);

describe('F3 profiles and plaza fixture', () => {
  it('bakes with zero errors', () => {
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(r.areaReports).toEqual([expect.objectContaining({ id: 'piazza', ok: true, guideInside: true })]);
  });

  it('the hp60 halfpipe is ground from wall to wall, sloping up to ~60° with ice and SLOPE flags', () => {
    const s = L('pipe') + 60;
    const f = frame(), h = hit();
    t.frameAt(0, s, f);
    expect(f.wL).toBeGreaterThan(10.9);
    let maxAng = 0;
    for (let d = -10.8; d <= 10.8; d += 0.4) {
      const x = f.px + f.rx * d, z = f.pz + f.rz * d;
      expect(t.groundRay(x, f.py + 8, z, 0, -1, 0, 12, h)).toBe(true);
      const a = (Math.acos(h.ny) * 180) / Math.PI;
      maxAng = Math.max(maxAng, a);
      expect(h.surf).toBe(surfCode('ice'));
      if (Math.abs(d) < 4) expect(a).toBeLessThan(2);
      if (Math.abs(d) > 7) expect(h.flags & TFLAG.SLOPE).toBeTruthy();
    }
    expect(maxAng).toBeGreaterThan(50);
    expect(maxAng).toBeLessThan(61);
    // the lip carries the wall (4.5 m up): a sphere just above the lip touches it
    const cs = contacts();
    const d = f.wR;
    expect(t.sphereWalls(f.px + f.rx * d, f.py + 5.1, f.pz + f.rz * d, 0.85, cs, 8)).toBeGreaterThan(0);
  });

  it('a kart riding high on the pipe wall stays on the surface (sim)', () => {
    const rig = simRig(t);
    place(rig, 0, L('pipe') + 20, 7, 30);
    // place() puts the kart on the frame plane; lift it onto the fillet surface
    const f = frame(), h = hit(), k = rig.w.karts[0]!, b = k.body;
    t.frameAt(0, L('pipe') + 20, f);
    t.groundRay(b.px, b.py + 6, b.pz, 0, -1, 0, 10, h);
    b.px = h.x; b.py = h.y; b.pz = h.z; b.nx = h.nx; b.ny = h.ny; b.nz = h.nz;
    let grounded = 0;
    for (let i = 0; i < 90; i++) { rig.tick(1, (_w, inp) => { inp.throttle = 15; }); if (k.body.grounded) grounded++; }
    expect(k.stats.respawns).toBe(0);
    expect(grounded).toBeGreaterThan(70);
  });

  it('the custom gutter profile raises the road edges', () => {
    const s = L('gutter') + 30;
    const f = frame(), h = hit();
    t.frameAt(0, s, f);
    const hc = t.groundRay(f.px, f.py + 5, f.pz, 0, -1, 0, 10, h) ? h.y : NaN;
    const x = f.px + f.rx * 8, z = f.pz + f.rz * 8;
    const he = t.groundRay(x, f.py + 5, z, 0, -1, 0, 10, h) ? h.y : NaN;
    expect(he - hc).toBeGreaterThan(0.6);
    expect(he - hc).toBeLessThan(1.2);
  });

  it('the plaza is solid ground across its ring, walled on the outside except where roads join, and locatable', () => {
    const a = r.areas[0]!;
    const [cx, cz] = a.center!;
    const h = hit(), cs = contacts();
    let open = 0, walled = 0;
    for (let k = 0; k <= 60; k++) {
      const th = ((a.from + (a.sweep * k) / 60) * Math.PI) / 180;
      for (let rr = a.rIn + 1; rr <= a.rOut - 1; rr += 2) {
        const x = cx + rr * Math.cos(th), z = cz - rr * Math.sin(th);
        expect(t.groundRay(x, a.y + 1, z, 0, -1, 0, 2, h)).toBe(true);
        expect(h.surf).toBe(surfCode('stone'));
      }
      const x = cx + (a.rOut - 0.3) * Math.cos(th), z = cz - (a.rOut - 0.3) * Math.sin(th);
      if (t.sphereWalls(x, a.y + 0.6, z, 0.85, cs, 8) > 0) walled++; else open++;
    }
    expect(walled).toBe(61);
    expect(open).toBe(0);
    // the entry and exit roads join through the sector's radial ends: open at mid-ring
    for (const edge of [a.from - 4 * Math.sign(a.sweep), a.from + a.sweep + 4 * Math.sign(a.sweep)]) {
      const th = (edge * Math.PI) / 180, rr = (a.rIn + a.rOut) / 2;
      expect(t.sphereWalls(cx + rr * Math.cos(th), a.y + 0.6, cz - rr * Math.sin(th), 0.85, cs, 8)).toBe(0);
    }
    // the tower is a wall; the curb ring between the tower and the ring is drivable ground
    expect(t.sphereWalls(cx + a.obstacles[0]!.r + 0.5, a.y + 1, cz, 0.85, cs, 8)).toBeGreaterThan(0);
    expect(t.groundRay(cx + a.rIn - 0.5, a.y + 1, cz, 0, -1, 0, 2, h)).toBe(true);
    // locate accepts a kart near the outer edge of the plaza (the guide ribbon is narrower than the ring at the ends)
    const mid = (a.from + a.sweep / 2) * Math.PI / 180;
    const px = cx + (a.rOut - 2) * Math.cos(mid), pz = cz - (a.rOut - 2) * Math.sin(mid);
    const out: TrackLoc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 };
    expect(t.locateGlobal(px, a.y + 0.3, pz, out)).toBe(true);
    expect(t.flagsAt!(0, out.s) & SFLAG.AREA).toBeTruthy();
  });

  it('every path is drivable end to end', () => {
    expect(sweep(t, 0, [0, -0.4, 0.4])).toBeNull();
  });
});

describe('gap-3 Belltower fixture (verbatim)', () => {
  const b = bake('_fixtures/belltower_piazza.ctd');
  it('compiles, closes < 0.01 m and solves the gap-3 straights', () => {
    expect(Math.hypot(b.model.closure.dx, b.model.closure.dz)).toBeLessThan(0.01);
    expect(Math.abs(b.model.closure.dy)).toBeLessThan(0.01);
    expect(b.model.solved['?a']).toBeCloseTo(128.94, 1);
    expect(b.model.solved['?b']).toBeCloseTo(14.54, 1);
    expect(b.model.solved['?c']).toBeCloseTo(86.08, 1);
    expect(b.model.paths[0]!.length).toBeCloseTo(1350, 3);
  });
  it('builds the alley shortcut (96.8 m, lands on the host) and the 270° piazza around the tower', () => {
    const alley = b.model.paths.find((p) => p.id === 'alley')!;
    expect(alley.length).toBeCloseTo(96.8, 0);
    expect(Math.hypot(alley.residual!.dx, alley.residual!.dz)).toBeLessThan(0.1);
    expect(b.areaReports[0]).toEqual(expect.objectContaining({ id: 'piazza', ok: true, guideInside: true }));
    const bt = reload(b);
    expect(sweep(bt, 0, [0])).toBeNull();
    expect(sweep(bt, 1, [0])).toBeNull();
    expect(surfaceAt(bt, 1, 45, 0)).toBe(surfCode('gravel'));
  });
});
