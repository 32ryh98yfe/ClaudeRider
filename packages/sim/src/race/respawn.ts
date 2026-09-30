// Respawn sequence (ADR-004, 10-sim-spec §12.6):
//   t0       trigger: respawnPhase 1, inputs ignored, physics continues (the kart may keep falling)
//   t0 + 24  placed on the last valid main-line sample (centreline, facing the tangent, v = 0), phase 2, frozen
//   t0 + 54  control returns (phase 0)
//   t0 + 144 kart–kart contacts resume (ghost 120 ticks from placement)
// Cancelled: active boosts, the drift and the draft. Kept: stored boosters, gauge and items.
import { NEUTRAL_INPUT } from '../core/input.ts';
import { Attach, Boost, type KartState, type WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import { copyLoc } from '../track/BakedTrack.ts';
import { evKey } from '../kart/evkey.ts';
import { paramsFor } from '../kart/params.ts';
import { kartDynamics, type DynamicsIn } from '../kart/dynamics.ts';
import { halfStep, type MotionState } from '../kart/motion.ts';
import { teamSizeOf } from '../kart/gauge.ts';

export const RESPAWN_FADE = 24, RESPAWN_LOCK = 30, RESPAWN_GHOST = 120, MANUAL_COOLDOWN = 180;
/** After a manual reset the kart is held to SLOW_CAP·vGrip for this many ticks once control returns [P]. */
export const MANUAL_SLOW_TICKS = 60;

const POSE = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };
const MS: MotionState = { impactThisTick: false, contactThisTick: false, tx: 0, ty: 0, tz: 1 };
const DYN: DynamicsIn = { gaugeOn: true, infinite: false, itemMode: false, instantAllowed: true, racing: true, teamSize: 1 };

export function startRespawn(w: WorldState, k: KartState, ctx: StepContext): void {
  const r = k.race;
  if (r.respawnPhase !== 0) return;
  // step() arms the manual-R cooldown right before calling us; an automatic trigger never touches it this tick
  const manual = r.manualCooldownUntil === w.tick + MANUAL_COOLDOWN;
  r.respawnPhase = 1;
  r.respawnUntil = w.tick + RESPAWN_FADE;
  r.slowTicks = manual ? MANUAL_SLOW_TICKS : 0;
  k.stats.respawns++;
  const b = k.body;
  if (b.attachKind !== Attach.NONE) { b.attachKind = Attach.NONE; b.attachId = 0; b.attachS = 0; b.attachT = 0; }
  ctx.events.push({ t: 'respawn', kart: k.slot, phase: 'out', tick: w.tick, key: evKey(w.tick, 50, k.slot) });
}

/** Called in phase 3 for karts with respawnPhase ≠ 0 (step() skips their normal dynamics and move). */
export function updateRespawn(w: WorldState, k: KartState, ctx: StepContext): void {
  const r = k.race, b = k.body, d = k.drive;
  if (r.respawnPhase === 1 && w.tick >= r.respawnUntil) {
    ctx.track.respawnPose(r.lastValid, POSE);
    const f = ctx.scratch.frame;
    ctx.track.frameAt(r.lastValid.path, r.lastValid.s, f);
    b.px = POSE.x + f.ux * 0.05; b.py = POSE.y + f.uy * 0.05; b.pz = POSE.z + f.uz * 0.05;
    b.fx = POSE.fx; b.fy = POSE.fy; b.fz = POSE.fz;
    b.nx = f.ux; b.ny = f.uy; b.nz = f.uz;
    b.vx = 0; b.vy = 0; b.vz = 0; b.yawRate = 0;
    b.grounded = 1; b.coyote = 7; b.airTicks = 0; b.wallContact = 0;
    b.ghostTicks = RESPAWN_GHOST;
    d.drift = 0; d.driftDir = 1; d.driftTicks = 0; d.driftPeak = 0;
    d.boostTicks = 0; d.boostKind = Boost.NONE; d.instTicks = 0; d.instWindow = 0; d.startTicks = 0; d.stunTicks = 0; d.wheelspinTicks = 0;
    d.draftCharge = 0; d.draftTicks = 0; d.lowSpeedTicks = 0;
    copyLoc(r.loc, r.lastValid);
    r.wrongWayTicks = 0; r.offGraphTicks = 0; r.noGroundTicks = 0;
    r.respawnPhase = 2;
    r.respawnUntil = w.tick + RESPAWN_LOCK;
    ctx.events.push({ t: 'respawn', kart: k.slot, phase: 'in', tick: w.tick, key: evKey(w.tick, 51, k.slot) });
  } else if (r.respawnPhase === 2 && w.tick >= r.respawnUntil) {
    r.respawnPhase = 0;
    r.respawnUntil = 0;
  } else if (r.respawnPhase === 1) {
    fadePhysics(w, k, ctx);
  }
}

/**
 * While fading out the kart keeps moving under neutral input (it may keep falling into the void). It cannot
 * interact with other karts (contacts and draft skip respawning karts), so moving it here instead of in the shared
 * phase-4 loop gives the same result.
 */
function fadePhysics(w: WorldState, k: KartState, ctx: StepContext): void {
  const spec = ctx.content.karts.byCode[k.spec];
  if (!spec) return;
  const P = paramsFor(spec), cfg = ctx.cfg;
  DYN.gaugeOn = cfg.mode !== 'item'; DYN.infinite = cfg.mode === 'infinite'; DYN.itemMode = cfg.mode === 'item';
  DYN.instantAllowed = cfg.rules.instantBoostInItem; DYN.racing = true; DYN.teamSize = teamSizeOf(cfg.teams);
  const prevT = k.drive.prevThrottle, prevH = k.drive.prevHeld;
  kartDynamics(w, k, NEUTRAL_INPUT, P, ctx, ctx.scratch.mods[k.slot]!, ctx.content.surfaceByCode[k.body.surf], DYN);
  k.drive.prevThrottle = prevT; k.drive.prevHeld = prevH; // step() latches the real input for this tick
  const f = ctx.scratch.frame2;
  ctx.track.frameAt(k.race.loc.path, k.race.loc.s, f);
  MS.impactThisTick = false; MS.contactThisTick = false; MS.tx = f.tx; MS.ty = f.ty; MS.tz = f.tz;
  halfStep(w, k, P, ctx, MS);
  halfStep(w, k, P, ctx, MS);
}
