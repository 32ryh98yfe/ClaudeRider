// Movement and collision for one half-displacement (ADR-005 step 4, 10-sim-spec §10): ground ray, then the wall
// sphere; kart–kart contacts (§11) after every kart has moved. Rails and warps replace the free move.
import { Attach, Boost, type KartState, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import { SIN } from '../core/math.ts';
import type { StepContext } from '../api.ts';
import type { SurfaceDef } from '@cr/content';
import type { Contact } from '../track/BakedTrack.ts';
import { TFLAG } from '../track/format.ts';
import type { KartParams } from './params.ts';
import { evKey } from './evkey.ts';
import { railHalfStep } from './rail.ts';
import { gravityFor } from './zones.ts';
import { hasZones } from './trackinfo.ts';

export const KART_R = 0.85;
export const KART_CY = 0.6;
/** Ground normal acceptance: n_hit · up > cos 65°. */
const COS65 = 0.42261826174069944;
/** Grounded karts follow the surface down this far below the contact point ("hover", gap-3). */
const SNAP = 0.35;
/** Coyote grace, written +1 because it is set in phase 4 (10-sim-spec §1.3). */
const COYOTE_WRITE = 7;

export interface MotionState { impactThisTick: boolean; contactThisTick: boolean; tx: number; ty: number; tz: number }

/**
 * Per-slot kill request from the ground (lava surface, ledge-kill triangle), raised in phase 4 and consumed by the
 * phase-7 respawn triggers of the same tick. It never outlives the tick, so it is not world state.
 */
export const KILL_FLAG = new Uint8Array(8);

/** Re-orthonormalizes forward against up. */
export function orthoForward(k: KartState): void {
  const b = k.body;
  const d = b.fx * b.nx + b.fy * b.ny + b.fz * b.nz;
  let fx = b.fx - d * b.nx, fy = b.fy - d * b.ny, fz = b.fz - d * b.nz;
  const l = Math.sqrt(fx * fx + fy * fy + fz * fz);
  if (l < 1e-6) { // forward parallel to up: pick any perpendicular
    fx = b.ny; fy = -b.nx; fz = 0;
    const l2 = Math.sqrt(fx * fx + fy * fy) || 1; fx /= l2; fy /= l2;
  } else { fx /= l; fy /= l; fz /= l; }
  b.fx = fx; b.fy = fy; b.fz = fz;
}

function surfDef(ctx: StepContext, code: number): SurfaceDef | undefined { return ctx.content.surfaceByCode[code]; }

export function halfStep(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, ms: MotionState): void {
  const b = k.body;
  if (b.attachKind === Attach.RAIL) { railHalfStep(k, ctx); return; }
  if (b.attachKind === Attach.WARP) return; // frozen at the gate
  const dt2 = DT / 2, T = ctx.track, hit = ctx.scratch.hit;
  if (hasZones(T)) gravityFor(T, k.race.loc, ctx.scratch.grav);
  b.px += b.vx * dt2; b.py += b.vy * dt2; b.pz += b.vz * dt2;

  // ---------------------------------------------------------------- ground (§10.2)
  const was = b.grounded;
  let ux: number, uy: number, uz: number;
  if (was) { ux = b.nx; uy = b.ny; uz = b.nz; }
  else { const g = ctx.scratch.grav; const gl = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1; ux = -g.x / gl; uy = -g.y / gl; uz = -g.z / gl; }
  let accept = false;
  if (T.groundRay(b.px + ux, b.py + uy, b.pz + uz, -ux, -uy, -uz, 2.0, hit) && hit.nx * ux + hit.ny * uy + hit.nz * uz > COS65) {
    const dd = hit.t - 1.0; // + = kart above the surface
    const vnh = b.vx * hit.nx + b.vy * hit.ny + b.vz * hit.nz;
    accept = dd <= 0 || (was === 1 && dd <= SNAP && vnh <= 2.0);
    if (accept) {
      if (!was && b.airTicks > 0) land(w, k, P, ctx, vnh, hit.nx, hit.ny, hit.nz);
      else {
        // continuing contact: re-project onto the new tangent plane, preserving speed
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
        let tx = b.vx - vnh * hit.nx, ty = b.vy - vnh * hit.ny, tz = b.vz - vnh * hit.nz;
        const tl = Math.sqrt(tx * tx + ty * ty + tz * tz);
        if (tl > 1e-6) { const f = sp / tl; tx *= f; ty *= f; tz *= f; }
        b.vx = tx; b.vy = ty; b.vz = tz;
      }
      const prevSurf = b.surf;
      b.px = hit.x; b.py = hit.y; b.pz = hit.z;
      b.nx = hit.nx; b.ny = hit.ny; b.nz = hit.nz;
      b.surf = hit.surf; b.grounded = 1; b.coyote = COYOTE_WRITE;
      orthoForward(k);
      if (b.surf !== prevSurf) surfaceEntry(w, k, P, ctx, surfDef(ctx, b.surf));
      if ((hit.flags & TFLAG.KILL) !== 0 || surfDef(ctx, b.surf)?.kill) KILL_FLAG[k.slot] = 1;
    }
  }
  if (!accept && was) {
    b.grounded = 0;
    ctx.events.push({ t: 'air', kart: k.slot, impact: 0, tick: w.tick, key: evKey(w.tick, 20, k.slot) });
  }

  // ---------------------------------------------------------------- walls (§10.4)
  walls(w, k, P, ctx, ms);
}

/**
 * Landing (§10.2 step 4): the normal speed is removed; above 6 m/s impact the kart loses up to 12% of its speed.
 * A hard landing also rebounds slightly [P]: 8% of the impact above 6 m/s, at most 1.5 m/s, which the coyote grace
 * covers, so the kart keeps control through the hop.
 */
function land(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, vnh: number, nx: number, ny: number, nz: number): void {
  const b = k.body;
  const imp = vnh < 0 ? -vnh : 0;
  b.vx -= vnh * nx; b.vy -= vnh * ny; b.vz -= vnh * nz;
  if (imp > P.landSpeed) {
    let f = P.landLossPerMps * (imp - P.landSpeed); if (f > P.landLossMax) f = P.landLossMax;
    b.vx *= 1 - f; b.vy *= 1 - f; b.vz *= 1 - f;
  }
  // tiny re-landings after a rebound are not reported (the client plays one landing per jump)
  if (imp >= 2 || b.airTicks > 10) ctx.events.push({ t: 'land', kart: k.slot, impact: imp, tick: w.tick, key: evKey(w.tick, 21, k.slot) });
  bounceV = imp > P.landSpeed ? Math.min(1.5, 0.08 * (imp - P.landSpeed)) : 0;
  bnx = nx; bny = ny; bnz = nz;
  b.airTicks = 0; // the rebound hop is a new (short) air phase
}
// rebound requested by land(), applied after the wall pass of the same half-step (never carried across ticks)
let bounceV = 0, bnx = 0, bny = 1, bnz = 0;

/** Pad surfaces act when the kart enters them (§7.6, §10.3). Set in phase 4, so durations are written +1. */
function surfaceEntry(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, def: SurfaceDef | undefined): void {
  if (!def) return;
  const b = k.body, d = k.drive;
  if (def.id === 'boost_pad') {
    if (d.boostTicks < P.padBoostTicks + 1) d.boostTicks = P.padBoostTicks + 1;
    if (d.boostKind === Boost.NONE) {
      d.boostKind = Boost.PAD;
      ctx.events.push({ t: 'boostStart', kart: k.slot, kind: Boost.PAD, tick: w.tick, key: evKey(w.tick, 9, k.slot) });
    }
  } else if (def.id === 'jump_pad') {
    const vn = b.vx * b.nx + b.vy * b.ny + b.vz * b.nz;
    if (vn < P.jumpPadSpeed) { const dv = P.jumpPadSpeed - vn; b.vx += b.nx * dv; b.vy += b.ny * dv; b.vz += b.nz * dv; }
    b.grounded = 0;
  }
}

const CONTACTS_SORTED: Contact[] = [];

function walls(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, ms: MotionState): void {
  const b = k.body, T = ctx.track, cs = ctx.scratch.contacts;
  const cx = b.px + b.nx * KART_CY, cy = b.py + b.ny * KART_CY, cz = b.pz + b.nz * KART_CY;
  const n = T.sphereWalls(cx, cy, cz, KART_R, cs, cs.length);
  if (n === 0) { applyBounce(k); return; }
  ms.contactThisTick = true;
  // process in order of decreasing depth (ties: triangle id), allocation-free insertion sort
  const S = CONTACTS_SORTED;
  S.length = 0;
  for (let i = 0; i < n; i++) {
    const c = cs[i]!;
    let j = S.length;
    S.push(c);
    while (j > 0 && (S[j - 1]!.depth < c.depth || (S[j - 1]!.depth === c.depth && S[j - 1]!.tri > c.tri))) { S[j] = S[j - 1]!; j--; }
    S[j] = c;
  }
  for (let i = 0; i < S.length; i++) {
    const c = S[i]!;
    // Re-evaluate against the centre moved by earlier (deeper) contacts. A sphere on a flat wall also touches the
    // edges and corners of the neighbouring coplanar triangles; once the face contact has pushed it out those are
    // no longer penetrating, and pushing along their slanted normals would shove the kart sideways or down.
    let nx = c.nx, ny = c.ny, nz = c.nz, depth = c.depth;
    if (i > 0) {
      const ex = b.px + b.nx * KART_CY - c.x, ey = b.py + b.ny * KART_CY - c.y, ez = b.pz + b.nz * KART_CY - c.z;
      const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (d >= KART_R) continue;
      depth = KART_R - d;
      if (d > 1e-9) { nx = ex / d; ny = ey / d; nz = ez / d; }
    }
    b.px += nx * depth; b.py += ny * depth; b.pz += nz * depth;
    // wall normal in the kart's tangent plane; floor/ceiling-like contacts only fix the position
    const dn = nx * b.nx + ny * b.ny + nz * b.nz;
    let hx = nx - dn * b.nx, hy = ny - dn * b.ny, hz = nz - dn * b.nz;
    const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (hl < 0.3) continue;
    hx /= hl; hy /= hl; hz /= hl;
    wallResponse(w, k, P, ctx, ms, hx, hy, hz);
  }
  applyBounce(k);
}

function applyBounce(k: KartState): void {
  if (bounceV <= 0) return;
  const b = k.body;
  b.vx += bnx * bounceV; b.vy += bny * bounceV; b.vz += bnz * bounceV;
  b.grounded = 0;
  bounceV = 0;
}

function wallResponse(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, ms: MotionState, nx: number, ny: number, nz: number): void {
  const b = k.body, d = k.drive;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  if (sp < 1e-6) return;
  const sinT = -vn / sp;
  let tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
  const tsp = Math.sqrt(tx * tx + ty * ty + tz * tz);
  const fresh = !b.wallContact && !ms.impactThisTick;
  if (fresh && sinT >= SIN.d15) {
    ms.impactThisTick = true;
    k.stats.wallHits++;
    const f = sinT < SIN.d45 ? P.wallF15 + (P.wallF45 - P.wallF15) * (sinT - SIN.d15) / (SIN.d45 - SIN.d15) : P.wallF90;
    tx *= f; ty *= f; tz *= f;
    b.vx = tx - P.wallE * vn * nx; b.vy = ty - P.wallE * vn * ny; b.vz = tz - P.wallE * vn * nz;
    if (d.drift === 1) {
      d.gauge *= P.wallGaugeKeep;
      d.drift = 0; d.reDriftLock = P.reDriftTicks; d.driftDir = 1; d.driftTicks = 0; d.driftPeak = 0;
      ctx.events.push({ t: 'driftEnd', kart: k.slot, tick: w.tick, key: evKey(w.tick, 4, k.slot) });
    }
    d.instTicks = 0; d.instWindow = 0;
    const hard = sinT >= SIN.d45;
    if (hard) {
      k.stats.hardHits++;
      d.stunTicks = P.wallStunTicks + 1;
      if (d.boostTicks > 0) ctx.events.push({ t: 'boostEnd', kart: k.slot, kind: d.boostKind, tick: w.tick, key: evKey(w.tick, 1, k.slot) });
      d.boostTicks = 0; d.boostKind = Boost.NONE; d.startTicks = 0;
      b.yawRate = 0;
      // nose realigned along the track tangent (projected on the ground plane), toward the side the kart faced,
      // turned slightly away from the wall
      let ttx = ms.tx, tty = ms.ty, ttz = ms.tz;
      const tn = ttx * b.nx + tty * b.ny + ttz * b.nz;
      ttx -= tn * b.nx; tty -= tn * b.ny; ttz -= tn * b.nz;
      const ttl = Math.sqrt(ttx * ttx + tty * tty + ttz * ttz) || 1;
      ttx /= ttl; tty /= ttl; ttz /= ttl;
      const sg = b.fx * ttx + b.fy * tty + b.fz * ttz >= -0.1 ? 1 : -1;
      let hx = sg * ttx + 0.3 * nx, hy = sg * tty + 0.3 * ny, hz = sg * ttz + 0.3 * nz;
      const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
      hx /= hl; hy /= hl; hz /= hl;
      b.fx = hx; b.fy = hy; b.fz = hz;
      orthoForward(k);
      const sp2 = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
      b.vx = b.fx * sp2; b.vy = b.fy * sp2; b.vz = b.fz * sp2;
    }
    ctx.events.push({ t: 'wall', kart: k.slot, severity: hard ? 2 : 1, x: b.px, y: b.py, z: b.pz, speed: -vn, tick: w.tick, key: evKey(w.tick, 22, k.slot) });
  } else {
    // grinding (벽 비비기): remove the into-wall velocity, 10 m/s² friction along the wall; the drift is kept
    let f = tsp > 0.01 ? 1 - (P.wallGrind * (DT / 2)) / tsp : 0;
    if (f < 0) f = 0;
    b.vx = tx * f; b.vy = ty * f; b.vz = tz * f;
    if (fresh) {
      ctx.events.push({ t: 'wall', kart: k.slot, severity: 0, x: b.px, y: b.py, z: b.pz, speed: -vn, tick: w.tick, key: evKey(w.tick, 22, k.slot) });
      ms.impactThisTick = true;
    }
  }
  if (sinT < SIN.d45) {
    // glancing: the nose is turned parallel to the wall (projected heading, no trig)
    const hn = b.fx * nx + b.fy * ny + b.fz * nz;
    if (hn < 0) {
      const hx = b.fx - hn * nx, hy = b.fy - hn * ny, hz = b.fz - hn * nz;
      const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (hl > 1e-6) { b.fx = hx / hl; b.fy = hy / hl; b.fz = hz / hl; }
      b.yawRate = 0;
    }
  }
}

/** A kart is "boosting" for contact mass when any boost-law source is active (§7.3 rows 1–6). */
function boosting(k: Readonly<KartState>, ctx: StepContext): boolean {
  return k.drive.boostTicks > 0 || k.drive.startTicks > 0 || ctx.scratch.mods[k.slot]!.vTarget > 0;
}

function contactable(k: Readonly<KartState>): boolean {
  return k.active === 1 && k.body.ghostTicks <= 0 && k.race.respawnPhase === 0 && k.race.finishTick < 0 && k.body.attachKind !== Attach.WARP;
}

const DV_MAX = 6;

/**
 * Kart–kart sphere contacts (§11): soft (restitution 0.3), symmetric (swapping two karts' slots mirrors the
 * result exactly), with each kart's Δv capped at 6 m/s and a 10% rear-end transfer. Run after each half-step.
 */
export function kartContacts(w: WorldState, ctx: StepContext, weights: ReadonlyArray<number>): void {
  const K = w.karts;
  const R = 2 * KART_R;
  for (let i = 0; i < K.length; i++) {
    const a = K[i]!;
    if (!contactable(a)) continue;
    for (let j = i + 1; j < K.length; j++) {
      const c = K[j]!;
      if (!contactable(c)) continue;
      const A = a.body, B = c.body;
      const ax = A.px + A.nx * KART_CY, ay = A.py + A.ny * KART_CY, az = A.pz + A.nz * KART_CY;
      const bx = B.px + B.nx * KART_CY, by = B.py + B.ny * KART_CY, bz = B.pz + B.nz * KART_CY;
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= R * R) continue;
      const dist = Math.sqrt(d2);
      if (dist < 1e-6) { dx = A.fx; dy = A.fy; dz = A.fz; } else { dx /= dist; dy /= dist; dz /= dist; }
      const ma = (weights[i] ?? 1) * (boosting(a, ctx) ? 1.5 : 1), mb = (weights[j] ?? 1) * (boosting(c, ctx) ? 1.5 : 1);
      const msum = ma + mb;
      const pen = R - dist;
      // positional separation, split by inverse mass (the lighter kart moves more)
      const pa = (pen * mb) / msum, pb = (pen * ma) / msum;
      A.px -= dx * pa; A.py -= dy * pa; A.pz -= dz * pa;
      B.px += dx * pb; B.py += dy * pb; B.pz += dz * pb;
      const vrel = (B.vx - A.vx) * dx + (B.vy - A.vy) * dy + (B.vz - A.vz) * dz;
      if (vrel >= 0) continue;
      const J = (-(1 + 0.3) * vrel) / (1 / ma + 1 / mb);
      let dva = J / ma, dvb = J / mb;
      if (dva > DV_MAX) dva = DV_MAX;
      if (dvb > DV_MAX) dvb = DV_MAX;
      A.vx -= dx * dva; A.vy -= dy * dva; A.vz -= dz * dva;
      B.vx += dx * dvb; B.vy += dy * dvb; B.vz += dz * dvb;
      // rear-end transfer: both karts point along the contact normal, the rear kart pushes the front one
      const c0 = -vrel;
      const fa = A.fx * dx + A.fy * dy + A.fz * dz, fb = B.fx * dx + B.fy * dy + B.fz * dz;
      if (fa > 0.7 && fb > 0.7) { // A behind B
        const t = 0.1 * c0;
        B.vx += t * B.fx; B.vy += t * B.fy; B.vz += t * B.fz;
        A.vx -= t * A.fx; A.vy -= t * A.fy; A.vz -= t * A.fz;
      } else if (fa < -0.7 && fb < -0.7) { // B behind A
        const t = 0.1 * c0;
        A.vx += t * A.fx; A.vy += t * A.fy; A.vz += t * A.fz;
        B.vx -= t * B.fx; B.vy -= t * B.fy; B.vz -= t * B.fz;
      }
      ctx.events.push({ t: 'bump', a: i, b: j, impulse: J, tick: w.tick, key: evKey(w.tick, 23, i, j) });
    }
  }
}
