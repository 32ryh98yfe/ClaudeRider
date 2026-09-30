// Rails and warps on the real F4 bake (10-sim-spec §13.3–§13.4, cookbook §8): capture window, grind speed law and
// gauge, tangent exit onto the host; warp gates (full-width span and side portal) with transit, exit and progress.
import { describe, expect, it } from 'vitest';
import { Attach, type SimEvent } from '@cr/sim';
import { bakedTrack } from './rig.ts';
import { racingRig, place, speedOf, type Place } from './util.ts';

const T = bakedTrack('_test/f4_rails');
const R = T.rails[0]!;
const gate = T.warps.find((w) => w.id === 'gate')!, portal = T.warps.find((w) => w.id === 'portal')!;

interface Trace { capS: number; capV: number; lockTicks: number; exitS: number; gain: number; speeds: number[]; respawns: number; endPath: number; driftEnds: number }

function ride(p: Place, ticks = 260, throttle = 15, setup?: (k: ReturnType<typeof place>) => void): Trace {
  const rig = racingRig(T);
  const k = place(rig, 0, p);
  setup?.(k);
  const tr: Trace = { capS: -1, capV: 0, lockTicks: 0, exitS: -1, gain: 0, speeds: [], respawns: 0, endPath: -1, driftEnds: 0 };
  let g0 = 0;
  for (let t = 0; t < ticks; t++) {
    const was = k.body.attachKind, gBefore = k.drive.gauge, locS = k.race.loc.s;
    const n0 = rig.events.length;
    rig.tick((_w, inp) => { inp[0]!.throttle = throttle; });
    tr.driftEnds += rig.events.slice(n0).filter((e: SimEvent) => e.t === 'driftEnd').length;
    const now = k.body.attachKind;
    if (was !== Attach.RAIL && now === Attach.RAIL) { tr.capS = locS; tr.capV = speedOf(k); g0 = gBefore; }
    if (now === Attach.RAIL) { tr.lockTicks++; tr.speeds.push(speedOf(k)); }
    if (was === Attach.RAIL && now !== Attach.RAIL) { tr.gain = k.drive.gauge - g0; }
    if (tr.lockTicks > 0 && tr.exitS < 0 && now !== Attach.RAIL && k.race.loc.path === 0) tr.exitS = k.race.loc.s;
  }
  tr.respawns = k.stats.respawns; tr.endPath = k.race.loc.path;
  return tr;
}

describe('rails (F4 ore rail)', () => {
  it('a kart under the rail start, aligned and fast enough, locks on and grinds at the rail speed law', () => {
    const r = ride({ s: R.fromS - 25, u: -3, speed: 32 });
    expect(r.capS).toBeGreaterThan(R.fromS - 2.5);
    expect(r.capS).toBeLessThan(R.fromS + 3);
    expect(r.capV).toBeGreaterThan(R.speedMin - 0.01); // snapped up to speedMin on the capture tick
    expect(r.capV).toBeLessThan(R.speedMin + 0.1);
    for (let i = 1; i < r.speeds.length; i++) expect(r.speeds[i]!).toBeGreaterThanOrEqual(r.speeds[i - 1]! - 1e-3); // quantized velocity
    expect(Math.max(...r.speeds)).toBeLessThanOrEqual(R.speedMax + 1e-3);
    expect(Math.max(...r.speeds)).toBeGreaterThan(R.speedMax - 0.5);
    // lock time within V17's 0.8–3 s, gauge gained at gaugePerSec while locked
    expect(r.lockTicks).toBeGreaterThanOrEqual(48);
    expect(r.lockTicks).toBeLessThanOrEqual(180);
    expect(r.gain).toBeCloseTo((R.gaugePerSec * r.lockTicks) / 60, 2);
  });

  it('leaves along the exit tangent and lands on the host road near hostTo; no respawn', () => {
    const r = ride({ s: R.fromS - 25, u: -3, speed: 32 });
    expect(r.exitS).toBeGreaterThan(R.hostTo! - 5);
    expect(r.exitS).toBeLessThan(R.hostTo! + 15);
    expect(r.endPath).toBe(0);
    expect(r.respawns).toBe(0);
  });

  it('no capture outside the window: too far, too slow, or heading off by more than 25°', () => {
    expect(ride({ s: R.fromS - 25, u: 3, speed: 32 }, 120).capS).toBe(-1);
    expect(ride({ s: R.fromS - 6, u: -3, speed: 13 }, 60, 0).capS).toBe(-1);
    // the rail bends left from its start, so test the heading cone on the far side (35° right of the host)
    expect(ride({ s: R.fromS - 1, u: -3, speed: 32, yawDeg: -35 }, 10).capS).toBe(-1);
  });

  it('a drift ends when the kart locks on', () => {
    const r = ride({ s: R.fromS - 25, u: -3, speed: 32 }, 120, 15, (k) => { k.drive.drift = 1; k.drive.driftDir = 1; k.drive.driftTicks = 20; });
    expect(r.capS).toBeGreaterThan(0);
    expect(r.driftEnds).toBeGreaterThanOrEqual(1);
  });
});

describe('warps (F4 gate span and portal)', () => {
  function through(p: Place, ticks: number): { enterS: number; transit: number; exitS: number; vIn: number; vOut: number; distJump: number; respawns: number; hiddenGhost: boolean } {
    const rig = racingRig(T);
    const k = place(rig, 0, p);
    let enterS = -1, transit = 0, exitS = -1, vIn = 0, vOut = 0, distBefore = 0, distJump = 0, hiddenGhost = true;
    for (let t = 0; t < ticks; t++) {
      const was = k.body.attachKind, v = speedOf(k), d0 = k.race.raceDist;
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; });
      const now = k.body.attachKind;
      if (was !== Attach.WARP && now === Attach.WARP) { enterS = k.race.loc.s; vIn = v; distBefore = d0; }
      if (now === Attach.WARP) { transit++; if (k.body.ghostTicks <= 0) hiddenGhost = false; }
      if (was === Attach.WARP && now !== Attach.WARP) { exitS = k.race.loc.s; vOut = speedOf(k); distJump = k.race.raceDist - distBefore; }
    }
    return { enterS, transit, exitS, vIn, vOut, distJump, respawns: k.stats.respawns, hiddenGhost };
  }

  it('the no-geometry gate span: enter at its start, 30 ticks in transit (ghosted), exit at its end at the kept speed', () => {
    const r = through({ s: gate.s - 30, u: 0, speed: 34 }, 120);
    expect(Math.abs(r.enterS - gate.s)).toBeLessThan(1.5);
    expect(r.transit).toBe(gate.transitTicks);
    expect(r.hiddenGhost).toBe(true);
    expect(Math.abs(r.exitS - gate.exitS)).toBeLessThan(1);
    expect(Math.abs(r.vOut - r.vIn)).toBeLessThan(0.6);
    expect(r.distJump).toBeGreaterThan(gate.exitS - gate.s - 3);
    expect(r.respawns).toBe(0);
  });

  it('the side portal takes only karts inside its window [u0, u1]', () => {
    const inWin = through({ s: portal.s - 30, u: (portal.u0 + portal.u1) / 2, speed: 34 }, 120);
    expect(inWin.transit).toBe(portal.transitTicks);
    expect(Math.abs(inWin.exitS - portal.exitS)).toBeLessThan(1);
    expect(inWin.respawns).toBe(0);
    const outside = through({ s: portal.s - 30, u: 0, speed: 34 }, 120);
    expect(outside.transit).toBe(0);
  });
});
