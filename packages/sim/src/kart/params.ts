// Kart physics parameters (ADR-004, 10-sim-spec §2–§3). Per-kart values come from KartSpec; the rest are shared.
// Tick counts are effective durations (the number of dynamics phases a timer is active, 10-sim-spec §1.3).
// The driving-technique constants (M5) are 15-driving-techniques §2.
import type { KartSpec } from '@cr/content';
import { decayF, SIN } from '../core/math.ts';
import { DT, KMH_PER_MPS } from '../core/units.ts';

export interface KartParams {
  vGrip: number; vBoost: number; a0: number; kOver: number; aCoast: number; aBrake: number; aBrakeDrift: number; vReverse: number;
  kBoost: number; aBoostMax: number; tBoostTicks: number; aStartMax: number; startCapMul: number; chainTicks: number;
  vInst: number; vDraft: number; vTeam: number; instTicks: number; aInst: number; instWindowTicks: number; instMinDriftTicks: number; instMinSlip: number;
  yGrip: number; gripV0: number; gripV1: number; kYawGrip: number; kLatGrip: number; etaGrip: number;
  driftYaw: number; tightenYaw: number; yawAccel: number; counterYawAccel: number;
  driftMinSteer: number; driftMinSpeed: number; kickR: number; kickAngle: number; kickLoss: number;
  y0: number; y0T: number; y1: number; y2: number; kYawDrift: number;
  kLatIn: number; kLatNeutral: number; kLatCounter: number; kLatShift: number; etaDrift: number;
  aDrift: number; cBeta: number; sinBetaMax: number; exitSin: number; exitMinTicks: number; reDriftTicks: number;
  rekickR: number; rekickMinTicks: number; rekickLoss: number;
  g0: number; gSlipRef: number; gTau: number; slots: number;
  instGaugeBonus: number; startGaugeBonus: number; draftGaugePerSec: number; infiniteFillPerSec: number;
  wallE: number; wallGrind: number; wallF15: number; wallF45: number; wallF90: number; wallStunTicks: number; wallGaugeKeep: number;
  weight: number; teamBoostTicks: number; itemBoostTicks: number; padBoostTicks: number; jumpPadSpeed: number;
  draftChargeTicks: number; draftTicks: number; draftVMul: number; draftAccelMul: number;
  airYawDamp: number; landSpeed: number; landLossPerMps: number; landLossMax: number; coyoteTicks: number;
  // driving techniques (M5, 15-driving-techniques §2)
  aReverse: number; revEngageTicks: number; zeroLockGt: number;
  postTicks: number; kPostHold: number; kPostRel: number;
  aDrag: number; etaDrag: number; dragCapMul: number; tapCapStep: number; tapStreakMax: number; tapYaw: number;
  tapAccelMul: number; tapTicks: number; tapGrace: number; tapMinGap: number; tapMaxGap: number;
  dragNeutral: number; dragEnterLo: number; dragEnterHi: number; dragExitLo: number; dragExitHi: number;
  cutSteer: number; cutTicks: number; etaCut: number; kCut: number; revGaugeMul: number;
  brakeTurnTicks: number; brakeTurnMul: number; spinTicks: number; spinSpeed: number; spinStunTicks: number;
}

type Shared = Omit<KartParams, 'vGrip' | 'vBoost' | 'a0' | 'tBoostTicks' | 'g0' | 'kLatIn' | 'kLatNeutral' | 'yGrip' | 'cBeta' | 'weight' | 'vInst' | 'vDraft' | 'vTeam'>;

export const SHARED: Readonly<Shared> = {
  kOver: 0.9, aCoast: 2.5, aBrake: 24, aBrakeDrift: 14, vReverse: 10.78, // 65 km/h on the M5 display
  // v10: gentler boost rise and no launch/technique propulsion above the kart boost target.
  kBoost: 1.8, aBoostMax: 8.5, aStartMax: 20, startCapMul: 1.0, chainTicks: 15,
  instTicks: 30, aInst: 7.65, instWindowTicks: 30, instMinDriftTicks: 15, instMinSlip: 0.0697564737441253 /* sin(4°), scaled with the stronger lateral grip */,
  gripV0: 4, gripV1: 33.5, kYawGrip: 12, kLatGrip: 24, etaGrip: 0.1,
  driftYaw: 2.1, tightenYaw: 1.0, yawAccel: 5.5, counterYawAccel: 24,
  driftMinSteer: 0.3, driftMinSpeed: 10, kickR: 1.2, kickAngle: 0.06981317007977318, kickLoss: 0.99,
  y0: 0.6, y0T: 0.6, y1: 1.2, y2: 0.7, kYawDrift: 6,
  kLatCounter: 24, kLatShift: 0.85, etaDrift: 0.8,
  // exit after ≥ 8 bookkeeping ticks = proto2d dT ≥ 0.12 s (7/60 < 0.12 ≤ 8/60)
  aDrift: 2.5, sinBetaMax: SIN.d55, exitSin: SIN.d6, exitMinTicks: 8, reDriftTicks: 6,
  // Legacy profile fields retained for tool compatibility; v10 Shift presses adjust continuous targets in handling.ts.
  rekickR: 0.8, rekickMinTicks: 9, rekickLoss: 0.99,
  gSlipRef: 0.25, gTau: 1.5, slots: 2,
  instGaugeBonus: 0.03, startGaugeBonus: 0.05, draftGaugePerSec: 0.05, infiniteFillPerSec: 0.45,
  wallE: 0.15, wallGrind: 10, wallF15: 0.95, wallF45: 0.70, wallF90: 0.40, wallStunTicks: 15, wallGaugeKeep: 1,
  teamBoostTicks: 270, itemBoostTicks: 180, padBoostTicks: 45, jumpPadSpeed: 9,
  draftChargeTicks: 120, draftTicks: 90, draftVMul: 1.05, draftAccelMul: 1.1,
  airYawDamp: 3, landSpeed: 6, landLossPerMps: 0.01, landLossMax: 0.12, coyoteTicks: 6,
  // gears: reverse −aReverse·(1 − r²) toward −vReverse after revEngageTicks of ↓ at STOP; zero-lock up to ~15% grade
  aReverse: 8, revEngageTicks: 6, zeroLockGt: 4.2,
  // post-boost bleed: postTicks (0.5 s) of decayF(kPostHold) toward the non-boost target, kPostRel toward 0 on release
  postTicks: 30, kPostHold: 6, kPostRel: 0.7,
  // Drag/tap rewards retain their duration and gauge roles; motor propulsion shares the normal boost cap.
  aDrag: 4.25, etaDrag: 1.0, dragCapMul: 1, tapCapStep: 0, tapStreakMax: 3, tapYaw: 0.7,
  tapAccelMul: 2, tapTicks: 8, tapGrace: 8, tapMinGap: 6, tapMaxGap: 12,
  dragNeutral: 0.3, dragEnterLo: SIN.d20, dragEnterHi: SIN.d35, dragExitLo: SIN.d18, dragExitHi: SIN.d37,
  // Reverse-gauge reward remains; recovery itself is continuous and independent of boost/Shift.
  cutSteer: 0.7, cutTicks: 2, etaCut: 0.8, kCut: 12, revGaugeMul: 3,
  // brake drift turn (고속턴) and spin-out (20 km/h, 15 ticks of stun)
  brakeTurnTicks: 8, brakeTurnMul: 2, spinTicks: 11, spinSpeed: 20 / KMH_PER_MPS, spinStunTicks: 15,
};

/** Per-tick post-boost bleed factors, precomputed once (decayF, never Math.exp in the sim). */
export const DECAY_POST_HOLD = decayF(SHARED.kPostHold, DT);
export const DECAY_POST_REL = decayF(SHARED.kPostRel, DT);

// keyed by the spec object, so a test that builds its own KartSpec variant gets its own parameters
const cache = new WeakMap<KartSpec, KartParams>();

export function paramsFor(spec: KartSpec): KartParams {
  let p = cache.get(spec);
  if (!p) {
    p = {
      ...SHARED, vGrip: spec.vGrip, vBoost: spec.vBoost, a0: spec.a0, tBoostTicks: spec.tBoostTicks, g0: spec.g0,
      kLatIn: spec.kLatIn, kLatNeutral: spec.kLatNeutral, yGrip: spec.yGrip, cBeta: spec.cBeta, weight: spec.weight,
      vInst: 1.05 * spec.vGrip, vDraft: SHARED.draftVMul * spec.vGrip, vTeam: spec.vBoost,
    };
    cache.set(spec, p);
  }
  return p;
}

/** Grip yaw gain at speed v (rad/s per unit steer): yG·v/(v + 4)/(1 + (v/33.5)²). */
export function gripGain(v: number, P: KartParams): number {
  const vv = v > 0 ? v : 0;
  const q = vv / P.gripV1;
  return (P.yGrip * vv) / (vv + P.gripV0) / (1 + q * q);
}
