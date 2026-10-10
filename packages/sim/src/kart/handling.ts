// Continuous steering control shared by authority and the AI lookahead model.
// A Shift press changes a target; it never changes a heading, yaw rate or velocity.
import { DT } from '../core/units.ts';
import type { KartDrive } from '../core/state.ts';
import { gripGain, type KartParams } from './params.ts';

export type DriftControl = Pick<KartDrive, 'drift' | 'driftIntentTicks' | 'driftArmed' | 'driftDir' | 'driftEngagement' | 'driftTightness' | 'driftTarget' | 'driftRecovering' | 'pendingDriftDir'>;

export function resetDriftHandling(d: DriftControl): void {
  d.driftIntentTicks = 0; d.driftArmed = 0; d.driftEngagement = 0; d.driftTightness = 0; d.driftTarget = 0; d.driftRecovering = 0; d.pendingDriftDir = 0;
}

/** 1 = entered, 2 = tightened, 0 = no transition. A recovery retains at most one fresh request. */
export function requestDrift(d: DriftControl, dir: number, canEnter: boolean): 0 | 1 | 2 {
  if (d.drift === 0) d.driftArmed = 1;
  if (dir === 0) return 0;
  const sign = dir > 0 ? 1 : -1;
  if (d.drift === 0) {
    if (!canEnter) return 0;
    d.drift = 1; d.driftDir = sign;
    resetDriftHandling(d); d.driftIntentTicks = 36;
    return 1;
  }
  if (sign !== d.driftDir || d.driftRecovering === 2) {
    d.pendingDriftDir = sign; d.driftIntentTicks = 0;
    d.driftRecovering = 2;
    return 0;
  }
  d.driftIntentTicks = 36;
  d.driftTarget = Math.min(1, d.driftTarget + 0.25);
  d.driftRecovering = 0;
  return 2;
}

/** Shift sustains engagement; release eases out. Counter-steering always takes priority, including under boost. */
export function advanceDriftHandling(d: DriftControl, steer: number, held: boolean, intent = steer, brake = false): void {
  if (brake) { d.pendingDriftDir = 0; d.driftIntentTicks = 0; }
  if (d.drift === 0) return;
  if (brake) { d.driftIntentTicks = 0; if (d.driftRecovering === 0) d.driftRecovering = 1; }
  if (intent * d.driftDir < -0.05) { d.driftRecovering = 2; d.driftIntentTicks = 0; }
  const sustaining = held || d.driftIntentTicks > 0;
  if (!sustaining && d.driftRecovering === 0) d.driftRecovering = 1;
  const active = sustaining && d.driftRecovering === 0;
  const rate = active ? 3.5 : d.driftRecovering === 2 ? 10 : 4;
  d.driftEngagement = Math.max(0, Math.min(1, d.driftEngagement + (active ? 1 : -1) * rate * DT));
  const delta = d.driftTarget - d.driftTightness;
  d.driftTightness += Math.max(-2 * DT, Math.min(2 * DT, delta));
}

/** Bounded angular acceleration, with faster response when unwinding a slide. */
export function steeringYaw(d: DriftControl, speed: number, steer: number, yaw: number, P: KartParams): number {
  let grip = steer * gripGain(speed, P);
  if (speed < -0.5) grip = -steer * P.yGrip * 0.5 * (-speed) / (-speed + P.gripV0);
  const e = d.driftEngagement;
  const drift = steer * (P.driftYaw + P.tightenYaw * d.driftTightness) * Math.max(0, speed) / (Math.max(0, speed) + 3);
  const target = grip + (drift - grip) * e;
  const maxStep = (d.driftRecovering === 2 ? P.counterYawAccel : P.yawAccel) * DT;
  const response = (target - yaw) * (d.driftRecovering === 2 ? 0.5 : 0.25);
  return yaw + Math.max(-maxStep, Math.min(maxStep, response));
}
