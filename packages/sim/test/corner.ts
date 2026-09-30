// Corner harness (gap-2 §5, 10-sim-spec §14.6) on the 3D sim: scripted drift plans (proto2d driftDriver), the
// "clumsy long drift" plan, grip driving on the geometric racing line and the sim's own AI, each driven through a
// corner kit from 60 m before... to 60 m past the corner. Harness code may use trig.
import { AI_TIERS, createAiDriver, gripGain, paramsFor, type FrameSample, type InputFrame, type KartParams, type KartState } from '@cr/sim';
import { getContent } from './rig.ts';
import { racingRig, place, speedOf, steerLeft } from './util.ts';
import type { CornerKit } from './fixtures/kits.ts';
import { Held } from '@cr/sim';

export interface Plan { dTrig: number; tSh: number; sD: number; phiCs: number; cCs: number; rek: number; vBr: number; inst: boolean; mid?: boolean }
export interface CornerResult { ok: boolean; fin: boolean; time: number; vMin: number; vX: number; vE: number; gauge: number; hits: number; inst: number; drifts: number }

const DT = 1 / 60;
const FS = (): FrameSample => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 });

/** Plan heading (2D, proto2d convention: x, y = −z; CCW +). */
const heading = (k: KartState): number => Math.atan2(-k.body.fz, k.body.fx);

function gripSteer(r: number, v: number, P: KartParams): number { const g = gripGain(v, P); const s = g > 1e-3 ? r / g : 0; return s > 1 ? 1 : s < -1 ? -1 : s; }

/** Pure-pursuit curvature toward the point `L` metres ahead on a lateral line u(s) of the kit. */
function pursuit(kit: CornerKit, k: KartState, s: number, L: number, u: number): number {
  const f = FS();
  kit.track.frameAt(0, s + L, f);
  const gx = f.px + f.rx * u, gz = f.pz + f.rz * u;
  const dx = gx - k.body.px, dy = -(gz - k.body.pz);
  const hx = k.body.fx, hy = -k.body.fz;
  const alpha = Math.atan2(-dx * hy + dy * hx, dx * hx + dy * hy);
  return (2 * Math.sin(alpha)) / Math.max(Math.hypot(dx, dy), 1);
}

type Driver = (k: KartState, inp: InputFrame, tick: number) => void;

/** proto2d driftDriver: approach on a line, trigger, hold, counter-steer at `phiCs` of remaining turn, pursue out. */
export function planDriver(kit: CornerKit, vE: number, plan: Plan, P: KartParams): Driver {
  let ph = 0, t0 = 0, psiAcc = 0, psiPrev = NaN, rekDone = false;
  const hw = kit.width / 2, turn = (kit.deg * Math.PI) / 180;
  return (k, inp, tick) => {
    const t = tick * DT, s = k.race.loc.s;
    const psi = heading(k);
    if (Number.isNaN(psiPrev)) psiPrev = psi;
    let dp = psi - psiPrev; if (dp > Math.PI) dp -= 2 * Math.PI; if (dp < -Math.PI) dp += 2 * Math.PI; psiAcc += dp; psiPrev = psi;
    const v = speedOf(k);
    let steer = 0, thr = 1, brk = 0, drift = false;
    if (ph === 0) {
      steer = gripSteer(pursuit(kit, k, s, 5 + 0.3 * v, plan.mid ? 0 : hw - 1.5) * v, v, P);
      thr = v < vE ? 1 : 0;
      const sTr = kit.arcStart - plan.dTrig;
      if (plan.vBr < vE - 0.01) {
        const need = Math.sqrt(plan.vBr * plan.vBr + 2 * 0.9 * P.aBrake * Math.max(0, sTr - s));
        if (v > need) { brk = 1; thr = 0; } else if (v > plan.vBr + 0.2 && sTr - s < 30) thr = 0;
      }
      if (s >= sTr) { ph = 1; t0 = t; }
    }
    if (ph >= 1 && ph <= 3) {
      const rem = turn - psiAcc;
      if (ph === 1) { drift = true; steer = plan.sD; if (t - t0 >= plan.tSh) ph = 2; if (t - t0 > 0.3 && k.drive.drift === 0) ph = 4; }
      else if (ph === 2) {
        steer = plan.sD;
        if (plan.rek > 0 && !rekDone && t - t0 >= plan.rek) { drift = true; rekDone = true; }
        if (rem <= (plan.phiCs * Math.PI) / 180) ph = 3;
        if (k.drive.drift === 0) ph = 4;
      }
      if (ph === 3) { steer = -plan.cCs; thr = plan.inst ? 0 : 1; if (k.drive.drift === 0) ph = 4; }
    }
    if (ph === 4) { steer = gripSteer(pursuit(kit, k, s, 6 + 0.35 * v, 0) * v, v, P); thr = 1; }
    inp.steer = steerLeft(steer); inp.throttle = thr ? 15 : 0; inp.brake = brk ? 15 : 0; inp.held = drift ? Held.DRIFT : 0;
  };
}

/** Runs one corner attempt: start 60 m in on the outside line at vE; gates at arcStart − 40, arcEnd + 15 (exit speed) and arcEnd + 60. */
export function runCorner(kit: CornerKit, vE: number, mk: (P: KartParams) => Driver | 'ai', opt: { kart?: string } = {}): CornerResult {
  const content = getContent();
  const rig = racingRig(kit.track, { slots: [{ kartBodyId: (opt.kart ?? 'pebble') as 'pebble' }] });
  const k = place(rig, 0, { s: 60, u: kit.width / 2 - 1.5, speed: vE });
  const P = paramsFor(content.karts.get(opt.kart ?? 'pebble'));
  const m = mk(P);
  const ai = m === 'ai' ? createAiDriver(kit.track, content, 0, AI_TIERS.legend, { instBoostRate: 1, lineNoise: 0 }, 5) : null;
  const drv = m === 'ai' ? null : m;
  const gA = kit.arcStart - 40, gB = kit.arcEnd + 60, gX = kit.arcEnd + 15;
  let tA = -1, tB = -1, vX = -1, vMin = 1e9, g0 = 0, inst0 = 0;
  const total = (): number => k.drive.gauge + k.drive.boosters;
  for (let tick = 0; tick < 60 * 30; tick++) {
    rig.tick((w, inp) => { if (ai) ai.decide(w, inp[0]!); else drv!(k, inp[0]!, tick); });
    const v = speedOf(k), s = k.race.loc.s;
    if (tA < 0 && s >= gA) { tA = tick; g0 = total(); inst0 = k.stats.instantBoosts; }
    if (tA >= 0 && tB < 0) vMin = Math.min(vMin, v);
    if (vX < 0 && s >= gX) vX = v;
    if (tB < 0 && s >= gB) { tB = tick; break; }
    if (k.race.respawnPhase !== 0) break;
  }
  // the drift term only: bonus charges (+0.03 per instant boost) are taken back out (10-sim-spec §8.2)
  const inst = k.stats.instantBoosts - inst0;
  const gauge = total() - g0 - 0.03 * inst;
  return { ok: tB > 0 && k.stats.wallHits === 0, fin: tB > 0, time: tB > 0 ? (tB - tA) * DT : 99, vMin, vX, vE, gauge, hits: k.stats.wallHits, inst, drifts: k.stats.drifts };
}

/** gap-2 bestDrift grid (reduced): the fastest clean plan. */
export function bestDrift(kit: CornerKit, vE: number, grid?: Partial<Record<'dTr' | 'tSh' | 'sD' | 'phi' | 'cCs' | 'brakes' | 'rek', number[]>>): { res: CornerResult; plan: Plan } | null {
  const dTr = grid?.dTr ?? [-6, -2, 2, 6, 10, 15, 20, 28], tSh = grid?.tSh ?? [0.05, 0.1, 0.18, 0.3], sD = grid?.sD ?? [0.45, 0.7, 1.0];
  const phi = grid?.phi ?? [0, 10, 20, 30, 45, 60], cCs = grid?.cCs ?? [0.6, 1.0], brakes = grid?.brakes ?? [1, 0.9, 0.8, 0.7, 0.6];
  const reks = grid?.rek ?? (kit.deg >= 135 ? [0, 0.3, 0.5] : [0]);
  let best: { res: CornerResult; plan: Plan } | null = null;
  for (const bf of brakes) {
    for (const a of dTr) for (const b of tSh) for (const c of sD) for (const d of phi) for (const e of cCs) for (const r of reks) {
      const plan: Plan = { dTrig: a, tSh: b, sD: c, phiCs: d, cCs: e, rek: r, vBr: vE * bf, inst: true };
      const res = runCorner(kit, vE, (P) => planDriver(kit, vE, plan, P));
      if (res.ok && (!best || res.time < best.res.time)) best = { res, plan };
    }
    if (best) break;
  }
  return best;
}

/** gap-2 bestClumsy: drift held ≥ 0.5 s, full steer, late counter-steer, no instant boost, no braking. */
export function bestClumsy(kit: CornerKit, vE: number): { res: CornerResult; plan: Plan } | null {
  let best: { res: CornerResult; plan: Plan } | null = null, bestHit: { res: CornerResult; plan: Plan } | null = null;
  for (const dTrig of [-4, 0, 4, 8, 12, 16, 20, 25, 30]) for (const tSh of [0.5, 0.7, 0.9]) for (const phiCs of [-10, 0]) for (const mid of [true, false]) {
    const plan: Plan = { dTrig, tSh, sD: 1.0, phiCs, cCs: 1.0, rek: 0, vBr: 1e9, inst: false, mid };
    const res = runCorner(kit, vE, (P) => planDriver(kit, vE, plan, P));
    if (res.ok) { if (!best || res.time < best.res.time) best = { res, plan }; }
    else if (res.fin && (!bestHit || res.time < bestHit.res.time)) bestHit = { res, plan };
  }
  return best ?? bestHit;
}
