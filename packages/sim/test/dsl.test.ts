// The sim on real DSL bakes from lane L4 (tracks/_test/f1_branch.ctd, f2_jumps.ctd): conveyors, surface and
// noItem zones, pads, a shortcut branch, a jump gap and an open ledge over a kill plane.
import { describe, expect, it } from 'vitest';
import { Boost } from '@cr/sim';
import { isNoItem } from '../src/kart/zones.ts';
import { bakedTrack } from './rig.ts';
import { racingRig, place, fwdKmh, speedOf, steerLeft, pursue3d } from './util.ts';

const f1 = bakedTrack('_test/f1_branch');
const f2 = bakedTrack('_test/f2_jumps');

describe('F1 bake: zones, pads, branch', () => {
  it('conveyor zones scale the target speed ×1.15 on one half of the road and ×0.85 on the other', () => {
    const fast = f1.zones.find((z) => z.kind === 'conveyor' && (z.speedMul ?? 1) > 1)!;
    const slow = f1.zones.find((z) => z.kind === 'conveyor' && (z.speedMul ?? 1) < 1)!;
    expect(fast).toBeDefined(); expect(slow).toBeDefined();
    const run = (z: typeof fast): number => {
      const rig = racingRig(f1);
      const k = place(rig, 0, { path: z.path, s: z.s0 + 2, u: (z.u0 + z.u1) / 2, speed: 34 });
      let top = 0;
      for (let t = 0; t < 400 && k.race.loc.s < z.s1 - 2; t++) {
        rig.tick((_w, inp) => { inp[0]!.throttle = 15; inp[0]!.steer = steerLeft(pursue3d(f1, k, 12, (z.u0 + z.u1) / 2)); });
        top = Math.max(top, speedOf(k));
      }
      return top;
    };
    expect(run(fast)).toBeGreaterThan(34 * 1.06);
    const s = run(slow);
    expect(s).toBeLessThan(34); // decaying toward 0.85·vGrip inside the zone
  });

  it('noItem zone and surface zone are live on the baked track', () => {
    const ni = f1.zones.find((z) => z.kind === 'noItem')!;
    const rig = racingRig(f1);
    const k = place(rig, 0, { path: ni.path, s: (ni.s0 + ni.s1) / 2, speed: 0 });
    expect(isNoItem(f1, k.race.loc)).toBe(true);
    const sz = f1.zones.find((z) => z.kind === 'surface')!;
    expect(sz.surf).toBeGreaterThan(0);
  });

  it('boost pads on the baked road grant the pad boost', () => {
    const pad = f1.pads.find((p) => p.kind === 'boost' && p.path === 0)!;
    const rig = racingRig(f1);
    place(rig, 0, { s: pad.s0 - 20, u: (pad.u0 + pad.u1) / 2, speed: 30 });
    rig.run(90, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(rig.events.some((e) => e.t === 'boostStart' && e.kind === Boost.PAD)).toBe(true);
  });

  it('driving the shortcut branch keeps progress continuous and accepted by anti-cut', () => {
    const br = f1.path(1);
    expect(br.map).toBeDefined();
    const rig = racingRig(f1);
    const k = place(rig, 0, { s: br.map!.fromS - 40, speed: 25 });
    let onBranch = 0, maxOff = 0, back = 0, prev = k.race.loc.sMain;
    for (let t = 0; t < 900; t++) {
      rig.tick((_w, inp) => {
        const onB = k.race.loc.path === 1;
        const sB = onB ? k.race.loc.s : Math.max(0, k.race.loc.s - br.map!.fromS);
        inp[0]!.throttle = speedOf(k) < 25 ? 15 : 0;
        inp[0]!.steer = steerLeft(onB || sB < br.length - 5 ? pursue3dOn(1, sB) : pursue3d(f1, k, 10));
      });
      if (k.race.loc.path === 1) onBranch++;
      maxOff = Math.max(maxOff, k.race.offGraphTicks);
      if (k.race.loc.sMain < prev - 0.5) back++;
      prev = k.race.loc.sMain;
      if (k.race.loc.path === 0 && onBranch > 0 && k.race.loc.s > br.map!.toS + 30) break;
    }
    function pursue3dOn(path: number, sB: number): number {
      const saved = k.race.loc.s;
      k.race.loc.s = sB;
      const st = pursue3d(f1, k, 10, 0, path);
      k.race.loc.s = saved;
      return st;
    }
    expect(onBranch).toBeGreaterThan(60);
    expect(k.race.loc.path).toBe(0);
    expect(k.race.loc.s).toBeGreaterThan(br.map!.toS + 20);
    expect(k.stats.respawns).toBe(0);
    expect(maxOff).toBeLessThan(10);
    expect(back).toBe(0);
  });
});

describe('F2 bake: jump gap, open ledge, kill plane', () => {
  const J = f2.jumps[0]!;
  function jump(v0: number) {
    const rig = racingRig(f2);
    const k = place(rig, 0, { path: J.path, s: J.lipS - 12, speed: v0 });
    let takeoff = -1, landS = -1;
    for (let t = 0; t < 240; t++) {
      const n0 = rig.events.length;
      rig.tick((_w, inp) => { inp[0]!.throttle = 0; });
      for (const e of rig.events.slice(n0)) {
        if (e.t === 'air' && takeoff < 0) takeoff = speedOf(k);
        if (e.t === 'land' && landS < 0) landS = k.race.loc.s;
      }
      if (landS > 0 && k.race.loc.s > landS + 10) break;
    }
    return { k, takeoff, landS };
  }
  it.each([25, 32, 40, 46])('taking off at %i m/s clears the gap and lands on the landing face without respawn', (v) => {
    let v0 = v;
    for (let i = 0; i < 3; i++) v0 += v - jump(v0).takeoff;
    const r = jump(v0);
    expect(Math.abs(r.takeoff - v)).toBeLessThan(0.5);
    expect(r.landS).toBeGreaterThan(J.landS0);
    expect(r.landS).toBeLessThan(J.landS1);
    expect(r.k.stats.respawns).toBe(0);
    expect(r.k.body.grounded).toBe(1);
  });

  it('driving off the open ledge hits the kill plane, respawns on the road and drives on', () => {
    const rig = racingRig(f2);
    const kill = f2.zones.find((z) => z.kind === 'kill');
    // the ledge: the longest run of samples whose right road edge has no wall
    const f = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
    const cs = Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, depth: 0, flags: 0, tri: 0 }));
    let run = 0, bestRun = 0, ledgeS = 0;
    for (let s = 0; s < f2.lapLength; s += 5) {
      f2.frameAt(0, s, f);
      const open = f2.sphereWalls(f.px + f.rx * f.wR + f.ux * 0.6, f.py + f.ry * f.wR + f.uy * 0.6, f.pz + f.rz * f.wR + f.uz * 0.6, 0.85, cs, 8) === 0;
      run = open ? run + 5 : 0;
      if (run > bestRun) { bestRun = run; ledgeS = s - run / 2; }
    }
    expect(bestRun).toBeGreaterThan(100);
    const k = place(rig, 0, { s: ledgeS, u: 3, speed: 20, yawDeg: -60 });
    let respawnIn = -1;
    for (let t = 0; t < 400; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; });
      if (respawnIn < 0 && rig.events.some((e) => e.t === 'respawn' && e.phase === 'in')) respawnIn = t;
      if (respawnIn >= 0 && t > respawnIn + 90) break;
    }
    expect(kill ?? f2.killY).toBeDefined();
    expect(k.stats.respawns).toBe(1);
    expect(k.body.grounded).toBe(1);
    expect(k.race.loc.valid).toBe(1);
    expect(fwdKmh(k)).toBeGreaterThan(40); // control returned and it accelerated away
  });
});
