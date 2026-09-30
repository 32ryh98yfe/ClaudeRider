// Item hazards (12-items-spec §4.3): Glitch Puddle, Redaction Cloud, Firewall blocks and the Token Bomb landing, plus
// the Overclock Aura contact. Hazards live in WorldState.hazards sorted by id; contacts are judged on each victim's own
// state in phase 5, so every peer with the same inputs resolves them identically (no lead needed beyond arm).
import type { EffectApply, ItemDef } from '@cr/content';
import { Attach, type HazardState, type KartState, type WorldState } from '../core/state.ts';
import type { StepContext } from '../api.ts';
import type { GroundHit } from '../track/BakedTrack.ts';
import { SFLAG } from '../track/format.ts';
import { evKey } from '../kart/evkey.ts';
import { KART_CY, KART_R } from '../kart/motion.ts';
import { EF, EFlag, itemDef } from './codes.ts';
import { authorityOf } from './decisions.ts';
import { resolveEffect, scheduleEffect } from './effects.ts';
import { objectId, mix4 } from './ids.ts';
import { trapHeight } from './kinematics.ts';
import { packNormal } from './pack.ts';
import { frameScratch, pathS, sMainOf } from './route.ts';
import { friendlyAllowed, inRace, inWarp, sameTeam } from './team.ts';

const POOL: HazardState[] = [];
const F = frameScratch();
const HIT: GroundHit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, surf: 0, tri: 0, flags: 0 };
/** Ground traps never hit a kart more than 3 m above the ground (ADR-010). */
export const TRAP_MAX_HEIGHT = 3;
const DEAD_CODE = 0;
const P = { x: 0, y: 0, z: 0 };

/** Settles (x, y, z) onto the road below with one ground ray; returns false (position unchanged) if nothing is hit. */
function settle(ctx: StepContext, p: { x: number; y: number; z: number }): boolean {
  if (!ctx.track.groundRay(p.x, p.y + 2.5, p.z, 0, -1, 0, 6, HIT)) return false;
  p.x = HIT.x; p.y = HIT.y; p.z = HIT.z;
  return true;
}

/** Is the kart's current track sample inside a `noItem` zone (dropped items fizzle there)? */
export function inNoItemZone(ctx: StepContext, k: Readonly<KartState>): boolean {
  const loc = k.race.loc;
  ctx.track.frameAt(loc.path, loc.s, F);
  if ((F.flags & SFLAG.NO_ITEM) !== 0) return true;
  for (const z of ctx.track.zones) if (z.kind === 'noItem' && z.path === loc.path && loc.s >= z.s0 && loc.s <= z.s1) return true;
  return false;
}

export function spawnHazard(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, owner: number, index: number, x: number, y: number, z: number, radius: number, arm: number, expire: number): HazardState {
  const h = POOL.pop() ?? { id: 0, code: 0, owner: 0, team: 0, px: 0, py: 0, pz: 0, radius: 0, arm: 0, expire: 0, flags: 0 };
  h.id = objectId(def.code, owner, w.tick, index + 1);
  h.code = def.code; h.owner = owner; h.team = w.karts[owner]!.team;
  h.px = x; h.py = y; h.pz = z; h.radius = radius; h.arm = arm; h.expire = expire; h.flags = 0;
  const L = w.hazards;
  L.push(h);
  for (let i = L.length - 1; i > 0 && L[i - 1]!.id > h.id; i--) { L[i] = L[i - 1]!; L[i - 1] = h; }
  ctx.events.push({ t: 'hazardSpawn', obj: h.id, item: def.code, tick: w.tick, key: evKey(w.tick, 89, owner, index) });
  const auth = authorityOf(w, ctx);
  if (auth) auth.emit({ k: 'hazard', tick: w.tick, obj: h.id, code: def.code, owner, arm, life: expire - w.tick, x, y, z });
  return h;
}

function removeHazard(w: WorldState, ctx: StepContext, h: HazardState): void {
  if (h.code === DEAD_CODE) return;
  ctx.events.push({ t: 'hazardRemove', obj: h.id, item: h.code, tick: w.tick, key: evKey(w.tick, 90, h.owner, h.id & 0xffff) });
  const auth = authorityOf(w, ctx);
  if (auth) auth.emit({ k: 'hazardRemove', tick: w.tick, obj: h.id });
  h.code = DEAD_CODE;
}

function compactHazards(w: WorldState): void {
  const L = w.hazards;
  let j = 0;
  for (let i = 0; i < L.length; i++) { const h = L[i]!; if (h.code === DEAD_CODE) POOL.push(h); else L[j++] = h; }
  L.length = j;
}

/** Keeps at most `max − incoming` hazards of `code` owned by `owner` (the oldest go first). */
export function trimOwnerHazards(w: WorldState, ctx: StepContext, code: number, owner: number, max: number, incoming: number): void {
  for (;;) {
    let n = 0, oldest: HazardState | null = null;
    for (const h of w.hazards) {
      if (h.code !== code || h.owner !== owner) continue;
      n++;
      if (!oldest || h.arm < oldest.arm || (h.arm === oldest.arm && h.id < oldest.id)) oldest = h;
    }
    if (n + incoming <= max || !oldest) break;
    removeHazard(w, ctx, oldest);
  }
  compactHazards(w);
}

/** Could a hazard of `def` owned by `h.owner` affect kart `k` under the friendly-fire rule? */
function hazardMayHit(w: Readonly<WorldState>, ctx: StepContext, def: Readonly<ItemDef>, h: Readonly<HazardState>, k: Readonly<KartState>): boolean {
  if (k.slot === h.owner) return def.friendlyFire === 'area';
  const o = w.karts[h.owner];
  return !o || !sameTeam(ctx, o, k) || friendlyAllowed(ctx, def);
}

/** Schedules and resolves an effect at once (contact hits have no lead). Returns the result code (−1 miss). */
export function hitNow(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, source: number, victim: number, seed: number, param: number): number {
  let a: EffectApply | null = null;
  for (const x of def.applies) if (x.to === 'victim') { a = x; break; }
  if (!a) return -1;
  const flags = def.blockedBy.length > 0 ? EFlag.BLOCKABLE : 0;
  const e = scheduleEffect(w, ctx, EF[a.effect], victim, source, w.tick, a.durTicks ?? 0, param, flags, seed);
  return e ? resolveEffect(w, ctx, e) : -1;
}

const eligible = (k: Readonly<KartState>): boolean => inRace(k) && k.race.respawnPhase === 0 && !inWarp(k);

// ------------------------------------------------------------------ spawners used by the item behaviours
/** Glitch Puddle / Redaction Cloud: behindM behind the kart, settled (puddle) or heightM above the road (cloud). */
export function dropBehind(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, user: number): HazardState | null {
  const k = w.karts[user]!, b = k.body, dr = def.drop!;
  const p = P;
  p.x = b.px - b.fx * dr.behindM; p.y = b.py - b.fy * dr.behindM; p.z = b.pz - b.fz * dr.behindM;
  settle(ctx, p);
  if (dr.heightM) { p.x += b.nx * dr.heightM; p.y += b.ny * dr.heightM; p.z += b.nz * dr.heightM; }
  trimOwnerHazards(w, ctx, def.code, user, dr.maxPerOwner, 1);
  return spawnHazard(w, ctx, def, user, 0, p.x, p.y, p.z, dr.radius, w.tick + dr.armTicks, w.tick + dr.lifeTicks);
}

/** Token Bomb: lands on the centreline `aheadM` past the thrower's main-line progress after `flightTicks`. */
export function lobAhead(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, user: number): HazardState {
  const k = w.karts[user]!, lob = def.lob!, T = ctx.track;
  const sLand = sMainOf(T, k.race.raceDist + lob.aheadM);
  T.frameAt(0, pathS(T, 0, sLand), F);
  const p = P;
  p.x = F.px; p.y = F.py; p.z = F.pz;
  settle(ctx, p);
  const land = w.tick + lob.flightTicks;
  return spawnHazard(w, ctx, def, user, 0, p.x, p.y, p.z, lob.radius, land, land);
}

/** Firewall: `place.offsets` blocks at the target's sMain + aheadM on the AI racing line, clamped inside the road. */
export function placeFirewall(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, user: number, target: number): number {
  const t = w.karts[target]!, pl = def.place!, dr = def.drop!, T = ctx.track;
  const s = pathS(T, 0, sMainOf(T, t.race.raceDist + pl.aheadM));
  T.frameAt(0, s, F);
  const ai = ctx.scratch.ai;
  T.aiAt(0, s, ai);
  const wl = F.wL, wr = F.wR;
  const narrow = wl + wr < pl.minWidthM;
  const n = narrow ? 1 : pl.offsets.length;
  trimOwnerHazards(w, ctx, def.code, user, dr.maxPerOwner, n);
  let first = 0;
  for (let i = 0; i < n; i++) {
    let u = ai.lineU + (narrow ? 0 : pl.offsets[i]!);
    if (u > wr - pl.edgeM) u = wr - pl.edgeM;
    if (u < -wl + pl.edgeM) u = -wl + pl.edgeM;
    const p = P;
    p.x = F.px + F.rx * u; p.y = F.py + F.ry * u; p.z = F.pz + F.rz * u;
    settle(ctx, p);
    const h = spawnHazard(w, ctx, def, user, i, p.x, p.y, p.z, dr.radius, w.tick + dr.armTicks, w.tick + dr.lifeTicks);
    if (i === 0) first = h.id;
  }
  return first;
}

// ------------------------------------------------------------------ phase 5: contacts
function bombLanding(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, h: HazardState): void {
  const lob = def.lob!;
  let ux = 0, uy = 1, uz = 0;
  if (ctx.track.groundRay(h.px, h.py + 2, h.pz, 0, -1, 0, 4, HIT)) { ux = HIT.nx; uy = HIT.ny; uz = HIT.nz; }
  for (const k of w.karts) {
    if (!eligible(k) || !hazardMayHit(w, ctx, def, h, k)) continue;
    const dx = k.body.px - h.px, dy = k.body.py - h.py, dz = k.body.pz - h.pz;
    const dn = dx * ux + dy * uy + dz * uz;
    const d2 = dx * dx + dy * dy + dz * dz - dn * dn;
    if (d2 > lob.radius * lob.radius || dn > lob.dy || dn < -lob.dy || trapHeight(w, ctx, k) > TRAP_MAX_HEIGHT) continue;
    hitNow(w, ctx, def, h.owner, k.slot, h.id, 0);
  }
  removeHazard(w, ctx, h);
}

function puddleContacts(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, h: HazardState): void {
  const dr = def.drop!;
  const spawn = h.arm - dr.armTicks;
  for (const k of w.karts) {
    if (!eligible(k) || !hazardMayHit(w, ctx, def, h, k)) continue;
    if (k.slot === h.owner && w.tick < spawn + (dr.ownerImmuneTicks ?? 0)) continue;
    const dx = k.body.px - h.px, dy = k.body.py - h.py, dz = k.body.pz - h.pz;
    if (dx * dx + dz * dz > h.radius * h.radius || dy > TRAP_MAX_HEIGHT || dy < -TRAP_MAX_HEIGHT || trapHeight(w, ctx, k) > TRAP_MAX_HEIGHT) continue;
    hitNow(w, ctx, def, h.owner, k.slot, h.id, 0);
    removeHazard(w, ctx, h);       // consumed by the first kart that touches it
    return;
  }
}

function cloudContacts(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, h: HazardState): void {
  for (const k of w.karts) {
    if (!eligible(k) || (h.flags & (1 << k.slot)) !== 0 || !hazardMayHit(w, ctx, def, h, k)) continue;
    const b = k.body;
    const dx = b.px + b.nx * KART_CY - h.px, dy = b.py + b.ny * KART_CY - h.py, dz = b.pz + b.nz * KART_CY - h.pz;
    if (dx * dx + dy * dy + dz * dz > h.radius * h.radius) continue;
    h.flags |= 1 << k.slot;          // once per kart per cloud
    hitNow(w, ctx, def, h.owner, k.slot, h.id, 0);
  }
}

function firewallContacts(w: WorldState, ctx: StepContext, def: Readonly<ItemDef>, h: HazardState): void {
  const hh = def.place?.blockHeightM ?? 1.2;
  const reach = h.radius + KART_R, cy = h.py + hh / 2;
  for (const k of w.karts) {
    if (!eligible(k) || !hazardMayHit(w, ctx, def, h, k)) continue;
    const b = k.body;
    const dx = b.px + b.nx * KART_CY - h.px, dz = b.pz + b.nz * KART_CY - h.pz, dy = b.py + b.ny * KART_CY - cy;
    const d2 = dx * dx + dz * dz;
    if (d2 > reach * reach || dy > hh / 2 + KART_R || dy < -hh / 2 - KART_R) continue;
    // no effect on a kart riding a rail or on a boost pad; the block still shatters (§2.2.10)
    const surf = ctx.content.surfaceByCode[b.surf];
    if (b.attachKind !== Attach.RAIL && surf?.id !== 'boost_pad') {
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : -b.fx, nz = d > 1e-6 ? dz / d : -b.fz;
      hitNow(w, ctx, def, h.owner, k.slot, h.id, packNormal(nx, nz));
    }
    removeHazard(w, ctx, h);
    return;
  }
}

/** Overclock Aura: opponents whose contact point is within `contact.radius` of the user's are spun (once per aura). */
function auraContacts(w: WorldState, ctx: StepContext): void {
  const def = ctx.content.items.byId.get('overclock_aura');
  if (!def) return;
  const r = def.contact?.radius ?? 2.2, tick = w.tick, ff = ctx.cfg.rules.friendlyFire;
  for (const e of w.effects) {
    if (e.code !== EF.overclock || (e.flags & (EFlag.RESOLVED | EFlag.DEAD | EFlag.ENDED)) !== EFlag.RESOLVED || e.start > tick || tick >= e.end) continue;
    const u = w.karts[e.victim]!;
    if (!eligible(u)) continue;
    for (const v of w.karts) {
      if (v.slot === u.slot || !eligible(v) || (e.param & (1 << v.slot)) !== 0) continue;
      const dx = v.body.px - u.body.px, dy = v.body.py - u.body.py, dz = v.body.pz - u.body.pz;
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      const mate = sameTeam(ctx, u, v);
      if (mate && ff !== 'all') continue;
      e.param |= 1 << v.slot;
      hitNow(w, ctx, def, u.slot, v.slot, e.id, 0);
      if (mate) {
        // KRD rule with friendly fire 'all': user and teammate both spin (the aura ends first so the user is not immune)
        e.flags |= EFlag.ENDED;
        const self = scheduleEffect(w, ctx, EF.spin, u.slot, u.slot, tick, 0, 0, 0, mix4(e.id, 0x5e1f, u.slot, tick));
        if (self) resolveEffect(w, ctx, self);
        break;
      }
    }
  }
}

/** Phase 5 (after projectiles): hazard landings, contacts and expiry, then aura contacts. */
export function stepHazards(w: WorldState, ctx: StepContext): void {
  const tick = w.tick;
  const bomb = ctx.content.items.byId.get('token_bomb')?.code ?? -1;
  const puddle = ctx.content.items.byId.get('glitch_puddle')?.code ?? -1;
  const cloud = ctx.content.items.byId.get('redaction_cloud')?.code ?? -1;
  const wall = ctx.content.items.byId.get('firewall')?.code ?? -1;
  for (const h of w.hazards) {
    if (h.code === DEAD_CODE) continue;
    const def = itemDef(ctx.content, h.code);
    if (!def) { removeHazard(w, ctx, h); continue; }
    if (h.code === bomb) { if (tick >= h.arm) bombLanding(w, ctx, def, h); continue; }
    if (tick >= h.expire) { removeHazard(w, ctx, h); continue; }
    if (tick < h.arm) continue;
    if (h.code === puddle) puddleContacts(w, ctx, def, h);
    else if (h.code === cloud) cloudContacts(w, ctx, def, h);
    else if (h.code === wall) firewallContacts(w, ctx, def, h);
  }
  compactHazards(w);
  auraContacts(w, ctx);
}
