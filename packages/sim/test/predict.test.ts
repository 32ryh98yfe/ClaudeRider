// AI self-prediction (14-ai §1, ai/predict.ts) against the real step(): the driver decides at t for t + 8, so the
// predictor replays its 8 pending frames through a flat-ground copy of kartDynamics. On the 1 km flat plane, for
// scripted frames exercising every M5 technique (15-driving-techniques §4: drift entry, drag, tap streaks, brake turn,
// spin-out, cut, post-boost bleed, STOP/R, instant boost, a booster fired inside the pipe), the predicted position
// 8 ticks ahead stays within 0.05 m of the simulated one, and the predicted technique state matches.
import { describe, expect, it } from 'vitest';
import { Boost, Edge, Gear, Held, paramsFor, type KartState } from '@cr/sim';
import { SelfPredictor } from '../src/ai/predict.ts';
import { getContent, type Rig } from './rig.ts';
import { flatPlane } from './fixtures/kits.ts';
import { place, racingRig, steerLeft } from './util.ts';

const LA = 8;
const flat = flatPlane().track;

interface Frame { steer?: number /* + = left */; thr?: 0 | 1; brk?: 0 | 1; drift?: boolean; edges?: number; boost?: boolean }

interface Scenario {
  name: string; kart?: string; speed: number; setup?: (k: KartState) => void; frames: Frame[];
}

const rep = (n: number, f: Frame): Frame[] => Array.from({ length: n }, () => ({ ...f }));
/** Taps the drift-direction key every `gap` ticks from `from` (relative to the start of the returned block). */
const taps = (n: number, gap: number, f: Frame, edge: number, from = 0): Frame[] =>
  Array.from({ length: n }, (_, t) => ({ ...f, edges: t >= from && (t - from) % gap === 0 ? edge : 0 }));
const boosted = (ticks: number) => (k: KartState): void => { k.drive.boostTicks = ticks; k.drive.boostKind = Boost.NORMAL; };

const SCENARIOS: Scenario[] = [
  { name: 'drift entry, β build-up and a neutral drag (DRIFT held)', speed: 45, setup: boosted(300), frames: [...rep(20, { steer: 1, drift: true }), ...rep(70, { drift: true })] },
  { name: 'drag with taps every 8 ticks (streak 1, 2, 3, 3)', speed: 45, setup: boosted(300), frames: [...rep(18, { steer: 1, drift: true }), ...rep(4, { drift: true }), ...taps(90, 8, { drift: true }, Edge.TAP_L)] },
  { name: 'right drag with taps every 6 and 12 ticks, mashing and wrong-way taps', speed: 45, setup: boosted(300), frames: [
    ...rep(18, { steer: -1, drift: true }), ...rep(4, { drift: true }), ...taps(30, 6, { drift: true }, Edge.TAP_R), ...taps(36, 12, { drift: true }, Edge.TAP_R),
    ...taps(12, 3, { drift: true }, Edge.TAP_R), ...taps(24, 8, { drift: true }, Edge.TAP_L)] },
  { name: 'brake turn (5 ticks), then a spin-out (12 ticks) with a boost cancelled', speed: 40, setup: boosted(200), frames: [
    ...rep(20, { steer: 1, drift: true }), ...rep(5, { steer: 0.6, drift: true, brk: 1 }), ...rep(10, { steer: 0.6, drift: true }), ...rep(12, { steer: 0.6, drift: true, brk: 1 }), ...rep(40, {})] },
  { name: 'cut: full counter-steer with DRIFT released; half counter does not cut', speed: 38, frames: [
    ...rep(24, { steer: 1, drift: true }), ...rep(10, { steer: -0.6 }), ...rep(6, { steer: 0.5, drift: true }), ...rep(20, { steer: -1 }), ...rep(20, {})] },
  { name: 'reverse gauge: boosting with DRIFT held never cuts; releasing DRIFT cuts', speed: 45, setup: boosted(300), frames: [
    ...rep(20, { steer: 1, drift: true }), ...rep(20, { steer: -1, drift: true }), ...rep(20, { steer: -1 }), ...rep(20, {})] },
  { name: 'post-boost bleed with ↑ held, then ↑ released, then a drift cancelling it', speed: 45, setup: boosted(10), frames: [
    ...rep(40, {}), ...rep(20, { thr: 0 }), ...rep(10, { boost: true }), ...rep(170, {}), ...rep(8, { steer: 1, drift: true }), ...rep(30, { steer: 0.5, drift: true })] },
  { name: 'instant boost: drift exit with a throttle release and press', speed: 36, frames: [
    ...rep(24, { steer: 1, drift: true }), ...rep(30, { steer: -0.65, thr: 0 }), ...rep(2, { thr: 0 }), ...rep(40, {})] },
  { name: 'brake to a stop, STOP, reverse after 6 ticks, ↑ back to D', speed: 12, frames: [...rep(80, { brk: 1, thr: 0 }), ...rep(40, { brk: 1, thr: 0, steer: 0.5 }), ...rep(40, {})] },
  { name: 'coasting in N to rest, then a start in D', speed: 14, frames: [...rep(400, { thr: 0 }), ...rep(40, { steer: 0.3 })] },
  { name: 'neon_blade (speed body): drag with taps', kart: 'neon_blade', speed: 46, setup: boosted(300), frames: [...rep(20, { steer: 1, drift: true }), ...rep(4, { drift: true }), ...taps(80, 9, { drift: true }, Edge.TAP_L)] },
  { name: 'reference recovery: full counter-steer interrupted by neutral, then resumed', speed: 34, frames: [
    ...rep(24, { steer: 1, drift: true }), ...rep(2, { steer: -1 }), ...rep(3, {}), ...rep(25, { steer: -1 }), ...rep(40, {})] },
  { name: 'reference repeated kicks: two-tick Shift mashing and intentional nine-tick presses', speed: 34, frames: [
    ...rep(12, { steer: 1, drift: true }),
    ...Array.from({ length: 48 }, (_, t) => ({ steer: 0.8, drift: t % 2 === 0 })),
    ...Array.from({ length: 36 }, (_, t) => ({ steer: 0.8, drift: t % 9 === 0 })),
    ...rep(12, { steer: -1 }), ...rep(30, {})] },
  { name: 'compressed Shift presses and reversed direction edge before filtered steering changes sign', speed: 34, frames: [
    ...rep(12, { steer: 1, drift: true }),
    ...taps(12, 3, { steer: 0.8, drift: true }, Edge.DRIFT),
    { steer: 0.8, edges: Edge.DRIFT | Edge.TAP_R },
    ...taps(15, 3, { steer: -1 }, Edge.DRIFT),
    ...rep(40, { steer: -0.5 })] },
];

function apply(rig: Rig, f: Frame): void {
  rig.tick((_w, inp) => {
    const o = inp[0]!;
    o.steer = steerLeft(f.steer ?? 0); o.throttle = (f.thr ?? 1) ? 15 : 0; o.brake = f.brk ? 15 : 0;
    o.held = f.drift ? Held.DRIFT : 0; o.edges = (f.edges ?? 0) | (f.boost ? Edge.USE_ITEM : 0);
  });
}
const push = (pr: SelfPredictor, f: Frame | undefined): void => {
  const g = f ?? {};
  pr.push(g.steer ?? 0, g.drift === true, (g.thr ?? 1) === 1, g.brk === 1, g.edges ?? 0, g.boost === true);
};

describe('AI self-prediction vs step() (8-tick lookahead, M5 techniques)', () => {
  for (const sc of SCENARIOS) {
    it(sc.name, () => {
      const kart = sc.kart ?? 'pebble';
      const rig = racingRig(flat, { slots: [{ kartBodyId: kart as 'pebble' }] });
      const k = place(rig, 0, { s: 300, speed: sc.speed });
      k.drive.prevThrottle = 1; k.drive.boosters = 2;
      sc.setup?.(k);
      const P = paramsFor(getContent().karts.get(kart as 'pebble'));
      const pr = new SelfPredictor(LA);
      const F = sc.frames;
      for (let t = 0; t < LA; t++) push(pr, F[t]);
      const pred: { x: number; y: number; drift: number; drag: number; streak: number; gear: number; boost: number; post: number }[] = [];
      let maxErr = 0, worst = -1, n = 0;
      for (let t = 0; t + LA < F.length; t++) {
        pr.run(k, P, 1);
        pred.push({ x: pr.px, y: pr.py, drift: pr.drift, drag: pr.dragT, streak: pr.streak, gear: pr.gear, boost: pr.boost, post: pr.post });
        apply(rig, F[t]!);
        push(pr, F[t + LA]);
        const p = pred[t + 1 - LA];
        if (p) {
          const err = Math.hypot(p.x - k.body.px, p.y + k.body.pz);
          if (err > maxErr) { maxErr = err; worst = t + 1; }
          n++;
          const d = k.drive;
          expect(p.drift, `drift @${t + 1}`).toBe(d.drift);
          expect(p.drag > 0, `dragging @${t + 1}`).toBe(d.dragTicks > 0);
          expect(p.streak, `tap streak @${t + 1}`).toBe(d.tapStreak);
          expect(p.gear, `gear @${t + 1}`).toBe(d.gear);
          expect(p.boost, `boost ticks @${t + 1}`).toBe(d.boostTicks + d.startTicks);
          expect(p.post, `bleed ticks @${t + 1}`).toBe(d.postTicks);
        }
      }
      console.log(`${sc.name}: max err ${maxErr.toExponential(2)} m over ${n} predictions`);
      expect(n).toBeGreaterThan(30);
      expect(maxErr, `max 8-tick position error (worst at tick ${worst})`).toBeLessThanOrEqual(0.05);
    });
  }

  it('the scripts reach every technique state (drag, streak 3, brake turn, spin-out, cut, bleed, R)', () => {
    // guards the scenarios above against silently missing the state they are meant to exercise
    const seen = { drag: false, streak3: false, spin: false, cut: false, bleed: false, rev: false, brakeTurn: false };
    for (const sc of SCENARIOS) {
      const rig = racingRig(flat, { slots: [{ kartBodyId: (sc.kart ?? 'pebble') as 'pebble' }] });
      const k = place(rig, 0, { s: 300, speed: sc.speed });
      k.drive.prevThrottle = 1; k.drive.boosters = 2;
      sc.setup?.(k);
      const n0 = rig.events.length;
      for (const f of sc.frames) {
        apply(rig, f);
        if (k.drive.dragTicks > 0) seen.drag = true;
        if (k.drive.tapStreak === 3) seen.streak3 = true;
        if (k.drive.postTicks > 0) seen.bleed = true;
        if (k.drive.gear === Gear.R) seen.rev = true;
      }
      for (const e of rig.events.slice(n0)) {
        if (e.t === 'spinOut') seen.spin = true;
        if (e.t === 'cut') seen.cut = true;
        if (e.t === 'brakeTurn') seen.brakeTurn = true;
      }
    }
    expect(seen).toEqual({ drag: true, streak3: true, spin: true, cut: true, bleed: true, rev: true, brakeTurn: true });
  });
});
