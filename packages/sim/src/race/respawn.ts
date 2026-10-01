// Respawn sequence (ADR-004, 10-sim-spec §12.6):
//   t0       trigger: respawnPhase 1, inputs ignored, physics continues (the kart may keep falling)
//   t0 + 24  placed on the last valid main-line sample (centreline, facing the tangent, v = 0), phase 2, frozen;
//            a kill inside a declared jump (J) span places the kart on the landing side instead (see gapRespawn)
//   t0 + 54  control returns (phase 0)
//   t0 + 144 kart–kart contacts resume (ghost 120 ticks from placement)
// Cancelled: active boosts (no post-boost bleed), the drift and its techniques, and the draft; the gear returns to
// STOP. Kept: stored boosters, gauge and items.
import { NEUTRAL_INPUT } from '../core/input.ts';
import { Attach, Boost, Gear, type KartState, type TrackLoc, type WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import { copyLoc } from '../track/BakedTrack.ts';
import { evKey } from '../kart/evkey.ts';
import { clearDriftTech, setGear } from '../kart/tech.ts';
import { paramsFor } from '../kart/params.ts';
import { kartDynamics, type DynamicsIn } from '../kart/dynamics.ts';
import { halfStep, type MotionState } from '../kart/motion.ts';
import { teamSizeOf } from '../kart/gauge.ts';
import { advanceLaps } from './progress.ts';

export const RESPAWN_FADE = 24, RESPAWN_LOCK = 30, RESPAWN_GHOST = 120, MANUAL_COOLDOWN = 180;
/** After a manual reset the kart is held to SLOW_CAP·vGrip for this many ticks once control returns [P]. */
export const MANUAL_SLOW_TICKS = 60;

const POSE = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };
const MS: MotionState = { impactThisTick: false, contactThisTick: false, tx: 0, ty: 0, tz: 1 };
const KILLED_AT: TrackLoc = { path: 0, i: 0, s: 0, u: 0, h: 0, sMain: 0, valid: 0 };
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
    // race.loc still holds the last accepted location (progress is frozen while respawning)
    copyLoc(KILLED_AT, r.loc);
    const forward = gapRespawn(k, ctx);
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
    clearDriftTech(w, k, ctx); // drag, taps, cut and brake counters (brakeTicks = 0)
    d.postTicks = 0;
    setGear(w, k, ctx, Gear.STOP);
    d.draftCharge = 0; d.draftTicks = 0; d.lowSpeedTicks = 0;
    // the placed sample may be one the track walked back to (respawn-ok slots, .ctrk v2)
    if (ctx.track.respawnLoc) ctx.track.respawnLoc(r.lastValid, r.loc); else copyLoc(r.loc, r.lastValid);
    // moved forward past a gap: credit the key gates (and a lap line) between the kill and the landing side
    if (forward) advanceLaps(w, k, ctx, KILLED_AT.sMain, r.loc.sMain, ctx.track.lapLength);
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
 * A kart killed inside a declared jump span (from 5 m before the lip to 10 m past the landing, the span in which
 * lastValid is never updated) respawns on the landing side, 15 m into the landing zone (at most half its length).
 * Otherwise it would be placed ≥ 60 m before the lip at v = 0, and a kart that cannot reach the jump's vMin from
 * there falls into the gap again: a respawn loop. Writes lastValid; returns true when it moved the kart forward.
 */
function gapRespawn(k: KartState, ctx: StepContext): boolean {
  const T = ctx.track, J = T.jumps, loc = KILLED_AT;
  for (let n = 0; n < J.length; n++) {
    const j = J[n]!;
    if (j.path !== loc.path || loc.s < j.lipS - 5 || loc.s > j.landS1 + 10) continue;
    const pm = T.path(j.path);
    let s = j.landS0 + (j.landS1 - j.landS0 < 30 ? 0.5 * (j.landS1 - j.landS0) : 15);
    if (s > pm.length) s = pm.closed ? s - pm.length : pm.length;
    const lv = k.race.lastValid;
    let i = Math.floor(s / pm.ds); if (i > pm.n - 2) i = pm.n - 2; if (i < 0) i = 0;
    lv.path = j.path; lv.i = i; lv.s = s; lv.u = 0; lv.h = 0; lv.valid = 1;
    let sm = T.toMainS(j.path, s);
    if (T.topology === 'circuit' && sm >= T.lapLength) sm -= T.lapLength;
    lv.sMain = sm;
    return true;
  }
  return false;
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
