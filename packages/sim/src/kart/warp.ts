// Warps (10-sim-spec §13.4, WarpBaked): crossing a warp gate on its path puts the kart in transit — hidden,
// ghosted, frozen at the gate — for transitTicks, then places it at the exit facing the exit tangent.
// State: KartBody.attachKind = WARP, attachId = warp index, attachT = transit ticks so far, attachS = entry speed.
import { Attach, type KartState, type TrackLoc, type WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import type { FrameSample } from '../track/BakedTrack.ts';
import { evKey } from './evkey.ts';
import { clearDriftTech } from './tech.ts';

const F: FrameSample = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
const GUESS: TrackLoc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 };

/** Exit speed when a warp does not keep the entry speed (m/s). */
export const WARP_EXIT_SPEED = 25.5;
/** Kart–kart contacts stay off for a moment after the exit so a queue of karts cannot stack up [P]. */
export const WARP_EXIT_GHOST = 30;

/**
 * Phase 7: entry test after the kart's location was accepted. `prevS` is the path s before this tick's move.
 * Returns true when the kart entered a warp this tick.
 */
export function tryEnterWarp(w: WorldState, k: KartState, ctx: StepContext, prevPath: number, prevS: number): boolean {
  const T = ctx.track, warps = T.warps, loc = k.race.loc, b = k.body;
  if (!warps.length || b.attachKind !== Attach.NONE) return false;
  for (let i = 0; i < warps.length; i++) {
    const W = warps[i]!;
    if (loc.path !== W.path || prevPath !== W.path) continue;
    let ds = loc.s - prevS;
    const pm = T.path(W.path);
    if (pm.closed) { if (ds > pm.length / 2) ds -= pm.length; else if (ds < -pm.length / 2) ds += pm.length; }
    if (ds <= 0) continue;
    // crossed the gate this tick: its s lies in (prevS, prevS + ds], modulo the length on closed paths
    let rel = W.s - prevS;
    if (pm.closed) rel -= pm.length * Math.floor(rel / pm.length);
    if (!(rel > 0 && rel <= ds)) continue;
    if (loc.u < W.u0 || loc.u > W.u1 || loc.h > W.hMax) continue;
    const d = k.drive;
    if (d.drift === 1) {
      d.drift = 0; d.driftDir = 1; d.driftTicks = 0; d.driftPeak = 0; d.reDriftLock = 6;
      ctx.events.push({ t: 'driftEnd', kart: k.slot, tick: w.tick, key: evKey(w.tick, 4, k.slot) });
    }
    clearDriftTech(w, k, ctx);
    b.attachKind = Attach.WARP; b.attachId = i; b.attachT = 0;
    b.attachS = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
    b.vx = 0; b.vy = 0; b.vz = 0; b.yawRate = 0;
    if (b.ghostTicks < W.transitTicks + 1) b.ghostTicks = W.transitTicks + 1;
    return true;
  }
  return false;
}

/**
 * Phase 7 while in transit: counts transit ticks; on the last one places the kart at the exit and relocates it.
 * Returns true on the exit tick (the caller then runs lap bookkeeping from the old to the new progress).
 */
export function updateWarp(w: WorldState, k: KartState, ctx: StepContext): boolean {
  const T = ctx.track, b = k.body, W = T.warps[b.attachId];
  if (!W) { b.attachKind = Attach.NONE; return false; }
  b.attachT++;
  if (b.attachT < W.transitTicks) return false;
  T.frameAt(W.exitPath, W.exitS, F);
  const sp = W.keepSpeed ? b.attachS : WARP_EXIT_SPEED;
  b.px = F.px + F.rx * W.exitU; b.py = F.py + F.ry * W.exitU; b.pz = F.pz + F.rz * W.exitU;
  b.fx = F.tx; b.fy = F.ty; b.fz = F.tz;
  b.nx = F.ux; b.ny = F.uy; b.nz = F.uz;
  b.vx = F.tx * sp; b.vy = F.ty * sp; b.vz = F.tz * sp;
  b.yawRate = 0; b.grounded = 1; b.coyote = 7; b.airTicks = 0;
  b.attachKind = Attach.NONE; b.attachId = 0; b.attachS = 0; b.attachT = 0;
  if (b.ghostTicks < WARP_EXIT_GHOST) b.ghostTicks = WARP_EXIT_GHOST;
  relocate(k, ctx, W.exitPath, W.exitS);
  return true;
}

/** Sets race.loc from a known (path, s) near the kart: graph-local search seeded there, global search as fallback. */
export function relocate(k: KartState, ctx: StepContext, path: number, s: number): void {
  const T = ctx.track, b = k.body, pm = T.path(path);
  GUESS.path = path; GUESS.s = s; GUESS.valid = 1;
  let i = Math.floor(s / pm.ds); if (i > pm.n - 2) i = pm.n - 2; if (i < 0) i = 0;
  GUESS.i = i;
  const loc = k.race.loc;
  if (!T.locate(b.px, b.py, b.pz, GUESS, loc)) T.locateGlobal(b.px, b.py, b.pz, loc);
}
