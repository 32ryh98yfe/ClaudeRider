// physics: acceptance numbers from docs/design/10-sim-spec.md §14 (gap-2 values [V]) and 02-contracts §E.
// Fixtures are built in code (test/fixtures): a 1 km flat plane, a 16 m corridor and 12 m corner kits.
// M5 (docs/design/15-driving-techniques.md): the display reads 205 km/h at vGrip (KMH); rows whose physics is
// unchanged keep their validated gap-2 numbers on the old scale (KMH_GAP2). Numbers that the new vBoost or the new
// laws (bleed, cut, drag, gears) move carry an "M5" note with the re-measured value; the techniques themselves
// are pinned in techniques.test.ts.
import { describe, expect, it } from 'vitest';
import { Edge, Held, V_REF, makeInput, copyInput, paramsFor, type InputFrame, type KartState } from '@cr/sim';
import { bakedTrack, makeRig, getContent, type Rig } from './rig.ts';
import { flatPlane, corridor, cornerKit } from './fixtures/kits.ts';
import { racingRig, place, fwdKmh, speedOf, steerLeft, KMH, KMH_GAP2 } from './util.ts';
import { bestClumsy, bestDrift, planDriver, runCorner, type Plan } from './corner.ts';
import { ORACLE_LOGS } from './oraclelogs.ts';
import { oracleKart, oracleStep, type OracleKart, type OracleParams } from './oracle/proto2d.ts';

const oval = bakedTrack('_test/drag_oval');
const flat = flatPlane().track;
/** vGrip on the gap-2 display scale (183.6 km/h): the acceleration rows are validated on it. */
const V_GRIP_GAP2 = V_REF * KMH_GAP2;

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
  const k = place(rig, 0, { s: 300, speed: v0 });
  k.drive.prevThrottle = 1;
  setup(k);
  const out: number[] = [];
  for (let t = 0; t <= n; t++) {
    if (t % 15 === 0) out.push(fwdKmh(k, scale));
    rig.tick((_w, inp) => { inp[0]!.throttle = 15; if (use.includes(t)) inp[0]!.edges |= Edge.USE_ITEM; });
  }
  return out;
}

describe('physics: acceleration (§14.1)', () => {
  it('0→100 km/h in 1.17 ± 0.05 s and 0→97% of top speed in 3.95 ± 0.10 s', () => {
    const rig = makeRig(oval, { laps: 1 });
    const press = rig.w.goTick + 30; // after the start-boost window: plain standing start
    let t100 = -1, t97 = -1;
    while (rig.w.tick < press + 600) {
      rig.tick((w, inp) => { inp[0]!.throttle = w.tick >= press ? 15 : 0; });
      const v = fwdKmh(rig.w.karts[0]!, KMH_GAP2), t = (rig.w.tick - press) / 60;
      if (t100 < 0 && v >= 100) t100 = t;
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
      for (const [name, v] of [['25', 25], ['30', 30], ['99', 0.99 * 34]] as const) if (hit[name] === undefined && u >= v) hit[name] = t / 60;
    }
    expect(hit['25']!).toBeCloseTo(1.78, 1); expect(Math.abs(hit['25']! - 1.78)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(hit['30']! - 2.62)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(hit['99']! - 4.97)).toBeLessThanOrEqual(0.15);
  });
});

// M5: the booster rows below moved with vBoost 45.11 (272 km/h on the new display) and, after expiry, with
// the post-boost bleed. The expected values are a pre-merge measurement of the unchanged boost law with the M5 vBoost
// (during the boost) and the oracle's bleed prediction (after expiry); the reconcile step confirms them on the merged sim.
describe('physics: booster (§14.2)', () => {
  it('reaches ≥ 270 km/h after 1.0 s and plateaus at 271.5–272.5 km/h', () => {
    const rig = makeRig(oval, { laps: 1 });
    const press = rig.w.goTick + 30;
    rig.run(press + 480 - rig.w.tick, (w, inp) => { inp[0]!.throttle = w.tick >= press ? 15 : 0; });
    rig.w.karts[0]!.drive.boosters = 1;
    const use = rig.w.tick;
    const at: Record<number, number> = {};
    rig.run(160, (w, inp) => { inp[0]!.throttle = 15; if (w.tick === use) inp[0]!.edges |= Edge.USE_ITEM; at[w.tick - use] = fwdKmh(w.karts[0]!); });
    expect(rig.w.karts[0]!.stats.boostsUsed).toBe(1);
    expect(at[61]!).toBeGreaterThanOrEqual(270); // M5 measured: 270.73 (gap-2: ≥ 237)
    expect(at[150]!).toBeGreaterThanOrEqual(271.5); // M5 measured: 271.98 (gap-2: 239–240.5)
    expect(at[150]!).toBeLessThanOrEqual(272.5);
  });

  it('from 205 km/h: 242, 261, 268, 271 (1.0 s), plateau to 3.0 s, then the 0.5 s post-boost bleed', () => {
    const s = series(34, 300, (k) => { k.drive.boosters = 1; }, [0]);
    // M5 measured: 242.0 261.3 268.2 270.6 (gap-2: 216, 231, 237, 239)
    [242.0, 261.3, 268.2, 270.6].forEach((v, i) => expect(Math.abs(s[i + 1]! - v)).toBeLessThanOrEqual(3));
    // M5 measured: plateau 271.5 … 272.0 (1.25 … 3.0 s)
    for (let i = 5; i <= 12; i++) { expect(s[i]!).toBeGreaterThanOrEqual(271); expect(s[i]!).toBeLessThanOrEqual(272.5); }
    // M5: the bleed (doc 15 §4.8) replaces the τ ≈ 1.1 s overspeed decay (gap-2: 229, 220, 212, 207, 202);
    // oracle prediction 219.9, 208.3, 207.7, 207.1, 206.7. The bleed law itself is pinned in techniques.test.ts.
    [219.9, 208.3, 207.7, 207.1, 206.7].forEach((v, i) => expect(Math.abs(s[13 + i]! - v)).toBeLessThanOrEqual(3));
  });

  it('from 169 km/h: 207, 243, 262 at 0.75 s (± 3 km/h)', () => {
    const s = series(28, 60, (k) => { k.drive.boosters = 1; }, [0]);
    // M5 measured: 206.5 243.3 261.8 (gap-2 from 151 km/h: 185, 217, 232)
    [206.5, 243.3, 261.8].forEach((v, i) => expect(Math.abs(s[i + 1]! - v)).toBeLessThanOrEqual(3));
  });

  it('two chained boosters (second at tick 172) hold the plateau to ≈ 6 s without a dip below 270', () => {
    const s = series(34, 360, (k) => { k.drive.boosters = 2; }, [0, 172]);
    // M5 measured: minimum 270.64 over 1.0 … 5.75 s (gap-2: ≥ 238)
    for (let i = 4; i <= 23; i++) expect(s[i]!).toBeGreaterThanOrEqual(270); // 1.0 … 5.75 s
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

describe('physics: walls at 30 m/s in a 16 m corridor (§10.4, §14.4)', () => {
  const cor = corridor(16).track;
  function wallHit(deg: number, boosted = false) {
    const rig = racingRig(cor);
    const k = place(rig, 0, { s: 300, u: 0, speed: 30, yawDeg: -deg }); // heading toward the right wall at u = +8
    if (boosted) { k.drive.boostTicks = 120; k.drive.boostKind = 1; }
    let tHit = -1, vAfter = -1, v1 = -1, stun = 0, severity = -1, boostAfter = -1;
    for (let t = 0; t < 400; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = tHit < 0 && !boosted ? (speedOf(k) < 30 ? 15 : 0) : 15; inp[0]!.steer = 0; });
      const ev = rig.events.find((e) => e.t === 'wall');
      if (tHit < 0 && ev && ev.t === 'wall') { tHit = t; vAfter = speedOf(k); severity = ev.severity; boostAfter = k.drive.boostTicks; }
      if (tHit >= 0 && t > tHit && k.drive.stunTicks > 0) stun++;
      if (tHit >= 0 && t === tHit + 60) { v1 = speedOf(k); break; }
    }
    return { lost: 30 * KMH_GAP2 - vAfter * KMH_GAP2, after: vAfter * KMH_GAP2, later: v1 * KMH_GAP2, stun, severity, boostAfter, k };
  }

  it('10° grinds: −3 ± 2 km/h, no stun, drift kept (severity 0)', () => {
    const r = wallHit(10);
    expect(r.severity).toBe(0);
    expect(r.lost).toBeGreaterThanOrEqual(1); expect(r.lost).toBeLessThanOrEqual(5);
    expect(r.stun).toBe(0);
    expect(Math.abs(r.later - 174)).toBeLessThanOrEqual(5);
  });

  it('30° costs −47 ± 5 km/h (−29%), no stun', () => {
    const r = wallHit(30);
    expect(r.severity).toBe(1);
    expect(r.lost).toBeGreaterThanOrEqual(42); expect(r.lost).toBeLessThanOrEqual(52);
    expect(r.stun).toBe(0);
    expect(Math.abs(r.later - 156)).toBeLessThanOrEqual(5);
  });

  it('60° leaves 39 km/h, stuns exactly 15 ticks and cancels the booster', () => {
    const r = wallHit(60);
    expect(r.severity).toBe(2);
    expect(Math.abs(r.after - 39)).toBeLessThanOrEqual(3);
    expect(r.stun).toBe(15);
    expect(Math.abs(r.later - 98)).toBeLessThanOrEqual(5);
    const b = wallHit(60, true);
    expect(b.severity).toBe(2);
    expect(b.boostAfter).toBe(0);
    expect(b.k.drive.boostKind).toBe(0);
    expect(b.stun).toBe(15);
  });

  it('90° leaves 24 km/h with a 15-tick stun; stored boosters are never lost', () => {
    const rig = racingRig(cor);
    const k = place(rig, 0, { s: 300, speed: 30, yawDeg: -90 });
    k.drive.boosters = 2;
    rig.run(40, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(k.drive.boosters).toBe(2);
    const r = wallHit(90);
    expect(Math.abs(r.after - 24)).toBeLessThanOrEqual(3);
    expect(r.stun).toBe(15);
    expect(Math.abs(r.later - 87)).toBeLessThanOrEqual(5);
  });

  it('a 15°+ hit while drifting ends the drift and halves the fractional gauge', () => {
    const rig = racingRig(cor);
    const k = place(rig, 0, { s: 300, u: -3, speed: 30 });
    k.drive.gauge = 0.6;
    let before = -1;
    for (let t = 0; t < 120 && k.stats.wallHits === 0; t++) {
      rig.tick((_w, inp) => { inp[0]!.throttle = 15; inp[0]!.held = Held.DRIFT; inp[0]!.steer = steerLeft(-1); });
      if (k.stats.wallHits === 0) before = k.drive.gauge;
    }
    expect(k.stats.wallHits).toBe(1);
    expect(k.drive.drift).toBe(0);
    // the hit tick's own drift gain (≤ 0.012) lands before the halving
    expect(k.drive.gauge).toBeGreaterThanOrEqual(before * 0.5);
    expect(k.drive.gauge).toBeLessThanOrEqual(before * 0.5 + 0.006);
  });
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
// cut recovery changes the best tight-hairpin input timing, not the zero-wall-hit
// acceptance criterion. Speeds here retain the historical KMH_GAP2 scale.
describe('physics: corners on a 12 m road at 34 m/s (§14.6)', () => {
  const kit = cornerKit(12, 90, 12);
  it('90° R12 optimal drift: drop ≤ 8%, preserved normalized charge and 3.38 ± 0.10 s', () => {
    const o = bestDrift(kit, 34, { dTr: [18, 20, 22], tSh: [0.05, 0.1, 0.18], sD: [0.6, 0.7], phi: [15, 20, 25], cCs: [1], brakes: [1] });
    expect(o).not.toBeNull();
    const r = o!.res;
    expect(r.hits).toBe(0);
    expect(1 - r.vMin / 34).toBeLessThanOrEqual(0.08);
    // Preserve the integrated slip/fatigue criterion while doc 17 raises g0 from
    // 0.7 to 1.1 to match the visible first inventory award. Timing is source-tested.
    const normalizedCharge = r.gauge / paramsFor(getContent().karts.get('pebble')).g0;
    expect(normalizedCharge).toBeGreaterThanOrEqual(0.3 / 0.7);
    expect(normalizedCharge).toBeLessThanOrEqual(0.43 / 0.7);
    expect(Math.abs(r.time - 3.38)).toBeLessThanOrEqual(0.1);
    expect(r.vX * KMH_GAP2).toBeGreaterThanOrEqual(186); // M5: cut exit (cCs 1)
  });
  it('90° R12 clumsy long drift: drop 35–45 km/h', () => {
    const c = bestClumsy(kit, 34);
    expect(c).not.toBeNull();
    const drop = 34 * KMH_GAP2 - c!.res.vMin * KMH_GAP2;
    expect(drop).toBeGreaterThanOrEqual(35); expect(drop).toBeLessThanOrEqual(45); // M5: cut exit (cCs 1)
    expect(Math.abs(c!.res.time - 3.65)).toBeLessThanOrEqual(0.1); // M5: still holds with the cut exit
  });

  // Regression rows: the fastest plans found by the full gap-2 grid search on these kits, with their measured
  // results. gap-2's values are in the comments; 180° R9/R12 optimal plans are faster here than in gap-2 because
  // the grid finds a better double-drift line on the 3D kit (10-sim-spec §14.6 lists them as regression values).
  // M5: plans with cCs 1 exit by the explicit cut (doc 15 §4.5); the OPT rows were re-searched with bestDrift and the
  // CLUMSY rows re-measured (KMH_GAP2 scale). The cut keeps more exit speed, so 180° corners are 0.1–0.3 s faster.
  const OPT: [number, number, Plan, number, number, number][] = [
    // deg, Rc, plan, min km/h, exit km/h, time s — re-searched with the M5 cut          pre-M5: min, exit, t
    [90, 9, { dTrig: 20, tSh: 0.1, sD: 0.7, phiCs: 30, cCs: 1, rek: 0, vBr: 34, inst: true }, 172, 192, 3.27], // 173 189 3.28
    [90, 16, { dTrig: 20, tSh: 0.05, sD: 0.45, phiCs: 20, cCs: 1, rek: 0, vBr: 34, inst: true }, 177, 193, 3.55], // 176 193 3.57
    // Doc 17: re-press 0.05 s earlier and counter with 40° remaining. The old
    // 45°/0.50 s input touches one wall under finite recovery; this remains clean.
    [180, 9, { dTrig: 20, tSh: 0.3, sD: 1, phiCs: 40, cCs: 1, rek: 0.45, vBr: 34, inst: true }, 110, 146, 4.35],
    [180, 12, { dTrig: 20, tSh: 0.05, sD: 1, phiCs: 45, cCs: 1, rek: 0.5, vBr: 34, inst: true }, 125, 158, 4.37], // 115 144 4.63
    [180, 16, { dTrig: 15, tSh: 0.18, sD: 1, phiCs: 45, cCs: 1, rek: 0, vBr: 34, inst: true }, 134, 167, 4.70], // 122 159 4.80
  ];
  const CLUMSY: [number, number, Partial<Plan>, number, number, number][] = [
    [90, 9, { dTrig: 16, tSh: 0.5, phiCs: 0, mid: true }, 143, 160, 3.50], // pre-M5 142 155 3.53
    [90, 16, { dTrig: 16, tSh: 0.9, phiCs: -10, mid: true }, 142, 164, 3.85], // 142 164 3.85
    [180, 9, { dTrig: 20, tSh: 0.7, phiCs: 0, mid: false }, 82, 134, 4.77], // 82 130 4.87
    [180, 12, { dTrig: 16, tSh: 0.5, phiCs: 0, mid: false }, 101, 143, 4.88], // 102 139 4.95
    [180, 16, { dTrig: 12, tSh: 0.5, phiCs: 0, mid: true }, 101, 149, 5.15], // 102 146 5.22
  ];
  it.each(OPT)('regression: %i° R%i optimal plan', (deg, rc, plan, vMin, vX, t) => {
    const k2 = cornerKit(rc, deg, 12);
    const r = runCorner(k2, 34, (P) => planDriver(k2, 34, plan, P));
    expect(r.ok).toBe(true);
    expect(Math.abs(r.vMin * KMH_GAP2 - vMin)).toBeLessThanOrEqual(3);
    expect(Math.abs(r.vX * KMH_GAP2 - vX)).toBeLessThanOrEqual(3);
    expect(Math.abs(r.time - t)).toBeLessThanOrEqual(0.1);
  });
  it.each(CLUMSY)('regression: %i° R%i clumsy plan', (deg, rc, p, vMin, vX, t) => {
    const k2 = cornerKit(rc, deg, 12);
    const plan: Plan = { dTrig: 0, tSh: 0.5, sD: 1, phiCs: 0, cCs: 1, rek: 0, vBr: 1e9, inst: false, ...p };
    const r = runCorner(k2, 34, (P) => planDriver(k2, 34, plan, P));
    expect(r.fin).toBe(true);
    expect(Math.abs(r.vMin * KMH_GAP2 - vMin)).toBeLessThanOrEqual(3);
    expect(Math.abs(r.vX * KMH_GAP2 - vX)).toBeLessThanOrEqual(3);
    expect(Math.abs(r.time - t)).toBeLessThanOrEqual(0.1);
  });
});

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
    const first = drift(ka, a, 90);
    const tired = drift(ka, a, 90);
    const b = racingRig(flat), kb = place(b, 0, { s: 300, speed: 32 });
    drift(kb, b, 90);
    b.run(240, (_w, inp) => { inp[0]!.throttle = 15; });
    expect(kb.drive.fatigueTicks).toBe(0);
    const rested = drift(kb, b, 90);
    expect(tired).toBeLessThan(rested * 0.9);
    expect(Math.abs(rested - first)).toBeLessThan(0.05);
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

  function doubleDrift(repressAt: number): { k: KartState; rig: Rig; yaw: number[]; spd: number[] } {
    const rig = racingRig(flat), k = place(rig, 0, { s: 300, speed: 30 });
    const yaw: number[] = [], spd: number[] = [];
    for (let t = 0; t < 40; t++) {
      rig.tick((_w, inp) => { const o = inp[0]!; o.throttle = 15; o.steer = steerLeft(0.8); o.held = t < 4 || t >= repressAt ? Held.DRIFT : 0; });
      yaw.push(k.body.yawRate); spd.push(speedOf(k));
    }
    return { k, rig, yaw, spd };
  }
  it('double drift: a re-press ≥ 9 ticks into the drift kicks +0.8 rad/s, 3° and ×0.99; earlier re-presses do nothing', () => {
    const early = doubleDrift(8);
    expect(early.rig.events.some((e) => e.t === 'doubleDrift')).toBe(false);
    const ok = doubleDrift(9);
    const ev = ok.rig.events.find((e) => e.t === 'doubleDrift');
    expect(ev).toBeDefined();
    const none = doubleDrift(99);
    // the kick adds 0.8 rad/s before the lag; compare to the same drift without a re-press
    const i = 9;
    const kick = ok.yaw[i]! - none.yaw[i]!;
    expect(kick).toBeGreaterThan(0.5); expect(kick).toBeLessThan(0.85);
    expect(ok.spd[i]! / none.spd[i]!).toBeLessThan(0.995);
  });
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
    expect(r.maxV).toBeGreaterThan(34.5);
    expect(r.maxV).toBeLessThanOrEqual(35.7 + 1e-6);
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
  it.each(ORACLE_LOGS.map((l) => [l.name, l] as const))('%s: 3D step matches the patched gap-2 prototype to ≤ 1e-6 m every tick', (_n, log) => {
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
