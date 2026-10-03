// physics: M5 driving techniques, the acceptance table of docs/design/15-driving-techniques.md §5 (items 1–9).
// Written from the spec text alone, independently of the implementation in kart/**: every script is an exact input
// sequence on the 1 km flat plane (or a corridor / slope fixture), and every number comes from doc 15 (§1 speeds,
// §2 constants) or from the laws of §4 evaluated on the observed state. The oracle comparison of item 9 runs in
// physics.test.ts over test/oraclelogs.ts. The pins of the M5 review (Mirror Mode taps, the air rules, external drift
// ends, threshold edges) schedule item effects through the sim's own effect scheduler, the one internal import here.
import { describe, expect, it } from 'vitest';
import {
  Attach, Boost, Edge, Gear, Held, KMH_PER_MPS, SIN, V_REF, cloneWorld, decayF, hashWorld, newKart, paramsFor,
  type BakedTrack, type KartState, type SimEvent,
} from '@cr/sim';
import { EF } from '../src/items/codes.ts';
import { scheduleEffect } from '../src/items/effects.ts';
import { bakedTrack, getContent, makeRig, type Rig } from './rig.ts';
import { corridor, flatPlane, strip } from './fixtures/kits.ts';
import { buildFixture, flatProfile, newMesh, sweep, turtle } from './fixtures/builder.ts';
import { fwdKmh, KMH, place, racingRig, steerLeft } from './util.ts';
import type { OracleParams, TechParams } from './oracle/proto2d.ts';

const DT = 1 / 60;
const flat = flatPlane().track;
// the §2 keys join KartParams in M5; the cast keeps this file compiling on either side of that change
const P = paramsFor(getContent().karts.get('pebble')) as OracleParams;
const Q2 = 2 / 4096; // two velocity quanta

/** doc 15 §2, verbatim. */
const DOC15: Record<keyof TechParams, number> = {
  vReverse: 10.78, aReverse: 8, revEngageTicks: 6, zeroLockGt: 4.2, postTicks: 30, kPostHold: 6, kPostRel: 0.7,
  aDrag: 5, etaDrag: 1.0, dragCapMul: 1.0662, tapCapStep: 0.01839, tapStreakMax: 3, tapYaw: 0.7, tapAccelMul: 2,
  tapTicks: 8, tapGrace: 8, tapMinGap: 6, tapMaxGap: 12, dragNeutral: 0.3,
  dragEnterLo: 0.3420201433256687, dragEnterHi: 0.573576436351046, dragExitLo: 0.3090169943749474, dragExitHi: 0.6018150231520483,
  cutSteer: 0.7, cutTicks: 2, etaCut: 0.8, revGaugeMul: 3, brakeTurnTicks: 8, brakeTurnMul: 2, spinTicks: 11,
  spinSpeed: 20 / (205 / 34), spinStunTicks: 15,
};

// ---------------------------------------------------------------------------------------------------- helpers
/** `raw` is the InputFrame steer itself (+ = right, ±127), for threshold edges; it overrides `steer`. */
interface Frame { steer?: number /* + = left */; raw?: number; thr?: 0 | 1; brk?: 0 | 1; drift?: boolean; edges?: number }

/** One tick for slot 0; returns the events it emitted. */
function tick(rig: Rig, f: Frame): SimEvent[] {
  const n0 = rig.events.length;
  rig.tick((_w, inp) => {
    const o = inp[0]!;
    o.steer = f.raw ?? steerLeft(f.steer ?? 0); o.throttle = (f.thr ?? 1) ? 15 : 0; o.brake = f.brk ? 15 : 0;
    o.held = f.drift ? Held.DRIFT : 0; o.edges = f.edges ?? 0;
  });
  return rig.events.slice(n0);
}

/** A racing rig with pebble on `track` at s = 300, moving at `speed` (throttle already held). */
function rigAt(speed: number, setup?: (k: KartState) => void, track: BakedTrack = flat, s = 300): { rig: Rig; k: KartState } {
  const rig = racingRig(track);
  const k = place(rig, 0, { s, speed });
  k.drive.prevThrottle = 1;
  setup?.(k);
  return { rig, k };
}

/** Effects scheduled by the tests come from the track (no attacker slot). */
const TRACK_SOURCE = 255;
/** Schedules effect `code` on slot 0, starting on the next tick. */
function afflict(rig: Rig, code: number, dur: number, param = 0): void {
  expect(scheduleEffect(rig.w, rig.ctx, code, 0, TRACK_SOURCE, rig.w.tick + 1, dur, param, 0, 77), `effect ${code}`).not.toBeNull();
}

/**
 * Puts `k` into a live left drift as K7b will see it on the next tick: 30 ticks old, boosting, DRIFT and ↑ already
 * held, planar speed `v`, and sin β toward the drift side equal to sin(betaDeg) *after* that tick's K5 turn. The yaw
 * rate is set to the K4 target for neutral steer (y0/(1 + 30·DT/y0T) + y2), so K4 keeps it and K5 turns the nose by
 * exactly yawRate·DT; the velocity therefore starts that much short of β, to the right of the nose.
 */
function liveDrift(k: KartState, betaDeg: number, o: { drag?: number; streak?: number; gap?: number; v?: number } = {}): void {
  const b = k.body, d = k.drive, v = o.v ?? 45;
  d.drift = 1; d.driftDir = 1; d.driftTicks = 30; d.fatigueTicks = 30; d.reDriftLock = 0;
  d.dragTicks = o.drag ?? 0; d.tapStreak = o.streak ?? 0; d.tapGap = o.gap ?? 255; d.counterTicks = 0; d.brakeTicks = 0;
  d.boostTicks = 120; d.boostKind = Boost.NORMAL; d.prevHeld = Held.DRIFT; d.prevThrottle = 1;
  const r = P.y0 / (1 + (30 * DT) / P.y0T) + P.y2;
  b.yawRate = r;
  const beta = (betaDeg * Math.PI) / 180, a = beta - r * DT;
  d.driftPeak = Math.sin(beta);
  // l = n × f; a left drift slides to the right of the nose (along −l)
  const lx = b.ny * b.fz - b.nz * b.fy, ly = b.nz * b.fx - b.nx * b.fz, lz = b.nx * b.fy - b.ny * b.fx;
  b.vx = v * (Math.cos(a) * b.fx - Math.sin(a) * lx); b.vy = v * (Math.cos(a) * b.fy - Math.sin(a) * ly); b.vz = v * (Math.cos(a) * b.fz - Math.sin(a) * lz);
}
/** The per-drift technique fields (§4.2, §4.7) and their idle values. */
const techOf = (k: KartState): Record<string, number> => {
  const d = k.drive;
  return { dragTicks: d.dragTicks, tapStreak: d.tapStreak, tapGap: d.tapGap, counterTicks: d.counterTicks, brakeTicks: d.brakeTicks };
};
const TECH_IDLE = { dragTicks: 0, tapStreak: 0, tapGap: 255, counterTicks: 0, brakeTicks: 0 };

const planar = (k: KartState): number => Math.hypot(k.body.vx, k.body.vz);
const fwd = (k: KartState): number => k.body.vx * k.body.fx + k.body.vy * k.body.fy + k.body.vz * k.body.fz;
/** Lateral speed w = v·l on the flat plane (l = n × f = (fz, 0, −fx), + = left). */
const lat = (k: KartState): number => k.body.vx * k.body.fz - k.body.vz * k.body.fx;
/** sin β toward the drift side for a drift in direction `dir` (+1 = left). */
const sbOf = (k: KartState, dir: number): number => (-dir * lat(k)) / planar(k);
/** Heading (rad, + = left / CCW from above). */
const heading = (k: KartState): number => Math.atan2(-k.body.fz, k.body.fx);
const wrap = (a: number): number => (a > Math.PI ? a - 2 * Math.PI : a < -Math.PI ? a + 2 * Math.PI : a);
const has = (ev: SimEvent[], t: SimEvent['t']): boolean => ev.some((e) => e.t === t && (!('kart' in e) || e.kart === 0));
const dragOn = (ev: SimEvent[]): boolean => ev.some((e) => e.t === 'drag' && e.kart === 0 && e.on);
const dragOff = (ev: SimEvent[]): boolean => ev.some((e) => e.t === 'drag' && e.kart === 0 && !e.on);
const streakOf = (ev: SimEvent[]): number => { for (const e of ev) if (e.t === 'tapBoost' && e.kart === 0) return e.streak; return 0; };
const gearOf = (ev: SimEvent[]): number => { for (const e of ev) if (e.t === 'gear' && e.kart === 0) return e.gear; return -1; };

/** Drift gauge gain of one tick (10-sim-spec §8.1) evaluated on the kart's state after that tick. */
function gaugeFormula(k: KartState, dir: number): number {
  const v = planar(k), sb = sbOf(k, dir);
  if (v < 10 || sb <= 0) return 0;
  let sl = sb / P.gSlipRef; if (sl > 1) sl = 1; sl = Math.sqrt(sl);
  return (P.g0 * sl * (v / P.vGrip)) / (1 + (k.drive.fatigueTicks * DT) / P.gTau) * DT;
}

// ---------------------------------------------------------------------------------------------------- 1 display
describe('physics: M5 display and constants (doc 15 §1–§2, §5 item 1)', () => {
  it('34 m/s reads 205.0 km/h; the spec speeds convert as in §1; body vBoost ×(45.11/44.4)', () => {
    expect(V_REF * KMH_PER_MPS).toBeCloseTo(205, 9);
    expect(KMH).toBe(KMH_PER_MPS);
    for (const [kmh, mps] of [[290, 48.10], [300, 49.76], [305, 50.59], [20, 3.317], [65, 10.78]] as const) {
      expect(Math.abs(kmh / KMH_PER_MPS - mps), `${kmh} km/h`).toBeLessThanOrEqual(0.005);
    }
    const karts = getContent().karts;
    expect(karts.get('pebble').vBoost).toBe(45.11);
    expect(karts.get('arrowhead').vBoost).toBe(45.72);
    expect(karts.get('neon_blade').vBoost).toBe(45.92);
    expect(karts.get('glacier_sled').vBoost).toBe(44.50);
    expect(45.11 * KMH_PER_MPS).toBeCloseTo(272, 0);
  });

  it('booster plateau reads 272 ± 0.5 km/h', () => {
    const { rig, k } = rigAt(34, (kk) => { kk.drive.boosters = 1; });
    const at: number[] = [];
    for (let t = 0; t < 175; t++) { tick(rig, { edges: t === 0 ? Edge.USE_ITEM : 0 }); at.push(fwdKmh(k)); }
    for (let t = 120; t < 175; t++) { expect(at[t]!).toBeGreaterThanOrEqual(271.5); expect(at[t]!).toBeLessThanOrEqual(272.5); }
  });

  it('SHARED gains the §2 constants and SIN gains d18, d20, d35, d37', () => {
    const p = P as unknown as Record<string, number>;
    // spinSpeed is given as 20 / (205/34) = 3.317073: either form is accepted
    for (const [key, v] of Object.entries(DOC15)) expect(p[key], key).toBeCloseTo(v, key === 'spinSpeed' ? 6 : 12);
    const S = SIN as unknown as Readonly<Record<string, number>>;
    expect(S['d18']).toBe(0.3090169943749474);
    expect(S['d20']).toBe(0.3420201433256687);
    expect(S['d35']).toBe(0.573576436351046);
    expect(S['d37']).toBe(0.6018150231520483);
    for (const [d, key] of [[18, 'dragExitLo'], [20, 'dragEnterLo'], [35, 'dragEnterHi'], [37, 'dragExitHi']] as const) {
      expect(p[key]).toBeCloseTo(Math.sin((d * Math.PI) / 180), 15);
    }
  });

  it('the drag and tap caps read 290 / 295 / 300 / 305 km/h on Balance', () => {
    [290, 295, 300, 305].forEach((kmh, streak) => {
      expect(Math.abs(P.vBoost * (P.dragCapMul + P.tapCapStep * streak) * KMH_PER_MPS - kmh), `streak ${streak}`).toBeLessThanOrEqual(0.05);
    });
  });
});

// ---------------------------------------------------------------------------------------------------- 2 coast, zero-lock
/** A straight 24 m road climbing `grade` (rise/run) along +x. */
function slope(grade: number): BakedTrack {
  const F = turtle([{ len: 500 }], { x: -100, ds: 1, y: (s) => grade * s, slope: () => grade });
  const ground = newMesh();
  sweep(ground, F, () => flatProfile(-12, 12, 8), { every: 1 });
  return buildFixture({ id: `slope_${grade}`, paths: [{ kind: 'main', closed: false, frames: F, wL: 12, wR: 12 }], ground, lineAt: 100 }).track;
}

describe('physics: coast and zero-lock (doc 15 §4.8, §5 item 2)', () => {
  it('no keys: D → N, coasting at 2.5 m/s² from 20 m/s reaches exactly 0, then STOP and the position is frozen', () => {
    const { rig, k } = rigAt(20);
    const first = tick(rig, { thr: 0 });
    expect(gearOf(first)).toBe(Gear.N);
    expect(k.drive.gear).toBe(Gear.N);
    expect(Math.abs(20 - fwd(k) - 2.5 * DT)).toBeLessThanOrEqual(Q2);
    let zeroAt = -1, stopAt = -1;
    for (let t = 1; t < 560; t++) {
      const ev = tick(rig, { thr: 0 });
      if (gearOf(ev) === Gear.STOP) stopAt = t;
      if (zeroAt < 0 && k.body.vx === 0 && k.body.vy === 0 && k.body.vz === 0) zeroAt = t;
    }
    expect(zeroAt).toBeGreaterThanOrEqual(470); expect(zeroAt).toBeLessThanOrEqual(490); // 20 / 2.5 s = 480 ticks
    expect(Math.abs(stopAt - zeroAt)).toBeLessThanOrEqual(1);
    expect(k.drive.gear).toBe(Gear.STOP);
    const p0 = [k.body.px, k.body.py, k.body.pz];
    for (let t = 0; t < 120; t++) {
      tick(rig, { thr: 0, steer: t < 60 ? 1 : -1 });
      expect([k.body.px, k.body.py, k.body.pz]).toEqual(p0);
      expect(k.body.vx === 0 && k.body.vz === 0).toBe(true);
    }
    expect(k.drive.gear).toBe(Gear.STOP);
  });

  it('a kart at rest in STOP stays put on a 10% grade (|g_t| 2.79 ≤ 4.2) and rolls on a 20% grade (5.49 > 4.2)', () => {
    const hold = rigAt(0, undefined, slope(0.1), 200);
    expect(hold.k.drive.gear).toBe(Gear.STOP);
    const h0 = [hold.k.body.px, hold.k.body.py, hold.k.body.pz];
    hold.rig.run(120, () => { /* no keys */ });
    expect(Math.hypot(hold.k.body.px - h0[0]!, hold.k.body.py - h0[1]!, hold.k.body.pz - h0[2]!)).toBeLessThan(1e-3);
    expect(Math.hypot(hold.k.body.vx, hold.k.body.vy, hold.k.body.vz)).toBeLessThan(1e-3);
    const roll = rigAt(0, undefined, slope(0.2), 200);
    const r0 = [roll.k.body.px, roll.k.body.py, roll.k.body.pz];
    roll.rig.run(120, () => { /* no keys */ });
    // net 5.49 − 2.5 (coast drag) ≈ 3 m/s² backwards: ≈ 6 m in 2 s
    expect(roll.k.body.px - r0[0]!).toBeLessThan(-2);
  });

  it('a kart in STOP hit side-on keeps its push: the zero-lock waits for the planar speed to die down', () => {
    // kart 1 coasts at 8 m/s into the side of kart 0, which sits at rest in STOP
    const rig = racingRig(flat, { slots: [{}, {}] });
    const k = place(rig, 0, { s: 300, speed: 0 });
    const o = place(rig, 1, { s: 300, u: -5, speed: 8, yawDeg: -90 });
    expect(k.drive.gear).toBe(Gear.STOP);
    expect(o.drive.gear).toBe(Gear.D);
    const p0 = [k.body.px, k.body.pz];
    let bumps = 0, maxLat = 0;
    const gears: number[] = [];
    for (let t = 0; t < 120; t++) {
      const ev = tick(rig, { thr: 0 });
      if (ev.some((e) => e.t === 'bump')) bumps++;
      for (const e of ev) if (e.t === 'gear' && e.kart === 0) gears.push(e.gear);
      maxLat = Math.max(maxLat, Math.abs(lat(k)));
    }
    expect(bumps).toBeGreaterThan(0);
    // pushed out of STOP once, slides in N, and locks again only when it has come to rest (no N ↔ STOP flicker)
    expect(gears).toEqual([Gear.N, Gear.STOP]);
    expect(maxLat).toBeGreaterThan(1);
    // the grip damping (kLatGrip) stops the slide after ≈ 0.32 m; the kart moved 0.05 m when the lock wiped the
    // sideways speed on every contact tick
    expect(Math.hypot(k.body.px - p0[0]!, k.body.pz - p0[1]!)).toBeGreaterThan(0.25);
    expect(k.drive.gear).toBe(Gear.STOP);
    expect(planar(k)).toBe(0);
  });

  it('coasting uphill on a 10% grade comes to rest, locks in STOP and stays there', () => {
    const { rig, k } = rigAt(8, undefined, slope(0.1), 200);
    let stopAt = -1;
    for (let t = 0; t < 240 && stopAt < 0; t++) if (gearOf(tick(rig, { thr: 0 })) === Gear.STOP) stopAt = t;
    expect(stopAt).toBeGreaterThan(0);
    const p0 = [k.body.px, k.body.py, k.body.pz];
    rig.run(120, () => { /* no keys */ });
    expect(k.drive.gear).toBe(Gear.STOP);
    expect(Math.hypot(k.body.px - p0[0]!, k.body.py - p0[1]!, k.body.pz - p0[2]!)).toBeLessThan(1e-3);
  });
});

// ---------------------------------------------------------------------------------------------------- 3 gears
describe('physics: gears (doc 15 §4.8, §5 item 3)', () => {
  /** Brakes from 20 m/s with ↓ only for `n` ticks; records gear changes by tick. */
  function brakeRun(n: number): { rig: Rig; k: KartState; gears: [number, number][]; u: number[] } {
    const { rig, k } = rigAt(20);
    const gears: [number, number][] = [], u: number[] = [];
    for (let t = 0; t < n; t++) {
      const g = gearOf(tick(rig, { thr: 0, brk: 1 }));
      if (g >= 0) gears.push([t, g]);
      u.push(fwd(k));
    }
    return { rig, k, gears, u };
  }

  it('↓ while moving forward brakes at 24 m/s²; at 0: STOP for 6 ticks, then R, reverse capped at −10.78 m/s (65.0 ± 0.3 km/h)', () => {
    const { k, gears, u } = brakeRun(500);
    for (let t = 1; t < 40; t++) expect(Math.abs(u[t - 1]! - u[t]! - 24 * DT), `tick ${t}`).toBeLessThanOrEqual(Q2);
    const stop = gears.find(([, g]) => g === Gear.STOP), rev = gears.find(([, g]) => g === Gear.R);
    expect(stop).toBeDefined(); expect(rev).toBeDefined();
    const [tS] = stop!, [tR] = rev!;
    // STOP is entered on the first tick with u ≤ 0.5 and held for revEngageTicks ticks of ↓; R engages on the next one
    expect(u[tS - 1]!).toBeLessThanOrEqual(0.5);
    expect(tR - tS).toBe(6);
    for (let t = tS; t < tR; t++) expect(u[t]!, `STOP tick ${t}`).toBe(0);
    expect(u[tR]!).toBeLessThan(0);
    // −aReverse·(1 − (u/vReverse)²) from rest: −8/60 on the first R tick, then the asymptote
    expect(Math.abs(u[tR]! + 8 * DT)).toBeLessThanOrEqual(Q2);
    for (let t = tR; t < u.length; t++) expect(u[t]!).toBeGreaterThanOrEqual(-10.78 - 0.002);
    const vEnd = -u[u.length - 1]!;
    expect(vEnd).toBeGreaterThan(10.73);
    expect(Math.abs(vEnd * KMH - 65)).toBeLessThanOrEqual(0.3);
    expect(k.drive.gear).toBe(Gear.R);
    expect(gears.map(([, g]) => g)).toEqual([Gear.STOP, Gear.R]);
  });

  /** Holds ↓ only for `n` ticks from now; returns the gear and forward speed after each tick. */
  function holdBrake(rig: Rig, k: KartState, n: number): { gear: number[]; u: number[] } {
    const gear: number[] = [], u: number[] = [];
    for (let t = 0; t < n; t++) { tick(rig, { thr: 0, brk: 1 }); gear.push(k.drive.gear); u.push(fwd(k)); }
    return { gear, u };
  }
  /** ↓ ticks spent in STOP before R engages: STOP for ticks 0..5 of ↓ (u = 0), R on tick 6 (−aReverse·DT). */
  function expectSixStopTicks(r: { gear: number[]; u: number[] }, label: string): void {
    for (let t = 0; t < 6; t++) { expect(r.gear[t], `${label}: ↓ tick ${t + 1}`).toBe(Gear.STOP); expect(r.u[t], `${label}: ↓ tick ${t + 1}`).toBe(0); }
    expect(r.gear[6], `${label}: ↓ tick 7`).toBe(Gear.R);
    expect(Math.abs(r.u[6]! + 8 * DT), label).toBeLessThanOrEqual(Q2);
  }

  it('R engages after 6 ↓ ticks at STOP on every path: a coasted stop, a kart at rest on the grid, a respawn', () => {
    // coast from 3 m/s to rest (STOP via N), then ↓
    const c = rigAt(3);
    for (let t = 0; t < 200 && c.k.drive.gear !== Gear.STOP; t++) tick(c.rig, { thr: 0 });
    expect(c.k.drive.gear).toBe(Gear.STOP);
    c.rig.run(10, () => { /* settled in STOP */ });
    expectSixStopTicks(holdBrake(c.rig, c.k, 10), 'coasted');
    // placed at rest (the start grid's STOP)
    const g = rigAt(0);
    expect(g.k.drive.gear).toBe(Gear.STOP);
    expectSixStopTicks(holdBrake(g.rig, g.k, 10), 'grid');
    // a (manual) respawn returns the gear to STOP; ↓ held through the lock counts from the first controlled tick
    const r = rigAt(2, (kk) => { kk.drive.lowSpeedTicks = 60; });
    tick(r.rig, { thr: 0, edges: Edge.RESPAWN });
    expect(r.k.race.respawnPhase).not.toBe(0);
    const rr: { gear: number[]; u: number[] } = { gear: [], u: [] };
    for (let t = 0; t < 200 && rr.gear.length < 10; t++) {
      tick(r.rig, { thr: 0, brk: 1 });
      // dynamics runs on the tick control returns (respawnPhase 0 after it): that is ↓ tick 1
      if (r.k.race.respawnPhase === 0) { rr.gear.push(r.k.drive.gear); rr.u.push(fwd(r.k)); }
    }
    expectSixStopTicks(rr, 'respawn');
  });

  it('↑ in R → D: the forward law brakes the backward motion and drives on', () => {
    const { rig, k } = brakeRun(300);
    expect(fwd(k)).toBeLessThan(-9);
    const ev = tick(rig, { thr: 1 });
    expect(gearOf(ev)).toBe(Gear.D);
    let prev = fwd(k), crossed = -1;
    for (let t = 1; t < 120; t++) {
      tick(rig, { thr: 1 });
      expect(fwd(k)).toBeGreaterThan(prev);
      prev = fwd(k);
      if (crossed < 0 && prev > 0) crossed = t;
    }
    expect(crossed).toBeGreaterThan(0);
    expect(crossed).toBeLessThan(60); // a0·(1 − (u/vG)²) ≥ 16.2 m/s² from −10.8 m/s
    expect(k.drive.gear).toBe(Gear.D);
  });

  it('releasing ↓ in R rolls back to exactly 0 and locks in STOP', () => {
    const { rig, k } = brakeRun(90);
    expect(k.drive.gear).toBe(Gear.R);
    let stopAt = -1;
    for (let t = 0; t < 240 && stopAt < 0; t++) if (gearOf(tick(rig, { thr: 0 })) === Gear.STOP) stopAt = t;
    expect(stopAt).toBeGreaterThan(0);
    rig.run(30, () => { /* no keys */ });
    expect(fwd(k)).toBe(0);
    expect(k.drive.gear).toBe(Gear.STOP);
  });
});

// ---------------------------------------------------------------------------------------------------- 4 bleed
describe('physics: post-boost bleed (doc 15 §4.1, §4.8, §5 item 4)', () => {
  /** Booster fired at tick 0 from 34 m/s; `frame(t)` drives from then on. Returns forward speed and postTicks per tick and the expiry tick. */
  function bleedRun(n: number, frame: (t: number, k: KartState) => Frame, setup?: (k: KartState) => void) {
    const { rig, k } = rigAt(34, (kk) => { kk.drive.boosters = 1; setup?.(kk); });
    const u: number[] = [], post: number[] = [], evs: SimEvent[][] = [];
    let expiry = -1;
    for (let t = 0; t < n; t++) {
      const f = frame(t, k);
      const ev = tick(rig, { ...f, edges: (f.edges ?? 0) | (t === 0 ? Edge.USE_ITEM : 0) });
      if (expiry < 0 && ev.some((e) => e.t === 'boostEnd' && e.kart === 0)) expiry = t;
      u.push(fwd(k)); post.push(k.drive.postTicks); evs.push(ev);
    }
    return { rig, k, u, post, evs, expiry };
  }
  const F6 = decayF(6, DT), F07 = decayF(0.7, DT);

  it('↑ held: 30 ticks of u ← 34 + (u − 34)·decayF(6), |v| ≈ 34.55 after them, then the overspeed law again', () => {
    const { u, post, expiry: E } = bleedRun(260, () => ({ thr: 1 }));
    expect(E).toBe(180);
    expect(u[E - 1]!).toBeGreaterThan(45.1);
    for (let j = 0; j < 30; j++) {
      expect(post[E + j]!, `bleed tick ${j}`).toBe(30 - j);
      expect(Math.abs(u[E + j]! - (34 + (u[E + j - 1]! - 34) * F6)), `bleed tick ${j}`).toBeLessThanOrEqual(Q2);
    }
    expect(Math.abs(u[E + 29]! - 34.55)).toBeLessThanOrEqual(0.01);
    expect(post[E + 30]!).toBe(0);
    for (let t = E + 30; t < 260; t++) expect(Math.abs(u[t]! - (u[t - 1]! - P.kOver * (u[t - 1]! - 34) * DT)), `tick ${t}`).toBeLessThanOrEqual(Q2);
  });

  it('↑ released: du = min((34 − u)·(1 − decayF(6)), −u·(1 − decayF(0.7))), never weaker than the held rule', () => {
    const { u, post, expiry: E, k } = bleedRun(230, (t) => ({ thr: t >= 175 ? 0 : 1 }));
    expect(E).toBe(180);
    let held = 0, rel = 0;
    for (let j = 0; j < 30; j++) {
      const u0 = u[E + j - 1]!;
      const dHold = (34 - u0) * (1 - F6), dRel = -u0 * (1 - F07);
      if (dHold < dRel) held++; else rel++;
      expect(post[E + j]!).toBe(30 - j);
      expect(Math.abs(u[E + j]! - (u0 + Math.min(dHold, dRel))), `bleed tick ${j}`).toBeLessThanOrEqual(Q2);
    }
    // both branches are exercised: the held rate down to ≈ 38.7 m/s, then the release rate toward 0
    expect(held).toBeGreaterThan(3); expect(rel).toBeGreaterThan(3);
    expect(u[E + 29]!).toBeLessThan(31);
    // after the bleed: plain coasting (−2.5 m/s²)
    for (let t = E + 30; t < 230; t++) expect(Math.abs(u[t - 1]! - u[t]! - P.aCoast * DT), `tick ${t}`).toBeLessThanOrEqual(Q2);
    expect(k.drive.gear).toBe(Gear.N);
  });

  it('a brake during the bleed uses the stronger deceleration (and leaves the bleed running)', () => {
    const { u, post, expiry: E } = bleedRun(230, (t) => ({ thr: 1, brk: t >= 195 && t < 199 ? 1 : 0 }));
    expect(E).toBe(180);
    for (let t = 195; t < 199; t++) {
      const u0 = u[t - 1]!;
      const bleed = 34 + (u0 - 34) * F6 - u0;
      expect(bleed).toBeGreaterThan(-P.aBrake * DT); // the brake is the stronger one here
      expect(Math.abs(u[t]! - (u0 - P.aBrake * DT)), `tick ${t}`).toBeLessThanOrEqual(Q2);
    }
    expect(post[199]!).toBe(30 - (199 - E));
    expect(Math.abs(u[199]! - (34 + (u[198]! - 34) * F6))).toBeLessThanOrEqual(Q2);
  });

  it('cancelled for good by a booster, a drift or an instant boost', () => {
    // booster 5 ticks into the bleed
    const b = bleedRun(240, (t) => ({ thr: 1, edges: t === 185 ? Edge.USE_ITEM : 0 }), (k) => { k.drive.boosters = 2; });
    expect(b.post[184]!).toBeGreaterThan(0);
    for (let t = 185; t < 240; t++) expect(b.post[t]!, `tick ${t}`).toBe(0);
    expect(b.u[200]!).toBeGreaterThan(b.u[185]!); // the boost law again
    // drift entry 5 ticks into the bleed; still cancelled after the drift ends
    const d = bleedRun(260, (t) => (t >= 185 && t < 205 ? { thr: 1, drift: true, steer: 1 } : t >= 205 && t < 215 ? { thr: 1, steer: -1 } : { thr: 1 }));
    expect(d.evs[185]!.some((e) => e.t === 'driftStart')).toBe(true);
    expect(d.post[184]!).toBeGreaterThan(0);
    for (let t = 185; t < 260; t++) expect(d.post[t]!, `tick ${t}`).toBe(0);
    // instant boost: window open at expiry, throttle lifted for 2 ticks and re-pressed
    const ib = bleedRun(240, (t, k) => {
      if (t === 180) k.drive.instWindow = 30;
      return { thr: t >= 181 && t < 183 ? 0 : 1 };
    });
    expect(ib.evs[183]!.some((e) => e.t === 'instantBoost')).toBe(true);
    expect(ib.post[182]!).toBeGreaterThan(0);
    for (let t = 183; t < 240; t++) expect(ib.post[t]!, `tick ${t}`).toBe(0);
  });

  it('a start boost running out arms the bleed: postTicks 30 on the tick startTicks reaches 0', () => {
    // a real start: ↑ pressed on the GO tick (perfect tier), held through the start boost
    const rig = makeRig(flat, { countdownTicks: 30 });
    const k = rig.w.karts[0]!;
    while (rig.w.tick + 1 < rig.w.goTick) tick(rig, { thr: 0 });
    const start: number[] = [], post: number[] = [];
    for (let t = 0; t < 200; t++) { tick(rig, { thr: 1 }); start.push(k.drive.startTicks); post.push(k.drive.postTicks); }
    expect(start[0]!).toBeGreaterThan(30);
    expect(k.drive.boostTicks).toBe(0);
    const E = start.indexOf(0);
    expect(E).toBeGreaterThan(30);
    for (let t = 0; t < E; t++) expect(post[t], `start tick ${t}`).toBe(0);
    for (let j = 0; j < 30; j++) expect(post[E + j], `bleed tick ${j}`).toBe(30 - j);
    expect(post[E + 30]).toBe(0);
  });

  it('a boost pad entered during the bleed cancels it (pad boost law); so does a team booster', () => {
    // a 3-tick boost runs out at once, 10 m before a 6 m boost pad
    const rig = racingRig(strip('boost_pad', { from: 300, to: 306 }).track);
    const k = place(rig, 0, { s: 290, speed: 34 });
    k.drive.prevThrottle = 1; k.drive.boostTicks = 3; k.drive.boostKind = Boost.NORMAL;
    const post: number[] = [];
    let entry = -1;
    for (let t = 0; t < 60; t++) {
      const ev = tick(rig, { thr: 1 });
      if (entry < 0 && ev.some((e) => e.t === 'boostStart' && e.kart === 0 && e.kind === Boost.PAD)) entry = t;
      post.push(k.drive.postTicks);
    }
    expect(post[2]).toBe(30);
    expect(entry).toBeGreaterThan(2);
    expect(entry).toBeLessThan(2 + 29);
    expect(post[entry]!).toBeGreaterThan(0); // the pad acts in phase 4; the next tick's boost law cancels the bleed
    for (let t = entry + 1; t < entry + 40; t++) expect(post[t], `tick ${t}`).toBe(0);
    // team booster 5 ticks into the bleed (Boost.TEAM, vTeam law)
    const { rig: r2, k: k2 } = rigAt(34, (kk) => { kk.drive.boostTicks = 3; kk.drive.boostKind = Boost.NORMAL; });
    const post2: number[] = [];
    for (let t = 0; t < 60; t++) {
      if (t === 7) k2.drive.teamBoosters = 1;
      const ev = tick(r2, { thr: 1, edges: t === 7 ? Edge.USE_ITEM : 0 });
      if (t === 7) expect(ev.some((e) => e.t === 'boostStart' && e.kart === 0 && e.kind === Boost.TEAM)).toBe(true);
      post2.push(k2.drive.postTicks);
    }
    expect(post2[6]).toBe(26);
    for (let t = 7; t < 60; t++) expect(post2[t], `team tick ${t}`).toBe(0);
  });

  it('a 60° wall hit before expiry cancels the boost without a bleed', () => {
    const rig = racingRig(corridor(16).track);
    const k = place(rig, 0, { s: 300, u: 0, speed: 30, yawDeg: -60 }); // toward the right wall (u = +8) at 60°
    k.drive.prevThrottle = 1; k.drive.boostTicks = 120; k.drive.boostKind = Boost.NORMAL;
    let hit = -1;
    for (let t = 0; t < 120; t++) {
      const ev = tick(rig, { thr: 1 });
      const w = ev.find((e) => e.t === 'wall' && e.kart === 0);
      if (hit < 0 && w && w.t === 'wall') { expect(w.severity).toBe(2); hit = t; }
      expect(k.drive.postTicks, `tick ${t}`).toBe(0);
    }
    expect(hit).toBeGreaterThanOrEqual(0);
    expect(hit).toBeLessThan(60);
    expect(k.drive.boostTicks).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------- 5 drag
interface DragRun { rig: Rig; k: KartState; ev: SimEvent[][]; v: number[]; drag: number[]; sb: number[]; onAt: number }
/**
 * Pebble at 45 m/s with boostTicks 300 (normal): DRIFT + full left steer for `build` ticks to build β, then `after(t)`
 * (default: DRIFT held, steer 0, ↑ held) up to tick `n`.
 */
function dragRun(n: number, after: (t: number, onAt: number) => Frame = () => ({ drift: true }), o: { build?: number; boost?: number; buildSteer?: number; prep?: (rig: Rig) => void } = {}): DragRun {
  const { rig, k } = rigAt(45, (kk) => { kk.drive.boostTicks = o.boost ?? 300; kk.drive.boostKind = (o.boost ?? 300) > 0 ? Boost.NORMAL : Boost.NONE; });
  o.prep?.(rig);
  const build = o.build ?? 24;
  const ev: SimEvent[][] = [], v: number[] = [], drag: number[] = [], sb: number[] = [];
  let onAt = -1;
  for (let t = 0; t < n; t++) {
    const e = tick(rig, t < build ? { steer: o.buildSteer ?? 1, drift: true } : after(t, onAt));
    if (onAt < 0 && dragOn(e)) onAt = t;
    ev.push(e); v.push(planar(k)); drag.push(k.drive.dragTicks); sb.push(k.drive.drift ? sbOf(k, 1) : 0);
  }
  return { rig, k, ev, v, drag, sb, onAt };
}

describe('physics: drag (끌기) (doc 15 §4.5–§4.8, §5 item 5)', () => {
  it('a neutral drag entered near β 30° fires on/off events, never loses |v|, reaches ≥ 288 km/h and stays ≤ 290 km/h', () => {
    const r = dragRun(120);
    expect(r.onAt).toBeGreaterThanOrEqual(24);
    expect(r.onAt).toBeLessThan(40);
    expect(r.ev.flat().filter((e) => e.t === 'drag' && e.on).length).toBe(1);
    expect(r.ev.flat().some((e) => e.t === 'drag' && !e.on)).toBe(true);
    // entered inside the window (sb measured after the tick, so a little slack)
    expect(r.sb[r.onAt]!).toBeGreaterThan(0.3); expect(r.sb[r.onAt]!).toBeLessThan(0.61);
    let maxV = 0, ticks = 0;
    for (let t = r.onAt; t < r.v.length && r.drag[t]! > 0; t++) {
      ticks++;
      if (t > r.onAt) {
        expect(r.drag[t]!, `tick ${t}`).toBe(Math.min(255, r.drag[t - 1]! + 1));
        expect(r.v[t]!, `tick ${t}`).toBeGreaterThanOrEqual(r.v[t - 1]! - Q2); // η = 1 and no K16 drag
      }
      maxV = Math.max(maxV, r.v[t]!);
    }
    expect(ticks).toBeGreaterThan(10);
    expect(maxV * KMH).toBeGreaterThanOrEqual(288);
    expect(Math.max(...r.v)).toBeLessThanOrEqual(48.10 + 0.002);
    expect(r.drag[r.onAt]!).toBe(1);
  });

  it('no drag without a boost, without ↑, while braking, or with in-steer held and no tap', () => {
    const none = (r: DragRun): void => { expect(r.onAt).toBe(-1); expect(Math.max(...r.drag)).toBe(0); };
    none(dragRun(90, () => ({ drift: true }), { boost: 0 }));
    none(dragRun(90, () => ({ drift: true, thr: 0 })));
    none(dragRun(90, () => ({ drift: true, steer: 1 })));
    none(dragRun(90, () => ({ drift: true, steer: 0.5 })));
    none(dragRun(90, () => ({ drift: true, steer: -0.5 })));
    const brk = dragRun(32, () => ({ drift: true, brk: 1 }));
    for (let t = 24; t < 32; t++) expect(brk.drag[t]!, `tick ${t}`).toBe(0);
    expect(brk.onAt).toBe(-1);
  });

  it('a wall impact that ends the drift also ends the drag and resets the technique fields (§4.7)', () => {
    // 4 m right of centre in a 16 m corridor: the left drag reaches the left wall (u = −8) mid-drag at ≈ 50°
    const rig = racingRig(corridor(16).track);
    const k = place(rig, 0, { s: 300, u: 4, speed: 45 });
    k.drive.prevThrottle = 1; k.drive.boostTicks = 300; k.drive.boostKind = Boost.NORMAL;
    let hit = -1, dragBefore = 0;
    for (let t = 0; t < 90 && hit < 0; t++) {
      dragBefore = k.drive.dragTicks;
      const ev = tick(rig, t < 24 ? { steer: 1, drift: true } : { drift: true });
      const w = ev.find((e) => e.t === 'wall' && e.kart === 0 && e.severity > 0);
      if (w) {
        hit = t;
        expect(dragOff(ev)).toBe(true);
        expect(has(ev, 'driftEnd')).toBe(true);
      }
    }
    expect(hit).toBeGreaterThan(24);
    expect(dragBefore).toBeGreaterThan(0);
    const d = k.drive;
    expect(d.drift).toBe(0);
    expect(d.dragTicks).toBe(0); expect(d.tapStreak).toBe(0); expect(d.tapGap).toBe(255); expect(d.counterTicks).toBe(0);
  });

  it('the live-drift state of these pins keeps dragging (control): drag 40 → 41, streak kept, gap + 1', () => {
    const { rig, k } = rigAt(45);
    liveDrift(k, 28, { drag: 40, streak: 2, gap: 3 });
    const ev = tick(rig, { drift: true });
    expect(dragOff(ev)).toBe(false);
    expect(k.drive.drift).toBe(1);
    expect(techOf(k)).toEqual({ dragTicks: 41, tapStreak: 2, tapGap: 4, counterTicks: 0, brakeTicks: 0 });
  });

  // §4.7: every external drift end also ends the drag and resets the technique fields (the wall case is above)
  it.each([['hard CC (stun)', EF.stun, 30, 0], ['tether', EF.tether_pull, 120, 1 | 16]] as const)('%s ends the drag and resets the technique fields', (_n, code, dur, param) => {
    const rig = racingRig(flat, { slots: [{}, {}] });
    const k = place(rig, 0, { s: 300, speed: 45 });
    place(rig, 1, { s: 340, speed: 30 }); // the tether's target
    liveDrift(k, 28, { drag: 40, streak: 2, gap: 3 });
    afflict(rig, code, dur, param);
    const ev = tick(rig, { drift: true });
    expect(ev.some((e) => e.t === 'effect' && e.victim === 0 && e.effect === code && e.result === 'hit')).toBe(true);
    expect(dragOff(ev)).toBe(true);
    expect(k.drive.drift).toBe(0);
    expect(techOf(k)).toEqual(TECH_IDLE);
  });

  it('a rail capture and a warp entry end the drag and reset the technique fields', () => {
    const F4 = bakedTrack('_test/f4_rails');
    const R = F4.rails[0]!, portal = F4.warps.find((x) => x.id === 'portal')!;
    /** A live drag placed at (s, u) on F4; runs until the kart attaches (or 6 ticks) and returns that tick's events. */
    const run = (s: number, u: number, kind: number): { k: KartState; ev: SimEvent[]; attached: boolean } => {
      const rig = racingRig(F4);
      const k = place(rig, 0, { s, u, speed: 45 });
      liveDrift(k, 28, { drag: 40, streak: 2, gap: 3 });
      let ev: SimEvent[] = [];
      for (let t = 0; t < 6 && k.body.attachKind !== kind; t++) {
        ev = tick(rig, { drift: true });
        if (k.body.attachKind !== kind) expect(k.drive.dragTicks, `tick ${t} before the capture`).toBeGreaterThan(0);
      }
      return { k, ev, attached: k.body.attachKind === kind };
    };
    const mid = (portal.u0 + portal.u1) / 2;
    for (const [name, s, u, kind] of [['rail', R.fromS - 1, -3, Attach.RAIL], ['warp', portal.s - 1, mid, Attach.WARP]] as const) {
      const r = run(s, u, kind);
      expect(r.attached, name).toBe(true);
      expect(has(r.ev, 'driftEnd'), name).toBe(true);
      expect(dragOff(r.ev), name).toBe(true);
      expect(r.k.drive.drift, name).toBe(0);
      expect(techOf(r.k), name).toEqual(TECH_IDLE);
    }
    // control on the same road: outside the capture window (rail) and the portal window, the same state keeps dragging
    for (const [name, s, u] of [['rail', R.fromS - 1, 3], ['warp', portal.s - 1, portal.u0 - 4]] as const) {
      const r = run(s, u, -1);
      expect(r.attached, name).toBe(false);
      expect(r.k.drive.dragTicks, `${name} control`).toBeGreaterThan(40);
    }
  });

  it('a respawn resets the technique fields when it places the kart', () => {
    const { rig, k } = rigAt(45, (kk) => { kk.drive.lowSpeedTicks = 60; });
    tick(rig, { edges: Edge.RESPAWN });
    expect(k.race.respawnPhase).toBe(1);
    while (rig.w.tick + 1 < k.race.respawnUntil) tick(rig, {});
    // live technique state right before the placement tick
    const d = k.drive;
    d.drift = 1; d.dragTicks = 40; d.tapStreak = 2; d.tapGap = 3; d.counterTicks = 1; d.brakeTicks = 4;
    const ev = tick(rig, {});
    expect(ev.some((e) => e.t === 'respawn' && e.kart === 0 && e.phase === 'in')).toBe(true);
    expect(dragOff(ev)).toBe(true);
    expect(d.drift).toBe(0);
    expect(techOf(k)).toEqual(TECH_IDLE);
  });

  it('a drag ends when ↑ is lifted, and the boost ending ends it', () => {
    const lift = dragRun(60, (t, on) => ({ drift: true, thr: on >= 0 && t >= on + 5 && t < on + 8 ? 0 : 1 }));
    expect(lift.onAt).toBeGreaterThan(0);
    expect(dragOff(lift.ev[lift.onAt + 5]!)).toBe(true);
    expect(lift.drag[lift.onAt + 5]!).toBe(0);
    const end = dragRun(60, () => ({ drift: true }), { boost: 34 });
    expect(end.onAt).toBeGreaterThan(0);
    expect(end.onAt).toBeLessThan(34);
    expect(end.drag[34]!).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------- 6 tap
/**
 * Drag as in dragRun, then from the drag-on tick D a tap every `gap` ticks from D + 4: the `side` TAP edge, with the
 * in-direction steer held for `press` ticks (0 = the edge alone).
 */
function tapRun(n: number, gap: number, o: { side?: 'L' | 'R'; press?: number } = {}): DragRun {
  const side = o.side ?? 'L', press = o.press ?? 2;
  return dragRun(n, (t, on) => {
    if (on < 0 || t < on + 4) return { drift: true };
    const m = (t - on - 4) % gap;
    const steer = side === 'L' && m < press ? 1 : 0;
    return { drift: true, steer, edges: m === 0 ? (side === 'L' ? Edge.TAP_L : Edge.TAP_R) : 0 };
  });
}
/**
 * The client's keyboard steer (apps/client/src/input/keyboard.ts sampleInput): each frame x += (target − x)·0.6,
 * snapping to the target within 0.02. One frame is one tick at 60 Hz. Starts at `x0`.
 */
function keyboardSteer(x0 = 0): (target: number) => number {
  let x = x0;
  return (target) => { x += (target - x) * 0.6; if (Math.abs(x - target) < 0.02) x = target; return x; };
}
/**
 * tapRun with a real keyboard press: from D + 4 the left key goes down every `gap` frames (TAP_L on the press frame)
 * and stays down for `hold` frames; the steer ramps through the keyboard smoothing, including the release of the
 * 24-frame drift-building press.
 */
function keyTapRun(n: number, gap: number, hold: number): DragRun {
  const key = keyboardSteer(1);
  return dragRun(n, (t, on) => {
    const m = on < 0 || t < on + 4 ? -1 : (t - on - 4) % gap;
    return { drift: true, steer: key(m >= 0 && m < hold ? 1 : 0), edges: m === 0 ? Edge.TAP_L : 0 };
  }, { boost: 400 });
}
const streaks = (r: DragRun): number[] => r.ev.map(streakOf).filter((s) => s > 0);
/** Longest run of consecutive ticks with dragTicks > 0. */
const longestDrag = (r: DragRun): number => { let best = 0, cur = 0; for (const d of r.drag) { cur = d > 0 ? cur + 1 : 0; best = Math.max(best, cur); } return best; };

describe('physics: tap boost (톡톡이) (doc 15 §4.3, §4.8, §5 item 6)', () => {
  it('TAP_L every 8 ticks in a left drag: streak 1, 2, 3, 3; |v| up to ≈ 305 km/h (≤ 50.59 m/s); the drag lasts ≥ 90 ticks', () => {
    const r = tapRun(200, 8);
    expect(r.onAt).toBeGreaterThan(0);
    expect(streaks(r).slice(0, 4)).toEqual([1, 2, 3, 3]);
    // each valid tap lands on its scripted tick and restarts the gap
    for (let j = 0; j < 4; j++) {
      const t = r.onAt + 4 + 8 * j;
      expect(streakOf(r.ev[t]!), `tap ${j}`).toBe(Math.min(3, j + 1));
    }
    expect(longestDrag(r)).toBeGreaterThanOrEqual(90);
    const maxV = Math.max(...r.v);
    expect(maxV).toBeLessThanOrEqual(50.59 + 0.002);
    expect(maxV).toBeGreaterThan(50.4);
    expect(maxV * KMH).toBeGreaterThan(303.5);
  });

  // §4.4/§4.6 tap grace: a keyboard press lasts several frames and ramps through the client smoothing; inside the
  // grace the in-steer counts as neutral, so the press neither ends the drag nor drives β past dragExitHi
  it.each([8, 10, 12])('keyboard-shaped taps every %i frames, held 2–5 frames: the drag lasts ≥ 150 ticks and reaches 305 km/h', (gap) => {
    for (let hold = 2; hold <= 5; hold++) {
      const r = keyTapRun(260, gap, hold);
      expect(r.onAt, `hold ${hold}`).toBeGreaterThan(0);
      expect(streaks(r).slice(0, 4), `hold ${hold}`).toEqual([1, 2, 3, 3]);
      expect(longestDrag(r), `hold ${hold}`).toBeGreaterThanOrEqual(150);
      const maxV = Math.max(...r.v);
      expect(maxV, `hold ${hold}`).toBeLessThanOrEqual(50.59 + 0.002);
      expect(maxV * KMH, `hold ${hold}`).toBeGreaterThan(304.5);
    }
  });

  it('a held tap key past the grace is in-steer again: the drag ends', () => {
    // one tap, then the key stays down: tolerated for tapGrace ticks after the tap, then steerOk fails
    const key = keyboardSteer(1);
    const r = dragRun(120, (t, on) => {
      const m = on < 0 || t < on + 4 ? -1 : t - on - 4;
      return { drift: true, steer: key(m >= 0 ? 1 : 0), edges: m === 0 ? Edge.TAP_L : 0 };
    });
    const tapAt = r.onAt + 4;
    expect(streakOf(r.ev[tapAt]!)).toBe(1);
    for (let t = tapAt; t <= tapAt + P.tapGrace; t++) expect(r.drag[t]!, `grace tick ${t - tapAt}`).toBeGreaterThan(0);
    expect(r.drag[tapAt + P.tapGrace + 1]!).toBe(0);
    expect(dragOff(r.ev[tapAt + P.tapGrace + 1]!)).toBe(true);
  });

  it('a sustained tap rhythm keeps the drag going until dragTicks saturates at 255', () => {
    const r = tapRun(300, 8);
    expect(longestDrag(r)).toBeGreaterThanOrEqual(256);
    expect(Math.max(...r.drag)).toBe(255);
  });

  it.each([6, 12])('a %i-tick rhythm is valid (streak 1, 2, 3)', (gap) => {
    expect(streaks(tapRun(120, gap)).slice(0, 3)).toEqual([1, 2, 3]);
  });

  it('gaps of 4 (or 5) ticks give no streak ≥ 2; gaps of 14 (or 13) stay at streak 1', () => {
    for (const gap of [4, 5]) {
      const s = streaks(tapRun(150, gap));
      expect(s.length, `gap ${gap}`).toBeGreaterThan(0);
      expect(Math.max(...s), `gap ${gap}`).toBe(1);
    }
    for (const gap of [13, 14]) {
      const r = tapRun(200, gap);
      const s = streaks(r);
      expect(s.length, `gap ${gap}`).toBeGreaterThanOrEqual(4);
      expect(new Set(s), `gap ${gap}`).toEqual(new Set([1]));
      expect(longestDrag(r), `gap ${gap}`).toBeGreaterThan(4 * gap);
    }
  });

  it('Mirror Mode (mods.steerInvert) swaps the tap keys: a left drift is steered and tapped with the right key, TAP_R', () => {
    // under Mirror Mode the right key steers left: build the left drift with it, then tap it every 8 ticks
    const mirror = (rig: Rig): void => afflict(rig, EF.mirror, 600);
    const run = (edge: number, press: number): DragRun => dragRun(160, (t, on) => {
      if (on < 0 || t < on + 4) return { drift: true };
      const m = (t - on - 4) % 8;
      return { drift: true, steer: m < press ? -1 : 0, edges: m === 0 ? edge : 0 };
    }, { buildSteer: -1, prep: mirror });
    const base = run(0, 0);
    expect(base.rig.ctx.scratch.mods[0]!.steerInvert).toBe(true);
    expect(base.onAt).toBeGreaterThan(0);
    expect(base.sb[base.onAt]!).toBeGreaterThan(0.3); // a left drift (sb toward driftDir = +1)
    const right = run(Edge.TAP_R, 2);
    expect(right.onAt).toBe(base.onAt);
    expect(streaks(right).slice(0, 4)).toEqual([1, 2, 3, 3]);
    expect(longestDrag(right)).toBeGreaterThanOrEqual(90);
    // TAP_L is now the wrong-direction key: nothing happens
    const wrong = run(Edge.TAP_L, 0);
    expect(wrong.ev.flat().some((e) => e.t === 'tapBoost')).toBe(false);
    expect(hashWorld(wrong.rig.w)).toBe(hashWorld(base.rig.w));
  });

  it('a wrong-direction tap does nothing (identical world hash); an in-direction one does', () => {
    const base = dragRun(120);
    const wrong = tapRun(120, 8, { side: 'R', press: 0 });
    const right = tapRun(120, 8, { side: 'L', press: 0 });
    expect(wrong.onAt).toBe(base.onAt);
    expect(hashWorld(wrong.rig.w)).toBe(hashWorld(base.rig.w));
    expect(wrong.ev.flat().some((e) => e.t === 'tapBoost')).toBe(false);
    expect(streaks(right).length).toBeGreaterThan(0);
    expect(hashWorld(right.rig.w)).not.toBe(hashWorld(base.rig.w));
  });
});

// ---------------------------------------------------------------------------------------------------- 7 cut, reverse gauge
describe('physics: cut and reverse gauge (doc 15 §4.5, §4.7, §5 item 7)', () => {
  /** A left drift (DRIFT + full steer) from `v0` for 30 ticks, then `after` for 30 ticks. */
  function cutRun(v0: number, boost: number, after: (t: number) => Frame) {
    const { rig, k } = rigAt(v0, (kk) => { kk.drive.boostTicks = boost; kk.drive.boostKind = boost > 0 ? Boost.NORMAL : Boost.NONE; });
    const ev: SimEvent[][] = [], s: { drift: number; counter: number; gauge: number; formula: number; wl: number; v: number; u: number; yaw: number; iw: number }[] = [];
    for (let t = 0; t < 60; t++) {
      ev.push(tick(rig, t < 30 ? { steer: 1, drift: true } : after(t)));
      s.push({ drift: k.drive.drift, counter: k.drive.counterTicks, gauge: k.drive.gauge, formula: gaugeFormula(k, 1), wl: lat(k), v: planar(k), u: fwd(k), yaw: k.body.yawRate, iw: k.drive.instWindow });
    }
    return { rig, k, ev, s };
  }

  it('a full counter-steer with DRIFT released qualifies on tick 2, then aligns and opens the instant window (doc 16)', () => {
    const r = cutRun(34, 0, () => ({ steer: -1 }));
    expect(r.s[29]!.drift).toBe(1);
    expect(has(r.ev[30]!, 'cut')).toBe(false);
    expect(r.s[30]!.counter).toBe(1);
    expect(r.s[30]!.drift).toBe(1);
    const end = r.ev.findIndex((events) => has(events, 'cut'));
    expect(end).toBeGreaterThanOrEqual(31);
    expect(end).toBeLessThan(40);
    expect(has(r.ev[end]!, 'driftEnd')).toBe(true);
    expect(r.s[end]!.drift).toBe(0);
    expect(Math.abs(r.s[end]!.wl)).toBeLessThan(1e-3);
    expect(r.s[end]!.yaw).toBeLessThan(-0.1); // the new steering input survives the exit
    expect(r.s[end]!.iw).toBeGreaterThan(0);
    expect(r.s[end]!.counter).toBe(0);
    // u += etaCut·(v − u): most of the sideways speed is turned forward
    expect(r.s[end]!.v).toBeGreaterThan(r.s[30]!.u + 0.6 * (r.s[30]!.v - r.s[30]!.u));
    expect(r.ev.flat().filter((e) => e.t === 'cut').length).toBe(1);
  });

  it('a cut with DRIFT still held (no boost) also recovers after the two-tick qualification', () => {
    const r = cutRun(34, 0, () => ({ steer: -1, drift: true }));
    const end = r.ev.findIndex((events) => has(events, 'cut'));
    expect(end).toBeGreaterThanOrEqual(31);
    expect(end).toBeLessThan(40);
    expect(r.s[end]!.drift).toBe(0);
  });

  it('a half counter-steer (0.6) never cuts', () => {
    const r = cutRun(34, 0, () => ({ steer: -0.6 }));
    expect(r.ev.flat().some((e) => e.t === 'cut')).toBe(false);
    for (let t = 30; t < 60; t++) expect(r.s[t]!.counter).toBe(0);
  });

  it('boosting with DRIFT held: counter-steer is the reverse gauge (×3 gain, no cut); releasing DRIFT permits recovery', () => {
    const r = cutRun(40, 300, (t) => ({ steer: -1, drift: t < 40 }));
    // in-steer: ×1 against the formula on the state
    for (let t = 20; t < 30; t++) {
      const dg = r.s[t]!.gauge - r.s[t - 1]!.gauge;
      expect(dg / r.s[t]!.formula, `in-steer tick ${t}`).toBeGreaterThan(0.95);
      expect(dg / r.s[t]!.formula, `in-steer tick ${t}`).toBeLessThan(1.05);
    }
    for (let t = 30; t < 40; t++) {
      expect(r.s[t]!.drift, `tick ${t}`).toBe(1);
      expect(has(r.ev[t]!, 'cut'), `tick ${t}`).toBe(false);
      expect(r.s[t]!.counter, `tick ${t}`).toBe(t - 29);
      const dg = r.s[t]!.gauge - r.s[t - 1]!.gauge;
      expect(dg / r.s[t]!.formula, `counter tick ${t}`).toBeGreaterThan(2.85);
      expect(dg / r.s[t]!.formula, `counter tick ${t}`).toBeLessThan(3.15);
    }
    expect(r.s[39]!.gauge).toBeLessThan(1);
    const end = r.ev.findIndex((events) => has(events, 'cut'));
    expect(end).toBeGreaterThanOrEqual(40);
    expect(end).toBeLessThan(50);
    expect(r.s[end]!.drift).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------- 8 brake turn, spin
describe('physics: brake drift turn (고속턴) and spin-out (doc 15 §4.3, §4.9, §5 item 8)', () => {
  /** Boosted left drift from 40 m/s for 20 ticks, then ↓ (DRIFT, steer and ↑ kept) for `nb` ticks, then 25 ticks of no keys. */
  function brakeRun(nb: number) {
    const { rig, k } = rigAt(40, (kk) => { kk.drive.boostTicks = 300; kk.drive.boostKind = Boost.NORMAL; kk.drive.boosters = 2; });
    const ev: SimEvent[][] = [], th: number[] = [], yaw: number[] = [], st: KartState['drive'][] = [], v: number[] = [];
    for (let t = 0; t < 20 + nb + 25; t++) {
      ev.push(tick(rig, t < 20 ? { steer: 1, drift: true } : t < 20 + nb ? { steer: 1, drift: true, brk: 1 } : { thr: 0 }));
      th.push(heading(k)); yaw.push(k.body.yawRate); st.push({ ...k.drive }); v.push(planar(k));
    }
    return { rig, k, ev, th, yaw, st, v };
  }

  it('brake ticks 1–8 turn the heading at 2·yawRate·DT, ticks 9–10 at 1×; brakeTurn fires on tick 1', () => {
    const r = brakeRun(10);
    for (let i = 1; i <= 10; i++) {
      const t = 19 + i;
      expect(r.st[t]!.brakeTicks, `brake tick ${i}`).toBe(i);
      expect(r.st[t]!.drift, `brake tick ${i}`).toBe(1);
      const mul = i <= 8 ? 2 : 1;
      expect(Math.abs(wrap(r.th[t]! - r.th[t - 1]!) - mul * r.yaw[t]! * DT), `brake tick ${i}`).toBeLessThanOrEqual(2e-4);
      expect(has(r.ev[t]!, 'brakeTurn'), `brake tick ${i}`).toBe(i === 1);
      expect(has(r.ev[t]!, 'spinOut')).toBe(false);
    }
    // the tick before the brake turns at 1×
    expect(Math.abs(wrap(r.th[19]! - r.th[18]!) - r.yaw[19]! * DT)).toBeLessThanOrEqual(2e-4);
    expect(r.ev.flat().some((e) => e.t === 'spinOut')).toBe(false);
  });

  it('brake tick 11 spins out: planar 3.317 m/s, drift ended without an instant window, boost cancelled (boosters kept), 15 stun ticks, no bleed', () => {
    const r = brakeRun(11);
    const t = 30, d = r.st[t]!;
    expect(has(r.ev[t]!, 'spinOut')).toBe(true);
    expect(has(r.ev[t]!, 'driftEnd')).toBe(true);
    expect(r.ev[t]!.some((e) => e.t === 'boostEnd' && e.kart === 0)).toBe(true);
    expect(Math.abs(r.v[t]! - 3.317)).toBeLessThanOrEqual(0.001);
    expect(d.drift).toBe(0);
    expect(d.boostTicks).toBe(0); expect(d.boostKind).toBe(Boost.NONE); expect(d.startTicks).toBe(0);
    expect(d.instTicks).toBe(0); expect(d.instWindow).toBe(0); expect(d.postTicks).toBe(0);
    expect(d.boosters).toBe(2);
    expect(d.dragTicks).toBe(0); expect(d.tapStreak).toBe(0); expect(d.tapGap).toBe(255); expect(d.counterTicks).toBe(0);
    let stun = 0;
    for (let i = t + 1; i < r.st.length; i++) { if (r.st[i]!.stunTicks > 0) stun++; expect(r.st[i]!.postTicks).toBe(0); }
    expect(stun).toBe(15);
    expect(r.ev.flat().filter((e) => e.t === 'spinOut').length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------------- air
describe('physics: techniques in the air (doc 15 §4.8)', () => {
  /** Lifts the kart 3 m off the flat plane with no coyote time: ≈ 47 ticks of free fall. */
  const lift = (k: KartState): void => { k.body.py += 3; k.body.grounded = 0; k.body.coyote = 0; };

  it('the drag ends with an off event on the first air tick; the cut counter resets', () => {
    const r = tapRun(80, 8);
    expect(r.k.drive.dragTicks).toBeGreaterThan(0);
    expect(r.k.drive.tapStreak).toBeGreaterThan(0);
    lift(r.k);
    const ev = tick(r.rig, { drift: true });
    expect(r.k.body.grounded).toBe(0);
    expect(dragOff(ev)).toBe(true);
    expect(r.k.drive.drift).toBe(1); // the drift itself is frozen, not ended
    expect([r.k.drive.dragTicks, r.k.drive.tapStreak, r.k.drive.tapGap]).toEqual([0, 0, 255]);
    // a boosted counter-steer with DRIFT held counts without cutting; the air resets the count
    const { rig, k } = rigAt(40, (kk) => { kk.drive.boostTicks = 300; kk.drive.boostKind = Boost.NORMAL; });
    for (let t = 0; t < 30; t++) tick(rig, { steer: 1, drift: true });
    for (let t = 0; t < 3; t++) tick(rig, { steer: -1, drift: true });
    expect(k.drive.counterTicks).toBe(3);
    lift(k);
    const ev2 = tick(rig, { steer: -1 }); // DRIFT released: on the ground this would cut
    expect(has(ev2, 'cut')).toBe(false);
    expect(k.drive.counterTicks).toBe(0);
    expect(k.drive.drift).toBe(1);
  });

  it('↓ makes no gear change in the air (no STOP → R, no N → D)', () => {
    const s = rigAt(0);
    lift(s.k);
    expect(s.k.drive.gear).toBe(Gear.STOP);
    const n = rigAt(20);
    tick(n.rig, { thr: 0 });
    expect(n.k.drive.gear).toBe(Gear.N);
    lift(n.k);
    for (let t = 0; t < 15; t++) {
      expect(gearOf(tick(s.rig, { thr: 0, brk: 1 })), `STOP kart tick ${t}`).toBe(-1);
      expect(gearOf(tick(n.rig, { thr: 0, brk: 1 })), `N kart tick ${t}`).toBe(-1);
      expect(s.k.body.grounded + n.k.body.grounded).toBe(0);
    }
    expect(s.k.drive.gear).toBe(Gear.STOP);
    expect(n.k.drive.gear).toBe(Gear.N);
  });

  it('the bleed keeps counting in the air, and a booster fired in the air zeroes it', () => {
    const { rig, k } = rigAt(40, (kk) => { kk.drive.boostTicks = 3; kk.drive.boostKind = Boost.NORMAL; kk.drive.boosters = 1; });
    lift(k);
    const post: number[] = [];
    for (let t = 0; t < 12; t++) {
      tick(rig, { edges: t === 10 ? Edge.USE_ITEM : 0 });
      post.push(k.drive.postTicks);
      expect(k.body.grounded, `tick ${t}`).toBe(0);
    }
    // armed on the expiry tick (the third decrement), then one less per tick
    expect(post.slice(0, 10)).toEqual([0, 0, 30, 29, 28, 27, 26, 25, 24, 23]);
    expect(post[10]).toBe(0);
    expect(post[11]).toBe(0);
    expect(k.drive.boostTicks).toBeGreaterThan(0);
    expect(k.drive.boosters).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------------- threshold edges
describe('physics: technique threshold edges (doc 15 §2)', () => {
  const D = 0.1; // degrees either side of an angle threshold
  /** One tick from a live left drift at β (as K7b sees it) with `drag` drag ticks; returns dragTicks after it. */
  function dragAfter(betaDeg: number, drag: number, f: Frame = { drift: true }): number {
    const { rig, k } = rigAt(45);
    liveDrift(k, betaDeg, { drag });
    tick(rig, f);
    expect(k.drive.drift).toBe(1);
    return k.drive.dragTicks;
  }

  it('drag entry: sin β in [sin 20°, sin 35°]', () => {
    expect(dragAfter(20 - D, 0)).toBe(0);
    expect(dragAfter(20 + D, 0)).toBe(1);
    expect(dragAfter(35 - D, 0)).toBe(1);
    expect(dragAfter(35 + D, 0)).toBe(0);
  });

  it('drag stay: sin β in [sin 18°, sin 37°]; between the windows only a running drag continues', () => {
    expect(dragAfter(18 - D, 10)).toBe(0);
    expect(dragAfter(18 + D, 10)).toBe(11);
    expect(dragAfter(37 - D, 10)).toBe(11);
    expect(dragAfter(37 + D, 10)).toBe(0);
    for (const b of [19, 36]) { expect(dragAfter(b, 0), `${b}°`).toBe(0); expect(dragAfter(b, 10), `${b}°`).toBe(11); }
  });

  it('neutral steer is |sIn| < 0.3: raw ±38 (0.299) allows the drag, raw ±39 (0.307) does not', () => {
    for (const raw of [38, -38]) { expect(dragAfter(28, 0, { drift: true, raw }), `raw ${raw}`).toBe(1); expect(dragAfter(28, 10, { drift: true, raw }), `raw ${raw}`).toBe(11); }
    for (const raw of [39, -39]) { expect(dragAfter(28, 0, { drift: true, raw }), `raw ${raw}`).toBe(0); expect(dragAfter(28, 10, { drift: true, raw }), `raw ${raw}`).toBe(0); }
  });

  /** A left drift from `v0` (DRIFT + full left for 30 ticks), then `after` for 20 ticks. */
  function counterRun(v0: number, boost: number, after: Frame) {
    const { rig, k } = rigAt(v0, (kk) => { kk.drive.boostTicks = boost; kk.drive.boostKind = boost > 0 ? Boost.NORMAL : Boost.NONE; });
    const ev: SimEvent[][] = [], counter: number[] = [], ratio: number[] = [];
    for (let t = 0; t < 30; t++) tick(rig, { steer: 1, drift: true });
    for (let t = 0; t < 20; t++) {
      const g0 = k.drive.gauge;
      ev.push(tick(rig, after));
      counter.push(k.drive.counterTicks);
      if (k.drive.drift) ratio.push((k.drive.gauge - g0) / gaugeFormula(k, 1));
    }
    return { ev, counter, ratio };
  }

  it('cut at sIn ≤ −0.7: raw +88 (−0.6929) never counts, raw +89 (−0.7008) qualifies on its 2nd tick', () => {
    const no = counterRun(34, 0, { raw: 88 });
    expect(no.ev.flat().some((e) => e.t === 'cut')).toBe(false);
    expect(Math.max(...no.counter)).toBe(0);
    const yes = counterRun(34, 0, { raw: 89 });
    expect(yes.counter[0]).toBe(1);
    expect(has(yes.ev[0]!, 'cut')).toBe(false);
    expect(yes.counter[1]).toBe(2);
    const end = yes.ev.findIndex((events) => has(events, 'cut'));
    expect(end).toBeGreaterThanOrEqual(1);
    expect(end).toBeLessThan(10);
    expect(has(yes.ev[end]!, 'driftEnd')).toBe(true);
  });

  it('reverse gauge at sIn ≤ −0.3 while boosting: raw +38 charges ×1, raw +39 charges ×3', () => {
    const x1 = counterRun(40, 300, { raw: 38, drift: true });
    const x3 = counterRun(40, 300, { raw: 39, drift: true });
    expect(x1.ratio.length).toBeGreaterThanOrEqual(10);
    expect(x3.ratio.length).toBeGreaterThanOrEqual(10);
    for (const r of x1.ratio.slice(0, 10)) { expect(r).toBeGreaterThan(0.95); expect(r).toBeLessThan(1.05); }
    for (const r of x3.ratio.slice(0, 10)) { expect(r).toBeGreaterThan(2.85); expect(r).toBeLessThan(3.15); }
  });
});

// ---------------------------------------------------------------------------------------------------- 9 determinism
describe('physics: technique state is part of the hash (doc 15 §5 item 9)', () => {
  it('bumping any KartDrive field of a fresh kart changes hashWorld; cloneWorld keeps them', () => {
    const { rig } = rigAt(0);
    const w = rig.w, d = w.karts[0]!.drive as unknown as Record<string, number>;
    const h0 = hashWorld(w);
    const keys = Object.keys(newKart(0).drive);
    for (const key of ['gear', 'postTicks', 'dragTicks', 'tapStreak', 'tapGap', 'counterTicks', 'brakeTicks']) expect(keys).toContain(key);
    for (const key of keys) {
      const was = d[key]!;
      d[key] = was + 1;
      expect(hashWorld(w), key).not.toBe(h0);
      expect(hashWorld(cloneWorld(w)), key).toBe(hashWorld(w));
      d[key] = was;
    }
    expect(hashWorld(w)).toBe(h0);
  });

  it('two identical technique runs (drag, taps, cut) give identical hash streams', () => {
    const run = (): number[] => {
      const r = tapRun(150, 8);
      const out: number[] = [];
      for (let t = 0; t < 30; t++) { tick(r.rig, { steer: -1 }); out.push(hashWorld(r.rig.w)); }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
