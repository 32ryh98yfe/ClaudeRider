// Homing projectiles on spline routes (ADR-010, 12-items-spec §4.2). State (path, s = race distance D, u, h) plus a
// world position for rendering. Terminal guidance: when ETA ≤ 21 ticks the projectile commits (authority emits
// `commit`), the victim effect is scheduled at S = Tc + 21 and the drawn position blends onto the victim, so the impact
// tick is exact. The drone flies a fixed 72-tick route (commit at T + 51, impact T + 72).
import type { ItemDef } from '@cr/content';
import type { ProjectileState, WorldState } from '../core/state.ts';
import { DT, V_REF } from '../core/units.ts';
import type { StepContext } from '../api.ts';
import { evKey } from '../kart/evkey.ts';
import { EF, EFlag, PPhase, itemDef } from './codes.ts';
import { authorityOf, knownCommit } from './decisions.ts';
import { effectId, scheduleEffect } from './effects.ts';
import { objectId } from './ids.ts';
import { smooth } from './kinematics.ts';
import { frameScratch, pathCovers, routePoint, sMainOf } from './route.ts';
import { inRace, inWarp } from './team.ts';

/** Fixed SCE lead (ADR-007). */
export const LEAD = 21;
const DEAD = 255;
const CRUISE_H = 1.2, DRONE_H = 3.5;

const POOL: ProjectileState[] = [];
const F = frameScratch(), F2 = frameScratch();
const POS = { x: 0, y: 0, z: 0 };

export function spawnProjectile(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, owner: number, target: number): ProjectileState {
  const k = w.karts[owner]!, t = w.karts[target]!;
  const p = POOL.pop() ?? { id: 0, code: 0, owner: 0, target: 0, phase: 0, path: 0, s: 0, u: 0, h: 0, px: 0, py: 0, pz: 0, spawn: 0, commit: 0, impact: 0 };
  const pd = def.projectile!;
  p.id = objectId(def.code, owner, w.tick, 0);
  p.code = def.code; p.owner = owner; p.target = target; p.phase = PPhase.CRUISE;
  const ahead = t.race.raceDist >= k.race.raceDist;
  p.path = k.race.loc.path; p.s = k.race.raceDist + (ahead ? 1.5 : -1.5); p.u = k.race.loc.u; p.h = 1;
  p.px = k.body.px + k.body.nx; p.py = k.body.py + k.body.ny; p.pz = k.body.pz + k.body.nz;
  p.spawn = w.tick; p.commit = 0;
  p.impact = pd.route === 'direct' ? w.tick + pd.lifeTicks : 0;
  const L = w.projectiles;
  L.push(p);
  for (let i = L.length - 1; i > 0 && L[i - 1]!.id > p.id; i--) { L[i] = L[i - 1]!; L[i - 1] = p; }
  ctx.events.push({ t: 'projSpawn', obj: p.id, item: def.code, tick: w.tick, key: evKey(w.tick, 87, owner, def.code) });
  return p;
}

/** Target speed along its own track tangent (m/s, ≥ 0). */
function trackSpeed(ctx: StepContext, slot: number, w: Readonly<WorldState>): number {
  const t = w.karts[slot]!;
  ctx.track.frameAt(t.race.loc.path, t.race.loc.s, F2);
  const u = t.body.vx * F2.tx + t.body.vy * F2.ty + t.body.vz * F2.tz;
  return u > 0 ? u : 0;
}

/** Cruise speed of a spline projectile against a target moving at `ut` along the track. */
function cruiseSpeed(def: Readonly<ItemDef>, ut: number): number {
  const pd = def.projectile!;
  const base = pd.speedMulVref * V_REF, chase = pd.plusTargetSpeed > 0 ? ut + pd.plusTargetSpeed : 0;
  return base > chase ? base : chase;
}

/** Time to impact in ticks from projectile state (HUD warning / bot threat perception; cosmetic). */
export function projectileEta(w: Readonly<WorldState>, ctx: StepContext, p: Readonly<ProjectileState>): number {
  if (p.phase === PPhase.TERMINAL || p.impact > 0) return Math.max(0, p.impact - w.tick);
  const def = itemDef(ctx.content, p.code);
  const t = w.karts[p.target];
  if (!def?.projectile || !t) return 1e9;
  const ut = trackSpeed(ctx, p.target, w);
  const gap = t.race.raceDist - p.s;
  const closing = cruiseSpeed(def, ut) - (gap >= 0 ? ut : -ut);
  return closing > 0.5 ? (gap >= 0 ? gap : -gap) / (closing * DT) + LEAD : 1e9;
}

function commit(w: WorldState, ctx: StepContext, p: ProjectileState, def: Readonly<ItemDef>, impact: number): void {
  p.phase = PPhase.TERMINAL; p.commit = w.tick; p.impact = impact;
  const a = def.applies[0];
  if (!a) return;
  const code = EF[a.effect];
  const flags = def.blockedBy.length > 0 ? EFlag.BLOCKABLE : 0;
  scheduleEffect(w, ctx, code, p.target, p.owner, impact, a.durTicks ?? 0, a.param ?? 0, flags, p.id);
  const auth = authorityOf(w, ctx);
  if (auth) auth.emit({ k: 'commit', tick: w.tick, obj: p.id, victim: p.target, eff: effectId(p.id, code, p.target, impact), impact });
}

function fizzle(w: WorldState, ctx: StepContext, p: ProjectileState): void {
  ctx.events.push({ t: 'itemFizzle', kart: p.owner, item: p.code, obj: p.id, tick: w.tick, key: evKey(w.tick, 86, p.owner, p.code) });
  p.phase = DEAD;
}

export function compactProjectiles(w: WorldState): void {
  const L = w.projectiles;
  let j = 0;
  for (let i = 0; i < L.length; i++) { const p = L[i]!; if (p.phase === DEAD) POOL.push(p); else L[j++] = p; }
  L.length = j;
}

/** Removes (fizzles) every drone in flight toward a slot in `mask` (Interrupt Pulse). */
export function clearDrones(w: WorldState, ctx: StepContext, mask: number): void {
  const drone = ctx.content.items.byId.get('throttle_drone')?.code ?? 0;
  for (const p of w.projectiles) if (p.code === drone && p.phase !== DEAD && (mask & (1 << p.target)) !== 0) fizzle(w, ctx, p);
  compactProjectiles(w);
}

/** Phase 5: advance, commit, impact, fizzle. */
export function stepProjectiles(w: WorldState, ctx: StepContext): void {
  const T = ctx.track, tick = w.tick;
  let dirty = false;
  for (const p of w.projectiles) {
    const def = itemDef(ctx.content, p.code);
    const pd = def?.projectile;
    const t = w.karts[p.target];
    if (!def || !pd || !t || !inRace(t)) { fizzle(w, ctx, p); dirty = true; continue; }
    if (p.phase === PPhase.TERMINAL && tick >= p.impact) {
      ctx.events.push({ t: 'projImpact', obj: p.id, item: p.code, tick, key: evKey(tick, 88, p.target, p.code) });
      p.phase = DEAD; dirty = true; continue;
    }
    if (p.phase === PPhase.CRUISE && tick - p.spawn >= pd.lifeTicks) { fizzle(w, ctx, p); dirty = true; continue; }
    const ut = trackSpeed(ctx, p.target, w);
    const Dt = t.race.raceDist;
    const gap = Dt - p.s, dist = gap >= 0 ? gap : -gap, dir = gap >= 0 ? 1 : -1;
    let step: number;
    if (pd.route === 'direct') {
      if (p.phase === PPhase.CRUISE && tick >= p.impact - LEAD) commit(w, ctx, p, def, p.impact);
      const left = p.impact - tick;
      step = dist / (left > 1 ? left : 1);
    } else {
      const speed = cruiseSpeed(def, ut);
      if (p.phase === PPhase.CRUISE) {
        const known = ctx.role === 'predictor' ? knownCommit(w, p.id) : undefined;
        if (known && known.tick <= tick) commit(w, ctx, p, def, known.impact);
        else if (!known) {
          const closing = speed - ut * dir;
          if (closing > 0.5 && dist <= closing * DT * LEAD) commit(w, ctx, p, def, tick + LEAD);
        }
      }
      step = speed * DT;
    }
    // a target in warp transit: hold s until it exits (§4.2)
    if (!inWarp(t)) p.s = dist <= step ? Dt : p.s + dir * step;
    p.u += (t.race.loc.u - p.u) * 0.2;
    p.h += ((pd.route === 'direct' ? DRONE_H : CRUISE_H) - p.h) * 0.2;
    // follow the target onto its branch when the branch covers the projectile's progress
    if (t.race.loc.path !== p.path && t.race.loc.path !== 0 && pathCovers(T, t.race.loc.path, sMainOf(T, p.s))) p.path = t.race.loc.path;
    p.path = routePoint(T, p.path, p.s, p.u, p.h, F, POS);
    let x = POS.x, y = POS.y, z = POS.z;
    if (p.phase === PPhase.TERMINAL) {
      const a = smooth((tick - p.commit) / (p.impact - p.commit > 0 ? p.impact - p.commit : 1));
      const b = t.body;
      x += (b.px + b.nx * 0.6 - x) * a; y += (b.py + b.ny * 0.6 - y) * a; z += (b.pz + b.nz * 0.6 - z) * a;
    }
    p.px = x; p.py = y; p.pz = z;
  }
  if (dirty) compactProjectiles(w);
}
