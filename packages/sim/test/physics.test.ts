// v10: lower physical speed, gentler capped boost, preserved wall resources and independent integration.
// Previous impulsive corner timing pins are replaced by the fixed keyboard scenarios in handling-v10.test.ts.
// physics: acceptance numbers from docs/design/10-sim-spec.md §14 (gap-2 values [V]) and 02-contracts §E.
// Fixtures are built in code (test/fixtures): a 1 km flat plane, a 16 m corridor and 12 m corner kits.
// M5 (docs/design/15-driving-techniques.md): the display reads 205 km/h at vGrip (KMH); rows whose physics is
// unchanged keep their validated gap-2 numbers on the old scale (KMH_GAP2). Numbers that the new vBoost or the new
// laws (bleed, cut, drag, gears) move carry an "M5" note with the re-measured value; the techniques themselves
// are pinned in techniques.test.ts.
import { describe, expect, it } from 'vitest';
import { Edge, Held, V_REF, makeInput, copyInput, paramsFor, type InputFrame, type KartState } from '@cr/sim';
import { bakedTrack, makeRig, getContent, type Rig } from './rig.ts';
import { flatPlane, corridor } from './fixtures/kits.ts';
import { racingRig, place, fwdKmh, speedOf, steerLeft, KMH, KMH_GAP2 } from './util.ts';
import { ORACLE_LOGS } from './oraclelogs.ts';
import { oracleKart, oracleStep, type OracleKart, type OracleParams } from './oracle/proto2d.ts';

const oval = bakedTrack('_test/drag_oval');
const flat = flatPlane().track;
/** vGrip on the gap-2 display scale (183.6 km/h): the acceleration rows are validated on it. */
const V_GRIP_GAP2 = V_REF * KMH_GAP2;
// v10 scales physical speed and thrust equally; these retained boost curves are normalized to the v9 scale.
const SPEED_SCALE = 0.85;

/** Holds throttle so that step `goTick + d` is the first with throttle (the drive callback sees the pre-step tick). */
function launch(d: number | null, ticksAfterGo: number, track = oval): Rig {
  const rig = makeRig(track, { laps: 1 });
  const go = rig.w.goTick;
  rig.run(go + ticksAfterGo - rig.w.tick, (w, inp) => { inp[0]!.throttle = d === null || w.tick + 1 >= go + d ? 15 : 0; });
  return rig;
}

/** km/h (on `scale`) every 15 ticks from `v0` on the flat plane, throttle held; `use` ticks fire a booster. */
function series(v0: number, n: number, setup: (k: KartState) => void, use: number[] = [], scale = KMH): number[] {
  const rig = racingRig(flat);
  const k = place(rig, 0, { s: 300, speed: v0 * SPEED_SCALE });
  k.drive.prevThrottle = 1;
  setup(k);
  const out: number[] = [];
  for (let t = 0; t <= n; t++) {
    if (t % 15 === 0) out.push(fwdKmh(k, scale) / SPEED_SCALE);
    rig.tick((_w, inp) => { inp[0]!.throttle = 15; if (use.includes(t)) inp[0]!.edges |= Edge.USE_ITEM; });
  }
  return out;
}

describe('physics: acceleration (§14.1)', () => {
  it('0→85 km/h (15% slower physical speed) in 1.17 ± 0.05 s and 0→97% of top speed in 3.95 ± 0.10 s', () => {
    const rig = makeRig(oval, { laps: 1 });
    const press = rig.w.goTick + 30; // after the start-boost window: plain standing start
    let t100 = -1, t97 = -1;
    while (rig.w.tick < press + 600) {
      rig.tick((w, inp) => { inp[0]!.throttle = w.tick >= press ? 15 : 0; });
      const v = fwdKmh(rig.w.karts[0]!, KMH_GAP2), t = (rig.w.tick - press) / 60;
      if (t100 < 0 && v >= 100 * SPEED_SCALE) t100 = t;
      if (t97 < 0 && v >= 0.97 * V_GRIP_GAP2) t97 = t;
    }
    expect(t100).toBeGreaterThan(1.12); expect(t100).toBeLessThan(1.22);
    expect(t97).toBeGreaterThan(3.85); expect(t97).toBeLessThan(4.05);
    expect(fwdKmh(rig.w.karts[0]!, KMH_GAP2)).toBeGreaterThan(0.99 * V_GRIP_GAP2);
    expect(fwdKmh(rig.w.karts[0]!, KMH_GAP2)).toBeLessThan(1.005 * V_GRIP_GAP2);
  });

  it('0→25 m/s 1.78 ± 0.05 s, 0→30 m/s 2.62 ± 0.08 s, 0→99% 4.97 ± 0.15 s on the flat plane', () => {
    const rig = racingRig(flat);
    const k = place(rig, 0, { s: 200, speed: 0 });
    const hit: Record<string, number> = {};
    for (let t = 1; t <= 600; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; });
      const u = fwdKmh(k) / KMH;
      for (const [name, v] of [['25', 25], ['30', 30], ['99', 0.99 * 34]] as const) if (hit[name] === undefined && u >= v * SPEED_SCALE) hit[name] = t / 60;
    }
    expect(hit['25']!).toBeCloseTo(1.78, 1); expect(Math.abs(hit['25']! - 1.78)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(hit['30']! - 2.62)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(hit['99']! - 4.97)).toBeLessThanOrEqual(0.15);
  });
});

// M5: the booster rows below moved with vBoost 45.11 (272 km/h on the new display) and, after expiry, with
// the post-boost bleed. The expected values are a pre-merge measurement of the unchanged boost law with the M5 vBoost
// (during the boost) and the oracle's bleed prediction (after expiry); the reconcile step confirms them on the merged sim.
describe('physics: gentle boost at the reduced physical cap', () => {
  it('rises through measured 200/500/1000ms speeds without a sudden speed step', () => {
    const rig = racingRig(flat), k = place(rig, 0, { s: 300, speed: V_REF });
    k.drive.boosters = 1; const samples: number[] = []; let previous = V_REF;
    for (let t = 0; t < 180; t++) {
      rig.tick((_w, f) => { f[0]!.throttle = 15; f[0]!.edges = t === 0 ? Edge.USE_ITEM : 0; });
      const v = speedOf(k); expect(v - previous).toBeLessThanOrEqual(8.5 / 60 + 1 / 4096);
      samples.push(v); previous = v;
    }
    expect(samples[11]).toBeCloseTo(30.0305, 3); expect(samples[29]).toBeCloseTo(31.1113, 3);
    expect(samples[59]).toBeCloseTo(31.9978, 3); expect(samples[179]).toBeCloseTo(32.5762, 3);
    expect(samples.every((v) => v <= 32.591975)).toBe(true);
  });
  it('chaining extends propulsion without a new acceleration pause or dip', () => {
    const rig = racingRig(flat), k = place(rig, 0, { s: 300, speed: V_REF }); k.drive.boosters = 2;
    let previous = V_REF;
    for (let t = 0; t < 350; t++) {
      rig.tick((_w, f) => { f[0]!.throttle = 15; f[0]!.edges = t === 0 || t === 172 ? Edge.USE_ITEM : 0; });
      expect(speedOf(k)).toBeGreaterThanOrEqual(previous - 1 / 4096); previous = speedOf(k);
      expect(previous).toBeLessThanOrEqual(32.591975);
    }
    expect(k.stats.boostsUsed).toBe(2);
  });
});

describe('physics: instant boost (§7.4, §14.3)', () => {
  it('from 151 km/h: +11 ± 2 km/h at 0.5 s over no instant boost; 163, 175, 178, 180 vs 158, 164, 168', () => {
    const withI = series(28, 150, (k) => { k.drive.instWindow = 30; k.drive.prevThrottle = 0; }, [], KMH_GAP2);
    const without = series(28, 150, (k) => { k.drive.prevThrottle = 0; }, [], KMH_GAP2);
    const gain = withI[2]! - without[2]!;
    expect(gain).toBeGreaterThanOrEqual(9); expect(gain).toBeLessThanOrEqual(13);
    [163, 175, 178].forEach((v, i) => expect(Math.abs(withI[i + 1]! - v)).toBeLessThanOrEqual(3));
    expect(Math.abs(withI[5]! - 180)).toBeLessThanOrEqual(3); // 1.25 s
    [158, 164, 168].forEach((v, i) => expect(Math.abs(without[i + 1]! - v)).toBeLessThanOrEqual(3));
  });

  function driftThenTap(driftTicks: number, steer: number, releaseAt: number, repressAt: number): { k: KartState; rig: Rig } {
    const rig = racingRig(flat);
    const k = place(rig, 0, { s: 300, speed: 30 });
    k.drive.prevThrottle = 1;
    let exitTick = -1;
    for (let t = 0; t < 200; t++) {
      rig.tick((_w, inp) => {
        const o = inp[0]!;
        o.throttle = 15; o.held = 0; o.steer = 0;
        if (t < driftTicks) { o.held = Held.DRIFT; o.steer = steerLeft(steer); }
        else if (k.drive.drift) o.steer = steerLeft(-1);
        if (exitTick >= 0 && t >= exitTick + releaseAt && t < exitTick + repressAt) o.throttle = 0;
      });
      if (exitTick < 0 && t >= driftTicks && k.drive.drift === 0) exitTick = t;
    }
    return { k, rig };
  }

  it('opens a 30-tick window only after a full drift (≥ 15 ticks, ≥ 8° slip), fired by a throttle press edge', () => {
    const full = driftThenTap(40, 1, 2, 5);
    expect(full.k.stats.instantBoosts).toBe(1);
    expect(full.rig.events.some((e) => e.t === 'instantBoost')).toBe(true);
    const late = driftThenTap(40, 1, 2, 40); // re-press after the window closed
    expect(late.k.stats.instantBoosts).toBe(0);
    const short = driftThenTap(4, 0.35, 1, 4); // a short, shallow drift opens no window
    expect(short.k.stats.drifts).toBe(1);
    expect(short.k.stats.instantBoosts).toBe(0);
  });
});

describe('physics: wall response and retained boost resources', () => {
  for (const [angle, severity] of [[10, 0], [30, 1], [60, 2], [90, 2]] as const) {
    it(`${angle} degree wall contact has severity ${severity} and preserves charge and boost`, () => {
      const r = racingRig(corridor(16).track), k = place(r, 0, { s: 300, speed: V_REF, yawDeg: -angle });
      k.drive.gauge = 0.6; k.drive.boosters = 2; k.drive.boostTicks = 400; k.drive.boostKind = 1;
      let hit = false;
      for (let t = 0; t < 240; t++) {
        const before = k.drive.boostTicks;
        r.tick((_w, f) => { f[0]!.throttle = 15; });
        const e = r.events.find((e) => e.t === 'wall');
        if (e?.t === 'wall') {
          expect(e.severity).toBe(severity); expect(k.drive.boostTicks).toBe(before - 1);
          expect(k.drive.stunTicks).toBe(severity === 2 ? 16 : 0); hit = true; break;
        }
      }
      expect(hit).toBe(true); expect(k.drive.gauge).toBeCloseTo(0.6, 4); expect(k.drive.boosters).toBe(2);
      expect([k.body.vx, k.body.vy, k.body.vz].every(Number.isFinite)).toBe(true);
    });
  }
});

describe('physics: start boost (§7.1, §14.5)', () => {
  const base = launch(null, 300);
  // Doc 17 changes the start acceleration and target only. Compare the physical
  // distance to the independent flat-plane oracle instead of retaining M5's
  // 30 m/s² launch-distance pins. The reference test independently checks the
  // resulting speeds against the recording, so changing both models is not enough.
  const P = paramsFor(getContent().karts.get('pebble')) as OracleParams;
  function startOracle(duration: number, ticksAfterGo = 300): OracleKart {
    const k = oracleKart(0, 0, 1, 0, 0);
    // The race grants the timer after the GO tick's decrement; the dynamics-only
    // oracle decrements first. Both runs include GO and ticksAfterGo later ticks.
    k.startT = duration > 0 ? duration + 1 : 0;
    for (let t = 0; t <= ticksAfterGo; t++) oracleStep(k, {
      steer: 0, thr: 1, brk: 0, drift: false, boost: false, tapL: false, tapR: false,
    }, P);
    return k;
  }
  const oracleGain = (duration: number): number => startOracle(duration).px - startOracle(0).px;
  const gain = (d: number): { gain: number; tier: number; r: Rig } => {
    const r = launch(d, 300);
    return { gain: r.w.karts[0]!.race.raceDist - base.w.karts[0]!.race.raceDist, tier: r.w.karts[0]!.stats.startTier, r };
  };
  it('holding the throttle through the countdown is no boost and no penalty', () => {
    expect(base.w.karts[0]!.stats.startTier).toBe(1);
  });
  it('PERFECT [0, +6] uses the reference launch law and preserves the timing window', () => {
    for (const d of [0, 3, 6]) {
      const g = gain(d);
      expect(g.tier).toBe(5);
      // Independent doc-17 integration: +42.646 m at 5 s; old M5 pin was +28 m.
      if (d === 0) expect(Math.abs(g.gain - oracleGain(90))).toBeLessThan(0.05);
    }
    const r = launch(0, 60);
    expect(Math.abs(fwdKmh(r.w.karts[0]!, KMH_GAP2) - startOracle(90, 60).vx * KMH_GAP2)).toBeLessThan(0.05);
  });
  it('GREAT −3 ticks and GOOD −9 ticks retain their shorter 60/36-tick launch durations', () => {
    // Independent integration: +34.583 m and +24.886 m. No wider old tolerance.
    const g = gain(-3); expect(g.tier).toBe(4); expect(Math.abs(g.gain - oracleGain(60))).toBeLessThan(0.05);
    const o = gain(-9); expect(o.tier).toBe(3); expect(Math.abs(o.gain - oracleGain(36))).toBeLessThan(0.05);
  });
  it('FALSE −24 ticks: −7 ± 3 m (wheelspin); a press 24 ticks late: none, −13 ± 3 m', () => {
    const f = gain(-24); expect(f.tier).toBe(2); expect(Math.abs(f.gain + 7)).toBeLessThanOrEqual(3);
    const l = gain(24); expect(l.tier).toBe(1); expect(Math.abs(l.gain + 13)).toBeLessThanOrEqual(3);
  });
  it('a good start adds the +0.05 gauge bonus in speed mode', () => {
    expect(gain(0).r.w.karts[0]!.drive.gauge).toBeCloseTo(0.05, 4);
    expect(base.w.karts[0]!.drive.gauge).toBe(0);
  });
});

// Corner plans end with counter-steer and DRIFT released. Doc 17's slower finite
// v10 corner acceptance is in handling-v10.test.ts: one held Shift, both directions, no brake.
describe('physics: drift gauge, fatigue and double drift (§6.2, §8)', () => {
  /** Holds a left drift with steer `s` for `n` ticks from 32 m/s, then counter-steers out; returns gauge gained. */
  function drift(k: KartState, rig: Rig, n: number, s = 0.8): number {
    const g0 = k.drive.gauge + k.drive.boosters;
    for (let t = 0; t < n + 60 && (t < n || k.drive.drift); t++) {
      rig.tick((_w, inp) => { const o = inp[0]!; o.throttle = 15; o.held = t < n ? Held.DRIFT : 0; o.steer = steerLeft(t < n ? s : -1); });
    }
    return k.drive.gauge + k.drive.boosters - g0;
  }

  it('fatigue: an immediate second drift charges less than the same drift after a rest', () => {
    const a = racingRig(flat), ka = place(a, 0, { s: 300, speed: 32 });
    drift(ka, a, 90);
    const tired = drift(ka, a, 90);
    const b = racingRig(flat), kb = place(b, 0, { s: 300, speed: 32 });
    drift(kb, b, 90);
    b.run(240, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(kb.drive.fatigueTicks).toBe(0);
    const rested = drift(kb, b, 90);
    expect(tired).toBeLessThan(rested * 0.9);
    expect(rested).toBeGreaterThan(0);
  });

  it('fatigue counts +1 per drifting tick and −1 per tick otherwise', () => {
    const rig = racingRig(flat), k = place(rig, 0, { s: 300, speed: 32 });
    drift(k, rig, 50);
    const f = k.drive.fatigueTicks;
    expect(f).toBeGreaterThanOrEqual(50);
    rig.run(10, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(k.drive.fatigueTicks).toBe(f - 10);
  });

  it('a full gauge becomes a stored booster (2 slots), then is held at 1', () => {
    const rig = racingRig(flat), k = place(rig, 0, { s: 300, speed: 32 });
    k.drive.gauge = 0.99; k.drive.boosters = 1;
    drift(k, rig, 30);
    expect(k.drive.boosters).toBe(2);
    expect(rig.events.filter((e) => e.t === 'gaugeFull').length).toBe(1);
    k.drive.gauge = 0.99;
    drift(k, rig, 30);
    expect(k.drive.boosters).toBe(2);
    expect(k.drive.gauge).toBe(1);
  });

  it('item mode: no gauge and no boosters from drifting', () => {
    const rig = racingRig(flat, { mode: 'item' }), k = place(rig, 0, { s: 300, speed: 32 });
    drift(k, rig, 60);
    expect(k.drive.gauge).toBe(0);
  });

  // Repeat Shift target/radius and continuity are verified on real trajectories in handling-v10.test.ts.
});

describe('physics: draft (§7.5)', () => {
  function pair(gap: number, lat: number, leave = -1) {
    const rig = racingRig(flat, { slots: [{}, {}] });
    const lead = place(rig, 0, { s: 320, speed: 30 });
    const tail = place(rig, 1, { s: 320 - gap, u: lat, speed: 30 });
    let bursts = 0, maxV = 0, chargeAt120 = -1, chargeAfterLeave = -1;
    for (let t = 0; t < 300; t++) {
      // leaving the cone: the follower is moved 5 m sideways (same speed and heading)
      if (t === leave) { tail.body.px += 5 * -tail.body.fz; tail.body.pz += 5 * tail.body.fx; }
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; inp[1]!.throttle = 15; });
      if (tail.drive.draftTicks > 0) { bursts++; maxV = Math.max(maxV, speedOf(tail)); }
      if (t === 118) chargeAt120 = tail.drive.draftCharge;
      if (leave >= 0 && t === leave + 40) chargeAfterLeave = tail.drive.draftCharge;
    }
    return { rig, lead, tail, bursts, maxV, chargeAt120, chargeAfterLeave };
  }
  it('charges for 120 ticks in the cone, then a 90-tick burst toward 1.05·vGrip', () => {
    const r = pair(10, 0);
    expect(r.chargeAt120).toBe(119);
    expect(r.bursts).toBe(90);
    expect(r.tail.stats.draftBursts).toBe(1);
    expect(r.maxV).toBeGreaterThan(V_REF);
    expect(r.maxV).toBeLessThanOrEqual(V_REF * 1.05 + 1e-3);
    expect(r.rig.events.some((e) => e.t === 'draft' && e.on)).toBe(true);
    expect(r.rig.events.some((e) => e.t === 'draft' && !e.on)).toBe(true);
  });
  it('no charge outside the cone (lateral ≥ 2.2 m or > 22 m behind); the meter drains at 2× its fill rate', () => {
    expect(pair(10, 3).tail.drive.draftCharge).toBe(0);
    expect(pair(30, 0).tail.drive.draftCharge).toBe(0);
    const r = pair(10, 0, 60);
    expect(r.chargeAfterLeave).toBe(0);
    expect(r.bursts).toBe(0);
  });
});

describe('physics: flat-plane oracle (§14.7, doc 15 §5 item 9)', () => {
  // the doc 15 §2 keys are SHARED params from M5 on; the cast keeps this file compiling on either side of that change
  const P = paramsFor(getContent().karts.get('pebble')) as OracleParams;
  /** The technique state of both models, for the first-divergence report. */
  const techSim = (k: KartState): string => {
    const d = k.drive;
    return `drift ${d.drift} drag ${d.dragTicks} streak ${d.tapStreak} gap ${d.tapGap} counter ${d.counterTicks} brake ${d.brakeTicks} gear ${d.gear} post ${d.postTicks} boost ${d.boostTicks} stun ${d.stunTicks} inst ${d.instTicks}/${d.instWindow}`;
  };
  const techOracle = (o: OracleKart): string =>
    `drift ${o.drift} drag ${o.dragT} streak ${o.streak} gap ${o.tapGap} counter ${o.counterT} brake ${o.brakeT} gear ${o.gear} post ${o.postT} boost ${o.boostT} stun ${o.stunT} inst ${o.instT}/${o.instWin}`;
  it.each(ORACLE_LOGS.map((l) => [l.name, l] as const))('%s: 3D step matches the independent continuous-model oracle to ≤ 1e-6 m every tick', (_n, log) => {
    const rig = racingRig(flat);
    const k = place(rig, 0, { s: 300, speed: log.v0 });
    k.drive.boosters = log.boosters; k.drive.prevThrottle = 1;
    const o = oracleKart(k.body.px, k.body.pz, k.body.fx, k.body.fz, log.v0);
    o.boosters = log.boosters;
    const f: InputFrame = makeInput();
    let maxErr = 0, gaugeErr = 0, boosterMismatch = 0, first = '';
    for (let t = 0; t < 600; t++) {
      // the oracle models dynamics only: keep the race rules (wrong way / off graph → respawn) out of the comparison
      k.race.wrongWayTicks = 0; k.race.offGraphTicks = 0;
      rig.tick((_w, inp) => { log.frame(t, k, inp[0]!); copyInput(f, inp[0]!); });
      oracleStep(o, {
        steer: -f.steer / 127, thr: f.throttle > 0 ? 1 : 0, brk: f.brake > 0 ? 1 : 0, drift: (f.held & Held.DRIFT) !== 0, boost: (f.edges & Edge.USE_ITEM) !== 0,
        tapL: (f.edges & Edge.TAP_L) !== 0, tapR: (f.edges & Edge.TAP_R) !== 0,
      }, P);
      const err = Math.hypot(o.px - k.body.px, o.pz - k.body.pz);
      maxErr = Math.max(maxErr, err);
      gaugeErr = Math.max(gaugeErr, Math.abs(o.gauge - k.drive.gauge));
      if (o.boosters !== k.drive.boosters) boosterMismatch++;
      if (!first && (err > 1e-6 || o.boosters !== k.drive.boosters)) first = `tick ${t}: sim [${techSim(k)}] oracle [${techOracle(o)}]`;
    }
    expect(maxErr, first).toBeLessThanOrEqual(1e-6);
    expect(gaugeErr, first).toBeLessThanOrEqual(1e-9);
    expect(boosterMismatch, first).toBe(0);
  });
});
