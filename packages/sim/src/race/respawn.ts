// Respawn sequence (ADR-004): fade 24 ticks → place on last valid sample (v=0) → control lock 30 → ghost 120.
import { Boost, type KartState, type WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import { copyLoc } from '../track/BakedTrack.ts';
import { evKey } from '../kart/evkey.ts';

export const RESPAWN_FADE = 24, RESPAWN_LOCK = 30, RESPAWN_GHOST = 120, MANUAL_COOLDOWN = 180;

export function startRespawn(w: WorldState, k: KartState, ctx: StepContext): void {
  const r = k.race;
  if (r.respawnPhase !== 0) return;
  r.respawnPhase = 1;
  r.respawnUntil = w.tick + RESPAWN_FADE;
  k.stats.respawns++;
  ctx.events.push({ t: 'respawn', kart: k.slot, phase: 'out', tick: w.tick, key: evKey(w.tick, 50, k.slot) });
}

export function updateRespawn(w: WorldState, k: KartState, ctx: StepContext): void {
  const r = k.race, b = k.body, d = k.drive;
  if (r.respawnPhase === 1 && w.tick >= r.respawnUntil) {
    const pose = POSE;
    // place on the respawn sample, not the death point: locate and the anti-cut window restart from there (L4-respawn-jumps)
    if (ctx.track.respawnLoc) { ctx.track.respawnLoc(r.lastValid, r.loc); copyLoc(r.lastValid, r.loc); } else copyLoc(r.loc, r.lastValid);
    ctx.track.respawnPose(r.lastValid, pose);
    b.px = pose.x; b.py = pose.y + 0.05; b.pz = pose.z;
    b.fx = pose.fx; b.fy = pose.fy; b.fz = pose.fz;
    b.vx = 0; b.vy = 0; b.vz = 0; b.yawRate = 0;
    b.nx = 0; b.ny = 1; b.nz = 0; b.grounded = 1; b.airTicks = 0; b.wallContact = 0;
    const f = ctx.scratch.frame;
    ctx.track.frameAt(r.lastValid.path, r.lastValid.s, f);
    b.nx = f.ux; b.ny = f.uy; b.nz = f.uz;
    b.ghostTicks = RESPAWN_GHOST + RESPAWN_LOCK;
    d.drift = 0; d.driftTicks = 0; d.boostTicks = 0; d.boostKind = Boost.NONE; d.instTicks = 0; d.instWindow = 0; d.startTicks = 0; d.stunTicks = 0;
    d.draftCharge = 0; d.draftTicks = 0;
    r.wrongWayTicks = 0; r.offGraphTicks = 0; r.noGroundTicks = 0;
    r.respawnPhase = 2;
    r.respawnUntil = w.tick + RESPAWN_LOCK;
    ctx.events.push({ t: 'respawn', kart: k.slot, phase: 'in', tick: w.tick, key: evKey(w.tick, 51, k.slot) });
  } else if (r.respawnPhase === 2 && w.tick >= r.respawnUntil) {
    r.respawnPhase = 0;
  }
}

const POSE = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: 1 };
