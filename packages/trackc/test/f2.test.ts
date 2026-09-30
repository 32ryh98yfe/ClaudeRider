// F2: jumps with real gaps (ramp, lip, gap, kill floor, landing face), open ledges with kill strips, KILL planes and
// shoulders — geometry checks plus end-to-end runs through the sim (L1 physics) on the baked binary.
import { describe, expect, it } from 'vitest';
import { SFLAG, TFLAG } from '@cr/sim';
import { bake, bakeSrc, contacts, frame, hit, reload, surfaceAt, surfCode, sweep } from './helpers.ts';
import { place, simRig } from './simrig.ts';
import { landingDistance } from '../src/validate.ts';

const r = bake('_test/f2_jumps.ctd');
const t = reload(r);
const J = t.jumps[0]!;

describe('F2 jump fixture', () => {
  it('bakes with zero errors; the jump is declared with its geometry', () => {
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(t.jumps.length).toBe(1);
    expect(J.landS0 - J.lipS).toBeCloseTo(10, 5);
    expect(J.lipDeg).toBe(8);
    expect(J.landS1 - J.landS0).toBeCloseTo(45, 5);
  });

  it('the road is continuous except across the gap; samples in the gap carry NO_GROUND|JUMP', () => {
    expect(sweep(t, 0, [0, -0.5, 0.5], 0, J.lipS - 0.5)).toBeNull();
    expect(sweep(t, 0, [0, -0.5, 0.5], J.landS0 + 1)).toBeNull(); // the landing face is a wall at landS0
    const h = hit(), f = frame();
    for (let s = J.lipS + 0.5; s < J.landS0 - 0.5; s += 1) {
      t.frameAt(0, s, f);
      expect(f.flags & SFLAG.NO_GROUND).toBeTruthy();
      expect(f.flags & SFLAG.JUMP).toBeTruthy();
      // nothing within 2 m below the flight line; the kill floor is further down
      expect(t.groundRay(f.px, f.py + 1, f.pz, 0, -1, 0, 2.5, h)).toBe(false);
      expect(t.groundRay(f.px, f.py, f.pz, 0, -1, 0, 20, h)).toBe(true);
      expect(h.flags & TFLAG.KILL).toBeTruthy();
    }
  });

  it('the lip is sharp: the ramp surface normal at the lip matches the 8° lip angle', () => {
    const h = hit(), f = frame();
    t.frameAt(0, J.lipS - 0.3, f);
    expect(t.groundRay(f.px, f.py + 1, f.pz, 0, -1, 0, 2, h)).toBe(true);
    const ang = (Math.acos(h.ny) * 180) / Math.PI;
    expect(ang).toBeGreaterThan(7);
    expect(ang).toBeLessThan(8.5);
  });

  it('the landing has a solid front face (a kart short of the landing hits a wall, not the road top)', () => {
    const f = frame(), cs = contacts();
    t.frameAt(0, J.landS0, f);
    const n = t.sphereWalls(f.px - f.tx * 0.5, f.py - 2, f.pz - f.tz * 0.5, 0.85, cs, 8);
    expect(n).toBeGreaterThan(0);
  });

  it('a kart flies the gap and lands where the V11 ballistic model says (sim)', () => {
    const rig = simRig(t);
    place(rig, 0, J.lipS - 30, 0, 30);
    let airborne = false, landedAt = -1, vTake = 0;
    for (let i = 0; i < 240 && landedAt < 0; i++) {
      rig.tick(1, (_w, inp) => { inp.throttle = 15; inp.steer = 0; });
      const k = rig.w.karts[0]!, b = k.body;
      if (!b.grounded && !airborne) { airborne = true; vTake = Math.hypot(b.vx, b.vy, b.vz); }
      else if (b.grounded && airborne) landedAt = k.race.loc.s;
    }
    expect(airborne).toBe(true);
    expect(landedAt).toBeGreaterThan(J.landS0);
    expect(landedAt).toBeLessThan(J.landS1 - 5);
    expect(rig.w.karts[0]!.stats.respawns).toBe(0);
    const x = landingDistance(vTake, 8, 2 + (10 * Math.tan((8 * Math.PI) / 180)) / 2);
    expect(Math.abs(landedAt - J.lipS - x)).toBeLessThan(2.5);
  });

  it('driving off the open ledge lands on the kill floor and respawns (sim)', () => {
    const rig = simRig(t);
    const ledge = r.model.toMain(r.model.paths[0]!.labels.get('ledge')!) + 120;
    const f = frame(); t.frameAt(0, ledge, f);
    // the ledge's right edge is open: no wall contact there
    const cs = contacts();
    const d = f.wR;
    expect(t.sphereWalls(f.px + f.rx * d + f.ux * 0.6, f.py + f.ry * d + f.uy * 0.6, f.pz + f.rz * d + f.uz * 0.6, 0.85, cs, 8)).toBe(0);
    place(rig, 0, ledge, 3, 18, 60);
    let respawned = false;
    for (let i = 0; i < 240 && !respawned; i++) { rig.tick(1, (_w, inp) => { inp.throttle = 15; }); respawned = rig.w.karts[0]!.stats.respawns > 0; }
    expect(respawned).toBe(true);
  });

  it('shoulders are drivable surfaces with their own material', () => {
    const snow = r.model.toMain(r.model.paths[0]!.labels.get('snowfield')!) + 100;
    expect(surfaceAt(t, 0, snow, 10)).toBe(surfCode('snow'));
    expect(surfaceAt(t, 0, snow, -10)).toBe(surfCode('snow'));
    expect(surfaceAt(t, 0, snow, 0)).toBe(surfCode('asphalt'));
  });

  it('V11 flags a gap that slow karts cannot clear', () => {
    const src = `TRACK v11 name="v11" diff=2 laps=1 topo=p2p
DEFAULTS w=16 wall=barrier:1
S 80
J ramp=6@4 gap=24 drop=0 land=45 vmin=15 vmax=30
S 40
ITEMS at=40
`;
    const b = bakeSrc(src);
    expect(b.findings.some((f) => f.rule === 'V11' && f.severity === 'error')).toBe(true);
  });
});
