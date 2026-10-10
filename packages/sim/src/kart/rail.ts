// Rails (10-sim-spec §13.3, RailBaked): a kart that meets a rail close enough, aligned and fast enough locks onto
// it and grinds along the rail path's centreline at the rail speed law, then leaves along the exit tangent.
// State: KartBody.attachKind = RAIL, attachId = rail index, attachS = arc length on the rail path, attachT = ticks.
import { Attach, type KartState, type TrackLoc, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import type { StepContext } from '../api.ts';
import type { FrameSample } from '../track/BakedTrack.ts';
import type { KartParams } from './params.ts';
import type { DynamicsIn } from './dynamics.ts';
import { addGauge, GaugeSrc } from './gauge.ts';
import { trackInfo } from './trackinfo.ts';
import { evKey } from './evkey.ts';
import { clearDriftTech } from './tech.ts';

const F: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };

/** Speed along the rail after the per-tick law u ← min(max, max(min, u) + accel·DT). */
function railSpeed(u: number, min: number, accel: number, max: number): number {
  const v = (u > min ? u : min) + accel * DT;
  return v < max ? v : max;
}

/**
 * Phase 7: capture test (|d| ≤ dMax, heading within the capture cone, |v| ≥ vMin, grounded, no hard CC).
 * Returns true if the kart locked on.
 */
export function tryCaptureRail(w: WorldState, k: KartState, ctx: StepContext): boolean {
  const T = ctx.track, rails = T.rails, b = k.body, loc = k.race.loc;
  if (!rails.length || b.attachKind !== Attach.NONE || !b.grounded || k.status.cc !== 0 || ctx.scratch.mods[k.slot]!.noControl) return false;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  const cosTab = trackInfo(T).railCos;
  for (let r = 0; r < rails.length; r++) {
    const R = rails[r]!;
    if (loc.path !== R.host || sp < R.vMin) continue;
    const span = R.toS - R.fromS;
    if (!(span > 0) || loc.s < R.fromS - 2 || loc.s > R.toS - 4) continue;
    const Lr = T.path(R.path).length;
    // affine guess, then three projection steps onto the rail polyline
    let sr = ((loc.s - R.fromS) / span) * Lr;
    for (let it = 0; it < 3; it++) {
      T.frameAt(R.path, sr, F);
      sr += (b.px - F.px) * F.tx + (b.py - F.py) * F.ty + (b.pz - F.pz) * F.tz;
      sr = sr < 0 ? 0 : sr > Lr ? Lr : sr;
    }
    T.frameAt(R.path, sr, F);
    const dx = b.px - F.px, dy = b.py - F.py, dz = b.pz - F.pz;
    if (dx * dx + dy * dy + dz * dz > R.captureDMax * R.captureDMax) continue;
    if (b.fx * F.tx + b.fy * F.ty + b.fz * F.tz < cosTab[r]!) continue;
    if (sr > Lr - 1) continue;
    // lock on: the drift ends, the kart snaps onto the rail at its current along-rail speed (clamped to the law)
    const d = k.drive;
    if (d.drift === 1) {
      d.drift = 0; d.driftDir = 1; d.driftTicks = 0; d.driftPeak = 0; d.reDriftLock = 6;
      ctx.events.push({ t: 'driftEnd', kart: k.slot, tick: w.tick, key: evKey(w.tick, 4, k.slot) });
    }
    clearDriftTech(w, k, ctx);
    b.attachKind = Attach.RAIL; b.attachId = r; b.attachS = sr; b.attachT = 0;
    const u0 = b.vx * F.tx + b.vy * F.ty + b.vz * F.tz;
    const u = u0 < R.speedMin ? R.speedMin : u0 > R.speedMax ? R.speedMax : u0;
    snap(k, u);
    return true;
  }
  return false;
}

/** Places the kart on the rail frame F with speed u along the tangent. */
function snap(k: KartState, u: number): void {
  const b = k.body;
  b.px = F.px; b.py = F.py; b.pz = F.pz;
  b.fx = F.tx; b.fy = F.ty; b.fz = F.tz;
  b.nx = F.ux; b.ny = F.uy; b.nz = F.uz;
  b.vx = F.tx * u; b.vy = F.ty * u; b.vz = F.tz * u;
  b.yawRate = 0; b.grounded = 1; b.airTicks = 0;
}

/** Phase 3 for a railed kart: rail speed law and gauge gain; no steering, drift or thrust. */
export function railDynamics(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, opt: Readonly<DynamicsIn>): void {
  const b = k.body, T = ctx.track, R = T.rails[b.attachId];
  if (!R) { b.attachKind = Attach.NONE; return; }
  T.frameAt(R.path, b.attachS, F);
  const u = railSpeed(b.vx * F.tx + b.vy * F.ty + b.vz * F.tz, R.speedMin, R.accel, R.speedMax);
  snap(k, u);
  b.attachT++;
  if (opt.gaugeOn && R.gaugePerSec > 0) addGauge(w, k, R.gaugePerSec * DT, GaugeSrc.BONUS, opt.teamSize, ctx);
  void P;
}

/**
 * Phase 4 half-step for a railed kart: advance along the rail; at its end, release along the exit tangent at rail
 * speed. The kart stays marked grounded so the next ground ray decides whether it lands or falls.
 */
export function railHalfStep(k: KartState, ctx: StepContext): void {
  const b = k.body, T = ctx.track, R = T.rails[b.attachId];
  if (!R) { b.attachKind = Attach.NONE; return; }
  const u = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  const Lr = T.path(R.path).length;
  b.attachS += u * (DT / 2);
  if (b.attachS >= Lr) {
    T.frameAt(R.path, Lr, F);
    snap(k, u);
    b.attachKind = Attach.NONE; b.attachId = 0; b.attachS = 0; b.attachT = 0;
    b.coyote = 7;
    return;
  }
  T.frameAt(R.path, b.attachS, F);
  snap(k, u);
}

/** Track location of a railed kart (the rail path maps affinely onto its host's progress). */
export function railLoc(k: Readonly<KartState>, ctx: StepContext, out: TrackLoc): void {
  const b = k.body, T = ctx.track, R = T.rails[b.attachId]!;
  T.frameAt(R.path, b.attachS, F);
  const pm = T.path(R.path);
  let i = Math.floor(b.attachS / pm.ds);
  if (i > pm.n - 2) i = pm.n - 2; if (i < 0) i = 0;
  out.path = R.path; out.i = i; out.s = b.attachS; out.u = 0; out.h = 0; out.sMain = F.sMain; out.valid = 1;
}
