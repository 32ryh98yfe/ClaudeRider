// Visual correction smoothing (20-netcode-spec §7.4): when a rollback moves a kart, the renderer keeps drawing it where
// it was and a critically damped spring pulls that offset back to zero (120 ms remote, 80 ms local). Offsets of 4 m or
// more snap (respawn, warp, resync).
import { MAX_KARTS } from '@cr/sim';

export class VisualSmoother {
  readonly x = new Float64Array(MAX_KARTS);
  readonly y = new Float64Array(MAX_KARTS);
  readonly z = new Float64Array(MAX_KARTS);
  readonly yaw = new Float64Array(MAX_KARTS);
  private vx = new Float64Array(MAX_KARTS);
  private vy = new Float64Array(MAX_KARTS);
  private vz = new Float64Array(MAX_KARTS);
  private vyaw = new Float64Array(MAX_KARTS);
  localSlot: number;
  remoteTau: number;
  localTau: number;
  snapM: number;
  snaps = 0;

  constructor(localSlot: number, o: { remoteMs?: number; localMs?: number; snapM?: number } = {}) {
    this.localSlot = localSlot;
    this.remoteTau = (o.remoteMs ?? 120) / 1000;
    this.localTau = (o.localMs ?? 80) / 1000;
    this.snapM = o.snapM ?? 4;
  }

  /** Adds a correction (old drawn pose − new predicted pose). */
  add(slot: number, dx: number, dy: number, dz: number, dyaw: number): void {
    const x = this.x[slot]! + dx, y = this.y[slot]! + dy, z = this.z[slot]! + dz;
    if (x * x + y * y + z * z >= this.snapM * this.snapM) { this.reset(slot); this.snaps++; return; }
    this.x[slot] = x; this.y[slot] = y; this.z[slot] = z;
    let a = this.yaw[slot]! + dyaw;
    if (a > Math.PI) a -= 2 * Math.PI; else if (a < -Math.PI) a += 2 * Math.PI;
    this.yaw[slot] = Math.abs(a) > 1.2 ? 0 : a;
  }

  reset(slot: number): void {
    this.x[slot] = 0; this.y[slot] = 0; this.z[slot] = 0; this.yaw[slot] = 0;
    this.vx[slot] = 0; this.vy[slot] = 0; this.vz[slot] = 0; this.vyaw[slot] = 0;
  }

  resetAll(): void { for (let s = 0; s < MAX_KARTS; s++) this.reset(s); }

  /** Advances every spring by `dtSec` (exact critically damped solution). */
  update(dtSec: number): void {
    if (dtSec <= 0) return;
    for (let s = 0; s < MAX_KARTS; s++) {
      const w = 1 / (s === this.localSlot ? this.localTau : this.remoteTau);
      const e = Math.exp(-w * dtSec);
      this.x[s] = spring(this.x[s]!, this.vx, s, w, dtSec, e);
      this.y[s] = spring(this.y[s]!, this.vy, s, w, dtSec, e);
      this.z[s] = spring(this.z[s]!, this.vz, s, w, dtSec, e);
      this.yaw[s] = spring(this.yaw[s]!, this.vyaw, s, w, dtSec, e);
    }
  }

  magnitude(slot: number): number { return Math.sqrt(this.x[slot]! ** 2 + this.y[slot]! ** 2 + this.z[slot]! ** 2); }
}

function spring(x0: number, vel: Float64Array, s: number, w: number, t: number, e: number): number {
  if (x0 === 0 && vel[s] === 0) return 0;
  const v0 = vel[s]!;
  const c = v0 + w * x0;
  const x = (x0 + c * t) * e;
  vel[s] = (v0 - w * c * t) * e;
  if (Math.abs(x) < 1e-6 && Math.abs(vel[s]!) < 1e-5) { vel[s] = 0; return 0; }
  return x;
}
