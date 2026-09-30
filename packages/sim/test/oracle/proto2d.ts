// Flat-plane oracle (10-sim-spec §14.7): the validated gap-2 step() from proto2d.src.txt, wall-free, patched
// test-side exactly as the spec allows:
//   1. integer-tick timers with the sim's convention (decrement at the start of the tick, effective durations);
//   2. the quantization grids of §15 at the end of every tick, plus the sim's frame hygiene (the forward vector is
//      renormalized at the start of the tick and again by each of the two half-step ground contacts);
//   3. this spec's windows and bonus charges (instant window 30 ticks, exit after ≥ 8 bookkeeping ticks, +0.03
//      gauge per instant boost).
// Mapping (§1.1): proto (x, y) ↔ world (x, −z); heading (hx, hy) ↔ (fx, −fz). Values are kept in world
// coordinates where rounding matters (q(−y) ≠ −q(y) at exact halves).
import type { KartParams } from '@cr/sim';

const DT = 1 / 60;
const SIN6 = 0.10452846326765347, SIN8 = 0.13917310096006544, SIN55 = 0.8191520442889918;

function decayF(k: number): number { const x = k * DT; return 1 / (1 + x * (1 + x * (0.5 + x / 6))); }
function rotH(hx: number, hy: number, a: number): [number, number] {
  const a2 = a * a;
  const s = a * (1 - (a2 / 6) * (1 - a2 / 20));
  const c = 1 - (a2 / 2) * (1 - a2 / 12);
  const nx = c * hx - s * hy, ny = s * hx + c * hy;
  const n = Math.sqrt(nx * nx + ny * ny);
  return [nx / n, ny / n];
}
const q = (x: number, k: number): number => Math.round(x * k) / k;

export interface OracleKart {
  px: number; pz: number; hx: number; hy: number; vx: number; vy: number; r: number;
  drift: 0 | 1; dDir: number; dT: number; dPeak: number; reDrift: number;
  gauge: number; gT: number; boosters: number; boostT: number; startT: number; instWin: number; instT: number;
  prevThr: number; prevDrift: boolean;
}

export function oracleKart(px: number, pz: number, fx: number, fz: number, v: number): OracleKart {
  return { px, pz, hx: fx, hy: -fz, vx: fx * v, vy: -fz * v, r: 0, drift: 0, dDir: 1, dT: 0, dPeak: 0, reDrift: 0, gauge: 0, gT: 0, boosters: 0, boostT: 0, startT: 0, instWin: 0, instT: 0, prevThr: 1, prevDrift: false };
}

export interface OracleInput { steer: number /* + = left */; thr: number; brk: number; drift: boolean; boost: boolean }

export function oracleStep(k: OracleKart, inp: OracleInput, P: KartParams): void {
  if (k.boostT > 0) k.boostT--;
  if (k.startT > 0) k.startT--;
  if (k.instT > 0) k.instT--;
  if (k.instWin > 0) k.instWin--;
  if (k.reDrift > 0) k.reDrift--;
  const thrIn = inp.thr > 0 ? 1 : 0;
  const thr = thrIn;
  const thrEdge = thrIn === 1 && k.prevThr === 0;
  const driftEdge = inp.drift && !k.prevDrift;
  const steer = inp.steer > 1 ? 1 : inp.steer < -1 ? -1 : inp.steer;
  // frame hygiene (sim K0): renormalize the quantized heading
  { const l = Math.sqrt(k.hx * k.hx + k.hy * k.hy); if (l > 1e-9) { k.hx = k.hx / l; k.hy = k.hy / l; } }
  let hx = k.hx, hy = k.hy;
  let u = k.vx * hx + k.vy * hy;
  if (k.drift === 0) {
    if (inp.drift && (steer >= P.driftMinSteer || steer <= -P.driftMinSteer) && u >= P.driftMinSpeed && k.reDrift <= 0) {
      k.drift = 1; k.dDir = steer > 0 ? 1 : -1; k.dT = 0; k.dPeak = 0;
      k.r += k.dDir * P.kickR;
      [hx, hy] = rotH(hx, hy, k.dDir * P.kickAngle);
      k.vx *= P.kickLoss; k.vy *= P.kickLoss;
    }
  } else if (driftEdge && k.dT >= P.rekickMinTicks) {
    k.r += k.dDir * P.rekickR;
    [hx, hy] = rotH(hx, hy, k.dDir * P.rekickAngle);
    k.vx *= P.rekickLoss; k.vy *= P.rekickLoss;
  }
  u = k.vx * hx + k.vy * hy;
  const sIn = steer * k.dDir;
  let rT: number;
  if (k.drift === 0) {
    const vv = u > 0 ? u : 0; const qq = vv / P.gripV1;
    rT = steer * P.yGrip * vv / (vv + P.gripV0) / (1 + qq * qq);
    if (u < -0.5) rT = -steer * P.yGrip * 0.5 * (-u) / (-u + P.gripV0);
  } else rT = k.dDir * (P.y0 / (1 + (k.dT * DT) / P.y0T) + P.y1 * sIn + (inp.drift ? P.y2 : 0));
  k.r += (rT - k.r) * (1 - decayF(k.drift === 0 ? P.kYawGrip : P.kYawDrift));
  [hx, hy] = rotH(hx, hy, k.r * DT);
  u = k.vx * hx + k.vy * hy;
  let w = -k.vx * hy + k.vy * hx;
  let v = Math.sqrt(u * u + w * w);
  let kL: number, eta: number;
  if (k.drift === 0) { kL = P.kLatGrip; eta = P.etaGrip; }
  else {
    eta = P.etaDrift;
    if (sIn >= 0.3) kL = P.kLatNeutral + (P.kLatIn - P.kLatNeutral) * ((sIn - 0.3) / 0.7); else if (sIn > -0.3) kL = P.kLatNeutral;
    else kL = P.kLatNeutral + (P.kLatCounter - P.kLatNeutral) * ((-sIn - 0.3) / 0.7);
    if (inp.drift) kL *= P.kLatShift;
  }
  const w2 = w * decayF(kL);
  const vRaw = Math.sqrt(u * u + w2 * w2);
  if (vRaw > 1e-6) { const f = (vRaw + eta * (v - vRaw)) / vRaw; u *= f; w = w2 * f; } else w = w2;
  v = Math.sqrt(u * u + w * w);
  if (k.drift === 1) { const sm = SIN55 * v; if (w > sm || w < -sm) { w = w > 0 ? sm : -sm; u = Math.sqrt(v * v - w * w); } }
  let sb = 0;
  if (k.drift === 1) k.gT++; else if (k.gT > 0) k.gT--;
  if (k.drift === 1) {
    sb = v > 0.1 ? -k.dDir * w / v : 0;
    k.dT++; if (sb > k.dPeak) k.dPeak = sb;
    if (v >= 10 && sb > 0) {
      let sl = sb / P.gSlipRef; if (sl > 1) sl = 1; sl = Math.sqrt(sl);
      const dg = P.g0 * sl * (v / P.vGrip) / (1 + (k.gT * DT) / P.gTau) * DT * 1;
      addGauge(k, dg);
    }
    if ((k.dT >= P.exitMinTicks && sb < SIN6) || u < 5) {
      if (k.dT >= P.instMinDriftTicks && k.dPeak >= SIN8) k.instWin = P.instWindowTicks;
      k.drift = 0; k.reDrift = P.reDriftTicks; k.dDir = 1; k.dT = 0; k.dPeak = 0;
    }
  }
  if (k.instWin > 0 && thrEdge) { k.instT = P.instTicks; k.instWin = 0; addGauge(k, P.instGaugeBonus); }
  if (inp.boost && k.boosters > 0 && k.boostT < P.chainTicks) { k.boosters--; k.boostT += P.tBoostTicks; }
  const boosting = k.boostT > 0 || k.startT > 0;
  const vT = boosting ? P.vBoost : P.vGrip;
  let a: number;
  const instOn = k.instT > 0 && !boosting && u < P.vInst;
  if (thr === 1) {
    if (u < vT) {
      if (boosting) {
        a = P.kBoost * (vT - u); const cap = k.boostT > 0 ? P.aBoostMax : P.aStartMax; if (a > cap) a = cap;
        const base = P.a0 * (1 - u / P.vGrip); if (a < base) a = base;
      } else { const qq = u / vT; a = P.a0 * (1 - qq * qq); if (k.drift === 1 && a > P.aDrift) a = P.aDrift; }
      if (instOn && a < P.aInst) a = P.aInst;
    } else {
      a = -P.kOver * (u - vT);
      if (instOn) a = P.aInst;
    }
  } else {
    a = -P.aCoast; if (u > vT) a -= P.kOver * (u - vT);
  }
  if (inp.brk > 0 && u > 0) a = -(k.drift === 1 ? P.aBrakeDrift : P.aBrake);
  let uN = u + a * DT;
  if ((thr === 0 || inp.brk > 0) && u >= 0 && uN < 0) uN = 0;
  u = uN;
  if (k.drift === 1 && sb > 0) { let f = 1 - P.cBeta * sb * sb * DT; if (f < 0) f = 0; u *= f; w *= f; }
  k.vx = u * hx - w * hy; k.vy = u * hy + w * hx;
  // world coordinates: z = −y; two half-displacements like the sim
  const vz = -k.vy;
  k.px += k.vx * (DT / 2); k.pz += vz * (DT / 2);
  k.px += k.vx * (DT / 2); k.pz += vz * (DT / 2);
  // each half-step ground contact re-orthonormalizes the forward vector (sim orthoForward)
  let fx = hx, fz = -hy;
  for (let i = 0; i < 2; i++) { const l = Math.sqrt(fx * fx + fz * fz); fx /= l; fz /= l; }
  k.prevThr = thrIn; k.prevDrift = inp.drift;
  // quantize (§15) in world coordinates
  k.px = q(k.px, 4096); k.pz = q(k.pz, 4096);
  k.vx = q(k.vx, 4096); k.vy = -q(vz, 4096);
  k.hx = q(fx, 32768); k.hy = -q(fz, 32768);
  k.r = q(k.r, 4096);
  k.gauge = q(k.gauge, 65536);
  k.dPeak = q(k.dPeak, 32768);
}

function addGauge(k: OracleKart, dg: number): void {
  k.gauge += dg;
  if (k.gauge >= 1) { if (k.boosters < 2) { k.boosters++; k.gauge -= 1; } else k.gauge = 1; }
}
