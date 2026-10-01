// Helpers for physics scenarios: race-ready rigs on fixtures, kart placement, speed readouts.
import { Gear, KMH_PER_MPS, StartTier, type BakedTrack, type FrameSample, type InputFrame, type KartState, type WorldState } from '@cr/sim';
import { makeRig, type Rig, type RigOptions } from './rig.ts';

/** Display km/h per m/s (M5, doc 15 §1: vGrip 34 m/s reads 205 km/h). */
export const KMH = KMH_PER_MPS;
/** The validated gap-2 display scale (3.6 × 1.5): rows pinned to gap-2 numbers keep them on this scale (doc 15 §1). */
export const KMH_GAP2 = 5.4;
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
  // a kart moving along its nose is in drive (doc 15 §4.8): left in STOP, the zero-lock would hold it at 0
  k.drive.gear = v > 0 ? Gear.D : v < 0 ? Gear.R : Gear.STOP;
  b.yawRate = 0; b.grounded = h > 0.05 ? 0 : 1; b.coyote = b.grounded ? 7 : 0; b.airTicks = b.grounded ? 0 : 1; b.wallContact = 0;
  // the surface under the kart, as the first ground contact would report it
  const hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
  if (T.groundRay(b.px + b.nx, b.py + b.ny, b.pz + b.nz, -b.nx, -b.ny, -b.nz, 2 + h, hit)) b.surf = hit.surf;
  T.locateGlobal(b.px, b.py, b.pz, k.race.loc);
  Object.assign(k.race.lastValid, k.race.loc);
  k.race.raceDist = k.race.loc.sMain;
  const r = k.race;
  r.noGroundTicks = 0; r.offGraphTicks = 0; r.wrongWayTicks = 0; r.respawnPhase = 0; r.respawnUntil = 0;
  b.attachKind = 0; b.attachId = 0; b.attachS = 0; b.attachT = 0;
  if (k.race.lap < 0 && k.race.loc.sMain > 0 && T.topology === 'p2p') k.race.lap = 0;
  return k;
}

/** Forward speed (along the nose) in display km/h; pass `KMH_GAP2` for rows pinned to the gap-2 scale. */
export const fwdKmh = (k: KartState, scale: number = KMH): number => (k.body.vx * k.body.fx + k.body.vy * k.body.fy + k.body.vz * k.body.fz) * scale;
/** |v| in m/s. */
export const speedOf = (k: KartState): number => Math.hypot(k.body.vx, k.body.vy, k.body.vz);

/** Runs `n` ticks with a per-tick input function for slot 0 (and optional others). */
export function drive(rig: Rig, n: number, fn: (w: WorldState, inp: InputFrame[], t: number) => void): void {
  const t0 = rig.w.tick;
  rig.run(n, (w, inp) => fn(w, inp, w.tick - t0));
}

/** Integer steer for a sim-convention (+ = left) steer value in [−1, 1]. */
export const steerLeft = (s: number): number => Math.round(-Math.max(-1, Math.min(1, s)) * 127);

/**
 * Pure pursuit in the kart's own tangent plane (works upside down in loops and on walls): aims at the point
 * `L` m ahead on (path, s) at lateral offset `u`; returns a sim-convention steer (+ = left).
 */
export function pursue3d(T: BakedTrack, k: KartState, L: number, u = 0, path = k.race.loc.path): number {
  const f = FS(), b = k.body;
  T.frameAt(path, k.race.loc.s + L, f);
  const dx = f.px + f.rx * u - b.px, dy = f.py + f.ry * u - b.py, dz = f.pz + f.rz * u - b.pz;
  const lx = b.ny * b.fz - b.nz * b.fy, ly = b.nz * b.fx - b.nx * b.fz, lz = b.nx * b.fy - b.ny * b.fx;
  const fwd = dx * b.fx + dy * b.fy + dz * b.fz, lat = dx * lx + dy * ly + dz * lz;
  const dist = Math.max(1, Math.hypot(fwd, lat));
  const kappa = (2 * Math.sin(Math.atan2(lat, fwd))) / dist;
  const v = Math.max(1, Math.hypot(b.vx, b.vy, b.vz));
  // grip yaw gain of the Balance kart: 1.55·v/(v+4)/(1+(v/33.5)²)
  const g = (1.55 * v) / (v + 4) / (1 + (v / 33.5) * (v / 33.5));
  return Math.max(-1, Math.min(1, (kappa * v) / g));
}
