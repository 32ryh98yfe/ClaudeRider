// Flat-plane oracle (10-sim-spec §14.7): the validated gap-2 step() from proto2d.src.txt, wall-free, patched
// test-side exactly as the spec allows:
//   1. integer-tick timers with the sim's convention (decrement at the start of the tick, effective durations);
//   2. the quantization grids of §15 at the end of every tick, plus the sim's frame hygiene (the forward vector is
//      renormalized at the start of the tick and again by each of the two half-step ground contacts);
//   3. this spec's windows and bonus charges (instant window 30 ticks, exit after ≥ 8 bookkeeping ticks, +0.03
//      gauge per instant boost);
//   4. the M5 driving techniques of docs/design/15-driving-techniques.md §4, read straight from that text and
//      written independently of the sim (flat ground only: no slope gravity, always grounded): stun, the brake
//      counter, the brake turn and spin-out, taps, cut, drag (K7b) with etaDrag, the drag law with its planar cap,
//      K16 skipped while dragging, the post-boost bleed, the reverse gauge, the gear machine and the zero-lock.
// Mapping (§1.1): proto (x, y) ↔ world (x, −z); heading (hx, hy) ↔ (fx, −fz). Values are kept in world
// coordinates where rounding matters (q(−y) ≠ −q(y) at exact halves).
import type { KartParams } from '@cr/sim';

const DT = 1 / 60;
const SIN6 = 0.10452846326765347, SIN8 = 0.13917310096006544, SIN55 = 0.8191520442889918;
/** Gear (core/state.ts `Gear`): stopped, drive, neutral, reverse. */
const STOP = 0, D = 1, N = 2, R = 3;

/** The doc 15 §2 SHARED keys. KartParams gains them in M5; typed here so the oracle compiles on either side of that change. */
export interface TechParams {
  vReverse: number; aReverse: number; revEngageTicks: number; zeroLockGt: number;
  postTicks: number; kPostHold: number; kPostRel: number;
  aDrag: number; etaDrag: number; dragCapMul: number; tapCapStep: number; tapStreakMax: number; tapYaw: number;
  tapAccelMul: number; tapTicks: number; tapGrace: number; tapMinGap: number; tapMaxGap: number; dragNeutral: number;
  dragEnterLo: number; dragEnterHi: number; dragExitLo: number; dragExitHi: number;
  cutSteer: number; cutTicks: number; etaCut: number; revGaugeMul: number;
  brakeTurnTicks: number; brakeTurnMul: number; spinTicks: number; spinSpeed: number; spinStunTicks: number;
}
export type OracleParams = KartParams & TechParams;

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
  // doc 15 (KartDrive: stunTicks, postTicks, gear, dragTicks, tapStreak, tapGap, counterTicks, brakeTicks)
  stunT: number; postT: number; gear: number; dragT: number; streak: number; tapGap: number; counterT: number; brakeT: number;
}

/** A kart at (px, pz) heading (fx, fz) moving at `v` along its nose; moving karts are in drive, a kart at rest in STOP. */
export function oracleKart(px: number, pz: number, fx: number, fz: number, v: number): OracleKart {
  return {
    px, pz, hx: fx, hy: -fz, vx: fx * v, vy: -fz * v, r: 0, drift: 0, dDir: 1, dT: 0, dPeak: 0, reDrift: 0, gauge: 0, gT: 0, boosters: 0, boostT: 0, startT: 0, instWin: 0, instT: 0, prevThr: 1, prevDrift: false,
    stunT: 0, postT: 0, gear: v > 0 ? D : v < 0 ? R : STOP, dragT: 0, streak: 0, tapGap: 255, counterT: 0, brakeT: 0,
  };
}

/** steer + = left; tapL / tapR are the Edge.TAP_L / TAP_R bits of the frame. */
export interface OracleInput { steer: number; thr: number; brk: number; drift: boolean; boost: boolean; tapL: boolean; tapR: boolean }

/** Drag ends: counter, streak and gap back to their idle values (§4.5). */
function endDrag(k: OracleKart): void { k.dragT = 0; k.streak = 0; k.tapGap = 255; }
/** The technique fields reset on every drift entry and end (§4.2, §4.7). brakeTicks is not one of them: it is set explicitly. */
function resetTech(k: OracleKart): void { endDrag(k); k.counterT = 0; }
function endDrift(k: OracleKart, P: OracleParams): void {
  k.drift = 0; k.reDrift = P.reDriftTicks; k.dDir = 1; k.dT = 0; k.dPeak = 0;
  resetTech(k);
}

export function oracleStep(k: OracleKart, inp: OracleInput, P: OracleParams): void {
  // §4.1 timers: the boost state is read before the decrements; only a natural expiry starts the bleed
  const wasBoost = k.boostT > 0 || k.startT > 0;
  if (k.boostT > 0) k.boostT--;
  if (k.startT > 0) k.startT--;
  if (k.instT > 0) k.instT--;
  if (k.instWin > 0) k.instWin--;
  if (k.stunT > 0) k.stunT--;
  if (k.reDrift > 0) k.reDrift--;
  if (k.postT > 0) k.postT--;
  if (wasBoost && k.boostT === 0 && k.startT === 0) k.postT = P.postTicks;
  const stunned = k.stunT > 0;
  const thrIn = inp.thr > 0 ? 1 : 0;
  const thr = stunned ? 0 : thrIn;
  const thrEdge = thrIn === 1 && k.prevThr === 0;
  const driftEdge = inp.drift && !k.prevDrift;
  const brk = inp.brk > 0;
  const steer = inp.steer > 1 ? 1 : inp.steer < -1 ? -1 : inp.steer;
  // frame hygiene (sim K0): renormalize the quantized heading
  { const l = Math.sqrt(k.hx * k.hx + k.hy * k.hy); if (l > 1e-9) { k.hx = k.hx / l; k.hy = k.hy / l; } }
  let hx = k.hx, hy = k.hy;
  let u = k.vx * hx + k.vy * hy;
  // §4.2 brake counter (control branch; the flat plane is always grounded)
  k.brakeT = brk ? Math.min(255, k.brakeT + 1) : 0;
  // K2 drift entry / double drift
  if (k.drift === 0) {
    if (inp.drift && (steer >= P.driftMinSteer || steer <= -P.driftMinSteer) && u >= P.driftMinSpeed && k.reDrift <= 0 && !stunned) {
      k.drift = 1; k.dDir = steer > 0 ? 1 : -1; k.dT = 0; k.dPeak = 0;
      k.r += k.dDir * P.kickR;
      [hx, hy] = rotH(hx, hy, k.dDir * P.kickAngle);
      k.vx *= P.kickLoss; k.vy *= P.kickLoss;
      resetTech(k); k.brakeT = brk ? 1 : 0; k.postT = 0;
    }
  } else if (driftEdge && k.dT >= P.rekickMinTicks) {
    k.r += k.dDir * P.rekickR;
    [hx, hy] = rotH(hx, hy, k.dDir * P.rekickAngle);
    k.vx *= P.rekickLoss; k.vy *= P.rekickLoss;
  }
  // §4.3 K3 brake turn, spin-out and taps (while drifting)
  let brakeTurn = false, spin = false;
  if (k.drift === 1) {
    if (k.brakeT >= P.spinTicks) {
      // spin-out: the drift ends with no instant window and the active boost is cancelled (stored boosters stay)
      spin = true;
      endDrift(k, P);
      k.boostT = 0; k.startT = 0; k.instT = 0; k.instWin = 0; k.postT = 0;
      k.stunT = P.spinStunTicks + 1;
    } else if (k.brakeT >= 1 && k.brakeT <= P.brakeTurnTicks) brakeTurn = true;
    if (k.drift === 1 && k.dragT > 0) {
      k.tapGap = Math.min(255, k.tapGap + 1);
      if (k.dDir > 0 ? inp.tapL : inp.tapR) {
        if (k.tapGap > P.tapMaxGap) k.streak = 1;
        else if (k.tapGap >= P.tapMinGap) k.streak = Math.min(P.tapStreakMax, k.streak + 1);
        else k.streak = 0;
        k.tapGap = 0;
        if (k.streak > 0) k.r += k.dDir * P.tapYaw;
      }
    }
  }
  u = k.vx * hx + k.vy * hy;
  const sIn = steer * k.dDir;
  // K4 yaw target and lag
  let rT: number;
  if (k.drift === 0) {
    const vv = u > 0 ? u : 0; const qq = vv / P.gripV1;
    rT = steer * P.yGrip * vv / (vv + P.gripV0) / (1 + qq * qq);
    if (u < -0.5) rT = -steer * P.yGrip * 0.5 * (-u) / (-u + P.gripV0);
  } else {
    // §4.4: inside the tap grace of a drag, in-direction steer counts as neutral (clamped to dragNeutral)
    const grace = k.dragT > 0 && k.streak > 0 && k.tapGap <= P.tapGrace;
    rT = k.dDir * (P.y0 / (1 + (k.dT * DT) / P.y0T) + P.y1 * (grace ? Math.min(sIn, P.dragNeutral) : sIn) + (inp.drift ? P.y2 : 0));
  }
  if (stunned) rT *= 0.3;
  k.r += (rT - k.r) * (1 - decayF(k.drift === 0 ? P.kYawGrip : P.kYawDrift));
  // K5 heading rotation (×brakeTurnMul on brake-turn ticks)
  [hx, hy] = rotH(hx, hy, k.r * DT * (brakeTurn ? P.brakeTurnMul : 1));
  // K6 decomposition (K7 slope gravity is zero on the flat plane)
  u = k.vx * hx + k.vy * hy;
  let w = -k.vx * hy + k.vy * hx;
  let v = Math.sqrt(u * u + w * w);
  // §4.5 K7b cut, reverse gauge and drag
  let cut = false;
  if (k.drift === 1) {
    const boosting = k.boostT > 0 || k.startT > 0;
    k.counterT = sIn <= -P.cutSteer ? Math.min(255, k.counterT + 1) : 0;
    cut = k.counterT >= P.cutTicks && !(boosting && inp.drift);
    const sb7 = v > 0.1 ? -k.dDir * w / v : 0;
    if (cut) { if (u > 0) u += P.etaCut * (v - u); w = 0; k.r = 0; }
    const steerOk = sIn > -P.dragNeutral && (sIn < P.dragNeutral || (k.streak > 0 && k.tapGap <= P.tapGrace));
    const ok = !cut && boosting && thr === 1 && !brk && steerOk;
    if (k.dragT > 0) {
      if (ok && sb7 >= P.dragExitLo && sb7 <= P.dragExitHi) k.dragT = Math.min(255, k.dragT + 1);
      else endDrag(k);
    } else if (ok && sb7 >= P.dragEnterLo && sb7 <= P.dragEnterHi) { k.dragT = 1; k.streak = 0; k.tapGap = 255; }
    v = Math.sqrt(u * u + w * w); // K8 reference speed: after the cut
  }
  // K8 lateral damping with momentum retention (etaDrag while dragging)
  let kL: number, eta: number;
  if (k.drift === 0) { kL = P.kLatGrip; eta = P.etaGrip; }
  else {
    eta = k.dragT > 0 ? P.etaDrag : P.etaDrift;
    // §4.6: the same grace clamp picks the neutral band
    const sL = k.dragT > 0 && k.streak > 0 && k.tapGap <= P.tapGrace ? Math.min(sIn, P.dragNeutral) : sIn;
    if (sL >= 0.3) kL = P.kLatNeutral + (P.kLatIn - P.kLatNeutral) * ((sL - 0.3) / 0.7); else if (sL > -0.3) kL = P.kLatNeutral;
    else kL = P.kLatNeutral + (P.kLatCounter - P.kLatNeutral) * ((-sL - 0.3) / 0.7);
    if (inp.drift) kL *= P.kLatShift;
  }
  const w2 = w * decayF(kL);
  const vRaw = Math.sqrt(u * u + w2 * w2);
  if (vRaw > 1e-6) { const f = (vRaw + eta * (v - vRaw)) / vRaw; u *= f; w = w2 * f; } else w = w2;
  v = Math.sqrt(u * u + w * w);
  // K9 slip cap
  if (k.drift === 1) { const sm = SIN55 * v; if (w > sm || w < -sm) { w = w > 0 ? sm : -sm; u = Math.sqrt(v * v - w * w); } }
  // K10 fatigue, K11 bookkeeping (reverse gauge ×revGaugeMul; a cut is an exit)
  let sb = 0;
  if (k.drift === 1) k.gT++; else if (k.gT > 0) k.gT--;
  if (k.drift === 1) {
    sb = v > 0.1 ? -k.dDir * w / v : 0;
    k.dT++; if (sb > k.dPeak) k.dPeak = sb;
    if (v >= 10 && sb > 0) {
      let sl = sb / P.gSlipRef; if (sl > 1) sl = 1; sl = Math.sqrt(sl);
      let dg = P.g0 * sl * (v / P.vGrip) / (1 + (k.gT * DT) / P.gTau) * DT * 1;
      if ((k.boostT > 0 || k.startT > 0) && sIn <= -0.3) dg *= P.revGaugeMul;
      addGauge(k, dg);
    }
    if ((k.dT >= P.exitMinTicks && sb < SIN6) || u < 5 || cut) {
      if (k.dT >= P.instMinDriftTicks && k.dPeak >= SIN8) k.instWin = P.instWindowTicks;
      endDrift(k, P);
    }
  }
  // K12 instant boost, K13 booster
  if (k.instWin > 0 && thrEdge) { k.instT = P.instTicks; k.instWin = 0; addGauge(k, P.instGaugeBonus); }
  if (inp.boost && k.boosters > 0 && k.boostT < P.chainTicks) { k.boosters--; k.boostT += P.tBoostTicks; }
  // K14 target speed; any boost law, drift or instant boost cancels the bleed for good
  const boosting = k.boostT > 0 || k.startT > 0;
  const vT = boosting ? P.vBoost : P.vGrip;
  if (boosting || k.drift === 1 || k.instT > 0) k.postT = 0;
  // §4.8 gear machine (before the longitudinal law)
  let gear = k.gear;
  if (thrIn === 1) gear = D;
  else if (brk) {
    if (u > 0.5) gear = D;
    else if (gear !== R) {
      // brakeTicks restarts at the STOP transition (this tick is the first ↓ tick at STOP); R after revEngageTicks of them
      if (gear !== STOP) { gear = STOP; k.brakeT = 1; } else if (k.brakeT > P.revEngageTicks) gear = R;
    }
  } else if (gear === D) gear = N;
  // K15 longitudinal law
  let uN: number;
  if (gear === STOP) { uN = 0; w = 0; } // flat ground: |g_t| = 0 ≤ zeroLockGt, so STOP is the zero-lock
  else if (gear === R && brk) { const rr = u < 0 ? -u / P.vReverse : 0; const a = -P.aReverse * (1 - rr * rr); uN = u + a * DT; }
  else {
    let a = 0, dragLaw = false;
    const instOn = k.instT > 0 && !boosting && u < P.vInst;
    uN = u;
    if (thr === 1) {
      if (k.dragT > 0 && boosting) {
        // drag law: injection and cap on planar |v| = √(u² + w²)
        dragLaw = true;
        const aI = P.aDrag * (k.streak > 0 && k.tapGap < P.tapTicks ? P.tapAccelMul : 1);
        const vCap = P.vBoost * (P.dragCapMul + P.tapCapStep * k.streak);
        const vp = Math.sqrt(u * u + w * w);
        if (vp > vCap) uN = u + -P.kOver * (vp - vCap) * DT;
        else {
          let aB: number;
          if (u < vT) {
            aB = P.kBoost * (vT - u); const cap = k.boostT > 0 ? P.aBoostMax : P.aStartMax; if (aB > cap) aB = cap;
            const base = P.a0 * (1 - u / P.vGrip); if (aB < base) aB = base;
          } else aB = -P.kOver * (u - vT);
          uN = u + (aB > aI ? aB : aI) * DT;
          if (uN * uN + w * w > vCap * vCap) uN = Math.sqrt(vCap * vCap - w * w);
        }
      } else if (u < vT) {
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
      a = u >= 0 ? -P.aCoast : P.aCoast; // coasting rolls toward rest either way
      if (u > vT) a -= P.kOver * (u - vT);
    }
    const aBrk = -(k.drift === 1 ? P.aBrakeDrift : P.aBrake);
    if (brk && u > 0) a = aBrk;
    if (!dragLaw) {
      uN = u + a * DT;
      // post-boost bleed toward the non-boost target (↑ held, above it) or toward 0 (↑ released); a brake wins if stronger
      if (k.postT > 0 && (thr === 0 || u > vT)) {
        uN = thr === 1 ? vT + (u - vT) * decayF(P.kPostHold) : u + Math.min((vT - u) * (1 - decayF(P.kPostHold)), -u * (1 - decayF(P.kPostRel)));
        if (brk && u > 0) { const ub = u + aBrk * DT; if (ub < uN) uN = ub; }
      }
    }
    if ((thr === 0 || brk) && u >= 0 && uN < 0) uN = 0;
    else if (thr === 0 && u < 0 && uN > 0) uN = 0;
  }
  // N or R coasting to exactly 0 on flat ground → STOP (the zero-lock holds from the next tick)
  if ((gear === N || gear === R) && uN === 0) gear = STOP;
  k.gear = gear;
  u = uN;
  // K16 drift drag (skipped while dragging)
  if (k.drift === 1 && sb > 0 && k.dragT === 0) { let f = 1 - P.cBeta * sb * sb * DT; if (f < 0) f = 0; u *= f; w *= f; }
  // §4.9 spin-out speed
  if (spin) { const vp = Math.sqrt(u * u + w * w); if (vp > 1e-9) { const s = P.spinSpeed / vp; u *= s; w *= s; } }
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
