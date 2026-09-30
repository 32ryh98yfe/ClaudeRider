// Helpers for physics scenarios: race-ready rigs on fixtures, kart placement, speed readouts.
import { StartTier, type BakedTrack, type FrameSample, type InputFrame, type KartState, type WorldState } from '@cr/sim';
import { makeRig, type Rig, type RigOptions } from './rig.ts';

export const KMH = 5.4;
const FS = (): FrameSample => ({ px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 });

/** A rig already in the RACING phase (3-tick countdown), start-boost logic disabled for every kart. */
export function racingRig(track: BakedTrack, o: RigOptions = {}): Rig {
  const rig = makeRig(track, { countdownTicks: 3, ...o });
  rig.run(rig.w.goTick - rig.w.tick);
  for (const k of rig.w.karts) if (k.active) k.stats.startTier = StartTier.NONE;
  return rig;
}

export interface Place { s: number; u?: number; h?: number; speed?: number; yawDeg?: number; path?: number }

/** Puts kart `slot` at (s, u) on a path, heading `yawDeg` (+ = left) off the tangent, moving at `speed` along its nose. */
export function place(rig: Rig, slot: number, p: Place): KartState {
  const k = rig.w.karts[slot]!, b = k.body, T = rig.track, f = FS();
  T.frameAt(p.path ?? 0, p.s, f);
  const u = p.u ?? 0, h = p.h ?? 0;
  b.px = f.px + f.rx * u + f.ux * h; b.py = f.py + f.ry * u + f.uy * h; b.pz = f.pz + f.rz * u + f.uz * h;
  const a = ((p.yawDeg ?? 0) * Math.PI) / 180;
  // left = up × forward = −right
  const lx = -f.rx, ly = -f.ry, lz = -f.rz;
  b.fx = f.tx * Math.cos(a) + lx * Math.sin(a); b.fy = f.ty * Math.cos(a) + ly * Math.sin(a); b.fz = f.tz * Math.cos(a) + lz * Math.sin(a);
  b.nx = f.ux; b.ny = f.uy; b.nz = f.uz;
  const v = p.speed ?? 0;
  b.vx = b.fx * v; b.vy = b.fy * v; b.vz = b.fz * v;
  b.yawRate = 0; b.grounded = h > 0.05 ? 0 : 1; b.coyote = b.grounded ? 7 : 0; b.airTicks = b.grounded ? 0 : 1; b.wallContact = 0;
  T.locateGlobal(b.px, b.py, b.pz, k.race.loc);
  Object.assign(k.race.lastValid, k.race.loc);
  k.race.raceDist = k.race.loc.sMain;
  if (k.race.lap < 0 && k.race.loc.sMain > 0 && T.topology === 'p2p') k.race.lap = 0;
  return k;
}

/** Forward speed (along the nose) in display km/h. */
export const fwdKmh = (k: KartState): number => (k.body.vx * k.body.fx + k.body.vy * k.body.fy + k.body.vz * k.body.fz) * KMH;
/** |v| in m/s. */
export const speedOf = (k: KartState): number => Math.hypot(k.body.vx, k.body.vy, k.body.vz);

/** Runs `n` ticks with a per-tick input function for slot 0 (and optional others). */
export function drive(rig: Rig, n: number, fn: (w: WorldState, inp: InputFrame[], t: number) => void): void {
  const t0 = rig.w.tick;
  rig.run(n, (w, inp) => fn(w, inp, w.tick - t0));
}

/** Integer steer for a sim-convention (+ = left) steer value in [−1, 1]. */
export const steerLeft = (s: number): number => Math.round(-Math.max(-1, Math.min(1, s)) * 127);
