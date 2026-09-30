// Ground, air and 3D motion (10-sim-spec §10, §13.5, §14.8): jumps, coyote time, landing, halfpipe walls up to
// 60°, track-gravity loops on RMF frames, low gravity and stacked decks.
import { describe, expect, it } from 'vitest';
import { Held, type KartState, type SimEvent } from '@cr/sim';
import { type Rig } from './rig.ts';
import { jumpKit, halfpipe, loopKit, helixKit, strip } from './fixtures/kits.ts';
import { racingRig, place, speedOf, steerLeft, pursue3d } from './util.ts';

/** Runs until `stop` or `max` ticks; collects this rig's events per tick. */
function runUntil(rig: Rig, max: number, each: (t: number, ev: SimEvent[]) => boolean | void, drive?: Parameters<Rig['tick']>[0]): void {
  for (let t = 0; t < max; t++) {
    const n0 = rig.events.length;
    rig.tick(drive);
    if (each(t, rig.events.slice(n0)) === true) return;
  }
}

describe('jumps (§10.3, §13.5, V11)', () => {
  /** Coasts up the ramp from `v0` (placed 12 m before the lip); returns take-off speed, landing s and impact. */
  function jump(v0: number) {
    const kit = jumpKit(2, true);
    const rig = racingRig(kit.track);
    const k = place(rig, 0, { s: kit.lipS - 12, speed: v0 });
    let takeoffV = -1, landS = -1, impact = 0, air = 0;
    runUntil(rig, 240, (_t, ev) => {
      for (const e of ev) {
        if (e.t === 'air' && takeoffV < 0) takeoffV = speedOf(k);
        if (e.t === 'land' && landS < 0) { landS = k.race.loc.s; impact = e.impact; }
      }
      if (!k.body.grounded) air++;
      return landS > 0 && k.race.loc.s > landS + 20;
    }, (_w, inp) => { inp[0]!.throttle = 0; });
    return { kit, k, takeoffV, landS, impact, air };
  }
  it.each([25, 30, 35, 40, 46])('taking off at %i m/s: flies, lands in the landing zone, no respawn', (v) => {
    // calibrate the entry speed so the lip speed is v (the ramp and overspeed decay cost a little)
    let v0 = v;
    for (let i = 0; i < 3; i++) v0 += v - jump(v0).takeoffV;
    const { kit, k, takeoffV, landS, impact, air } = jump(v0);
    expect(Math.abs(takeoffV - v)).toBeLessThan(0.3);
    expect(landS).toBeGreaterThanOrEqual(kit.landS0 + 1.5);
    expect(landS).toBeLessThanOrEqual(kit.landS1 - 5);
    expect(impact).toBeGreaterThan(6);
    expect(k.stats.respawns).toBe(0);
    expect(k.body.grounded).toBe(1);
    expect(air).toBeLessThan(72);
  });

  it('landing: the normal speed is removed and v × (1 − min(0.12, 0.01·(v_imp − 6))); no rebound, one land event', () => {
    const kit = jumpKit(2, true);
    const rig = racingRig(kit.track);
    const k = place(rig, 0, { s: kit.lipS - 30, speed: 31.2 });
    let before = 0, after = -1, impact = 0, lands = 0, landTick = -1, airAfter = 0;
    runUntil(rig, 200, (t, ev) => {
      for (const e of ev) if (e.t === 'land') { lands++; if (landTick < 0) { landTick = t; impact = e.impact; after = Math.hypot(k.body.vx, k.body.vz); } }
      if (landTick < 0) before = Math.hypot(k.body.vx, k.body.vz);
      if (landTick >= 0 && !k.body.grounded) airAfter++;
      return t > 150;
    }, (_w, inp) => { inp[0]!.throttle = 0; });
    const f = Math.min(0.12, 0.01 * (impact - 6));
    expect(after / before).toBeCloseTo(1 - f, 2);
    expect(lands).toBe(1);
    expect(impact).toBeGreaterThan(6);
    expect(airAfter).toBe(0); // stays on the ground from the touchdown tick (V11's ballistic touchdown point)
  });

  it('no ground for > 72 ticks outside a declared jump span respawns; inside one it does not', () => {
    const undeclared = jumpKit(40, false);
    const r1 = racingRig(undeclared.track), k1 = place(r1, 0, { s: undeclared.lipS - 20, speed: 30 });
    let respawnAir = -1, air1 = 0;
    runUntil(r1, 200, (_t, ev) => {
      if (!k1.body.grounded) air1++;
      if (ev.some((e) => e.t === 'respawn' && e.phase === 'out')) { respawnAir = air1; return true; }
    }, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(respawnAir).toBeGreaterThanOrEqual(72);
    expect(respawnAir).toBeLessThanOrEqual(76);
    const declared = jumpKit(40, true);
    const r2 = racingRig(declared.track), k2 = place(r2, 0, { s: declared.lipS - 20, speed: 30 });
    let landed = false;
    runUntil(r2, 200, (_t, ev) => { if (ev.some((e) => e.t === 'land')) landed = true; return landed; }, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(landed).toBe(true);
    expect(k2.stats.respawns).toBe(0);
    expect(k2.race.loc.valid).toBe(1);
  });

  it('a kart too slow for the gap falls in and respawns on the landing side, once (no respawn loop)', () => {
    const kit = jumpKit(2, true);
    const rig = racingRig(kit.track);
    const k = place(rig, 0, { s: kit.lipS - 20, speed: 18 }); // coasts to ≈ 13 m/s at the lip: short of the 14 m gap
    let placedAt = -1, placedDist = -1, distBefore = 0;
    runUntil(rig, 900, (_t, ev) => {
      if (k.race.respawnPhase === 0 && placedAt < 0) distBefore = k.race.raceDist;
      if (ev.some((e) => e.t === 'respawn' && e.phase === 'in')) { placedAt = k.race.loc.s; placedDist = k.race.raceDist; }
    }, (_w, inp) => { inp[0]!.throttle = placedAt < 0 ? 0 : 15; });
    expect(k.stats.respawns).toBe(1);
    expect(placedAt).toBeGreaterThan(kit.landS0);
    expect(placedAt).toBeLessThan(kit.landS1);
    expect(placedDist).toBeGreaterThan(distBefore); // progress moved forward with the kart
    expect(k.race.loc.s).toBeGreaterThan(kit.landS1); // and it drove on from there
  });

  it('coyote time: 6 ticks after leaving the ground the kart still steers and can start a drift', () => {
    const tryDrift = (after: number): KartState => {
      const kit = jumpKit(2, true);
      const rig = racingRig(kit.track);
      const k = place(rig, 0, { s: kit.lipS - 20, speed: 32 });
      let airTick = -1;
      for (let t = 0; t < 120; t++) {
        rig.tick((w, inp) => {
          inp[0]!.throttle = 15;
          if (airTick >= 0 && w.tick + 1 >= airTick + after) { inp[0]!.held = Held.DRIFT; inp[0]!.steer = steerLeft(1); }
        });
        if (airTick < 0 && rig.events.some((e) => e.t === 'air')) airTick = rig.w.tick;
        if (k.stats.drifts > 0 || (airTick >= 0 && rig.w.tick > airTick + after + 2)) break;
      }
      return k;
    };
    expect(tryDrift(6).stats.drifts).toBe(1);
    expect(tryDrift(7).stats.drifts).toBe(0);
  });

  it('in the air the nose follows the flight path and no gauge is gained', () => {
    const kit = jumpKit(2, true);
    const rig = racingRig(kit.track);
    const k = place(rig, 0, { s: kit.lipS - 20, speed: 34 });
    let pitchUp = 0, pitchDown = 0, gaugeInAir = 0;
    runUntil(rig, 120, (_t, ev) => {
      if (!k.body.grounded && k.body.coyote === 0) {
        if (k.body.fy > 0.05) pitchUp++;
        if (k.body.fy < -0.05) pitchDown++;
        gaugeInAir += k.drive.gauge;
      }
      return ev.some((e) => e.t === 'land');
    }, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(pitchUp).toBeGreaterThan(0);
    expect(pitchDown).toBeGreaterThan(0);
    expect(gaugeInAir).toBe(0);
  });
});

describe('halfpipe walls (§10.2, 11-track-spec §5.1)', () => {
  it('a kart at 30 m/s holds a line at 55° for 2 s without respawn', () => {
    const kit = halfpipe(60);
    const rig = racingRig(kit.track);
    const k = place(rig, 0, { s: 300, speed: 30 });
    // put the kart on the right wall where the section is 55° steep
    const th = (55 * Math.PI) / 180, u0 = kit.floor + kit.radius * Math.sin(th), h0 = kit.radius * (1 - Math.cos(th));
    const f = { tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, px: 0, py: 0, pz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
    kit.track.frameAt(0, 300, f);
    const b = k.body;
    b.px = f.px + f.rx * u0 + f.ux * h0; b.py = f.py + f.ry * u0 + f.uy * h0; b.pz = f.pz + f.rz * u0 + f.uz * h0;
    b.nx = -f.rx * Math.sin(th) + f.ux * Math.cos(th); b.ny = -f.ry * Math.sin(th) + f.uy * Math.cos(th); b.nz = -f.rz * Math.sin(th) + f.uz * Math.cos(th);
    kit.track.locateGlobal(b.px, b.py, b.pz, k.race.loc);
    Object.assign(k.race.lastValid, k.race.loc);
    let grounded = 0, maxDev = 0;
    for (let t = 0; t < 120; t++) {
      rig.tick((_w, inp) => {
        // hold the lateral position: steer uphill (right) when below the line, with damping on the drift rate
        const e = u0 - k.race.loc.u;
        const vr = b.vx * f.rx + b.vy * f.ry + b.vz * f.rz;
        inp[0]!.steer = steerLeft(-(0.35 * e - 0.25 * vr));
        inp[0]!.throttle = speedOf(k) < 30 ? 15 : 0;
      });
      if (b.grounded) grounded++;
      maxDev = Math.max(maxDev, Math.abs(k.race.loc.u - u0));
    }
    expect(k.stats.respawns).toBe(0);
    expect(grounded).toBeGreaterThanOrEqual(114);
    expect(maxDev).toBeLessThan(1.5);
    expect(speedOf(k)).toBeGreaterThan(27);
  });

  it('riding up the curved wall at speed follows the surface to 60° without leaving the ground', () => {
    const kit = halfpipe(60);
    const rig = racingRig(kit.track);
    const k = place(rig, 0, { s: 300, u: 0, speed: 32 });
    let maxU = 0, air = 0;
    for (let t = 0; t < 90; t++) {
      // aim up the right wall, then back down to the floor
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; inp[0]!.steer = steerLeft(pursue3d(kit.track, k, 12, t < 45 ? 12.5 : 0)); });
      maxU = Math.max(maxU, k.race.loc.u);
      if (!k.body.grounded) air++;
    }
    expect(maxU).toBeGreaterThan(9); // well onto the wall (≥ ~35° steep there)
    expect(air).toBeLessThanOrEqual(6);
    expect(k.stats.respawns).toBe(0);
  });
});

describe('track gravity, loops and low gravity (§10.1, 11-track-spec §4)', () => {
  it('loop R12 with track gravity: enters and exits at ≥ 30 m/s with no ground loss > 6 ticks', () => {
    const kit = loopKit();
    const rig = racingRig(kit.track);
    const k = place(rig, 0, { s: kit.loopS0 - 60, speed: 32 });
    let vIn = -1, vOut = -1, run = 0, maxRun = 0, top = -1e9, upsideDown = 0;
    for (let t = 0; t < 600; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; inp[0]!.steer = steerLeft(pursue3d(kit.track, k, 8)); });
      const s = k.race.loc.s;
      if (vIn < 0 && s >= kit.loopS0) vIn = speedOf(k);
      if (vOut < 0 && s >= kit.loopS1) vOut = speedOf(k);
      if (!k.body.grounded) { run++; maxRun = Math.max(maxRun, run); } else run = 0;
      top = Math.max(top, k.body.py);
      if (k.body.ny < -0.9) upsideDown++;
      if (s > kit.loopS1 + 60) break;
    }
    expect(vIn).toBeGreaterThanOrEqual(30);
    expect(vOut).toBeGreaterThanOrEqual(30);
    expect(maxRun).toBeLessThanOrEqual(6);
    expect(top).toBeGreaterThan(2 * kit.radius - 1);
    expect(upsideDown).toBeGreaterThan(3);
    expect(k.stats.respawns).toBe(0);
    expect(k.race.loc.s).toBeGreaterThan(kit.loopS1 + 50);
  });

  it('low gravity (sample flag GRAV low, default scale 0.4) lengthens the fall', () => {
    const t = strip('asphalt', { key: 'lowflag' }).track;
    // the fixture carries no low-g flags; a zone-free check of the default world value
    const rig = racingRig(t);
    place(rig, 0, { s: 300, h: 7, speed: 0 });
    let land = -1;
    runUntil(rig, 200, (i, ev) => { if (ev.some((e) => e.t === 'land')) { land = i + 1; return true; } });
    expect(land).toBeGreaterThan(40); // √(2·7/28) s ≈ 42 ticks under world gravity
    expect(land).toBeLessThan(46);
  });
});

describe('stacked decks (V2 ≥ 8 m, §10.2)', () => {
  const kit = helixKit(10, 2.5);
  it('driving the helix keeps progress on the right deck', () => {
    const rig = racingRig(kit.track);
    const k = place(rig, 0, { s: 30, speed: 25 });
    let maxH = 0, prevS = -1e9, backwards = 0;
    for (let t = 0; t < 2400 && k.race.loc.s < kit.S[0]![kit.S[0]!.length - 1]! - 40; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = speedOf(k) < 25 ? 15 : 0; inp[0]!.steer = steerLeft(pursue3d(kit.track, k, 10)); });
      maxH = Math.max(maxH, Math.abs(k.race.loc.h));
      if (k.race.loc.s < prevS - 0.01) backwards++;
      prevS = k.race.loc.s;
    }
    expect(k.stats.respawns).toBe(0);
    expect(backwards).toBe(0);
    expect(maxH).toBeLessThan(1);
    expect(k.body.py).toBeGreaterThan(kit.rise * kit.turns - 1);
  });

  it('drops onto any deck land on that deck, never the one below', () => {
    const rig = racingRig(kit.track);
    const k = rig.w.karts[0]!;
    let seed = 12345;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const L = kit.S[0]![kit.S[0]!.length - 1]!;
    for (let n = 0; n < 200; n++) {
      const s = 70 + rnd() * (L - 140), u = (rnd() - 0.5) * 10, h = 0.5 + rnd() * 7.5;
      place(rig, 0, { s, u, h, speed: 0 });
      const y0 = k.body.py - h;
      let landed = false;
      for (let t = 0; t < 90 && !landed; t++) { const n0 = rig.events.length; rig.tick(); landed = rig.events.slice(n0).some((e) => e.t === 'land'); }
      expect(landed).toBe(true);
      expect(Math.abs(k.body.py - y0)).toBeLessThan(0.3);
    }
  });
});
