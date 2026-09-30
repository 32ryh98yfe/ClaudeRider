// tether_pull (§2.2.2): the user is pulled toward the target — steering replaced by pursuit, throttle forced on, boost
// law toward vT = max(1.2·V_REF, min(1.25·u_target, V_BOOST)). Ends early with a slingshot when the user is within 4 m
// behind the target; without one when wall-blocked for > 18 ticks, the target warps, finishes or retires, the user
// respawns [P], or a pulse from the target side clears it. Param: target slot (bits 0–3) | 16 | wall-blocked ticks << 5.
import type { EffectInstance } from '../../core/state.ts';
import { DT, V_BOOST, V_REF } from '../../core/units.ts';
import type { EffectBehavior } from '../behavior.ts';
import { EFlag } from '../codes.ts';
import { planarSpeed } from '../effects.ts';
import { setPlanarSpeed, steerToward } from '../kinematics.ts';
import { inRace, inWarp } from '../team.ts';

export const TETHER_SLINGSHOT_M = 4, TETHER_WALL_TICKS = 18;
const MAX_TURN = 0.05; // rad per tick (3 rad/s): the pull bends the user's path hard but not instantly

export const tetherTarget = (e: Readonly<EffectInstance>): number => e.param & 15;

const behavior: EffectBehavior = {
  onStart(w, e) {
    const k = w.karts[e.victim]!;
    k.drive.drift = 0; k.drive.driftTicks = 0; k.drive.driftPeak = 0; k.drive.driftDir = 1;
    const t = w.karts[tetherTarget(e)];
    if (!t || !inRace(t) || inWarp(t)) e.flags |= EFlag.ENDED;
  },
  onTick(w, e, k, ctx) {
    const t = w.karts[tetherTarget(e)];
    // the user respawning (teleported) or the target warping/finishing breaks the tether without a slingshot
    if (!t || !inRace(t) || inWarp(t) || !inRace(k) || k.race.respawnPhase !== 0) { e.flags |= EFlag.ENDED; return; }
    const a = k.body, b = t.body;
    const dx = b.px - a.px, dy = b.py - a.py, dz = b.pz - a.pz;
    const along = dx * b.fx + dy * b.fy + dz * b.fz;          // > 0: the user is behind the target
    const lx = dx - along * b.fx, ly = dy - along * b.fy, lz = dz - along * b.fz;
    if (along <= TETHER_SLINGSHOT_M && along >= -TETHER_SLINGSHOT_M && lx * lx + ly * ly + lz * lz <= 16) { e.flags |= EFlag.ENDED | EFlag.PROXIMITY; return; }
    let wall = (e.param >> 5) & 0xff;
    wall = a.wallContact ? wall + 1 : 0;
    if (wall > TETHER_WALL_TICKS) { e.flags |= EFlag.ENDED; return; }
    e.param = (e.param & 31) | (wall << 5);
    // boost law toward the pull speed (the bot vMul / effect caps still apply through vCapMul)
    const ut = planarSpeed(t);
    let vT = 1.25 * ut;
    if (vT > V_BOOST) vT = V_BOOST;
    if (vT < 1.2 * V_REF) vT = 1.2 * V_REF;
    vT *= ctx.scratch.mods[k.slot]?.vCapMul ?? 1;
    const u = planarSpeed(k);
    let acc = u < vT ? 4 * (vT - u) : -0.9 * (u - vT);
    if (acc > 25) acc = 25;
    const turned = steerToward(k, dx, dy, dz, MAX_TURN);
    a.yawRate = turned / DT;
    // velocity follows the (new) nose: pursuit, not drift
    const vn = a.vx * a.nx + a.vy * a.ny + a.vz * a.nz;
    a.vx = a.fx * u + a.nx * vn; a.vy = a.fy * u + a.ny * vn; a.vz = a.fz * u + a.nz * vn;
    setPlanarSpeed(k, u + acc * DT);
  },
  onEnd(_w, e) {
    return (e.flags & EFlag.PROXIMITY) !== 0; // the slingshot only follows a proximity release
  },
};

export default behavior;
