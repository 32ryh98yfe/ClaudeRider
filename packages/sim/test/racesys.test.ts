// Race systems (10-sim-spec §8–§12): kart–kart contacts (symmetric, soft, capped), team gauge and team booster,
// Infinite Boost auto-fill, manual reset (R) with its cooldown and slow cap.
import { describe, expect, it } from 'vitest';
import { Edge, Held, type SimEvent } from '@cr/sim';
import { flatPlane } from './fixtures/kits.ts';
import { racingRig, place, speedOf } from './util.ts';
import { addGauge, GaugeSrc } from '../src/kart/gauge.ts';
import { paramsFor, SHARED } from '../src/kart/params.ts';
import { SLOW_CAP } from '../src/kart/dynamics.ts';
import { getContent } from './rig.ts';

const pebble = paramsFor(getContent().karts.get('pebble'));

describe('kart–kart contacts (§10.5)', () => {
  /** Two karts 2.4 m apart converging at ±8°; returns their velocities after 20 ticks, with and without the other. */
  function converge(swap: boolean): { v: number[][]; alone: number[][]; bumps: number } {
    const run = (both: boolean): { v: number[][]; bumps: number } => {
      const rig = racingRig(flatPlane().track, { slots: [{}, {}] });
      const a = swap ? 1 : 0, b = swap ? 0 : 1;
      place(rig, a, { s: 200, u: -1.2, speed: 30, yawDeg: -8 });
      place(rig, b, { s: 200, u: both ? 1.2 : 60, speed: 30, yawDeg: 8 });
      let bumps = 0;
      for (let t = 0; t < 20; t++) {
        const n0 = rig.events.length;
        rig.tick((_w, inp) => { for (const i of inp) i.throttle = 15; });
        bumps += rig.events.slice(n0).filter((e: SimEvent) => e.t === 'bump').length;
      }
      const vel = (i: number): number[] => { const k = rig.w.karts[i]!.body; return [k.vx, k.vy, k.vz]; };
      return { v: [vel(a), vel(b)], bumps };
    };
    const w = run(true), s = run(false);
    return { v: w.v, alone: s.v, bumps: w.bumps };
  }

  it('equal karts get equal and opposite velocity changes, each within the 6 m/s cap', () => {
    const r = converge(false);
    expect(r.bumps).toBeGreaterThan(0);
    const dA = r.v[0]!.map((x, i) => x - r.alone[0]![i]!), dB = r.v[1]!.map((x, i) => x - r.alone[1]![i]!);
    const lenA = Math.hypot(...dA), lenB = Math.hypot(...dB);
    expect(lenA).toBeGreaterThan(0.5);
    expect(lenA).toBeLessThanOrEqual(6 + 1e-6);
    expect(Math.abs(lenA - lenB)).toBeLessThan(0.05 * lenA);
    expect(dA[0]! * dB[0]! + dA[2]! * dB[2]!).toBeLessThan(0); // opposite directions
  });

  it('the result does not depend on slot order', () => {
    const a = converge(false), b = converge(true);
    for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) expect(b.v[k]![i]!).toBeCloseTo(a.v[k]![i]!, 9);
  });
});

describe('team gauge and team booster (§9.3)', () => {
  const duo = () => racingRig(flatPlane().track, { teams: 'duo', slots: [{ team: 0 }, { team: 0 }, { team: 1 }, { team: 1 }] });

  it('drift gauge feeds the team gauge (size 2·teamSize); when full every racing teammate gets a team booster', () => {
    const rig = duo();
    const [k0, k1, k2] = rig.w.karts;
    k1!.drive.boosters = 2; // full slots: a normal booster is converted
    for (let i = 0; i < 39; i++) addGauge(rig.w, k0!, 0.1, GaugeSrc.DRIFT, 2, rig.ctx);
    expect(rig.w.teams[0]!.gauge).toBeCloseTo(3.9, 9);
    expect(k0!.drive.teamBoosters).toBe(0);
    addGauge(rig.w, k0!, 0.1, GaugeSrc.DRIFT, 2, rig.ctx);
    expect(rig.w.teams[0]!.gauge).toBe(0);
    expect(k0!.drive.teamBoosters).toBe(1);
    expect([k1!.drive.boosters, k1!.drive.teamBoosters]).toEqual([1, 1]);
    expect(k2!.drive.teamBoosters).toBe(0);
    expect(rig.w.teams[1]!.gauge).toBe(0);
  });

  it('Infinite-Boost auto-fill does not feed the team gauge; finished karts receive nothing', () => {
    const rig = duo();
    const [k0, k1] = rig.w.karts;
    addGauge(rig.w, k0!, 0.5, GaugeSrc.AUTO, 2, rig.ctx);
    expect(rig.w.teams[0]!.gauge).toBe(0);
    k1!.race.finishTick = rig.w.tick;
    addGauge(rig.w, k0!, 4, GaugeSrc.DRIFT, 2, rig.ctx);
    expect(k0!.drive.teamBoosters).toBe(1);
    expect(k1!.drive.teamBoosters).toBe(0);
  });

  it('a stored team booster fires first and holds the team speed 1.02·vBoost for 270 ticks', () => {
    const rig = duo();
    const k = place(rig, 0, { s: 200, speed: 30 });
    k.drive.boosters = 1; k.drive.teamBoosters = 1;
    let top = 0, ticks = 0;
    for (let t = 0; t < 320; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; if (t === 0) inp[0]!.edges |= Edge.USE_ITEM; });
      if (t === 0) expect([k.drive.boosters, k.drive.teamBoosters, k.drive.boostKind]).toEqual([1, 0, 2]);
      if (k.drive.boostTicks > 0) { ticks++; top = Math.max(top, speedOf(k)); }
    }
    expect(ticks).toBeGreaterThanOrEqual(SHARED.teamBoostTicks - 1);
    expect(ticks).toBeLessThanOrEqual(SHARED.teamBoostTicks + 1);
    expect(top).toBeGreaterThan(pebble.vTeam - 0.4);
    expect(top).toBeLessThan(pebble.vTeam + 0.2);
    expect(pebble.vTeam).toBeCloseTo(1.02 * pebble.vBoost, 9);
  });
});

describe('Infinite Boost (§9.4)', () => {
  it('the gauge fills by itself at 0.45/s, and boosters chain while ITEM is held', () => {
    const rig = racingRig(flatPlane().track, { mode: 'infinite' });
    const k = place(rig, 0, { s: 200, speed: 30 });
    k.drive.gauge = 0; k.drive.boosters = 0;
    let fullAt = -1;
    for (let t = 0; t < 200 && fullAt < 0; t++) {
      const n0 = rig.events.length;
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; });
      if (rig.events.slice(n0).some((e: SimEvent) => e.t === 'gaugeFull')) fullAt = t + 1;
    }
    const expected = Math.ceil(60 / SHARED.infiniteFillPerSec);
    expect(Math.abs(fullAt - expected)).toBeLessThanOrEqual(3);
    // holding ITEM fires each booster as it comes: the kart never drops back to grip speed for long
    let boosted = 0;
    for (let t = 0; t < 600; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; inp[0]!.held |= Held.ITEM; });
      if (k.drive.boostTicks > 0) boosted++;
    }
    expect(boosted).toBeGreaterThan(0.6 * 600);
  });
});

describe('manual reset R (§12.6)', () => {
  it('only when slow for 1 s; respawn, then held to SLOW_CAP·vGrip for 60 ticks; cooldown 180 ticks', () => {
    const rig = racingRig(flatPlane().track);
    const k = place(rig, 0, { s: 200, speed: 30 });
    rig.tick((_w, inp) => { inp[0]!.edges |= Edge.RESPAWN; inp[0]!.throttle = 15; });
    expect(k.race.respawnPhase).toBe(0); // fast: ignored
    place(rig, 0, { s: 200, speed: 0 });
    rig.run(61, (_w, inp) => { inp[0]!.throttle = 0; inp[0]!.brake = 0; });
    expect(k.drive.lowSpeedTicks).toBeGreaterThanOrEqual(60);
    rig.tick((_w, inp) => { inp[0]!.edges |= Edge.RESPAWN; });
    expect(k.race.respawnPhase).toBe(1);
    expect(k.stats.respawns).toBe(1);
    while (k.race.respawnPhase !== 0) rig.tick();
    // control is back: full throttle is capped for the slow window, then free
    let capped = 0, over = 0;
    const cap = SLOW_CAP * pebble.vGrip;
    for (let t = 0; t < 300; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; if (t === 5) inp[0]!.edges |= Edge.RESPAWN; });
      if (k.race.slowTicks > 0) { capped++; expect(speedOf(k)).toBeLessThanOrEqual(cap + 0.05); }
      else if (speedOf(k) > cap + 1) over++;
    }
    expect(capped).toBeGreaterThanOrEqual(55);
    expect(capped).toBeLessThanOrEqual(61);
    expect(over).toBeGreaterThan(0);
    expect(k.stats.respawns).toBe(1); // the second press was inside the cooldown (and the kart was not slow)
  });
});
