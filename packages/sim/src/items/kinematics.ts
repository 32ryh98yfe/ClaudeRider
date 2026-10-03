// Kinematic hard-CC curves and mash-out (12-items-spec §3, §6.4). Runs after kart dynamics and before the move
// (step.ts calls useItems there), so the curve value is exactly what the half-steps integrate this tick.
// Curves use arithmetic only: smoothstep(x) = x·x·(3 − 2x).
import { Edge, type InputFrame } from '../core/input.ts';
import { Attach, type KartState, type WorldState } from '../core/state.ts';
import { smallCos, smallSin } from '../core/math.ts';
import type { StepContext } from '../api.ts';
import { evKey } from '../kart/evkey.ts';
import { EFlag, Kin, effectDef } from './codes.ts';
import { ccImpactSpeed, effectBehavior } from './effects.ts';

export const smooth = (x: number): number => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };

/** Visual lift of the `airborne` kinematic at CC tick k of `dur`: parabola peaking at 4.0 m at dur/2 (render only). */
export function airborneLift(k: number, dur: number): number {
  const x = k / dur;
  return x <= 0 || x >= 1 ? 0 : 16 * x * (1 - x);
}

/** Height used by ground traps: the kart's height above the road plus the airborne visual lift (ADR-010: > 3 m immune). */
export function trapHeight(w: Readonly<WorldState>, ctx: StepContext, k: Readonly<KartState>): number {
  let h = k.race.loc.h > 0 ? k.race.loc.h : 0;
  const st = k.status;
  if (st.cc !== 0 && w.tick < st.ccEnd) {
    const def = effectDef(ctx.content, st.cc);
    if (def?.mods.kinematic === 'airborne') h += airborneLift(w.tick - st.ccStart, def.durTicks);
  }
  return h;
}

/** Sets the ground-plane speed of a kart, keeping its direction of travel (forward if it is at rest) and normal speed. */
export function setPlanarSpeed(k: KartState, speed: number): void {
  const b = k.body;
  const vn = b.vx * b.nx + b.vy * b.ny + b.vz * b.nz;
  let x = b.vx - vn * b.nx, y = b.vy - vn * b.ny, z = b.vz - vn * b.nz;
  const l = Math.sqrt(x * x + y * y + z * z);
  if (l > 1e-4) { x /= l; y /= l; z /= l; } else { x = b.fx; y = b.fy; z = b.fz; }
  const s = speed > 0 ? speed : 0;
  b.vx = x * s + vn * b.nx; b.vy = y * s + vn * b.ny; b.vz = z * s + vn * b.nz;
}

/**
 * Turns the kart's forward toward the ground-plane direction (gx, gy, gz) by at most `maxA` radians (small-angle
 * rotation about the kart up, like dynamics.rotateForward). Returns the signed angle turned (+ = left).
 */
export function steerToward(k: KartState, gx: number, gy: number, gz: number, maxA: number): number {
  const b = k.body;
  const gn = gx * b.nx + gy * b.ny + gz * b.nz;
  let x = gx - gn * b.nx, y = gy - gn * b.ny, z = gz - gn * b.nz;
  const gl = Math.sqrt(x * x + y * y + z * z);
  if (gl < 1e-6) return 0;
  x /= gl; y /= gl; z /= gl;
  const lx = b.ny * b.fz - b.nz * b.fy, ly = b.nz * b.fx - b.nx * b.fz, lz = b.nx * b.fy - b.ny * b.fx; // left = n × f
  const c = b.fx * x + b.fy * y + b.fz * z, s = lx * x + ly * y + lz * z;
  let a: number;
  if (c > 0 && s <= maxA && s >= -maxA) { b.fx = x; b.fy = y; b.fz = z; a = s; }
  else {
    a = s >= 0 ? maxA : -maxA;
    const cs = smallCos(a), sn = smallSin(a);
    let fx = b.fx * cs + lx * sn, fy = b.fy * cs + ly * sn, fz = b.fz * cs + lz * sn;
    const n = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
    fx /= n; fy /= n; fz /= n;
    b.fx = fx; b.fy = fy; b.fz = fz;
  }
  return a;
}

/** Mash-out credits (§6.4): alternating direction, ≥ minGap ticks apart, ≤ maxCredits; ccEnd −credit, floor ccStart + floor. */
export function creditMash(w: WorldState, inputs: ReadonlyArray<InputFrame>, ctx: StepContext): void {
  const tick = w.tick;
  for (const k of w.karts) {
    const st = k.status;
    if (!k.active || st.cc === 0 || tick >= st.ccEnd) continue;
    const mash = effectDef(ctx.content, st.cc)?.mash;
    if (!mash) continue;
    const edges = inputs[k.slot]?.edges ?? 0;
    const l = (edges & Edge.TAP_L) !== 0, r = (edges & Edge.TAP_R) !== 0;
    if (!l && !r) continue;
    const dir: -1 | 1 = l && r ? (st.lastTapDir === -1 ? 1 : -1) : l ? -1 : 1;
    if (dir === st.lastTapDir || tick - st.lastTapTick < mash.minGapTicks || st.mashCredits >= mash.maxCredits) continue;
    const floor = st.ccStart + mash.floorTicks;
    let end = st.ccEnd - mash.creditTicks;
    if (end < floor) end = floor;
    if (end < tick + 1) end = tick + 1;
    st.ccEnd = end;
    st.mashCredits++; st.lastTapDir = dir; st.lastTapTick = tick;
    const lo = floor > tick + 1 ? floor : tick + 1;
    let remaining = Math.ceil((end - lo) / mash.creditTicks);
    if (remaining > mash.maxCredits - st.mashCredits) remaining = mash.maxCredits - st.mashCredits;
    ctx.events.push({ t: 'mash', kart: k.slot, remaining, tick, key: evKey(tick, 82, k.slot, st.mashCredits) });
  }
}

/** Hard-CC speed curves plus effect onTick behaviours (tether pursuit). */
export function applyKinematics(w: WorldState, ctx: StepContext): void {
  const tick = w.tick;
  for (const k of w.karts) {
    // Hits and timers still resolve in transit, but physical motion stays frozen.
    // Resume the same curve from its current age after the warp places the kart.
    if (!k.active || k.race.respawnPhase !== 0 || k.body.attachKind === Attach.WARP) continue;
    const m = ctx.scratch.mods[k.slot];
    if (!m) continue;
    const kin = m.kinematic;
    if (kin === Kin.NONE || kin === Kin.TETHER) continue;
    const st = k.status;
    const u0 = ccImpactSpeed(w, k);
    const t = tick - st.ccStart;
    if (kin === Kin.AIRBORNE) {
      const dur = effectDef(ctx.content, st.cc)?.durTicks ?? 66;
      setPlanarSpeed(k, u0 * (1 - 0.75 * smooth(t / dur)));
      k.body.yawRate = 0;
    } else if (kin === Kin.TRAP) {
      setPlanarSpeed(k, t >= 12 ? 0 : u0 * (1 - smooth(t / 12)));
      k.body.yawRate = 0;
    } else if (kin === Kin.SPIN && t <= 20) {
      setPlanarSpeed(k, u0 * (1 - 0.55 * smooth(t / 20)));
    }
  }
  for (const e of w.effects) {
    if ((e.flags & (EFlag.RESOLVED | EFlag.DEAD | EFlag.ENDED | EFlag.DRIVER)) !== EFlag.RESOLVED || e.start > tick || tick >= e.end) continue;
    const beh = effectBehavior(effectDef(ctx.content, e.code));
    const k = w.karts[e.victim];
    if (beh?.onTick && k && k.active) beh.onTick(w, e, k, ctx); // behaviours see respawns too (the tether ends on one)
  }
}
