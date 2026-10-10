// F4: rails (offset paths with capture/speed/gauge, mapped onto the host) and warps (portal skips, no-geometry spans).
import { describe, expect, it } from 'vitest';
import { SFLAG, type TrackLoc } from '@cr/sim';
import { bake, bakeSrc, frame, hit, locateWalk, reload, sweep } from './helpers.ts';

const r = bake('_test/f4_rails.ctd');
const t = reload(r);

describe('F4 rail and warp fixture', () => {
  it('bakes with zero errors; one rail path mapped onto the main line', () => {
    expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(t.rails.length).toBe(1);
    const rail = t.rails[0]!;
    const pm = t.path(rail.path);
    expect(pm.kind).toBe('rail');
    expect(pm.map!.host).toBe(0);
    expect(rail.captureDMax).toBe(2);
    expect(rail.captureHeadingDeg).toBe(25);
    expect(rail.vMin).toBe(15 * 0.85);
    expect([rail.speedMin, rail.accel, rail.speedMax]).toEqual([38 * 0.85, 3 * 0.85, 42 * 0.85]);
    expect(rail.gaugePerSec).toBeCloseTo(0.3, 6);
    const lockMin = (rail.length! / rail.speedMax) * 60, lockMax = (rail.length! / rail.speedMin) * 60;
    expect(lockMin).toBeGreaterThanOrEqual(48);
    expect(lockMax).toBeLessThanOrEqual(180);
    expect(t.path(0).links!.some((l) => l.kind === 'railIn' && l.to === rail.path)).toBe(true);
    expect(pm.links!.some((l) => l.kind === 'railOut' && l.to === 0)).toBe(true);
  });

  it('the rail starts over the road, leaves it on the inside of the corner and ends tangent to the host', () => {
    const rail = t.rails[0]!, f = frame(), g = frame();
    t.frameAt(rail.path, 0, f); t.frameAt(0, rail.hostFrom!, g);
    const u0 = (f.px - g.px) * g.rx + (f.py - g.py) * g.ry + (f.pz - g.pz) * g.rz;
    const h0 = (f.px - g.px) * g.ux + (f.py - g.py) * g.uy + (f.pz - g.pz) * g.uz;
    expect(u0).toBeCloseTo(-3, 1);
    expect(h0).toBeCloseTo(1, 1);
    // mid-rail it runs 13 m inside the centreline, well off the 15 m road
    const mid = t.path(rail.path).length / 2;
    t.frameAt(rail.path, mid, f); t.frameAt(0, t.toMainS(rail.path, mid), g);
    const um = (f.px - g.px) * g.rx + (f.pz - g.pz) * g.rz;
    expect(um).toBeLessThan(-10);
    t.frameAt(rail.path, t.path(rail.path).length, f); t.frameAt(0, rail.hostTo!, g);
    expect(f.tx * g.tx + f.ty * g.ty + f.tz * g.tz).toBeGreaterThan(Math.cos((5 * Math.PI) / 180));
    // host samples under the span carry the RAIL flag; key gates avoid it
    expect(t.flagsAt!(0, (rail.hostFrom! + rail.hostTo!) / 2) & SFLAG.RAIL).toBeTruthy();
    for (const k of t.keyGates) expect(k > rail.hostFrom! && k < rail.hostTo!).toBe(false);
  });

  it('a kart driving the road under the rail is located on the main path (rails are entered by capture)', () => {
    const rail = t.rails[0]!, f = frame();
    const pts: { x: number; y: number; z: number }[] = [];
    for (let s = rail.hostFrom! - 20; s < rail.hostTo! + 20; s += 0.5) { t.frameAt(0, s, f); pts.push({ x: f.px - f.rx * 3, y: f.py, z: f.pz - f.rz * 3 }); }
    const start: TrackLoc = { path: 0, i: Math.floor((rail.hostFrom! - 20) / t.path(0).ds), s: rail.hostFrom! - 20, u: -3, h: 0, sMain: rail.hostFrom! - 20, valid: 1 };
    const w = locateWalk(t, pts, start);
    expect(w.ok).toBe(true);
    expect(w.paths.every((p) => p === 0)).toBe(true);
  });

  it('warps: a portal skip and a no-geometry gate span', () => {
    expect(t.warps.length).toBe(2);
    const portal = t.warps.find((w) => w.id === 'portal')!, gate = t.warps.find((w) => w.id === 'gate')!;
    expect(portal.transitTicks).toBe(48);
    expect(portal.keepSpeed).toBe(true);
    expect([portal.u0, portal.u1]).toEqual([3.5, 7]);
    expect(portal.exitS).toBeGreaterThan(portal.s);
    for (const k of t.keyGates) expect(k > portal.s && k < portal.exitS).toBe(false);
    expect(gate.transitTicks).toBe(30);
    expect(Math.abs(gate.exitS - gate.s - 40)).toBeLessThan(1.5); // span ends are sample-aligned (1 m)
    const f = frame(), h = hit();
    for (let s = gate.s + 1; s < gate.exitS - 1; s += 2) {
      t.frameAt(0, s, f);
      expect(f.flags & SFLAG.WARP).toBeTruthy();
      expect(t.groundRay(f.px, f.py + 1, f.pz, 0, -1, 0, 3, h)).toBe(false);
    }
    expect(sweep(t, 0, [0, -0.5, 0.5])).toBeNull(); // the sweep skips the warp span and must find ground elsewhere
    expect(r.visMeta.portals!.length).toBe(4);
    expect(r.slots.some((s) => s.name === 'wall:rail')).toBe(true);
    expect(r.slots.some((s) => s.name === 'wall:portal')).toBe(true);
  });

  it('V17 flags a rail that is too short to lock and one whose exit is not tangent', () => {
    const base = `TRACK v17 name="v17" diff=3 laps=1 topo=p2p
DEFAULTS w=15 wall=barrier:1
S 200
C R40 90 L
S 200
ITEMS at=100
`;
    const short = bakeSrc(base + 'RAIL r1 host=main from=50 to=70 d=[50:0,70:0] h=1\n');
    expect(short.findings.some((f) => f.rule === 'V17' && /lock time/.test(f.msg))).toBe(true);
    const skew = bakeSrc(base + 'RAIL r2 host=main from=80 to=180 d=[80:0,170:-8,180:-10] h=1\n');
    expect(skew.findings.some((f) => f.rule === 'V17' && /tangent/.test(f.msg))).toBe(false); // smoothstep keys end flat
    const far = bakeSrc(base + 'RAIL r3 host=main from=80 to=180 d=[80:-15,180:-15] h=1\n');
    expect(far.findings.some((f) => f.rule === 'V17' && /not reachable/.test(f.msg))).toBe(true);
  });
});
