// physics: M5 driving techniques, the acceptance table of docs/design/15-driving-techniques.md §5 (items 1–9).
// Written from the spec text alone, independently of the implementation in kart/**: every script is an exact input
// sequence on the 1 km flat plane (or a corridor / slope fixture), and every number comes from doc 15 (§1 speeds,
// §2 constants) or from the laws of §4 evaluated on the observed state. The oracle comparison of item 9 runs in
// physics.test.ts over test/oraclelogs.ts.
import { describe, expect, it } from 'vitest';
import {
  Boost, Edge, Gear, Held, KMH_PER_MPS, SIN, V_REF, cloneWorld, decayF, hashWorld, newKart, paramsFor,
  type BakedTrack, type KartState, type SimEvent,
} from '@cr/sim';
import { getContent, type Rig } from './rig.ts';
import { corridor, flatPlane } from './fixtures/kits.ts';
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
  aDrag: 5, etaDrag: 1.0, dragCapMul: 1.0662, tapCapStep: 0.01839, tapStreakMax: 3, tapYaw: 0.4, tapAccelMul: 2,
  tapTicks: 8, tapGrace: 8, tapMinGap: 6, tapMaxGap: 12, dragNeutral: 0.3,
  dragEnterLo: 0.3420201433256687, dragEnterHi: 0.573576436351046, dragExitLo: 0.3090169943749474, dragExitHi: 0.6018150231520483,
  cutSteer: 0.7, cutTicks: 2, etaCut: 0.8, revGaugeMul: 3, brakeTurnTicks: 8, brakeTurnMul: 2, spinTicks: 11,
  spinSpeed: 20 / (205 / 34), spinStunTicks: 15,
};

// ---------------------------------------------------------------------------------------------------- helpers
interface Frame { steer?: number /* + = left */; thr?: 0 | 1; brk?: 0 | 1; drift?: boolean; edges?: number }

/** One tick for slot 0; returns the events it emitted. */
function tick(rig: Rig, f: Frame): SimEvent[] {
  const n0 = rig.events.length;
  rig.tick((_w, inp) => {
    const o = inp[0]!;
    o.steer = steerLeft(f.steer ?? 0); o.throttle = (f.thr ?? 1) ? 15 : 0; o.brake = f.brk ? 15 : 0;
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
    for (const [key, v] of Object.entries(DOC15)) expect(p[key], key).toBeCloseTo(v, 12);
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
function dragRun(n: number, after: (t: number, onAt: number) => Frame = () => ({ drift: true }), o: { build?: number; boost?: number } = {}): DragRun {
  const { rig, k } = rigAt(45, (kk) => { kk.drive.boostTicks = o.boost ?? 300; kk.drive.boostKind = (o.boost ?? 300) > 0 ? Boost.NORMAL : Boost.NONE; });
  const build = o.build ?? 24;
  const ev: SimEvent[][] = [], v: number[] = [], drag: number[] = [], sb: number[] = [];
  let onAt = -1;
  for (let t = 0; t < n; t++) {
    const e = tick(rig, t < build ? { steer: 1, drift: true } : after(t, onAt));
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

  it('a full counter-steer with DRIFT released cuts on its 2nd tick: β → 0, the drift ends with the instant window open', () => {
    const r = cutRun(34, 0, () => ({ steer: -1 }));
    expect(r.s[29]!.drift).toBe(1);
    expect(has(r.ev[30]!, 'cut')).toBe(false);
    expect(r.s[30]!.counter).toBe(1);
    expect(r.s[30]!.drift).toBe(1);
    expect(has(r.ev[31]!, 'cut')).toBe(true);
    expect(has(r.ev[31]!, 'driftEnd')).toBe(true);
    expect(r.s[31]!.drift).toBe(0);
    expect(Math.abs(r.s[31]!.wl)).toBeLessThan(1e-3);
    expect(Math.abs(r.s[31]!.yaw)).toBeLessThan(1e-9);
    expect(r.s[31]!.iw).toBeGreaterThan(0);
    expect(r.s[31]!.counter).toBe(0);
    // u += etaCut·(v − u): most of the sideways speed is turned forward
    expect(r.s[31]!.v).toBeGreaterThan(r.s[30]!.u + 0.6 * (r.s[30]!.v - r.s[30]!.u));
    expect(r.ev.flat().filter((e) => e.t === 'cut').length).toBe(1);
  });

  it('a cut with DRIFT still held (no boost) also cuts on the 2nd tick', () => {
    const r = cutRun(34, 0, () => ({ steer: -1, drift: true }));
    expect(has(r.ev[31]!, 'cut')).toBe(true);
    expect(r.s[31]!.drift).toBe(0);
  });

  it('a half counter-steer (0.6) never cuts', () => {
    const r = cutRun(34, 0, () => ({ steer: -0.6 }));
    expect(r.ev.flat().some((e) => e.t === 'cut')).toBe(false);
    for (let t = 30; t < 60; t++) expect(r.s[t]!.counter).toBe(0);
  });

  it('boosting with DRIFT held: counter-steer is the reverse gauge (×3 gain, no cut); releasing DRIFT cuts at once', () => {
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
    expect(has(r.ev[40]!, 'cut')).toBe(true);
    expect(r.s[40]!.drift).toBe(0);
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
