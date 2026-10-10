// Finish presentation remains simulated: brake for 0.8 s, retain real road/wall contact, then park.
import { Attach, Boost, Gear, type KartState, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import type { StepContext } from '../api.ts';
import type { KartParams } from '../kart/params.ts';
import { halfStep, type MotionState } from '../kart/motion.ts';
import { clearDriftTech } from '../kart/tech.ts';
import { EFlag } from '../items/codes.ts';

export const FINISH_BRAKE_TICKS = 48;
export const finishedKart = (k: Readonly<KartState>): boolean => k.race.finishTick >= 0 || k.race.retired === 1;
const PARK_POSE = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };

/** Clear driving forces, keeping earned inventory and race results. Safe to repeat after reconciliation. */
export function releaseFinishedDrive(w: WorldState, k: KartState, ctx: StepContext): void {
  const d = k.drive, s = k.status;
  clearDriftTech(w, k, ctx);
  d.drift = 0; d.driftDir = 1; d.driftTicks = 0; d.driftPeak = 0; d.reDriftLock = 0;
  d.boostTicks = 0; d.boostKind = Boost.NONE; d.startTicks = 0; d.instTicks = 0; d.instWindow = 0;
  d.postTicks = 0; d.draftTicks = 0; d.draftCharge = 0; d.wheelspinTicks = 0; d.stunTicks = 0;
  d.prevHeld = 0; d.prevThrottle = 0;
  s.cc = 0; s.ccEnd = w.tick; s.modMask = 0;
  for (const effect of w.effects) if (effect.victim === k.slot && (effect.flags & EFlag.RESOLVED)) effect.flags |= EFlag.DEAD;
  k.body.yawRate = 0;
  k.body.attachKind = Attach.NONE; k.body.attachId = 0; k.body.attachS = 0; k.body.attachT = 0;
}

export function brakeFinishedKart(w: WorldState, k: KartState, ctx: StepContext): void {
  releaseFinishedDrive(w, k, ctx);
  const b = k.body, end = k.race.finishTick >= 0 ? k.race.finishTick : w.endTick;
  if (k.race.respawnPhase !== 0 || !b.grounded && (b.py < ctx.track.killY || b.airTicks > 600)) {
    // A finisher over a void cannot land. Keep its result and park on the last compiled safe support,
    // rather than falling forever or re-enabling a respawn's driving phase after the race has ended.
    const r = k.race, frame = ctx.scratch.frame;
    ctx.track.respawnPose(r.lastValid, PARK_POSE);
    if (ctx.track.respawnLoc) ctx.track.respawnLoc(r.lastValid, r.loc);
    else { r.loc.path = r.lastValid.path; r.loc.s = r.lastValid.s; r.loc.i = r.lastValid.i; r.loc.u = r.lastValid.u; r.loc.h = r.lastValid.h; r.loc.sMain = r.lastValid.sMain; r.loc.valid = r.lastValid.valid; }
    ctx.track.frameAt(r.loc.path, r.loc.s, frame);
    b.px = PARK_POSE.x; b.py = PARK_POSE.y; b.pz = PARK_POSE.z;
    b.fx = PARK_POSE.fx; b.fy = PARK_POSE.fy; b.fz = PARK_POSE.fz;
    b.nx = frame.ux; b.ny = frame.uy; b.nz = frame.uz;
    b.vx = 0; b.vy = 0; b.vz = 0; b.grounded = 1; b.airTicks = 0; b.coyote = 7;
    r.respawnPhase = 0; r.respawnUntil = 0; r.slowTicks = 0;
  }
  const remaining = Math.max(0, FINISH_BRAKE_TICKS - Math.max(0, w.tick - end));
  const factor = remaining / (remaining + 1);
  if (b.grounded) {
    b.vx *= factor; b.vy *= factor; b.vz *= factor;
  } else {
    // Brake tangent motion while an airborne finisher completes its genuine landing.
    const g = ctx.scratch.grav, length = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z);
    const ux = length > 0 ? -g.x / length : b.nx, uy = length > 0 ? -g.y / length : b.ny, uz = length > 0 ? -g.z / length : b.nz;
    const vn = b.vx * ux + b.vy * uy + b.vz * uz;
    b.vx = (b.vx - ux * vn) * factor + ux * vn + g.x * DT;
    b.vy = (b.vy - uy * vn) * factor + uy * vn + g.y * DT;
    b.vz = (b.vz - uz * vn) * factor + uz * vn + g.z * DT;
  }
  k.drive.gear = b.vx === 0 && b.vy === 0 && b.vz === 0 ? Gear.STOP : Gear.N;
}

export function moveFinishedKart(w: WorldState, k: KartState, p: KartParams, ctx: StepContext, motion: MotionState): void {
  const b = k.body;
  if (b.grounded && b.vx === 0 && b.vy === 0 && b.vz === 0) return;
  if (b.grounded) {
    // A point-to-point finish may have no road beyond it. Stop on the last support instead of coasting off it.
    const dt = DT / 2;
    const supported = ctx.track.groundRay(b.px + b.vx * dt + b.nx, b.py + b.vy * dt + b.ny, b.pz + b.vz * dt + b.nz,
      -b.nx, -b.ny, -b.nz, 1.5, ctx.scratch.hit);
    if (!supported) { b.vx = 0; b.vy = 0; b.vz = 0; k.drive.gear = Gear.STOP; return; }
  }
  halfStep(w, k, p, ctx, motion);
  const r = k.race, loc = ctx.scratch.loc;
  if (ctx.track.locate(b.px, b.py, b.pz, r.loc, loc)) {
    r.loc.path = loc.path; r.loc.i = loc.i; r.loc.s = loc.s; r.loc.u = loc.u; r.loc.h = loc.h; r.loc.sMain = loc.sMain; r.loc.valid = loc.valid;
  }
}
