// Track hazards for the lane planner (14-ai §4.7): the analytic hazardPose(h, tick) is sampled at the bot's
// arrival (entering, crossing and leaving the hazard's footprint); an active or telegraphing footprint becomes a
// blocked lateral interval in the bot's own track frame. If every lane is blocked the bot slows to arrive after
// the active window. Pure: public track data + the bot's predicted state; allocation-free (module scratch).
import type { BakedTrack, HazardPose } from '../track/BakedTrack.ts';
import type { PathPlan } from './plan.ts';

export const MAX_BLOCKS = 8;

/** Blocked lateral intervals ahead (filled by scanHazards). */
export interface HazardBlocks {
  n: number;
  u0: Float64Array; u1: Float64Array;   // lateral interval (m, + right) in the kart's path frame
  ds: Float64Array;                      // distance ahead (m)
  clearTicks: Float64Array;              // ticks from now until the footprint is clear at the kart's position
}

export function makeBlocks(): HazardBlocks {
  return { n: 0, u0: new Float64Array(MAX_BLOCKS), u1: new Float64Array(MAX_BLOCKS), ds: new Float64Array(MAX_BLOCKS), clearTicks: new Float64Array(MAX_BLOCKS) };
}

const P: HazardPose = { x: 0, y: 0, z: 0, active: 0, telegraph: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, phase: 0 };
const PAD = 1.5; // kart radius + margin

/**
 * Hazards on `pp` whose footprint lies 0–120 m ahead of s. `tick0` is the tick the bot's next frame applies on,
 * `v` its speed. Writes the blocked intervals into `out`.
 */
export function scanHazards(track: BakedTrack, pp: PathPlan, s: number, v: number, tick0: number, out: HazardBlocks): void {
  out.n = 0;
  const hz = track.hazards;
  if (hz.length === 0) return;
  const vv = v > 6 ? v : 6;
  for (let h = 0; h < hz.length && out.n < MAX_BLOCKS; h++) {
    const H = hz[h]!;
    if (H.path !== pp.index) continue;
    const mo = H.motion;
    const lane = mo !== undefined && mo.type === 'lane';
    // along-track range the hazard can occupy
    let sMin = H.s, sMax = H.s;
    if (lane && mo) { sMin = mo.s0 ?? H.s; sMax = mo.s1 ?? H.s; }
    let dMin = sMin - s, dMax = sMax - s;
    if (pp.closed) { const L = pp.length; if (dMax < -40) { dMin += L; dMax += L; } }
    if (dMax < -8 || dMin > 120) continue;
    const a = H.size[0], b = H.size[1];
    let blocked = false, lo = 1e9, hi = -1e9, dsHit = 1e9, clear = 0;
    // three looks: when the kart reaches the near edge, the middle and the far edge of the footprint
    for (let look = 0; look < 3; look++) {
      let ds = lane ? Math.max(0, dMin) : H.s - s;
      if (pp.closed && ds < -pp.length / 2) ds += pp.length;
      const reach = H.shape === 'box' ? 0.5 * Math.max(a, b) : a + 0.5 * b;
      ds += (look - 1) * (reach + PAD);
      if (ds < -reach - PAD) continue;
      const eta = tick0 + Math.max(0, ds) / vv * 60;
      track.hazardPose(h, Math.round(eta), P);
      if (!P.active && !P.telegraph) continue;
      // footprint in the path frame at the pose
      let i = Math.round((s + ds) / pp.ds);
      i = pp.closed ? ((i % pp.n) + pp.n) % pp.n : i < 0 ? 0 : i > pp.n - 1 ? pp.n - 1 : i;
      if (lane) {
        // moving along the road: find its sample near the guess
        let best = 1e18, bi = i;
        const py = -P.z;
        for (let k = -25; k <= 25; k++) {
          const j = pp.closed ? (((i + k) % pp.n) + pp.n) % pp.n : Math.max(0, Math.min(pp.n - 1, i + k));
          const dx = P.x - pp.X[j]!, dy = py - pp.Y[j]!, d2 = dx * dx + dy * dy;
          if (d2 < best) { best = d2; bi = j; }
        }
        let dj = bi * pp.ds - s;
        if (pp.closed) { const L = pp.length; if (dj < -L / 2) dj += L; else if (dj > L / 2) dj -= L; }
        if (Math.abs(dj - Math.max(0, ds)) > 3 * (reach + PAD) + 6) continue; // not where we will be
        i = bi;
      }
      const tx = pp.TX[i]!, ty = pp.TY[i]!, rx = ty, ry = -tx;
      const u = (P.x - pp.X[i]!) * rx + (-P.z - pp.Y[i]!) * ry;
      let half: number;
      if (H.shape === 'box') {
        const fx = P.fx ?? 0, fy = -(P.fz ?? 1);
        const fr = Math.abs(fx * rx + fy * ry), ft = Math.abs(fx * tx + fy * ty);
        half = 0.5 * a * fr + 0.5 * b * ft;
      } else half = a + (H.shape === 'cyl' ? 0 : 0.5 * b * 0.5);
      if (u - half - PAD < lo) lo = u - half - PAD;
      if (u + half + PAD > hi) hi = u + half + PAD;
      blocked = true;
      if (ds < dsHit) dsHit = Math.max(0, ds);
    }
    if (!blocked) continue;
    // when is it clear at the kart's arrival point? (for the slow-down when no lane is free; −1 = never, a vehicle lane)
    if (lane) clear = -1;
    else for (let t = 0; t <= 300; t += 6) {
      track.hazardPose(h, Math.round(tick0 + t), P);
      if (!P.active && !P.telegraph) { clear = t; break; }
      clear = t;
    }
    const k = out.n++;
    out.u0[k] = lo; out.u1[k] = hi; out.ds[k] = dsHit; out.clearTicks[k] = clear;
  }
}
