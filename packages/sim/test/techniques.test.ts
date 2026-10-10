// v10 keeps gear, fatigue, event/reset, air and deterministic contracts from the M5 acceptance table of docs/design/15-driving-techniques.md §5 (items 1–9).
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
  aDrag: 4.25, etaDrag: 1.0, dragCapMul: 1, tapCapStep: 0, tapStreakMax: 3, tapYaw: 0.7, tapAccelMul: 2,
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
  d.driftArmed = 0; d.driftEngagement = 1; d.driftTarget = 0; d.driftTightness = 0; d.driftRecovering = 0; d.pendingDriftDir = 0;
  d.dragTicks = o.drag ?? 0; d.tapStreak = o.streak ?? 0; d.tapGap = o.gap ?? 255; d.counterTicks = 0; d.brakeTicks = 0;
  d.boostTicks = 120; d.boostKind = Boost.NORMAL; d.prevHeld = Held.DRIFT; d.prevThrottle = 1;
  const r = 0; // neutral steering has no permanent yaw carry in v10
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
    expect(V_REF * KMH_PER_MPS).toBeCloseTo(205 * 0.85, 9);
    expect(KMH).toBe(KMH_PER_MPS);
    for (const [kmh, mps] of [[290, 48.10], [300, 49.76], [305, 50.59], [20, 3.317], [65, 10.78]] as const) {
      expect(Math.abs(kmh / KMH_PER_MPS - mps), `${kmh} km/h`).toBeLessThanOrEqual(0.005);
    }
    const karts = getContent().karts;
    expect(karts.get('pebble').vBoost).toBeCloseTo(45.11 * 0.85 ** 2, 8);
    expect(karts.get('arrowhead').vBoost).toBeCloseTo(45.72 * 0.85 ** 2, 8);
    expect(karts.get('neon_blade').vBoost).toBeCloseTo(45.92 * 0.85 ** 2, 8);
    expect(karts.get('glacier_sled').vBoost).toBeCloseTo(44.50 * 0.85 ** 2, 8);
    expect(45.11 * KMH_PER_MPS).toBeCloseTo(272, 0);
  });

  it('booster plateau reads about 197 km/h after the additional reduction', () => {
    const { rig, k } = rigAt(P.vGrip, (kk) => { kk.drive.boosters = 1; });
    const at: number[] = [];
    for (let t = 0; t < 175; t++) { tick(rig, { edges: t === 0 ? Edge.USE_ITEM : 0 }); at.push(fwdKmh(k)); }
    for (let t = 150; t < 175; t++) { expect(at[t]!).toBeGreaterThanOrEqual(P.vBoost * KMH_PER_MPS - 0.25); expect(at[t]!).toBeLessThanOrEqual(P.vBoost * KMH_PER_MPS); }
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

  it('drag/tap/team propulsion cannot exceed the kart boost cap', () => {
    for (let streak = 0; streak <= 3; streak++) expect(P.vBoost * (P.dragCapMul + P.tapCapStep * streak)).toBe(P.vBoost);
    expect(P.vTeam).toBe(P.vBoost); expect(P.startCapMul).toBe(1);
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
    // Stronger grip (24/s rather than 18/s) stops this push after about 0.245 m; wiping velocity each contact
    // would still move only 0.05 m. The N→STOP sequence above verifies the actual zero-lock condition.
    expect(Math.hypot(k.body.px - p0[0]!, k.body.pz - p0[1]!)).toBeGreaterThan(0.2);
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
  /** Booster fired at tick 0 from P.vGrip m/s; `frame(t)` drives from then on. Returns forward speed and postTicks per tick and the expiry tick. */
  function bleedRun(n: number, frame: (t: number, k: KartState) => Frame, setup?: (k: KartState) => void) {
    const { rig, k } = rigAt(P.vGrip, (kk) => { kk.drive.boosters = 1; setup?.(kk); });
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

  it('↑ held: 30 ticks of u ← P.vGrip + (u − P.vGrip)·decayF(6), |v| ≈ (P.vGrip + (P.vBoost - P.vGrip) * F6 ** 30) after them, then the overspeed law again', () => {
    const { u, post, expiry: E } = bleedRun(260, () => ({ thr: 1 }));
    expect(E).toBe(180);
    expect(u[E - 1]!).toBeGreaterThan(P.vBoost - 0.03);
    for (let j = 0; j < 30; j++) {
      expect(post[E + j]!, `bleed tick ${j}`).toBe(30 - j);
      expect(Math.abs(u[E + j]! - (P.vGrip + (u[E + j - 1]! - P.vGrip) * F6)), `bleed tick ${j}`).toBeLessThanOrEqual(Q2);
    }
    expect(Math.abs(u[E + 29]! - (P.vGrip + (P.vBoost - P.vGrip) * F6 ** 30))).toBeLessThanOrEqual(0.01);
    expect(post[E + 30]!).toBe(0);
    for (let t = E + 30; t < 260; t++) expect(Math.abs(u[t]! - (u[t - 1]! - P.kOver * (u[t - 1]! - P.vGrip) * DT)), `tick ${t}`).toBeLessThanOrEqual(Q2);
  });

  it('↑ released: du = min((P.vGrip − u)·(1 − decayF(6)), −u·(1 − decayF(0.7))), never weaker than the held rule', () => {
    const { u, post, expiry: E, k } = bleedRun(230, (t) => ({ thr: t >= 175 ? 0 : 1 }));
    expect(E).toBe(180);
    let held = 0, rel = 0;
    for (let j = 0; j < 30; j++) {
      const u0 = u[E + j - 1]!;
      const dHold = (P.vGrip - u0) * (1 - F6), dRel = -u0 * (1 - F07);
      if (dHold < dRel) held++; else rel++;
      expect(post[E + j]!).toBe(30 - j);
      expect(Math.abs(u[E + j]! - (u0 + Math.min(dHold, dRel))), `bleed tick ${j}`).toBeLessThanOrEqual(Q2);
    }
    // both branches are exercised: the held rate down to ≈ 38.7 m/s, then the release rate toward 0
    expect(held + rel).toBe(30); expect(rel).toBeGreaterThan(3); // the smaller boost gap can keep the release branch strongest throughout
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
      const bleed = P.vGrip + (u0 - P.vGrip) * F6 - u0;
      expect(bleed).toBeGreaterThan(-P.aBrake * DT); // the brake is the stronger one here
      expect(Math.abs(u[t]! - (u0 - P.aBrake * DT)), `tick ${t}`).toBeLessThanOrEqual(Q2);
    }
    expect(post[199]!).toBe(30 - (199 - E));
    const u0 = u[198]!;
    const expected = u0 > P.vGrip ? P.vGrip + (u0 - P.vGrip) * F6 : u0 + P.a0 * (1 - (u0 / P.vGrip) ** 2) * DT;
    expect(Math.abs(u[199]! - expected)).toBeLessThanOrEqual(Q2);
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
    const k = place(rig, 0, { s: 290, speed: P.vGrip });
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
    const { rig: r2, k: k2 } = rigAt(P.vGrip, (kk) => { kk.drive.boostTicks = 3; kk.drive.boostKind = Boost.NORMAL; });
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

  it('a 60° wall hit preserves boost until its normal expiry and bleed', () => {
    const rig = racingRig(corridor(16).track);
    const k = place(rig, 0, { s: 300, u: 0, speed: 30, yawDeg: -60 }); // toward the right wall (u = +8) at 60°
    k.drive.prevThrottle = 1; k.drive.boostTicks = 120; k.drive.boostKind = Boost.NORMAL;
    let hit = -1;
    for (let t = 0; t < 120; t++) {
      const ev = tick(rig, { thr: 1 });
      const w = ev.find((e) => e.t === 'wall' && e.kart === 0);
      if (hit < 0 && w && w.t === 'wall') { expect(w.severity).toBe(2); hit = t; }
      expect(k.drive.postTicks, `tick ${t}`).toBe(t === 119 ? 30 : 0);
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
  it('neutral steering allows a held drift to unwind instead of orbiting indefinitely', () => {
    const r = dragRun(180);
    expect(Math.abs(r.k.body.yawRate)).toBeLessThan(0.01);
    expect(r.k.drive.dragTicks).toBe(0);
    expect(planar(r.k)).toBeLessThan(34); // an artificially seeded 45m/s slide decays toward the lower motor cap
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

  it('a wall impact clears all drift control and technique fields', () => {
    const rig = racingRig(corridor(16).track), k = place(rig, 0, { s: 300, u: 6.8, speed: 28, yawDeg: -60 });
    liveDrift(k, 28, { drag: 40, streak: 2, gap: 3 });
    for (let t = 0; t < 15 && !k.stats.wallHits; t++) tick(rig, { drift: true });
    expect(k.stats.wallHits).toBeGreaterThan(0); expect(k.drive.drift).toBe(0);
    expect(techOf(k)).toEqual(TECH_IDLE); expect(k.drive.driftEngagement).toBe(0);
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
        if (k.body.attachKind !== kind) expect(k.drive.drift, `tick ${t} before the capture`).toBe(1);
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
      expect(r.k.drive.driftEngagement, `${name} control`).toBe(1);
      expect(r.k.drive.drift, `${name} control`).toBe(1);
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

  it('a drag ends when throttle is lifted or its boost expires', () => {
    for (const throttle of [false, true]) {
      const { rig, k } = rigAt(P.vBoost); liveDrift(k, 28, { drag: 40, streak: 1 });
      if (throttle) k.drive.boostTicks = 1;
      const ev = tick(rig, { drift: true, thr: throttle ? 1 : 0 });
      expect(dragOff(ev)).toBe(true); expect(k.drive.dragTicks).toBe(0);
    }
  });
});

// Arrow tap streaks remain a bonus within an existing sliding/boosting state; Shift controls the turn itself.
describe('physics: tap bonuses on continuous drift', () => {
  for (const gap of [6, 8, 12]) it(`valid ${gap}-tick tap cadence raises the smooth target without yaw impulses`, () => {
    const { rig, k } = rigAt(P.vBoost); const streaks: number[] = [];
    for (let t = 0; t < 3 * gap; t++) {
      // Preserve the instantaneous test slip while exercising the persistent cadence state.
      liveDrift(k, 28, { drag: 40, streak: k.drive.tapStreak, gap: k.drive.tapGap, v: P.vBoost });
      const yaw = k.body.yawRate;
      const ev = tick(rig, { drift: true, edges: t % gap === 0 ? Edge.TAP_L : 0 });
      for (const e of ev) if (e.t === 'tapBoost') streaks.push(e.streak);
      expect(Math.abs(k.body.yawRate - yaw)).toBeLessThanOrEqual(P.yawAccel * DT + Q2);
    }
    expect(streaks).toEqual([1, 2, 3]);
  });
  it('the opposite tap does not award an in-direction bonus', () => {
    const { rig, k } = rigAt(P.vBoost); liveDrift(k, 28, { drag: 40 });
    expect(tick(rig, { drift: true, edges: Edge.TAP_R }).some((e) => e.t === 'tapBoost')).toBe(false);
  });
});

// Counter-steer timing across boost/Shift combinations is exercised by handling-v10.test.ts.
describe('physics: counter-steer completion keeps physical slip continuous', () => {
  for (const steer of [-0.2, -0.6, -1]) it(`counter-steer ${steer} recovers without requiring Shift release`, () => {
    const { rig, k } = rigAt(P.vGrip); for (let t = 0; t < 40; t++) tick(rig, { steer: 1, drift: true });
    let ended = false;
    for (let t = 0; t < 60; t++) { const ev = tick(rig, { steer, drift: true }); if (has(ev, 'cut')) ended = true; }
    expect(ended).toBe(true); expect(k.drive.drift).toBe(0); expect(k.stats.drifts).toBe(1);
  });
});

describe('physics: braking has priority without artificial spin or steering lock', () => {
  it('holds accelerator + brake + Shift for over a second with live steering and no spin/stun', () => {
    const { rig, k } = rigAt(P.vGrip, (kk) => { kk.drive.boostTicks = 300; kk.drive.boostKind = Boost.NORMAL; kk.drive.boosters = 2; });
    for (let t = 0; t < 30; t++) tick(rig, { steer: 1, drift: true });
    let previous = heading(k), changedDirection = false;
    for (let t = 0; t < 90; t++) {
      const ev = tick(rig, { steer: t < 30 ? 1 : -1, drift: true, brk: 1, thr: 1 });
      expect(has(ev, 'spinOut')).toBe(false); expect(has(ev, 'brakeTurn')).toBe(false);
      expect(k.drive.stunTicks).toBe(0); expect(k.drive.driftIntentTicks).toBe(0);
      const angle = heading(k), da = wrap(angle - previous); previous = angle;
      expect(Math.abs(da - k.body.yawRate * DT)).toBeLessThan(2e-4);
      if (t >= 30 && k.body.yawRate < 0) changedDirection = true;
    }
    expect(changedDirection).toBe(true); expect(k.drive.drift).toBe(0); expect(k.drive.boosters).toBe(2);
    expect(planar(k)).toBeLessThan(0.01); expect(k.drive.boostTicks).toBeGreaterThan(0);
    for (let t = 0; t < 30; t++) tick(rig, { thr: 1, steer: -1 });
    expect(fwd(k)).toBeGreaterThan(3); expect(k.body.yawRate).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------------------------------- air
describe('physics: techniques in the air (doc 15 §4.8)', () => {
  /** Lifts the kart 3 m off the flat plane with no coyote time: ≈ 47 ticks of free fall. */
  const lift = (k: KartState): void => { k.body.py += 3; k.body.grounded = 0; k.body.coyote = 0; };

  it('the drag ends with an off event on the first air tick; the cut counter resets', () => {
    const base = rigAt(P.vBoost); liveDrift(base.k, 28, { drag: 40, streak: 2, gap: 3 });
    const r = { rig: base.rig, k: base.k };
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

  it('reverse gauge at sIn ≤ −0.3 while boosting: raw +38 charges ×1, raw +39 charges ×3', () => {
    const x1 = counterRun(40, 300, { raw: 38, drift: true });
    const x3 = counterRun(40, 300, { raw: 39, drift: true });
    expect(x1.ratio.length).toBeGreaterThanOrEqual(4);
    expect(x3.ratio.length).toBeGreaterThanOrEqual(4);
    for (const r of x1.ratio.slice(0, 4)) { expect(r).toBeGreaterThan(0.95); expect(r).toBeLessThan(1.05); }
    for (const r of x3.ratio.slice(0, 4)) { expect(r).toBeGreaterThan(2.85); expect(r).toBeLessThan(3.15); }
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
      const r = dragRun(150);
      const out: number[] = [];
      for (let t = 0; t < 30; t++) { tick(r.rig, { steer: -1 }); out.push(hashWorld(r.rig.w)); }
      return out;
    };
    expect(run()).toEqual(run());
  });
});
