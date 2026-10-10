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
const PREV = new WeakMap<WorldState, { tick: number; centres: number[] }>();
const SWEEP: HazardPose = { ...POSE };

/** Tick-local motion scratch, overwritten before every move (including rollback); never serialized. */
export function captureTrackHazardMotion(w: WorldState): void {
  let prev = PREV.get(w);
  if (!prev) { prev = { tick: w.tick, centres: [] }; PREV.set(w, prev); }
  prev.tick = w.tick;
  for (let i = 0; i < w.karts.length; i++) {
    const k = w.karts[i]!, b = k.body, o = i * 4;
    prev.centres[o] = b.px + b.nx * KART_CY; prev.centres[o + 1] = b.py + b.ny * KART_CY; prev.centres[o + 2] = b.pz + b.nz * KART_CY;
    prev.centres[o + 3] = k.race.respawnPhase === 0 && b.attachKind === Attach.NONE ? 1 : 0;
  }
}

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
    if (d2 > R * R) { C.depth = R - Math.sqrt(d2); return false; }
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
  if (d2 > R * R) { C.depth = R - Math.sqrt(d2); return false; }
  if (d2 > 1e-12) { const d = Math.sqrt(d2); C.nx = qx / d; C.ny = qy / d; C.nz = qz / d; C.depth = R - d; }
  else if (rho > 1e-9) { C.nx = rx / rho; C.ny = ry / rho; C.nz = rz / rho; C.depth = R + s0 - rho; }
  else { C.nx = ux; C.ny = uy; C.nz = uz; C.depth = R; }
  return true;
}

function ball(qx: number, qy: number, qz: number, rr: number): boolean {
  const d2 = qx * qx + qy * qy + qz * qz;
  if (d2 > rr * rr) { C.depth = rr - Math.sqrt(d2); return false; }
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

/** Upper bound on the shape's motion in a tick, for conservative advancement against moving shapes. */
function hazardTravel(h: Readonly<HazardDefBaked>): number {
  const m = h.motion;
  if (!m) return 0;
  if (m.type === 'lane') return 2 * Math.abs(m.speed ?? 10) / 60;
  if (m.type === 'cross') return 2 * (m.halfSpan ?? 20) / Math.max(1, h.activeTo - h.activeFrom);
  if (m.type === 'piston') return (m.rise ?? 4) / Math.max(1, m.rampTicks ?? 10);
  if (m.type === 'pendulum' || m.type === 'rotate') {
    const angular = 6.283185307179586 / Math.max(1, h.periodTicks) * (m.type === 'pendulum' ? (m.ampDeg ?? 60) * 0.017453292519943295 : 1);
    return angular * ((m.arm ?? 5) + reach(h));
  }
  return 0;
}

/** Phase 5: sweep the actual movement, so thin traps and crossing movers cannot be skipped between ticks. */
export function stepTrackHazards(w: WorldState, ctx: StepContext): void {
  const T = ctx.track, H = T.hazards;
  if (H.length === 0) return;
  const K = w.karts, R = KART_R, prev = PREV.get(w);
  for (let i = 0; i < H.length; i++) {
    const h = H[i]!;
    T.hazardPose(i, w.tick, POSE);
    // Damage activity is tick-discrete. Visible mechanical bodies remain solid while raised/idle; parked trains
    // follow the renderer's active/telegraph visibility, while plumes are trigger volumes only.
    const solid = h.contact === 'solid' || h.effect === 'block';
    const physical = solid && (h.kind !== 'train' || POSE.active === 1 || POSE.telegraph === 1);
    if (POSE.active !== 1 && !physical) continue;
    T.hazardPose(i, w.tick - 1, SWEEP);
    // Lane restart and a parked train's arrival are teleports, never a sweep across the road.
    const lane = h.motion?.type === 'lane' ? h.motion : undefined;
    const laneSpan = lane ? (lane.s1 ?? h.s + 100) - (lane.s0 ?? h.s) : 1;
    const lapScale = lane ? h.periodTicks * Math.abs(lane.speed ?? 10) / (60 * laneSpan) : 0;
    const laneWrap = lane !== undefined && (Math.floor((POSE.phase ?? 0) * lapScale) !== Math.floor((SWEEP.phase ?? 0) * lapScale));
    const teleported = laneWrap || (h.motion?.type === 'lane' && (POSE.phase ?? 0) < (SWEEP.phase ?? 0)) ||
      (h.motion?.type === 'cross' && POSE.active !== SWEEP.active);
    const br = reach(h) + R, travel = hazardTravel(h);
    for (let j = 0; j < K.length; j++) {
      const k = K[j]!, b = k.body, o = j * 4;
      if (!inRace(k) || k.race.respawnPhase !== 0 || b.attachKind !== Attach.NONE) continue;
      const cx = b.px + b.nx * KART_CY, cy = b.py + b.ny * KART_CY, cz = b.pz + b.nz * KART_CY;
      const sweep = !teleported && prev?.tick === w.tick && prev.centres[o + 3] === 1;
      const x0 = sweep ? prev.centres[o]! : cx, y0 = sweep ? prev.centres[o + 1]! : cy, z0 = sweep ? prev.centres[o + 2]! : cz;
      const dx = cx - x0, dy = cy - y0, dz = cz - z0, distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const ox = cx - POSE.x, oy = cy - POSE.y, oz = cz - POSE.z;
      const broad = br + distance + (sweep ? travel : 0);
      if (ox * ox + oy * oy + oz * oz > broad * broad) continue;
      const bound = distance + travel;
      let t = sweep ? 0 : 1, contact = false;
      for (let n = 0; n < 256; n++) {
        T.hazardPose(i, w.tick - 1 + t, SWEEP);
        if (SWEEP.fx === undefined || SWEEP.ux === undefined) {
          T.frameAt(h.path, h.s, FR);
          SWEEP.fx = FR.tx; SWEEP.fy = FR.ty; SWEEP.fz = FR.tz; SWEEP.ux = FR.ux; SWEEP.uy = FR.uy; SWEEP.uz = FR.uz;
        }
        const collidable = SWEEP.active === 1 || solid && (h.kind !== 'train' || SWEEP.telegraph === 1);
        if (collidable && touch(h, SWEEP, x0 + dx * t, y0 + dy * t, z0 + dz * t, R + 0.00001)) { contact = true; break; }
        if (t >= 1) break;
        // Distance to a convex shape is Lipschitz: this step cannot jump over contact. The time cap also observes
        // activity edges; inactive geometry is skipped without inventing contact on its invisible parked route.
        const advance = collidable && bound > 0 ? Math.max(0.000001, -C.depth / bound) : 0.125;
        t = Math.min(1, t + Math.min(0.125, advance));
      }
      if (!contact) continue;
      if (solid) {
        keepAboveSupport(k, h, SWEEP, ctx, x0 + dx * t, y0 + dy * t, z0 + dz * t);
        // Clip only the remaining inward displacement. Rewinding the entire segment would pin a kart that
        // starts touching a block even while steering away or sliding along its face.
        const into = dx * C.nx + dy * C.ny + dz * C.nz;
        if (into < 0) { const remove = into * (1 - t); b.px -= C.nx * remove; b.py -= C.ny * remove; b.pz -= C.nz * remove; }
        block(k);
        // A moving block can advance beyond the contact pose before the end of this tick.
        if (touch(h, POSE, b.px + b.nx * KART_CY, b.py + b.ny * KART_CY, b.pz + b.nz * KART_CY, R)) {
          keepAboveSupport(k, h, POSE, ctx, b.px + b.nx * KART_CY, b.py + b.ny * KART_CY, b.pz + b.nz * KART_CY);
          block(k);
        }
        if (h.effect === 'block') continue;
      }
      if (POSE.active !== 1 || hazardCC(w, k) || k.status.immuneUntil > w.tick) continue;
      hit(w, ctx, h, i, k);
    }
  }
  if (prev) prev.tick = -1;
}

/** A moving solid must eject to an available side, never force a supported kart through its floor or a wall. */
function keepAboveSupport(k: KartState, h: Readonly<HazardDefBaked>, p: Readonly<HazardPose>, ctx: StepContext, cx: number, cy: number, cz: number): void {
  const b = k.body;
  if (!b.grounded) return;
  const downward = C.nx * b.nx + C.ny * b.ny + C.nz * b.nz < -0.001;
  let obstructed = false;
  if (!downward) {
    const pieces = Math.max(1, Math.ceil(C.depth / 0.4));
    for (let n = 1; n <= pieces; n++) {
      const d = C.depth * n / pieces;
      if (ctx.track.sphereWalls(cx + C.nx * d, cy + C.ny * d, cz + C.nz * d, KART_R - 0.01, ctx.scratch.contacts, 1) > 0) { obstructed = true; break; }
    }
    if (!obstructed) return;
  }
  const fx = p.fx!, fy = p.fy!, fz = p.fz!, ux = p.ux!, uy = p.uy!, uz = p.uz!;
  const sx = uy * fz - uz * fy, sy = uz * fx - ux * fz, sz = ux * fy - uy * fx;
  const dx = cx - p.x, dy = cy - p.y, dz = cz - p.z;
  const a = dx * fx + dy * fy + dz * fz, c = dx * sx + dy * sy + dz * sz;
  let best = Infinity, bx = 0, by = 0, bz = 0;
  // The closest geometric face can lie beyond a road edge (the Manor bookcase overlaps the right wall).
  // Check all four ground-plane exits, including their entire translation, before selecting the shortest.
  for (let face = 0; face < (h.shape === 'box' ? 4 : 8); face++) {
    const along = face < 2, sign = (face & 1) === 0 ? -1 : 1;
    let nx = (along ? fx : sx) * sign, ny = (along ? fy : sy) * sign, nz = (along ? fz : sz) * sign;
    if (face >= 4) { const sideSign = face < 6 ? -1 : 1; nx = fx * sign + sx * sideSign; ny = fy * sign + sy * sideSign; nz = fz * sign + sz * sideSign; }
    const down = nx * b.nx + ny * b.ny + nz * b.nz;
    nx -= down * b.nx; ny -= down * b.ny; nz -= down * b.nz;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length < 0.001) continue;
    nx /= length; ny /= length; nz /= length;
    let depth: number;
    if (h.shape === 'box') depth = Math.max(0, (along ? h.size[0] : h.size[1]) * 0.5 + KART_R - (along ? a : c) * sign) / length + 0.00001;
    else {
      // A low swinger/capsule can also press down on the kart. Search its convex section in the support plane.
      let low = 0, high = 2 * (reach(h) + KART_R);
      for (let n = 0; n < 24; n++) { const mid = (low + high) / 2; if (touch(h, p, cx + nx * mid, cy + ny * mid, cz + nz * mid, KART_R)) low = mid; else high = mid; }
      depth = high + 0.00001;
    }
    if (depth >= best) continue;
    const x = cx + nx * depth - b.nx * KART_CY, y = cy + ny * depth - b.ny * KART_CY, z = cz + nz * depth - b.nz * KART_CY;
    const loc = ctx.scratch.loc;
    if (!ctx.track.locate(x, y, z, k.race.loc, loc)) continue;
    ctx.track.frameAt(loc.path, loc.s, FR);
    if (loc.u < -FR.wL + KART_R || loc.u > FR.wR - KART_R) continue;
    if (!ctx.track.groundRay(x + b.nx * 0.75, y + b.ny * 0.75, z + b.nz * 0.75, -b.nx, -b.ny, -b.nz, 1.5, ctx.scratch.hit)) continue;
    let clear = true;
    const pieces = Math.max(1, Math.ceil(depth / 0.4));
    for (let n = 1; n <= pieces; n++) {
      const d = depth * n / pieces;
      if (ctx.track.sphereWalls(cx + nx * d, cy + ny * d, cz + nz * d, KART_R - 0.01, ctx.scratch.contacts, 1) > 0) { clear = false; break; }
    }
    if (clear) { best = depth; bx = nx; by = ny; bz = nz; }
  }
  // If a kart is boxed in on every side, hold it on its support until the press lifts rather than tunnel it down.
  C.nx = best < Infinity ? bx : -b.fx; C.ny = best < Infinity ? by : -b.fy; C.nz = best < Infinity ? bz : -b.fz;
  C.depth = best < Infinity ? best : 0;
}

/** Solid hazard: pushed out along the contact normal; the velocity into the hazard is removed. */
function block(k: KartState): void {
  const b = k.body;
  b.wallContact = 1;
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
