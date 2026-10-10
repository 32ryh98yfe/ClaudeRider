// Bakes per-sample AI tables (docs/design/14-ai-spec.md): signed curvature, 40 m turn-ahead, speed limit, width.
// Mirrors the validated gap-2 AI's runtime scans so the sim-side driver only does table lookups.
import { AIS, SHARED } from '@cr/sim';
import type { Sample } from './geometry.ts';

// The braking preview must use the same deceleration as the live kart model.
const A_BRAKE = SHARED.aBrake, BRAKE_FRAC = 0.8, OMEGA_CAP = SHARED.driftYaw * 0.6, HAIRPIN_CAP = SHARED.driftYaw * 0.38, HAIRPIN_TURN = 2.2, R_BIAS = 0.6;

/**
 * Headings of the plan tangent (radians, CCW from +x with north = −z). Where the tangent is near vertical (inside a
 * loop) its plan projection is noise, so the last well-defined heading carries through instead of a random flip.
 */
function headings(S: Sample[]): Float64Array {
  const n = S.length, h = new Float64Array(n);
  let first = -1;
  for (let i = 0; i < n; i++) {
    const s = S[i]!;
    if (s.tx * s.tx + s.tz * s.tz >= 0.09) { h[i] = Math.atan2(-s.tz, s.tx); if (first < 0) first = i; }
    else h[i] = i > 0 ? h[i - 1]! : NaN;
  }
  for (let i = 0; i < first; i++) h[i] = h[first]!;
  if (first < 0) h.fill(0);
  return h;
}
function dAng(a: number, b: number): number { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

export function bakeAi(S: Sample[], closed: boolean, step: number): Float64Array {
  const n = S.length;
  const nSeg = closed ? n - 1 : n;
  const idx = (i: number): number => (closed ? ((i % nSeg) + nSeg) % nSeg : Math.max(0, Math.min(n - 1, i)));
  const per = (m: number): number => Math.max(1, Math.round(m / step));
  const kappa = new Float64Array(n);
  const hd = headings(S);
  const w2 = per(2);
  for (let i = 0; i < n; i++) kappa[i] = dAng(hd[idx(i - w2)]!, hd[idx(i + w2)]!) / (2 * w2 * step);
  const out = new Float64Array(n * AIS.STRIDE);
  const look40 = per(40), look90 = per(90), st2 = per(2);
  for (let i = 0; i < n; i++) {
    const o = i * AIS.STRIDE;
    const hw = Math.min(S[i]!.w / 2, S[i]!.w / 2);
    out[o + AIS.KAPPA] = kappa[i]!;
    out[o + AIS.TURN40] = dAng(hd[i]!, hd[idx(i + look40)]!);
    out[o + AIS.WIDTH] = hw;
    out[o + AIS.LINE_U] = 0;
    out[o + AIS.ZONE] = 0;
    // yaw-budget speed limit over the next 90 m (prototype aiDriver)
    let turnSum = 0;
    for (let k = 0; k <= look90; k += st2) turnSum += Math.abs(kappa[idx(i + k)]!) * 2;
    const cap = turnSum > HAIRPIN_TURN ? HAIRPIN_CAP : OMEGA_CAP;
    let vLim = 99;
    for (let k = 0; k <= look90; k += st2) {
      const cr = Math.abs(kappa[idx(i + k)]!);
      if (cr > 1e-4) {
        const hwk = S[idx(i + k)]!.w / 2;
        const va = cap * (1 / cr + R_BIAS * hwk);
        const vr = Math.sqrt(va * va + 2 * BRAKE_FRAC * A_BRAKE * k * step);
        if (vr < vLim) vLim = vr;
      }
    }
    out[o + AIS.VLIM] = vLim;
    void hw;
  }
  return out;
}
