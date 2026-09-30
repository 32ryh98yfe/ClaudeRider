// Movement + collision for one half-displacement (ADR-005 step 4): ground ray, wall sphere.
import { Boost, type KartState, type WorldState } from '../core/state.ts';
import { DT } from '../core/units.ts';
import { SIN } from '../core/math.ts';
import type { StepContext } from '../api.ts';
import type { KartParams } from './params.ts';
import { evKey } from './evkey.ts';

export const KART_R = 0.85;
export const KART_CY = 0.6;

export interface MotionState { impactThisTick: boolean; contactThisTick: boolean; tx: number; ty: number; tz: number }

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

export function halfStep(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, ms: MotionState): void {
  const b = k.body, dt2 = DT / 2, T = ctx.track, hit = ctx.scratch.hit;
  b.px += b.vx * dt2; b.py += b.vy * dt2; b.pz += b.vz * dt2;

  // ---------------------------------------------------------------- ground
  let ux: number, uy: number, uz: number;
  if (b.grounded) { ux = b.nx; uy = b.ny; uz = b.nz; }
  else { const g = ctx.scratch.grav; const gl = Math.sqrt(g.x * g.x + g.y * g.y + g.z * g.z) || 1; ux = -g.x / gl; uy = -g.y / gl; uz = -g.z / gl; }
  const vUp = b.vx * ux + b.vy * uy + b.vz * uz;
  const snapDown = b.grounded ? 0.35 : 0.05 + (vUp < 0 ? -vUp * dt2 : 0);
  const found = T.groundRay(b.px + ux, b.py + uy, b.pz + uz, -ux, -uy, -uz, 1.0 + snapDown + (b.grounded ? 0 : 0.3), hit);
  if (found) {
    const dist = hit.t - 1.0; // + = kart above the hit point
    const vn = b.vx * hit.nx + b.vy * hit.ny + b.vz * hit.nz;
    if (b.grounded) {
      if (dist <= snapDown && !(vn > 3 && dist > 0.02)) {
        b.px = hit.x; b.py = hit.y; b.pz = hit.z;
        // blend the up vector toward the smooth ground normal
        let nx = b.nx + (hit.nx - b.nx) * 0.5, ny = b.ny + (hit.ny - b.ny) * 0.5, nz = b.nz + (hit.nz - b.nz) * 0.5;
        const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        b.nx = nx; b.ny = ny; b.nz = nz;
        const vn2 = b.vx * hit.nx + b.vy * hit.ny + b.vz * hit.nz;
        b.vx -= vn2 * hit.nx; b.vy -= vn2 * hit.ny; b.vz -= vn2 * hit.nz;
        b.surf = hit.surf;
        b.coyote = 0;
        if ((hit.flags & 4) !== 0) k.race.noGroundTicks = 9999; // kill triangle → respawn trigger
      } else {
        b.grounded = 0; b.airTicks = 0;
        ctx.events.push({ t: 'air', kart: k.slot, impact: 0, tick: w.tick, key: evKey(w.tick, 20, k.slot) });
      }
    } else if (dist <= 0.02 && vn <= 0.5) {
      // landing
      const impact = -vn;
      b.px = hit.x; b.py = hit.y; b.pz = hit.z;
      b.nx = hit.nx; b.ny = hit.ny; b.nz = hit.nz;
      b.vx -= vn * hit.nx; b.vy -= vn * hit.ny; b.vz -= vn * hit.nz;
      if (impact > P.landSpeed) {
        let f = 0.01 * (impact - P.landSpeed); if (f > 0.12) f = 0.12;
        b.vx *= 1 - f; b.vy *= 1 - f; b.vz *= 1 - f;
      }
      b.grounded = 1; b.surf = hit.surf; b.coyote = 0;
      ctx.events.push({ t: 'land', kart: k.slot, impact, tick: w.tick, key: evKey(w.tick, 21, k.slot) });
    }
  } else if (b.grounded) {
    b.grounded = 0; b.airTicks = 0;
    ctx.events.push({ t: 'air', kart: k.slot, impact: 0, tick: w.tick, key: evKey(w.tick, 20, k.slot) });
  }
  if (b.grounded) orthoForward(k);

  // ---------------------------------------------------------------- walls
  const cs = ctx.scratch.contacts;
  const cx = b.px + b.nx * KART_CY, cy = b.py + b.ny * KART_CY, cz = b.pz + b.nz * KART_CY;
  const n = T.sphereWalls(cx, cy, cz, KART_R, cs, cs.length);
  if (n === 0) return;
  ms.contactThisTick = true;
  // resolve deepest first (simple fixed order: by depth, tie → tri id)
  let best = -1, bestDepth = -1;
  for (let i = 0; i < n; i++) {
    const c = cs[i]!;
    b.px += c.nx * c.depth; b.py += c.ny * c.depth; b.pz += c.nz * c.depth;
    if (c.depth > bestDepth || (c.depth === bestDepth && c.tri < cs[best]!.tri)) { bestDepth = c.depth; best = i; }
  }
  for (let i = 0; i < n; i++) {
    const c = cs[i]!;
    // wall normal projected into the ground plane
    const dn = c.nx * b.nx + c.ny * b.ny + c.nz * b.nz;
    let hx = c.nx - dn * b.nx, hy = c.ny - dn * b.ny, hz = c.nz - dn * b.nz;
    const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
    if (hl < 0.3) continue; // floor/ceiling-like contact: position fix only
    hx /= hl; hy /= hl; hz /= hl;
    wallResponse(w, k, P, ctx, ms, hx, hy, hz, i === best);
  }
}

function wallResponse(w: WorldState, k: KartState, P: KartParams, ctx: StepContext, ms: MotionState, nx: number, ny: number, nz: number, primary: boolean): void {
  const b = k.body, d = k.drive;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz;
  if (vn >= 0) return;
  const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
  if (sp < 1e-6) return;
  const sinT = -vn / sp;
  let tx = b.vx - vn * nx, ty = b.vy - vn * ny, tz = b.vz - vn * nz;
  const tsp = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (primary && !b.wallContact && !ms.impactThisTick && sinT >= SIN.d15) {
    ms.impactThisTick = true;
    k.stats.wallHits++;
    let f: number;
    if (sinT < SIN.d45) f = P.wallF15 + (P.wallF45 - P.wallF15) * (sinT - SIN.d15) / (SIN.d45 - SIN.d15);
    else f = P.wallF90;
    tx *= f; ty *= f; tz *= f;
    b.vx = tx - P.wallE * vn * nx; b.vy = ty - P.wallE * vn * ny; b.vz = tz - P.wallE * vn * nz;
    if (d.drift === 1) { d.drift = 0; d.gauge *= P.wallGaugeKeep; d.reDriftLock = P.reDriftTicks; }
    d.instTicks = 0; d.instWindow = 0;
    const severity: 0 | 1 | 2 = sinT >= SIN.d45 ? 2 : 1;
    if (sinT >= SIN.d45) {
      k.stats.hardHits++;
      d.stunTicks = P.wallStunTicks;
      if (d.boostKind !== Boost.START) { d.boostTicks = 0; d.boostKind = Boost.NONE; }
      b.yawRate = 0;
      // nose realigned along the wall, toward the track-forward side, slightly away from it
      const wtx = b.ny * nz - b.nz * ny, wty = b.nz * nx - b.nx * nz, wtz = b.nx * ny - b.ny * nx; // wall tangent = up × n
      const sgn = wtx * ms.tx + wty * ms.ty + wtz * ms.tz >= 0 ? 1 : -1;
      const hx = sgn * wtx + 0.3 * nx, hy = sgn * wty + 0.3 * ny, hz = sgn * wtz + 0.3 * nz;
      const hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
      b.fx = hx / hl; b.fy = hy / hl; b.fz = hz / hl;
      orthoForward(k);
      const sp2 = Math.sqrt(b.vx * b.vx + b.vy * b.vy + b.vz * b.vz);
      b.vx = b.fx * sp2; b.vy = b.fy * sp2; b.vz = b.fz * sp2;
    }
    ctx.events.push({ t: 'wall', kart: k.slot, severity, x: b.px, y: b.py, z: b.pz, speed: -vn, tick: w.tick, key: evKey(w.tick, 22, k.slot) });
  } else {
    // grinding (벽 비비기): remove into-wall velocity, friction along the wall
    let f = tsp > 0.01 ? 1 - (P.wallGrind * (DT / 2)) / tsp : 0;
    if (f < 0) f = 0;
    b.vx = tx * f; b.vy = ty * f; b.vz = tz * f;
    if (primary && !b.wallContact && !ms.impactThisTick) {
      ctx.events.push({ t: 'wall', kart: k.slot, severity: 0, x: b.px, y: b.py, z: b.pz, speed: -vn, tick: w.tick, key: evKey(w.tick, 22, k.slot) });
      ms.impactThisTick = true;
    }
  }
  if (sinT < SIN.d45) {
    // glancing: nose turned parallel to the wall (project heading)
    const hn = b.fx * nx + b.fy * ny + b.fz * nz;
    if (hn < 0) {
      const hx = b.fx - hn * nx, hy = b.fy - hn * ny, hz = b.fz - hn * nz;
      const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (hl > 1e-6) { b.fx = hx / hl; b.fy = hy / hl; b.fz = hz / hl; }
      b.yawRate = 0;
    }
  }
}

/** Kart–kart sphere contacts (soft, symmetric, capped). Call after each half-step for all karts. */
export function kartContacts(w: WorldState, ctx: StepContext, weights: ReadonlyArray<number>): void {
  const K = w.karts;
  for (let i = 0; i < K.length; i++) {
    const a = K[i]!;
    if (!a.active || a.body.ghostTicks > 0 || a.race.respawnPhase !== 0) continue;
    for (let j = i + 1; j < K.length; j++) {
      const c = K[j]!;
      if (!c.active || c.body.ghostTicks > 0 || c.race.respawnPhase !== 0) continue;
      const A = a.body, B = c.body;
      const ax = A.px + A.nx * KART_CY, ay = A.py + A.ny * KART_CY, az = A.pz + A.nz * KART_CY;
      const bx = B.px + B.nx * KART_CY, by = B.py + B.ny * KART_CY, bz = B.pz + B.nz * KART_CY;
      let dx = bx - ax, dy = by - ay, dz = bz - az;
      const d2 = dx * dx + dy * dy + dz * dz;
      const R = 2 * KART_R;
      if (d2 >= R * R) continue;
      const dist = Math.sqrt(d2);
      if (dist < 1e-6) { dx = 1; dy = 0; dz = 0; } else { dx /= dist; dy /= dist; dz /= dist; }
      const ma = (weights[i] ?? 1) * (a.drive.boostTicks > 0 ? 1.5 : 1), mb = (weights[j] ?? 1) * (c.drive.boostTicks > 0 ? 1.5 : 1);
      const ia = 1 / ma, ib = 1 / mb, it = ia + ib;
      const pen = R - dist;
      A.px -= dx * pen * (ia / it); A.py -= dy * pen * (ia / it); A.pz -= dz * pen * (ia / it);
      B.px += dx * pen * (ib / it); B.py += dy * pen * (ib / it); B.pz += dz * pen * (ib / it);
      const vrel = (B.vx - A.vx) * dx + (B.vy - A.vy) * dy + (B.vz - A.vz) * dz;
      if (vrel >= 0) continue;
      let J = (-(1 + 0.3) * vrel) / it;
      const cap = 6 / it * 2; // limits Δv to ~6 m/s per contact
      if (J > cap) J = cap;
      A.vx -= dx * J * ia; A.vy -= dy * J * ia; A.vz -= dz * J * ia;
      B.vx += dx * J * ib; B.vy += dy * J * ib; B.vz += dz * J * ib;
      ctx.events.push({ t: 'bump', a: i, b: j, impulse: J, tick: w.tick, key: evKey(w.tick, 23, i, j) });
    }
  }
}
