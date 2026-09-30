// Track hazards (10-sim-spec §13.6), phase 5. A hazard's pose is the analytic BakedTrack.hazardPose(id, tick), so no
// hazard state is stored. A kart whose wall sphere touches a live hazard is hit through L2's effect runtime
// (scheduleEffect + resolveEffect, source 255, EFlag.HAZARD so shields and halos never block it), which applies the
// hard-CC refresh and 36-tick immunity rules:
//   launch (geyser)   airborne 66 ticks
//   squash (press)    stun 45 ticks, speed ×0.3 at contact
//   spin   (train)    spin 60 ticks + 8 m/s push away from the hazard
//   spin   (traffic)  spin 60 ticks + 6 m/s push
//   spin   (swinger)  spin 60 ticks
//   block             solid: the kart is pushed out and loses its speed into the hazard (no effect)
// No double hits: while a kart's hard CC comes from a track hazard, or while it is immune, track hazards skip it (the
// CC outlasts every contact; skipping an immune kart only saves a stream of `immune` results for the same contact).
import { Attach, type KartState, type WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import type { HazardPose } from '../track/BakedTrack.ts';
import type { HazardDefBaked } from '../track/format.ts';
import { KART_CY, KART_R } from '../kart/motion.ts';
import { EF, EFlag, Res } from '../items/codes.ts';
import { resolveEffect, scheduleEffect } from '../items/effects.ts';
import { mix4 } from '../items/ids.ts';
import { inRace } from '../items/team.ts';

/** Effect source of every track hazard hit. */
export const TRACK_SOURCE = 255;
export const SQUASH_TICKS = 45, SQUASH_SPEED_MUL = 0.3, TRAIN_PUSH = 8, TRAFFIC_PUSH = 6;

const POSE: HazardPose = { x: 0, y: 0, z: 0, active: 0, telegraph: 0, fx: 0, fy: 0, fz: 1, ux: 0, uy: 1, uz: 0, phase: 0 };
const FR = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: 1, rx: 1, ry: 0, rz: 0, ux: 0, uy: 1, uz: 0, wL: 0, wR: 0, sMain: 0, flags: 0 };
/** Contact result: unit normal from the hazard toward the kart centre and the penetration depth. */
const C = { nx: 0, ny: 1, nz: 0, depth: 0 };

/** Bounding radius of a hazard's shape around its pose point (broad phase). */
function reach(h: Readonly<HazardDefBaked>): number {
  const a = h.size[0], b = h.size[1], c = h.size[2];
  if (h.shape === 'box') return Math.sqrt(0.25 * a * a + 0.25 * b * b + c * c);
  if (h.shape === 'sphere') return a;
  return capsule(h) ? 0.5 * b + a : Math.sqrt(a * a + b * b);
}
const capsule = (h: Readonly<HazardDefBaked>): boolean => h.kind === 'swinger' || h.motion?.type === 'pendulum' || h.motion?.type === 'rotate';

/**
 * Sphere (centre c, radius R) against the posed shape. Box: base-centred on the pose, `along` on f, `across` on
 * u × f, `up` on u. Cylinder: base on the pose, axis u. Capsule (swingers): centred on the pose, axis u. Sphere:
 * centred on the pose. Fills C on contact.
 */
function touch(h: Readonly<HazardDefBaked>, p: Readonly<HazardPose>, cx: number, cy: number, cz: number, R: number): boolean {
  const fx = p.fx!, fy = p.fy!, fz = p.fz!, ux = p.ux!, uy = p.uy!, uz = p.uz!;
  const dx = cx - p.x, dy = cy - p.y, dz = cz - p.z;
  const s0 = h.size[0], s1 = h.size[1], s2 = h.size[2];
  if (h.shape === 'box') {
    // side axis s = u × f
    const sx = uy * fz - uz * fy, sy = uz * fx - ux * fz, sz = ux * fy - uy * fx;
    const a = dx * fx + dy * fy + dz * fz, b = dx * sx + dy * sy + dz * sz, e = dx * ux + dy * uy + dz * uz;
    const ha = 0.5 * s0, hb = 0.5 * s1;
    const ca = a < -ha ? -ha : a > ha ? ha : a, cb = b < -hb ? -hb : b > hb ? hb : b, ce = e < 0 ? 0 : e > s2 ? s2 : e;
    const qa = a - ca, qb = b - cb, qe = e - ce, d2 = qa * qa + qb * qb + qe * qe;
    if (d2 > R * R) return false;
    if (d2 > 1e-12) {
      const d = Math.sqrt(d2);
      C.nx = (qa * fx + qb * sx + qe * ux) / d; C.ny = (qa * fy + qb * sy + qe * uy) / d; C.nz = (qa * fz + qb * sz + qe * uz) / d;
      C.depth = R - d;
    } else {
      // centre inside the box: out through the nearer side face (across or along)
      const pb = hb - (b < 0 ? -b : b), pa = ha - (a < 0 ? -a : a);
      if (pb <= pa) { const sg = b < 0 ? -1 : 1; C.nx = sx * sg; C.ny = sy * sg; C.nz = sz * sg; C.depth = R + pb; }
      else { const sg = a < 0 ? -1 : 1; C.nx = fx * sg; C.ny = fy * sg; C.nz = fz * sg; C.depth = R + pa; }
    }
    return true;
  }
  if (h.shape === 'sphere') return ball(dx, dy, dz, s0 + R);
  const e = dx * ux + dy * uy + dz * uz;
  if (capsule(h)) {
    const hl = 0.5 * s1, t = e < -hl ? -hl : e > hl ? hl : e;
    return ball(dx - t * ux, dy - t * uy, dz - t * uz, s0 + R);
  }
  // cylinder standing on the pose point
  const ce = e < 0 ? 0 : e > s1 ? s1 : e;
  const rx = dx - e * ux, ry = dy - e * uy, rz = dz - e * uz, rho = Math.sqrt(rx * rx + ry * ry + rz * rz);
  const k = rho > s0 ? 1 - s0 / rho : 0;
  const qx = rx * k + (e - ce) * ux, qy = ry * k + (e - ce) * uy, qz = rz * k + (e - ce) * uz;
  const d2 = qx * qx + qy * qy + qz * qz;
  if (d2 > R * R) return false;
  if (d2 > 1e-12) { const d = Math.sqrt(d2); C.nx = qx / d; C.ny = qy / d; C.nz = qz / d; C.depth = R - d; }
  else if (rho > 1e-9) { C.nx = rx / rho; C.ny = ry / rho; C.nz = rz / rho; C.depth = R + s0 - rho; }
  else { C.nx = ux; C.ny = uy; C.nz = uz; C.depth = R; }
  return true;
}

function ball(qx: number, qy: number, qz: number, rr: number): boolean {
  const d2 = qx * qx + qy * qy + qz * qz;
  if (d2 > rr * rr) return false;
  const d = Math.sqrt(d2);
  if (d > 1e-9) { C.nx = qx / d; C.ny = qy / d; C.nz = qz / d; } else { C.nx = 0; C.ny = 1; C.nz = 0; }
  C.depth = rr - d;
  return true;
}

/** Is the kart's running hard CC driven by a track hazard? */
function hazardCC(w: Readonly<WorldState>, k: Readonly<KartState>): boolean {
  const st = k.status;
  if (st.cc === 0 || w.tick >= st.ccEnd) return false;
  for (const e of w.effects) if (e.victim === k.slot && (e.flags & (EFlag.DRIVER | EFlag.DEAD)) === EFlag.DRIVER) return e.source === TRACK_SOURCE;
  return false;
}

/** Phase 5: contacts between karts and live track hazards. */
export function stepTrackHazards(w: WorldState, ctx: StepContext): void {
  const T = ctx.track, H = T.hazards;
  if (H.length === 0) return;
  const K = w.karts, R = KART_R;
  for (let i = 0; i < H.length; i++) {
    const h = H[i]!;
    T.hazardPose(i, w.tick, POSE);
    if (POSE.active !== 1) continue;
    if (POSE.fx === undefined || POSE.ux === undefined) {
      // older bakes: the track frame at the hazard
      T.frameAt(h.path, h.s, FR);
      POSE.fx = FR.tx; POSE.fy = FR.ty; POSE.fz = FR.tz; POSE.ux = FR.ux; POSE.uy = FR.uy; POSE.uz = FR.uz;
    }
    const br = reach(h) + R;
    for (let j = 0; j < K.length; j++) {
      const k = K[j]!, b = k.body;
      if (!inRace(k) || k.race.respawnPhase !== 0 || b.attachKind !== Attach.NONE) continue;
      const cx = b.px + b.nx * KART_CY, cy = b.py + b.ny * KART_CY, cz = b.pz + b.nz * KART_CY;
      const ox = cx - POSE.x, oy = cy - POSE.y, oz = cz - POSE.z;
      if (ox * ox + oy * oy + oz * oz > br * br) continue;
      if (!touch(h, POSE, cx, cy, cz, R)) continue;
      if (h.effect === 'block') { block(k); continue; }
      if (hazardCC(w, k) || k.status.immuneUntil > w.tick) continue;
      hit(w, ctx, h, i, k);
    }
  }
}

/** Solid hazard: pushed out along the contact normal; the velocity into the hazard is removed. */
function block(k: KartState): void {
  const b = k.body;
  b.px += C.nx * C.depth; b.py += C.ny * C.depth; b.pz += C.nz * C.depth;
  const vn = b.vx * C.nx + b.vy * C.ny + b.vz * C.nz;
  if (vn < 0) { b.vx -= vn * C.nx; b.vy -= vn * C.ny; b.vz -= vn * C.nz; }
}

function hit(w: WorldState, ctx: StepContext, h: Readonly<HazardDefBaked>, id: number, k: KartState): void {
  const code = h.effect === 'launch' ? EF.airborne : h.effect === 'squash' ? EF.stun : EF.spin;
  const dur = h.effect === 'squash' ? SQUASH_TICKS : 0;
  const e = scheduleEffect(w, ctx, code, k.slot, TRACK_SOURCE, w.tick, dur, 0, EFlag.HAZARD, mix4(0x7ac4, id, k.slot, w.tick));
  if (!e || resolveEffect(w, ctx, e) !== Res.HIT) return;
  const b = k.body;
  if (h.effect === 'squash') { b.vx *= SQUASH_SPEED_MUL; b.vy *= SQUASH_SPEED_MUL; b.vz *= SQUASH_SPEED_MUL; return; }
  const push = h.kind === 'train' ? TRAIN_PUSH : h.kind === 'traffic' ? TRAFFIC_PUSH : 0;
  if (push > 0 && h.effect === 'spin') {
    // away from the hazard, in the kart's ground plane
    const cn = C.nx * b.nx + C.ny * b.ny + C.nz * b.nz;
    let px = C.nx - cn * b.nx, py = C.ny - cn * b.ny, pz = C.nz - cn * b.nz;
    const l = Math.sqrt(px * px + py * py + pz * pz);
    if (l < 1e-6) return;
    px /= l; py /= l; pz /= l;
    b.vx += px * push; b.vy += py * push; b.vz += pz * push;
  }
}
